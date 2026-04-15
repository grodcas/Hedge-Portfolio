/**
 * MACRO INTELLIGENCE BUILDER — v2
 *
 * Two GPT-5 calls per run, producing a single combined blob in BETA_10_Daily_macro:
 *
 *   Call 1 (trend):
 *     Inputs  — 8 weeks of MACRO_STATE_indicators + MACRO_STATE_fomc
 *                + MACRO_STATE_news + SPY daily prices
 *     Output  — { regime, window_start, window_end, window_rationale,
 *                 drivers[], narrative[], whats_next[], sp500_direction }
 *
 *   Call 2 (today):
 *     Inputs  — trend output + today's SPY bar + today's top macro headlines (BETA_12)
 *     Output  — { spy_move_pct, spy_direction, drivers[], narrative[],
 *                 regime_tension: none|mild|strong, tension_note }
 *
 * Both calls use gpt-5 with response_format: json_object, temperature 0.
 * Stored under BETA_10_Daily_macro.summary as version "macro-v2".
 */

const WINDOW_DAYS = 56; // 8 weeks

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build-macro-intelligence")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const windowStart = new Date(Date.now() - WINDOW_DAYS * 86400000)
      .toISOString()
      .slice(0, 10);

    console.log(`[MACRO v2] window ${windowStart} .. ${today}`);

    // Run weekly news picker inline — fills MACRO_STATE_news for this week
    // before the trend call reads it. Idempotent on week_start.
    try {
      await pickWeeklyNews(db, apiKey, today);
    } catch (e) {
      console.warn(`[weekly-news] failed: ${e.message}`);
    }

    // ---- Load all inputs in parallel ----
    const [indicatorsRes, fomcRes, newsStateRes, spyRes, todayHeadlinesRes] =
      await Promise.all([
        db
          .prepare(
            `SELECT indicator_code, indicator_name, release_date, period, value, prior, unit, source
               FROM MACRO_STATE_indicators
              WHERE release_date >= ?
              ORDER BY release_date ASC`,
          )
          .bind(windowStart)
          .all(),
        db
          .prepare(
            `SELECT meeting_date, title, statement_text
               FROM MACRO_STATE_fomc
              ORDER BY meeting_date DESC LIMIT 4`,
          )
          .all(),
        db
          .prepare(
            `SELECT week_start, title, summary, sentiment, magnitude, why_it_matters, picked_by
               FROM MACRO_STATE_news
              WHERE week_start >= ?
              ORDER BY week_start ASC`,
          )
          .bind(windowStart)
          .all(),
        db
          .prepare(
            `SELECT date, open, close FROM PRICE_01_Daily
              WHERE ticker = 'SPY' AND date >= ?
              ORDER BY date ASC`,
          )
          .bind(windowStart)
          .all(),
        db
          .prepare(
            `SELECT title, summary, category, sentiment, magnitude
               FROM BETA_12_News_digest
              WHERE date = ? AND type = 'macro'
              ORDER BY rank ASC LIMIT 8`,
          )
          .bind(today)
          .all(),
      ]);

    const indicators = indicatorsRes.results || [];
    const fomcs = (fomcRes.results || []).slice().reverse(); // chronological for prompt
    const newsState = newsStateRes.results || [];
    const spy = spyRes.results || [];
    const todayHeadlines = todayHeadlinesRes.results || [];

    if (spy.length === 0) {
      return Response.json(
        { ok: false, error: "No SPY history in window — bootstrap required" },
        { status: 500 },
      );
    }

    // Sample FRED daily yields weekly (every 5 business days) to compress
    const compressedIndicators = compressIndicators(indicators);

    const trendInputText = formatTrendInput(
      compressedIndicators,
      fomcs,
      newsState,
      spy,
      windowStart,
      today,
    );

    // ---- Call 1: Trend ----
    const trendPrompt = `You are a senior macro analyst. Read the 8-week macro state below and output a STRUCTURED JSON verdict on the current market regime.

${trendInputText}

TASK
Identify the regime driving markets across the last 8 weeks. CHOOSE the time window inside those 8 weeks that best frames the current regime — it may be the last week, last 2 weeks, last month, or the full window. The window you pick MUST be justified by a specific event or shift visible in the data above.

Output EXACTLY this JSON — no markdown, no prose outside the object:

{
  "regime": "bullish" | "cautious_bullish" | "neutral" | "cautious_bearish" | "bearish",
  "window_start": "YYYY-MM-DD",
  "window_end": "YYYY-MM-DD",
  "window_rationale": "one sentence: why this window, anchored to an event or shift in the data",
  "drivers":   [{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}],
  "narrative": [{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}],
  "sp500_direction": {"p_up": 0.0, "p_flat": 0.0, "p_down": 0.0}
}

RULES
- Base every conclusion on the data above. Do not invent numbers.
- window_start must be >= ${windowStart} and window_end must be <= ${today}.
- p_up + p_flat + p_down must sum to 1.0.
- drivers: 3-5 items. narrative: 3-5 items.
- Each array MUST be sorted by magnitude of market impact, MOST IMPACTFUL FIRST.
- bias: "bull" = pushes markets up, "bear" = pushes markets down, "neutral" = genuinely two-sided.
- Keep text < 20 words. Concrete, grounded in the data above.
- If the data is sparse or contradictory, pick "neutral" regime and say so in window_rationale.
- Do NOT output upcoming catalysts here — those are produced by the recommendation call downstream.`;

    const trend = await callGPT5(apiKey, trendPrompt);
    if (!trend?.regime) {
      return Response.json(
        { ok: false, error: "Trend call returned invalid JSON", trend },
        { status: 500 },
      );
    }
    normalizeProbs(trend.sp500_direction);

    // ---- Call 2: Today ----
    const todayBar = spy[spy.length - 1];
    const spyMovePct =
      todayBar.open > 0 ? ((todayBar.close - todayBar.open) / todayBar.open) * 100 : 0;

    const todayHeadlinesText =
      todayHeadlines.length === 0
        ? "No macro headlines retrieved for today."
        : todayHeadlines
            .map(
              (n, i) =>
                `${i + 1}. [${n.category || "-"}] ${n.title} (${n.sentiment || "-"}, mag=${n.magnitude ?? "-"})\n   ${n.summary || ""}`,
            )
            .join("\n");

    const todayPrompt = `You are the same macro analyst. Yesterday's regime verdict is below. Today's SPY move and today's macro headlines follow. Explain today, and explicitly flag whether today challenges the regime.

REGIME VERDICT (trend call output)
${JSON.stringify(trend, null, 2)}

TODAY
Date: ${today}
SPY open: ${todayBar.open}
SPY close: ${todayBar.close}
SPY intraday move: ${spyMovePct.toFixed(2)}%

TOP MACRO HEADLINES TODAY
${todayHeadlinesText}

TASK
Output EXACTLY this JSON:

{
  "spy_move_pct": ${spyMovePct.toFixed(2)},
  "spy_direction": "up" | "down" | "flat",
  "drivers":   [{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}],
  "narrative": [{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}],
  "regime_tension": "none" | "mild" | "strong",
  "tension_note": "one sentence only if regime_tension != none, else empty string"
}

RULES
- drivers: 2-4 items. narrative: 1-3 items.
- Each array MUST be sorted by magnitude of market impact TODAY, MOST IMPACTFUL FIRST.
- bias: "bull" = pushed SPY up, "bear" = pushed SPY down, "neutral" = genuinely two-sided.
- "flat" means |move| < 0.25%.
- regime_tension rules:
    * "none"   — today's move is consistent with the regime
    * "mild"   — today's move is the opposite sign of the regime but < 0.75%
    * "strong" — today's move is the opposite sign and >= 0.75%
- A +1% day in a bearish regime is "strong". A +0.2% day in a bearish regime is "none".
- Bullet text < 20 words each. Ground everything in the provided data.`;

    const todayOut = await callGPT5(apiKey, todayPrompt);
    if (!todayOut?.spy_direction) {
      return Response.json(
        { ok: false, error: "Today call returned invalid JSON", todayOut },
        { status: 500 },
      );
    }

    // ---- Call 3: Recommendation ----
    const currentSpy = Number(todayBar.close) || 0;
    const recoPrompt = `You are the same macro analyst. The regime (trend) and today's context are below. Now produce an actionable recommendation, a FACTUAL list of upcoming catalysts, and a three-scenario outlook.

REGIME VERDICT
${JSON.stringify(trend, null, 2)}

TODAY CONTEXT
${JSON.stringify(todayOut, null, 2)}

MARKET REFERENCE
Current SPY close: ${currentSpy.toFixed(2)}
Horizon: 4 weeks out from ${today}

TASK
Output EXACTLY this JSON:

{
  "recommendation": {
    "headline": "short directional headline (< 12 words)",
    "action": "add_risk" | "trim_risk" | "hold" | "rotate" | "hedge",
    "confidence": "low" | "medium" | "high",
    "bullets": [{"text": "rationale bullet", "bias": "bull" | "bear" | "neutral"}]
  },
  "catalysts": [
    {"event": "short event name", "date": "YYYY-MM-DD", "type": "release" | "meeting" | "earnings" | "geopol"}
  ],
  "scenarios": {
    "horizon_weeks": 4,
    "current_spy": ${currentSpy.toFixed(2)},
    "bull": {"probability": 0.0, "target_spy": 0.0, "thesis": "one sentence"},
    "base": {"probability": 0.0, "target_spy": 0.0, "thesis": "one sentence"},
    "bear": {"probability": 0.0, "target_spy": 0.0, "thesis": "one sentence"}
  }
}

RULES
- recommendation.bullets: 3-5 items, sorted by importance, each < 20 words.
- action semantics:
    * "add_risk"  — raise equity exposure / add duration
    * "trim_risk" — reduce equity exposure or high-beta
    * "hold"      — maintain current positioning
    * "rotate"    — shift between sectors/factors without changing net exposure
    * "hedge"     — add protection while keeping core exposure
- catalysts: 3-6 items. Be FACTUAL and UNBIASED — just the event and its date. Do NOT include directional language. Sort chronologically. Only include events within the next 4-6 weeks.
- scenarios:
    * probabilities must sum to 1.0
    * base = the most likely path; bull = upside surprise; bear = downside surprise
    * target_spy must be grounded in recent range and consistent with the regime
    * a bullish regime should have bull target > base > bear, and base > current_spy usually
    * each thesis in one sentence, referencing a specific driver from the trend
- Everything must be internally consistent with the regime verdict and today's context above.`;

    const reco = await callGPT5(apiKey, recoPrompt);
    if (!reco?.recommendation || !reco?.scenarios) {
      return Response.json(
        { ok: false, error: "Recommendation call returned invalid JSON", reco },
        { status: 500 },
      );
    }
    // Normalize scenario probabilities
    const sc = reco.scenarios;
    const pTotal = (sc.bull?.probability || 0) + (sc.base?.probability || 0) + (sc.bear?.probability || 0);
    if (pTotal > 0) {
      sc.bull.probability = sc.bull.probability / pTotal;
      sc.base.probability = sc.base.probability / pTotal;
      sc.bear.probability = sc.bear.probability / pTotal;
    }

    // ---- Combine + persist ----
    const blob = {
      version: "macro-v3",
      built_at: new Date().toISOString(),
      trend,
      today: todayOut,
      recommendation: reco.recommendation,
      catalysts: reco.catalysts || [],
      scenarios: reco.scenarios,
    };

    const id = await shortHash(`daily-macro|${today}`);
    const structure = [
      { type: "indicators", count: indicators.length },
      { type: "fomc", count: fomcs.length },
      { type: "news_state", count: newsState.length },
      { type: "spy_bars", count: spy.length },
      { type: "today_headlines", count: todayHeadlines.length },
    ];

    await db
      .prepare(
        `INSERT INTO BETA_10_Daily_macro (id, structure, summary, creation_date)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           structure = excluded.structure,
           summary = excluded.summary,
           creation_date = excluded.creation_date`,
      )
      .bind(id, JSON.stringify(structure), JSON.stringify(blob), today)
      .run();

    console.log(
      `[MACRO v3] regime=${trend.regime} window=${trend.window_start}..${trend.window_end} tension=${todayOut.regime_tension} action=${reco.recommendation.action}`,
    );

    return Response.json({
      ok: true,
      date: today,
      regime: trend.regime,
      window: { start: trend.window_start, end: trend.window_end },
      spy_move_pct: todayOut.spy_move_pct,
      regime_tension: todayOut.regime_tension,
      action: reco.recommendation.action,
      confidence: reco.recommendation.confidence,
    });
  },
};

// ---- weekly news picker ----

function mondayOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

async function pickWeeklyNews(db, apiKey, today) {
  const weekStart = mondayOf(today);

  // Read this week's macro headlines from BETA_12
  const weekRows = await db
    .prepare(
      `SELECT title, summary, category, sentiment, magnitude, source, date
         FROM BETA_12_News_digest
        WHERE type = 'macro' AND date >= ? AND date <= ?
        ORDER BY date DESC, rank ASC
        LIMIT 40`,
    )
    .bind(weekStart, today)
    .all();
  const rows = weekRows.results || [];
  if (rows.length === 0) {
    console.log(`[weekly-news] no BETA_12 macro rows for week ${weekStart}`);
    return;
  }

  const listing = rows
    .map(
      (r, i) =>
        `${i + 1}. [${r.date}] [${r.category || "-"}] (${r.sentiment || "-"}, mag=${r.magnitude ?? "-"}) ${r.title}\n   ${(r.summary || "").slice(0, 200)}`,
    )
    .join("\n");

  const prompt = `You are a macro editor. From the list of macro headlines for the week of ${weekStart}, pick the SINGLE most market-moving story. Output EXACTLY this JSON:

{
  "index": <1-based index into the list below>,
  "sentiment": "bullish" | "bearish" | "neutral",
  "magnitude": -1.0 to 1.0,
  "why_it_matters": "one sentence: why this was THE top macro story of the week"
}

Criteria
- Importance for US equity markets over a multi-week horizon.
- Prefer events that shift regime expectations (Fed, inflation, growth, geopolitics with spillover) over one-off headlines.
- Do not pick duplicates — pick ONE story. If multiple headlines cover the same event, pick the clearest one.

HEADLINES
${listing}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "gpt-5-mini error");
  const text = j.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty picker output");
  const pick = JSON.parse(text);
  const idx = Number(pick.index) - 1;
  if (!Number.isFinite(idx) || idx < 0 || idx >= rows.length) {
    throw new Error(`picker returned invalid index ${pick.index}`);
  }
  const chosen = rows[idx];

  const id = await shortHash(`macro-news|${weekStart}|${chosen.title}`);
  await db
    .prepare(
      `INSERT INTO MACRO_STATE_news
         (id, week_start, title, summary, source, url, sentiment, magnitude, why_it_matters, picked_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto')
       ON CONFLICT(id) DO UPDATE SET
         sentiment = excluded.sentiment,
         magnitude = excluded.magnitude,
         why_it_matters = excluded.why_it_matters`,
    )
    .bind(
      id,
      weekStart,
      chosen.title,
      chosen.summary || null,
      chosen.source || null,
      null,
      pick.sentiment || chosen.sentiment || null,
      Number.isFinite(pick.magnitude) ? pick.magnitude : chosen.magnitude,
      pick.why_it_matters || null,
    )
    .run();
  console.log(`[weekly-news] week=${weekStart} picked="${chosen.title.slice(0, 60)}"`);
}

// ---- helpers ----

function compressIndicators(indicators) {
  // BLS (monthly): keep all rows. FRED daily: sample every 5th business day + latest.
  const keep = [];
  const fredByCode = {};
  for (const r of indicators) {
    if (r.source === "BLS") {
      keep.push(r);
    } else if (r.source === "FRED") {
      (fredByCode[r.indicator_code] ||= []).push(r);
    } else {
      keep.push(r);
    }
  }
  for (const code of Object.keys(fredByCode)) {
    const series = fredByCode[code];
    const sampled = [];
    for (let i = 0; i < series.length; i += 5) sampled.push(series[i]);
    if (series.length > 0 && sampled[sampled.length - 1] !== series[series.length - 1]) {
      sampled.push(series[series.length - 1]);
    }
    keep.push(...sampled);
  }
  keep.sort((a, b) => a.release_date.localeCompare(b.release_date));
  return keep;
}

function formatTrendInput(indicators, fomcs, newsState, spy, windowStart, today) {
  const byCode = {};
  for (const r of indicators) (byCode[r.indicator_code] ||= []).push(r);

  const indicatorsBlock = Object.keys(byCode)
    .sort()
    .map((code) => {
      const rows = byCode[code];
      const name = rows[0].indicator_name;
      const unit = rows[0].unit || "";
      const points = rows
        .map((r) => `${r.release_date}: ${r.value}${unit ? " " + unit : ""}`)
        .join("  |  ");
      return `  ${code} (${name}): ${points}`;
    })
    .join("\n");

  const fomcBlock =
    fomcs.length === 0
      ? "  (no FOMC meetings in window)"
      : fomcs
          .map(
            (f) =>
              `  ${f.meeting_date} — ${f.title}\n    ${(f.statement_text || "").slice(0, 1200)}`,
          )
          .join("\n\n");

  const newsBlock =
    newsState.length === 0
      ? "  (no curated weekly news in window yet — bootstrap phase)"
      : newsState
          .map(
            (n) =>
              `  [${n.week_start}] ${n.title} — ${n.sentiment || "-"} (picked_by=${n.picked_by})\n    ${n.summary || ""}\n    why: ${n.why_it_matters || ""}`,
          )
          .join("\n");

  const spyBlock = spy
    .map((b) => {
      const pct = b.open > 0 ? (((b.close - b.open) / b.open) * 100).toFixed(2) : "0.00";
      return `  ${b.date}: close=${b.close} (${pct}% intraday)`;
    })
    .join("\n");

  return `WINDOW: ${windowStart} .. ${today}

INDICATORS (8-week timeline)
${indicatorsBlock || "  (none)"}

FOMC STATEMENTS
${fomcBlock}

CURATED WEEKLY TOP MACRO NEWS
${newsBlock}

SPY DAILY PRICES
${spyBlock}`;
}

function normalizeProbs(d) {
  if (!d) return;
  const total = (d.p_up || 0) + (d.p_flat || 0) + (d.p_down || 0);
  if (total > 0) {
    d.p_up = d.p_up / total;
    d.p_flat = d.p_flat / total;
    d.p_down = d.p_down / total;
  }
}

async function callGPT5(apiKey, prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  const j = await res.json();
  if (j.error) {
    console.error("[GPT5] error:", j.error);
    throw new Error(j.error.message || "gpt-5 error");
  }
  const text = j.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty GPT-5 output");
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("[GPT5] JSON parse failed. Raw:", text.slice(0, 500));
    throw e;
  }
}

async function shortHash(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
