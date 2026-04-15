/**
 * TICKER-TREND-SHORT
 *
 * Tactical overlay trend per ticker. Unlike ticker-trend-long (which only
 * moves when filings or earnings land), this trend reacts to news flow,
 * price action, press releases, and has a 7-day staleness floor so even
 * quiet tickers get refreshed.
 *
 * Triggers (any one fires a rebuild):
 *   - news       : any headline today with |magnitude| >= TRIGGER_MAGNITUDE
 *   - price_move : |intraday move today| >= TRIGGER_PRICE_MOVE_PCT
 *   - press      : any ALPHA_03_Press row in the last 2 days
 *   - stale      : current TICKER_TREND_short is >= STALE_DAYS old (or missing)
 *   - force      : query param force=true overrides all checks (bootstrap)
 *
 * Inputs to the gpt-5 call:
 *   - long-term trend baseline (from TICKER_TREND_long)
 *   - last 7 days of SIGNAL_HISTORY_daily (sentiment trajectory)
 *   - today's BETA_12 per-ticker headlines (detailed content)
 *   - last 14 days of PRICE_01_Daily (price + intraday %)
 *   - last 2 ALPHA_03_Press rows
 *   - trigger reason
 *
 * Output: upsert TICKER_TREND_short, mark SIGNAL_HISTORY_daily.trend_updated = 1
 * for today's row.
 *
 * Endpoints:
 *   GET /build?ticker=AAPL[&force=true]
 *   GET /build-all[?force=true]
 */

const TRACKED_TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "MS", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX",
];

// Trigger thresholds — all tunable in one place.
const TRIGGER_MAGNITUDE = 0.6;      // news headline |magnitude|
const TRIGGER_PRICE_MOVE_PCT = 1.5; // intraday |move%|
const STALE_DAYS = 7;               // max days since last short trend

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const force = url.searchParams.get("force") === "true";

    if (url.pathname === "/build") {
      const ticker = url.searchParams.get("ticker");
      if (!ticker) return Response.json({ ok: false, error: "ticker required" }, { status: 400 });
      try {
        const out = await buildForTicker(env.DB, apiKey, ticker, force);
        return Response.json({ ok: true, ...out });
      } catch (e) {
        return Response.json({ ok: false, ticker, error: e.message }, { status: 500 });
      }
    }

    if (url.pathname === "/build-all") {
      const results = [];
      for (const ticker of TRACKED_TICKERS) {
        try {
          const out = await buildForTicker(env.DB, apiKey, ticker, force);
          results.push({ ticker, ok: true, ...summarize(out) });
          console.log(
            `[trend-short] ${ticker} ${out.skipped ? "skipped" : `${out.regime}/${out.trigger}`}`,
          );
        } catch (e) {
          console.error(`[trend-short] ${ticker} FAILED: ${e.message}`);
          results.push({ ticker, ok: false, error: e.message });
        }
      }
      return Response.json({ ok: true, count: results.length, results });
    }

    return new Response("Not found", { status: 404 });
  },
};

function summarize(out) {
  if (out.skipped) return { skipped: true, reason: out.reason };
  return { regime: out.regime, score: out.score, trigger: out.trigger };
}

async function buildForTicker(db, apiKey, ticker, force) {
  const today = new Date().toISOString().slice(0, 10);
  const windowStart = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

  // Load everything in parallel.
  const [
    longRow,
    sigHist14,
    todaysHeadlines,
    prices14,
    press,
    currentShort,
  ] = await Promise.all([
    db.prepare(`SELECT * FROM TICKER_TREND_long WHERE ticker = ?`).bind(ticker).first(),
    db
      .prepare(
        `SELECT date, sentiment_score, magnitude, news_count, earnings_flag, top_headline
           FROM SIGNAL_HISTORY_daily
          WHERE ticker = ? AND date >= ?
          ORDER BY date ASC`,
      )
      .bind(ticker, windowStart)
      .all(),
    db
      .prepare(
        `SELECT title, summary, sentiment, magnitude
           FROM BETA_12_News_digest
          WHERE type = 'ticker' AND ticker = ? AND date = ?
          ORDER BY rank ASC LIMIT 6`,
      )
      .bind(ticker, today)
      .all(),
    db
      .prepare(
        `SELECT date, open, close FROM PRICE_01_Daily
          WHERE ticker = ? AND date >= ?
          ORDER BY date ASC`,
      )
      .bind(ticker, windowStart)
      .all(),
    db
      .prepare(
        `SELECT date, heading, summary, sentiment, magnitude
           FROM ALPHA_03_Press
          WHERE ticker = ? AND date >= ?
          ORDER BY date DESC LIMIT 3`,
      )
      .bind(ticker, twoDaysAgo)
      .all(),
    db.prepare(`SELECT as_of FROM TICKER_TREND_short WHERE ticker = ?`).bind(ticker).first(),
  ]);

  const sig = sigHist14.results || [];
  const prices = prices14.results || [];
  const pressRows = press.results || [];
  const headlines = todaysHeadlines.results || [];

  // Evaluate triggers.
  let trigger = null;
  let triggerDetail = null;

  const todaySig = sig.find((r) => r.date === today);
  if (todaySig && Math.abs(todaySig.magnitude || 0) >= TRIGGER_MAGNITUDE) {
    trigger = "news";
    triggerDetail = `news magnitude ${Number(todaySig.magnitude).toFixed(2)} >= ${TRIGGER_MAGNITUDE}`;
  }

  const todayPrice = prices.find((p) => p.date === today);
  if (!trigger && todayPrice && todayPrice.open > 0) {
    const pct = ((todayPrice.close - todayPrice.open) / todayPrice.open) * 100;
    if (Math.abs(pct) >= TRIGGER_PRICE_MOVE_PCT) {
      trigger = "price_move";
      triggerDetail = `intraday ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% >= ${TRIGGER_PRICE_MOVE_PCT}%`;
    }
  }

  if (!trigger && pressRows.length > 0) {
    trigger = "press";
    triggerDetail = `press release ${pressRows[0].date}: ${(pressRows[0].heading || "").slice(0, 80)}`;
  }

  if (!trigger) {
    if (!currentShort?.as_of || currentShort.as_of < sevenDaysAgo) {
      trigger = "stale";
      triggerDetail = currentShort?.as_of
        ? `last update ${currentShort.as_of} >= ${STALE_DAYS} days old`
        : "no existing short-term trend";
    }
  }

  if (!trigger && !force) {
    return { skipped: true, reason: "no trigger" };
  }
  if (force && !trigger) {
    trigger = "force";
    triggerDetail = "force=true (bootstrap)";
  }

  // Build prompt.
  const sector = lookupSector(ticker);

  const longBaseline = longRow
    ? `${longRow.regime} (score ${fmt(longRow.score)}) — ${longRow.thesis || ""}`
    : "(no long-term trend available)";

  const sigBlock =
    sig.length === 0
      ? "  (no signal history)"
      : sig
          .map(
            (r) =>
              `  ${r.date}  sent=${fmt(r.sentiment_score)} mag=${fmt(r.magnitude)} news=${r.news_count}${r.earnings_flag ? " [EARNINGS]" : ""}${r.top_headline ? "  top=" + r.top_headline.slice(0, 80) : ""}`,
          )
          .join("\n");

  const headlinesBlock =
    headlines.length === 0
      ? "  (no headlines today)"
      : headlines
          .map(
            (h) =>
              `  • ${h.title}  (${h.sentiment || "-"}, mag=${h.magnitude ?? "?"})\n    ${(h.summary || "").slice(0, 200)}`,
          )
          .join("\n");

  const priceBlock =
    prices.length === 0
      ? "  (no price history)"
      : prices
          .map((p) => {
            const pct = p.open > 0 ? (((p.close - p.open) / p.open) * 100).toFixed(2) : "?";
            return `  ${p.date}  close=${fmt(p.close)}  intraday=${pct}%`;
          })
          .join("\n");

  const pressBlock =
    pressRows.length === 0
      ? "  (no recent press)"
      : pressRows
          .map(
            (p) =>
              `  ${p.date}  ${p.heading || ""}  (${p.sentiment || "-"}, mag=${p.magnitude ?? "?"})\n    ${(p.summary || "").slice(0, 200)}`,
          )
          .join("\n");

  const prompt = `You are a senior equity analyst. Build the SHORT-TERM tactical trend for ${ticker} (${sector}). This trend layers on top of the slow long-term baseline below and reacts to news, press, and price action over the last 2 weeks.

TRIGGER
${trigger} — ${triggerDetail}

LONG-TERM BASELINE (unchanged by this call)
  ${longBaseline}

SIGNAL HISTORY (last 14 days — daily aggregate sentiment + news)
${sigBlock}

TODAY'S HEADLINES (detailed)
${headlinesBlock}

PRICE HISTORY (last 14 days)
${priceBlock}

RECENT PRESS
${pressBlock}

TASK
Output EXACTLY this JSON — no markdown, no prose outside:

{
  "regime":   "bullish" | "cautious_bullish" | "neutral" | "cautious_bearish" | "bearish",
  "score":    -1.0 to 1.0,
  "thesis":   "one sentence capturing the tactical story RIGHT NOW",
  "drivers":  [{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}],
  "narrative":[{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}]
}

RULES
- This is SHORT-TERM. The long-term baseline is context only; do not just echo it.
- regime should reflect tactical conditions: the last 1-2 weeks of news and price, not the fundamentals story.
- score follows regime ranges: bullish > 0.4, cautious_bullish 0.1..0.4, neutral -0.1..0.1, cautious_bearish -0.4..-0.1, bearish < -0.4
- drivers: 3-5 items, sorted by importance, each < 20 words, grounded in the data above
- narrative: 2-4 items, telling the story of how we got to the current tactical view
- bias: bull supports upside, bear supports downside, neutral genuinely two-sided
- If data is sparse or contradictory, pick "neutral" and say so in thesis
- It is LEGITIMATE for short-term regime to differ from long-term (e.g. long bullish but short cautious_bearish due to a downgrade)`;

  const blob = await callGPT5(apiKey, prompt);
  if (!blob?.regime) throw new Error("invalid LLM output");

  // Upsert TICKER_TREND_short
  await db
    .prepare(
      `INSERT INTO TICKER_TREND_short
         (ticker, as_of, trigger, trigger_detail, regime, score, thesis, drivers, narrative, raw_blob)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticker) DO UPDATE SET
         as_of = excluded.as_of,
         trigger = excluded.trigger,
         trigger_detail = excluded.trigger_detail,
         regime = excluded.regime,
         score = excluded.score,
         thesis = excluded.thesis,
         drivers = excluded.drivers,
         narrative = excluded.narrative,
         raw_blob = excluded.raw_blob`,
    )
    .bind(
      ticker,
      today,
      trigger,
      triggerDetail,
      blob.regime,
      Number(blob.score) || 0,
      blob.thesis || "",
      JSON.stringify(blob.drivers || []),
      JSON.stringify(blob.narrative || []),
      JSON.stringify(blob),
    )
    .run();

  // Mark today's signal-history row as trend_updated = 1
  await db
    .prepare(
      `UPDATE SIGNAL_HISTORY_daily SET trend_updated = 1
        WHERE ticker = ? AND date = ?`,
    )
    .bind(ticker, today)
    .run();

  return {
    ticker,
    regime: blob.regime,
    score: blob.score,
    trigger,
    triggerDetail,
  };
}

const SECTOR_MAP = {
  Technology: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "INTC", "AMD", "NFLX", "TSLA"],
  Finance: ["JPM", "GS", "BAC", "MS", "BRK.B"],
  Energy: ["XOM", "CVX"],
  Healthcare: ["UNH", "LLY", "JNJ"],
  Consumer: ["PG", "KO", "HD"],
  Industrial: ["CAT", "BA"],
};
function lookupSector(ticker) {
  for (const [s, ts] of Object.entries(SECTOR_MAP)) if (ts.includes(ticker)) return s;
  return "Unknown";
}

function fmt(v) {
  if (v == null) return "?";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "?";
}

async function callGPT5(apiKey, prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "gpt-5 error");
  const text = j.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty gpt-5 output");
  return JSON.parse(text);
}
