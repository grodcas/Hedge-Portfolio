import { openaiFetch } from "../../_shared/openai-call.js";
/**
 * SECTOR-TREND-LONG
 *
 * Slow structural thesis per sector. Analogous to ticker-trend-long but keyed
 * by sector. Synthesizes an 8-week SECTOR_FACTORS_daily trajectory together
 * with constituent ticker long theses and the current macro regime into a
 * single gpt-5 JSON blob.
 *
 * Endpoints:
 *   GET /build?sector=Healthcare   — build for one sector
 *   GET /build-all                 — loop all 8 sectors
 *
 * Writes to SECTOR_TREND_long (PK = sector, upsert in place).
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

export default {
  async fetch(req, env) {
    globalThis.__OAI_CTX = { env, caller: "sector-trend-long" };
    const url = new URL(req.url);
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    if (url.pathname === "/build") {
      const sector = url.searchParams.get("sector");
      if (!sector || !SECTOR_CONSTITUENTS[sector]) {
        return Response.json({ ok: false, error: `unknown sector (must be one of ${SECTORS.join(",")})` }, { status: 400 });
      }
      try {
        const out = await buildForSector(env.DB, apiKey, sector);
        return Response.json({ ok: true, ...out });
      } catch (e) {
        return Response.json({ ok: false, sector, error: e.message }, { status: 500 });
      }
    }

    if (url.pathname === "/build-all") {
      const results = [];
      for (const sector of SECTORS) {
        try {
          const out = await buildForSector(env.DB, apiKey, sector);
          results.push({ sector, ok: true, regime: out.regime, score: out.score });
          console.log(`[sector-trend-long] ${sector} regime=${out.regime} score=${out.score}`);
        } catch (e) {
          console.error(`[sector-trend-long] ${sector} FAILED: ${e.message}`);
          results.push({ sector, ok: false, error: e.message });
        }
      }
      return Response.json({ ok: true, count: results.length, results });
    }

    return new Response("Not found", { status: 404 });
  },
};

async function buildForSector(db, apiKey, sector) {
  const constituents = SECTOR_CONSTITUENTS[sector];
  const etf = SECTOR_ETF[sector];

  // Load 8-week factor trajectory, constituent long theses, macro regime.
  const [factorRes, constituentRes, macroRow] = await Promise.all([
    db.prepare(`
      SELECT date, regime_fit, earn_momentum, beat_rate_sector, valuation_sigma,
             rel_strength_13w, rs_ratio, rs_momentum,
             stance_score, stance, fwd_pe_sector, breadth_above_200dma
        FROM SECTOR_FACTORS_daily
       WHERE sector = ?
       ORDER BY date DESC LIMIT 56
    `).bind(sector).all(),
    db.prepare(`
      SELECT ticker, regime, score, thesis FROM TICKER_TREND_long
       WHERE ticker IN (${constituents.map(() => "?").join(",")})
    `).bind(...constituents).all(),
    db.prepare(`SELECT summary FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1`).first(),
  ]);

  const factorRows = (factorRes.results || []).slice().reverse(); // chronological
  const tickerTrends = indexBy(constituentRes.results || [], "ticker");

  let macroRegime = "neutral";
  let macroSummary = "";
  try {
    if (macroRow?.summary) {
      const blob = JSON.parse(macroRow.summary);
      if (blob?.trend?.regime) macroRegime = blob.trend.regime;
      if (blob?.trend?.window_rationale) macroSummary = blob.trend.window_rationale;
    }
  } catch (_) { /* non-JSON row */ }

  if (factorRows.length === 0) {
    throw new Error(`no SECTOR_FACTORS_daily rows for ${sector}`);
  }

  const latest = factorRows[factorRows.length - 1];
  const oldest = factorRows[0];

  // Build prompt blocks.
  const factorBlock = factorRows.length === 0
    ? "  (no sector factor data)"
    : [
        `  latest (${latest.date}): stance=${latest.stance ?? "?"} score=${fmt(latest.stance_score)} regime_fit=${fmt(latest.regime_fit)} fwd_pe=${fmt(latest.fwd_pe_sector)} beat_rate=${fmt(latest.beat_rate_sector)} breadth_200dma=${fmt(latest.breadth_above_200dma)} rs_ratio=${fmt(latest.rs_ratio)} rs_momentum=${fmt(latest.rs_momentum)}`,
        factorRows.length > 1
          ? `  earliest (${oldest.date}): stance=${oldest.stance ?? "?"} score=${fmt(oldest.stance_score)} fwd_pe=${fmt(oldest.fwd_pe_sector)} beat_rate=${fmt(oldest.beat_rate_sector)}`
          : "  (only one day of history available)",
        `  trajectory length: ${factorRows.length} rows`,
      ].join("\n");

  const constituentBlock = constituents
    .map((t) => {
      const row = tickerTrends[t];
      if (!row) return `  ${t}: (no long trend)`;
      return `  ${t}: ${row.regime ?? "?"} (score ${fmt(row.score)}) — ${(row.thesis || "").slice(0, 200)}`;
    })
    .join("\n");

  const prompt = `You are a senior sector strategist. Build the long-term thesis for the ${sector} sector (SPDR ETF ${etf}) by synthesizing (a) its 8-week factor trajectory, (b) the long-term stories of its portfolio constituents, and (c) the current macro regime.

SECTOR FACTOR TRAJECTORY
${factorBlock}

CONSTITUENT LONG-TERM THESES
${constituentBlock}

MACRO REGIME
  ${macroRegime}${macroSummary ? ` — ${macroSummary.slice(0, 240)}` : ""}

TASK
Output EXACTLY this JSON — no markdown, no prose outside:

{
  "regime":   "bullish" | "cautious_bullish" | "neutral" | "cautious_bearish" | "bearish",
  "score":    -1.0 to 1.0,
  "thesis":   "one sentence capturing the sector's structural story",
  "drivers":  [{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}],
  "narrative":[{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}]
}

RULES
- regime = long-horizon conviction on the sector's fundamentals + structural position
- score aligns with regime: bullish > 0.4, cautious_bullish 0.1..0.4, neutral -0.1..0.1, cautious_bearish -0.4..-0.1, bearish < -0.4
- drivers: 3-5 items, ordered by importance, each < 20 words, grounded in the factor trajectory OR constituent theses above
- narrative: 3-5 items describing how the sector's position has evolved across the 8-week window
- bias: "bull" = supports upside, "bear" = supports downside, "neutral" = two-sided
- Lean on the factor trajectory more than constituents; constituents are confirming detail, not the headline
- Regime_fit scores come from a hardcoded macro×sector affinity matrix — weight them but don't quote the exact number
- If factor history is only 1-2 rows, say so in thesis and pick "neutral"
- Do NOT reference specific ETF prices, today's news, or intraday moves — this is the slow structural view`;

  const blob = await callGPT5(apiKey, prompt);
  if (!blob?.regime) throw new Error("invalid LLM output");

  const asOf = new Date().toISOString().slice(0, 10);
  const updatedBy = `daily:${latest.date}`;

  await db.prepare(`
    INSERT INTO SECTOR_TREND_long
      (sector, as_of, updated_by, regime, score, thesis, drivers, narrative, raw_blob)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sector) DO UPDATE SET
      as_of = excluded.as_of,
      updated_by = excluded.updated_by,
      regime = excluded.regime,
      score = excluded.score,
      thesis = excluded.thesis,
      drivers = excluded.drivers,
      narrative = excluded.narrative,
      raw_blob = excluded.raw_blob
  `).bind(
    sector, asOf, updatedBy,
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
    thesis: blob.thesis,
    factor_rows_used: factorRows.length,
    constituents_used: Object.keys(tickerTrends).length,
    macro_regime: macroRegime,
  };
}

function fmt(v) {
  if (v == null) return "?";
  const n = Number(v);
  if (!Number.isFinite(n)) return "?";
  return n.toFixed(2);
}

function indexBy(rows, key) {
  const map = {};
  for (const r of (rows || [])) {
    if (!map[r[key]]) map[r[key]] = r;
  }
  return map;
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
