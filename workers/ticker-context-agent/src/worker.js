/**
 * TICKER-CONTEXT-AGENT (#6 Context reading) — per [TICKER_PIPELINE.md §6].
 *
 * One short paragraph on whether the regime + sector tape + macro events are
 * tailwind / neutral / headwind for the thesis right now.
 *
 * Inputs (per ticker):
 *   - Macro regime + macro thesis drivers + macro thesis tripwires
 *     (BETA_10_Daily_macro)
 *   - Sector thesis drivers + sector tape (SECTOR_TREND_long for the
 *     ticker's sector + SECTOR_FACTORS_daily latest snapshot)
 *   - Upcoming macro calendar events (MACRO_STATE_calendar, next 21d, high
 *     impact only)
 *   - Prior ticker thesis drivers (used as the filter for which calendar
 *     events matter for THIS ticker)
 *
 * Output (validated):
 *   {
 *     prose: string,
 *     verdict: "tailwind" | "neutral" | "headwind",
 *     event_count: int,        // calendar events surfaced in the prose
 *     version, last_updated, input_fingerprint, ticker_at_write
 *   }
 *
 * Writes TICKER_TREND_long.{context_json, _updated_at, _model}.
 * Endpoint: GET /build?ticker=NVDA[&force=1].
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";
const VALID_VERDICTS = new Set(["tailwind", "neutral", "headwind"]);

const SECTOR_MAP = {
  Technology:    ["AAPL", "MSFT", "NVDA", "INTC", "AMD"],
  ConsDisc:      ["AMZN", "TSLA", "HD"],
  Communication: ["GOOGL", "META", "NFLX"],
  Finance:       ["JPM", "GS", "BAC", "MS", "BRK.B"],
  Energy:        ["XOM", "CVX"],
  Healthcare:    ["UNH", "LLY", "JNJ"],
  Staples:       ["PG", "KO"],
  Industrial:    ["CAT", "BA"],
};
const TICKER_TO_SECTOR = (() => {
  const m = {};
  for (const [sec, tickers] of Object.entries(SECTOR_MAP)) {
    for (const t of tickers) m[t] = sec;
  }
  return m;
})();

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const ticker = url.searchParams.get("ticker");
    if (!ticker) return Response.json({ ok: false, error: "ticker query param required" }, { status: 400 });
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";

    try {
      const out = await build(env.DB, apiKey, ticker, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(db, apiKey, ticker, force) {
  const sector = TICKER_TO_SECTOR[ticker] || null;

  const [trendRow, macroRow, sectorRow, sectorFactors, calendarRes] = await Promise.all([
    db.prepare(
      `SELECT thesis_json, context_json, context_updated_at
         FROM TICKER_TREND_long WHERE ticker = ?`,
    ).bind(ticker).first(),
    db.prepare(
      `SELECT regime, confidence, thesis_json
         FROM BETA_10_Daily_macro
        WHERE thesis_json IS NOT NULL
        ORDER BY creation_date DESC LIMIT 1`,
    ).first(),
    sector
      ? db.prepare(
          `SELECT thesis_json FROM SECTOR_TREND_long WHERE sector = ?`,
        ).bind(sector).first()
      : Promise.resolve(null),
    sector
      ? db.prepare(
          `SELECT date, regime_fit, valuation_sigma, rs_ratio, rs_momentum,
                  rel_strength_13w, breadth_above_200dma, earn_momentum,
                  fwd_pe_sector, stance, stance_score
             FROM SECTOR_FACTORS_daily WHERE sector = ?
            ORDER BY date DESC LIMIT 1`,
        ).bind(sector).first()
      : Promise.resolve(null),
    db.prepare(
      `SELECT event_date, country, event_code, event_label, impact, consensus, prior
         FROM MACRO_STATE_calendar
        WHERE event_date >= date('now')
          AND event_date <= date('now', '+21 days')
          AND impact = 'high'
        ORDER BY event_date ASC LIMIT 12`,
    ).all(),
  ]);
  if (!trendRow) throw new Error(`no TICKER_TREND_long row for ${ticker}`);
  if (!macroRow) throw new Error("no macro thesis_json yet (M2 must fire first)");

  const macroThesis  = safeJson(macroRow.thesis_json) || {};
  const sectorThesis = sectorRow?.thesis_json ? safeJson(sectorRow.thesis_json) : null;
  const tickerThesis = trendRow.thesis_json ? safeJson(trendRow.thesis_json) : null;
  const tickerDrivers = Array.isArray(tickerThesis?.drivers) ? tickerThesis.drivers : [];

  const events = calendarRes?.results || [];

  const prevContext = trendRow.context_json ? safeJson(trendRow.context_json) : null;
  const prevVersion = Number.isInteger(prevContext?.version) ? prevContext.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    ticker,
    macro_regime:    macroRow.regime,
    macro_drivers:   (macroThesis.drivers   || []).map(d => d.name),
    macro_tripwires: (macroThesis.tripwires || []).map(t => t.id),
    sector_drivers:  (sectorThesis?.drivers || []).map(d => d.name),
    sector_factors:  sectorFactors ? [
      sectorFactors.regime_fit, sectorFactors.valuation_sigma,
      sectorFactors.rs_ratio, sectorFactors.rs_momentum,
      sectorFactors.breadth_above_200dma, sectorFactors.stance,
    ] : null,
    events:          events.map(e => [e.event_date, e.country, e.event_code]),
    ticker_drivers:  tickerDrivers.map(d => d.name),
  }));

  if (!force && prevContext?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      ticker,
      version: prevVersion,
      context_updated_at: trendRow.context_updated_at,
    };
  }

  const prompt = buildPrompt({
    ticker, sector,
    macroRegime:    macroRow.regime || "unclassified",
    macroConf:      macroRow.confidence,
    macroDrivers:   macroThesis.drivers   || [],
    macroTripwires: macroThesis.tripwires || [],
    sectorDrivers:  sectorThesis?.drivers || [],
    sectorFactors,
    events,
    tickerDrivers,
    prevContext,
  });
  const blob = await callLLM(apiKey, prompt, { model: MODEL });
  validate(blob);

  const now = new Date().toISOString();
  const out = {
    prose:        blob.prose.trim(),
    verdict:      blob.verdict,
    event_count:  Number.isInteger(blob.event_count) ? blob.event_count : 0,
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    ticker_at_write: ticker,
  };

  await db.prepare(
    `UPDATE TICKER_TREND_long
        SET context_json       = ?,
            context_updated_at = ?,
            context_model      = ?
      WHERE ticker = ?`,
  ).bind(JSON.stringify(out), now, MODEL, ticker).run();

  return {
    action: "wrote",
    ticker,
    version: out.version,
    verdict: out.verdict,
    event_count: out.event_count,
    context_updated_at: now,
  };
}

function buildPrompt({ ticker, sector, macroRegime, macroConf, macroDrivers, macroTripwires, sectorDrivers, sectorFactors, events, tickerDrivers, prevContext }) {
  const confPct = Number.isFinite(macroConf) ? `${(macroConf * 100).toFixed(0)}%` : "?";
  const macroDrvBlock = macroDrivers.length
    ? macroDrivers.map(d => `  - ${d.name}: ${d.rationale}`).join("\n")
    : "  (no macro drivers)";
  const macroTripBlock = macroTripwires.length
    ? macroTripwires.map(t => `  - [${t.id}] ${t.condition} — currently: ${t.currently}`).join("\n")
    : "  (no macro tripwires)";
  const sectorDrvBlock = sectorDrivers.length
    ? sectorDrivers.map(d => `  - ${d.name}: ${d.rationale}`).join("\n")
    : "  (no sector drivers)";
  const sectorFactorsBlock = sectorFactors
    ? `  date:                ${sectorFactors.date}
  regime_fit:          ${fmtNum(sectorFactors.regime_fit)}
  valuation_sigma:     ${fmtNum(sectorFactors.valuation_sigma)}σ
  rel_strength_13w:    ${fmtNum(sectorFactors.rel_strength_13w)}
  rs_ratio (RRG x):    ${fmtNum(sectorFactors.rs_ratio)}
  rs_momentum (RRG y): ${fmtNum(sectorFactors.rs_momentum)}
  breadth_above_200d:  ${fmtNum(sectorFactors.breadth_above_200dma)}
  earn_momentum:       ${fmtNum(sectorFactors.earn_momentum)}
  stance:              ${sectorFactors.stance ?? "?"} (score ${fmtNum(sectorFactors.stance_score)})`
    : "  (no SECTOR_FACTORS_daily row for sector)";
  const eventsBlock = events.length
    ? events.map(e => `  ${e.event_date} ${e.country}/${e.event_code.padEnd(8)} ${e.event_label || ""}  consensus=${e.consensus ?? "?"}  prior=${e.prior ?? "?"}`).join("\n")
    : "  (no high-impact events in next 21d)";
  const tickerDrvBlock = tickerDrivers.length
    ? tickerDrivers.map(d => `  - ${d.name}: ${d.rationale}`).join("\n")
    : "  (no prior ticker thesis — call this first version; weigh sector tape heaviest)";

  const prevBlock = prevContext
    ? `Version: ${prevContext.version} (last updated ${prevContext.last_updated})
Verdict: ${prevContext.verdict}
Prose: ${prevContext.prose}`
    : "(no prior context reading)";

  return `You are a senior equity analyst writing the macro/sector context reading for ${ticker} (sector: ${sector || "unknown"}). One short paragraph on whether the regime + sector tape + upcoming macro events are TAILWIND, NEUTRAL, or HEADWIND for the ticker thesis right now.

TICKER THESIS DRIVERS (use as the filter — only events / sector signals that touch THESE matter)
${tickerDrvBlock}

MACRO REGIME
  Label: ${macroRegime}  (confidence ${confPct})

MACRO THESIS DRIVERS
${macroDrvBlock}

MACRO THESIS TRIPWIRES
${macroTripBlock}

${sector || "?"} SECTOR THESIS DRIVERS
${sectorDrvBlock}

${sector || "?"} SECTOR FACTORS (latest)
${sectorFactorsBlock}

UPCOMING HIGH-IMPACT MACRO EVENTS (next 21d)
${eventsBlock}

PREVIOUS CONTEXT READING (drift gradually — only flip when conditions demand)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one short paragraph, 3-5 sentences. Reference the regime label, ONE sector factor (with the actual number), and the nearest event that touches a ticker driver. Tie back to whether each is tailwind / headwind for the ticker.>",
  "verdict": "tailwind" | "neutral" | "headwind",
  "event_count": <integer — count of upcoming events the prose explicitly cites>
}

RULES
- Filter the calendar through the ticker drivers — drop events that don't touch a driver. event_count = the events you actually cited.
- "tailwind" = regime + sector tape both supportive (e.g. risk-on regime + sector OW + drivers reinforced by events). "headwind" = at least one of {regime against, sector UW with breadth deteriorating, tripwire near, hostile event imminent}. Otherwise "neutral".
- Cite at least one specific number from the sector factors block. Do NOT cite a metric marked "(NA)".
- Do not hedge — pick one verdict.`;
}

function fmtNum(v) {
  if (v == null) return "(NA)";
  const n = Number(v);
  if (!Number.isFinite(n)) return "(NA)";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 10)   return n.toFixed(2);
  return n.toFixed(3);
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validate(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 50) {
    throw new Error("invalid output: prose missing or too short");
  }
  if (!VALID_VERDICTS.has(blob.verdict)) {
    throw new Error(`invalid verdict: ${blob.verdict}`);
  }
  if (blob.event_count != null && (!Number.isInteger(blob.event_count) || blob.event_count < 0)) {
    throw new Error(`invalid event_count: ${blob.event_count}`);
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
