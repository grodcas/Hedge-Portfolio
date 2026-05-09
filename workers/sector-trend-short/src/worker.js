import { openaiFetch } from "../../_shared/openai-call.js";
/**
 * SECTOR-TREND-SHORT
 *
 * Tactical sector thesis. Analogous to ticker-trend-short. Trigger-gated.
 *
 * Triggers (any one fires):
 *   - stance_change : SECTOR_FACTORS_daily.stance differs from prior day
 *   - rs_cross      : rs_ratio crosses 100 (JdK center) since prior day
 *   - stale         : last SECTOR_TREND_short row is ≥ STALE_DAYS old (or missing)
 *   - force         : query param force=true bypasses checks
 *
 * Inputs (on trigger fire):
 *   - today + yesterday SECTOR_FACTORS_daily row
 *   - constituent TICKER_TREND_short rows
 *   - last 14d PRICE_01_Daily for the sector ETF
 *   - SECTOR_TREND_long baseline (if present)
 *   - BETA_10_Daily_macro regime
 *
 * Output: upsert SECTOR_TREND_short.
 *
 * Endpoints:
 *   GET /build?sector=Healthcare[&force=true]
 *   GET /build-all[?force=true]
 */

// Sector constituents per SPDR/GICS ETF convention (post-2018 reclass).
// GOOGL and META sit in XLC, not XLK.
const SECTOR_CONSTITUENTS = {
  Technology:    ["AAPL", "MSFT", "NVDA", "INTC", "AMD"],
  ConsDisc:      ["AMZN", "TSLA", "HD"],
  Communication: ["GOOGL", "META", "NFLX"],
  Finance:       ["JPM", "GS", "BAC", "MS", "BRK.B"],
  Energy:        ["XOM", "CVX"],
  Healthcare:    ["UNH", "LLY", "JNJ"],
  Staples:       ["PG", "KO"],
  Industrial:    ["CAT", "BA"],
};

const SECTOR_ETF = {
  Technology: "XLK", ConsDisc: "XLY", Communication: "XLC", Finance: "XLF",
  Energy: "XLE", Healthcare: "XLV", Staples: "XLP", Industrial: "XLI",
};

const SECTORS = Object.keys(SECTOR_CONSTITUENTS);

const STALE_DAYS = 7;

export default {
  async fetch(req, env) {
    globalThis.__OAI_CTX = { env, caller: "sector-trend-short" };
    const url = new URL(req.url);
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const force = url.searchParams.get("force") === "true";

    if (url.pathname === "/build") {
      const sector = url.searchParams.get("sector");
      if (!sector || !SECTOR_CONSTITUENTS[sector]) {
        return Response.json({ ok: false, error: `unknown sector` }, { status: 400 });
      }
      try {
        const out = await buildForSector(env.DB, apiKey, sector, force);
        return Response.json({ ok: true, ...out });
      } catch (e) {
        return Response.json({ ok: false, sector, error: e.message }, { status: 500 });
      }
    }

    if (url.pathname === "/build-all") {
      const results = [];
      for (const sector of SECTORS) {
        try {
          const out = await buildForSector(env.DB, apiKey, sector, force);
          results.push({ sector, ok: true, ...summarize(out) });
          console.log(
            `[sector-trend-short] ${sector} ${out.skipped ? `skipped:${out.reason}` : `${out.regime}/${out.trigger}`}`,
          );
        } catch (e) {
          console.error(`[sector-trend-short] ${sector} FAILED: ${e.message}`);
          results.push({ sector, ok: false, error: e.message });
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

async function buildForSector(db, apiKey, sector, force) {
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - STALE_DAYS * 86400000).toISOString().slice(0, 10);
  const constituents = SECTOR_CONSTITUENTS[sector];
  const etf = SECTOR_ETF[sector];

  // Load factor snapshots (today + prior day), current short row, long baseline, constituents' short theses.
  const [factorRes, currentShort, longRow, constituentRes, macroRow] = await Promise.all([
    db.prepare(`
      SELECT * FROM SECTOR_FACTORS_daily
       WHERE sector = ?
       ORDER BY date DESC LIMIT 2
    `).bind(sector).all(),
    db.prepare(`SELECT * FROM SECTOR_TREND_short WHERE sector = ?`).bind(sector).first(),
    db.prepare(`SELECT regime, score, thesis FROM SECTOR_TREND_long WHERE sector = ?`).bind(sector).first(),
    db.prepare(`
      SELECT ticker, regime, score, thesis FROM TICKER_TREND_short
       WHERE ticker IN (${constituents.map(() => "?").join(",")})
    `).bind(...constituents).all(),
    db.prepare(`SELECT summary FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1`).first(),
  ]);

  const factors = factorRes.results || [];
  const todayFactors = factors[0] || null;
  const ydayFactors = factors[1] || null;

  // -------- Evaluate triggers --------
  let trigger = null;
  let triggerDetail = null;

  if (todayFactors && ydayFactors && todayFactors.stance && ydayFactors.stance
      && todayFactors.stance !== ydayFactors.stance) {
    trigger = "stance_change";
    triggerDetail = `${ydayFactors.stance} → ${todayFactors.stance}`;
  }

  if (!trigger && todayFactors?.rs_ratio != null && ydayFactors?.rs_ratio != null) {
    const todaySign = Math.sign(todayFactors.rs_ratio - 100);
    const ydaySign = Math.sign(ydayFactors.rs_ratio - 100);
    if (todaySign !== 0 && ydaySign !== 0 && todaySign !== ydaySign) {
      trigger = "rs_cross";
      triggerDetail = `rs_ratio ${ydayFactors.rs_ratio.toFixed(1)} → ${todayFactors.rs_ratio.toFixed(1)}`;
    }
  }

  if (!trigger) {
    if (!currentShort?.as_of || currentShort.as_of < sevenDaysAgo) {
      trigger = "stale";
      triggerDetail = currentShort?.as_of
        ? `last update ${currentShort.as_of} ≥ ${STALE_DAYS} days old`
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

  // -------- Load the ETF price history only when we're actually building --------
  const pricesRes = await db.prepare(`
    SELECT date, open, close FROM PRICE_01_Daily
     WHERE ticker = ? AND date >= date('now', '-14 days')
     ORDER BY date ASC
  `).bind(etf).all();
  const prices = pricesRes.results || [];

  // -------- Build prompt --------
  let macroRegime = "neutral";
  try {
    if (macroRow?.summary) {
      const blob = JSON.parse(macroRow.summary);
      if (blob?.trend?.regime) macroRegime = blob.trend.regime;
    }
  } catch (_) { /* non-JSON */ }

  const tickerTrends = {};
  for (const r of (constituentRes.results || [])) tickerTrends[r.ticker] = r;

  const longBaseline = longRow
    ? `${longRow.regime} (score ${fmt(longRow.score)}) — ${longRow.thesis || ""}`
    : "(no long trend)";

  const factorBlock = todayFactors
    ? `  today (${todayFactors.date}): stance=${todayFactors.stance ?? "?"} score=${fmt(todayFactors.stance_score)} rs_ratio=${fmt(todayFactors.rs_ratio)} rs_momentum=${fmt(todayFactors.rs_momentum)} rel_13w=${fmt(todayFactors.rel_strength_13w)} breadth_200dma=${fmt(todayFactors.breadth_above_200dma)}`
    : "  (no factor row today)";

  const ydayBlock = ydayFactors
    ? `  yesterday (${ydayFactors.date}): stance=${ydayFactors.stance ?? "?"} score=${fmt(ydayFactors.stance_score)} rs_ratio=${fmt(ydayFactors.rs_ratio)}`
    : "  (no prior-day factor row)";

  const priceBlock = prices.length === 0
    ? "  (no ETF price history)"
    : prices.slice(-7).map((p) => {
        const intraday = (p.open && p.open > 0) ? ((p.close - p.open) / p.open * 100).toFixed(2) : "?";
        return `  ${p.date}: close=${fmt(p.close)}, intraday=${intraday}%`;
      }).join("\n");

  const constituentBlock = constituents
    .map((t) => {
      const row = tickerTrends[t];
      if (!row) return `  ${t}: (no short trend)`;
      return `  ${t}: ${row.regime ?? "?"} (score ${fmt(row.score)}) — ${(row.thesis || "").slice(0, 160)}`;
    })
    .join("\n");

  const prompt = `You are a senior sector strategist writing the TACTICAL (1–2 week) thesis for ${sector} (ETF ${etf}). The trigger that fired this rebuild: ${trigger} — ${triggerDetail}. Use the structural long thesis as baseline, then overlay recent factor movement, ETF price action, and what constituent short theses are saying.

LONG-TERM BASELINE
  ${longBaseline}

SECTOR FACTORS (today vs yesterday)
${factorBlock}
${ydayBlock}

ETF PRICE (last 7 bars)
${priceBlock}

CONSTITUENT SHORT THESES
${constituentBlock}

MACRO REGIME
  ${macroRegime}

TASK
Output EXACTLY this JSON — no markdown, no prose outside:

{
  "regime":   "bullish" | "cautious_bullish" | "neutral" | "cautious_bearish" | "bearish",
  "score":    -1.0 to 1.0,
  "thesis":   "one sentence capturing what changed and why it matters tactically",
  "drivers":  [{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}],
  "narrative":[{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}]
}

RULES
- regime = short-horizon (1–2 week) conviction, can differ from the long baseline
- score aligns with regime: bullish > 0.4, cautious_bullish 0.1..0.4, neutral -0.1..0.1, cautious_bearish -0.4..-0.1, bearish < -0.4
- Lead with the triggering signal (${trigger}) — the thesis should answer "why now"
- drivers: 3-5 items, each < 20 words, grounded in the factor movement OR constituent short theses OR ETF price action
- narrative: 3-5 items describing the 1-2 week arc
- If data is sparse (e.g., only 1 factor row), say so in thesis and pick "neutral"
- Do NOT reference specific filings or earnings details — that's the long worker's job`;

  const blob = await callGPT5(apiKey, prompt);
  if (!blob?.regime) throw new Error("invalid LLM output");

  const asOf = today;

  await db.prepare(`
    INSERT INTO SECTOR_TREND_short
      (sector, as_of, trigger, trigger_detail, regime, score, thesis, drivers, narrative, raw_blob)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sector) DO UPDATE SET
      as_of = excluded.as_of,
      trigger = excluded.trigger,
      trigger_detail = excluded.trigger_detail,
      regime = excluded.regime,
      score = excluded.score,
      thesis = excluded.thesis,
      drivers = excluded.drivers,
      narrative = excluded.narrative,
      raw_blob = excluded.raw_blob
  `).bind(
    sector, asOf, trigger, triggerDetail,
    blob.regime,
    Number(blob.score) || 0,
    blob.thesis || "",
    JSON.stringify(blob.drivers || []),
    JSON.stringify(blob.narrative || []),
    JSON.stringify(blob),
  ).run();

  return {
    sector,
    regime: blob.regime,
    score: blob.score,
    trigger,
    trigger_detail: triggerDetail,
    thesis: blob.thesis,
    macro_regime: macroRegime,
  };
}

function fmt(v) {
  if (v == null) return "?";
  const n = Number(v);
  if (!Number.isFinite(n)) return "?";
  return n.toFixed(2);
}

async function callGPT5(apiKey, prompt) {
  const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
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
