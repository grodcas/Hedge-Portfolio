/**
 * MACRO-SECTOR-HEDGES-AGENT (S5) — concrete hedges if the sector thesis breaks.
 *
 * Per [MAP_PIPELINE.md §S5]. 1-3 hedge candidates per sector, each tied
 * to a specific tripwire — paired short within the sector, sector-ETF
 * puts, or rotating into a lower-beta sister sector.
 *
 * Inputs (per /build?sector=X):
 *   - Sector thesis (long bias) + tripwires
 *     (SECTOR_TREND_long.thesis_json — drivers/tripwires)
 *   - Intra-sector peer table — TICKER_TREND_long for every ticker in the
 *     sector, surfaced as paired-short candidates (the structural laggard
 *     is the natural short)
 *   - Correlated assets — sector ETF list (XLE / XLK / etc., hardcoded)
 *   - Sister-sector candidates — lower-beta cousin sectors
 *   - Book existing hedges                  NOT in DB (no per-instrument
 *                                           hedge table); passed as
 *                                           "(none configured)" placeholder
 *
 * Output (validated):
 *   {
 *     prose: string,
 *     hedges: [{
 *       instrument:    string ("short INTC", "XLK puts 2026-09 25-delta",
 *                              "rotate to Staples"),
 *       kind:          "paired_short" | "etf_puts" | "sister_rotation",
 *       rationale:     string (one sentence tied to a tripwire id),
 *       tripwire_id:   string (must match one of thesis.tripwires[].id),
 *       sizing:        string ("~25% of sector long" / "1.5% notional" / etc.)
 *     }],
 *     version, last_updated, input_fingerprint, regime_at_write
 *   }
 *
 * Writes SECTOR_TREND_long.{hedges_json,_updated_at,_model}.
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";

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
const VALID_SECTORS = new Set(Object.keys(SECTOR_MAP));

// Sector → SPDR ETF for the puts kind, plus sister-sector candidates the
// agent can rotate into. Sister candidates are lower-beta cousins typical
// for the regime-rotation playbook.
const SECTOR_HEDGE_PROFILE = {
  Technology:    { etf: "XLK", sisters: ["Staples", "Healthcare"] },
  ConsDisc:      { etf: "XLY", sisters: ["Staples"] },
  Communication: { etf: "XLC", sisters: ["Staples"] },
  Finance:       { etf: "XLF", sisters: ["Staples", "Healthcare"] },
  Energy:        { etf: "XLE", sisters: ["Staples", "Healthcare"] },
  Healthcare:    { etf: "XLV", sisters: ["Staples"] },
  Staples:       { etf: "XLP", sisters: ["Healthcare"] },
  Industrial:    { etf: "XLI", sisters: ["Staples", "Healthcare"] },
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const sector = url.searchParams.get("sector");
    if (!sector || !VALID_SECTORS.has(sector)) {
      return Response.json({ ok: false, error: `invalid sector — use one of: ${[...VALID_SECTORS].join(",")}` }, { status: 400 });
    }
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
    try {
      const out = await build(env, env.DB, apiKey, sector, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(env, db, apiKey, sector, force) {
  const sectorRow = await db.prepare(
    `SELECT thesis_json, thesis_updated_at,
            hedges_json, hedges_updated_at
       FROM SECTOR_TREND_long WHERE sector = ?`,
  ).bind(sector).first();
  if (!sectorRow) throw new Error(`no SECTOR_TREND_long row for ${sector}`);
  if (!sectorRow.thesis_json) throw new Error(`no thesis_json for ${sector} — fire macro-sector-thesis-agent first`);
  const sectorThesis = JSON.parse(sectorRow.thesis_json);

  const macroRow = await db.prepare(
    `SELECT regime FROM BETA_10_Daily_macro
      WHERE thesis_json IS NOT NULL ORDER BY creation_date DESC LIMIT 1`,
  ).first();

  const tickers = SECTOR_MAP[sector];
  const placeholders = tickers.map(() => "?").join(",");
  const peerRes = await db.prepare(
    `SELECT ticker, regime, score, thesis FROM TICKER_TREND_long WHERE ticker IN (${placeholders})`,
  ).bind(...tickers).all();
  const peers = peerRes.results || [];

  const profile = SECTOR_HEDGE_PROFILE[sector];

  const prevHedges = sectorRow.hedges_json ? safeJson(sectorRow.hedges_json) : null;
  const prevVersion = Number.isInteger(prevHedges?.version) ? prevHedges.version : 0;
  const fingerprint = await sha256(JSON.stringify({
    sector,
    macro_regime:   macroRow?.regime ?? null,
    thesis_drivers:   sectorThesis.drivers,
    thesis_tripwires: sectorThesis.tripwires,
    peers: peers.map(p => [p.ticker, p.regime, p.score]),
    profile,
  }));

  if (!force && prevHedges?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      sector,
      version: prevVersion,
      hedges_updated_at: sectorRow.hedges_updated_at,
    };
  }

  const prompt = buildPrompt({
    sector,
    macroRegime: macroRow?.regime || "unclassified",
    sectorThesis, peers, profile, prevHedges,
  });

  const blob = await callLLM(apiKey, prompt, { model: MODEL, env, caller: "macro-sector-hedges" });
  validateHedges(blob, tickers, sectorThesis);

  const now = new Date().toISOString();
  const hedges = {
    prose:        blob.prose.trim(),
    hedges:       blob.hedges,
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    regime_at_write: macroRow?.regime ?? null,
  };

  await db.prepare(
    `UPDATE SECTOR_TREND_long
        SET hedges_json = ?, hedges_updated_at = ?, hedges_model = ?
      WHERE sector = ?`,
  ).bind(JSON.stringify(hedges), now, MODEL, sector).run();

  return {
    action: "wrote",
    sector,
    version: hedges.version,
    hedges_count: hedges.hedges.length,
    hedges_updated_at: now,
  };
}

function buildPrompt({ sector, macroRegime, sectorThesis, peers, profile, prevHedges }) {
  const driversBlock = (sectorThesis.drivers || []).map(d => `  - ${d.name}: ${d.rationale}`).join("\n") || "  (none)";
  const tripwiresBlock = (sectorThesis.tripwires || []).map(t => `  - [${t.id}] ${t.condition} — currently: ${t.currently}`).join("\n") || "  (none)";
  const peersBlock = peers.length
    ? peers.map(p => `  ${p.ticker.padEnd(6)} regime ${(p.regime || "?").padEnd(20)} score ${fmtNum(p.score)}   ${(p.thesis || "").slice(0, 90)}`).join("\n")
    : "  (no TICKER_TREND_long rows for this sector)";
  const sisterBlock = profile?.sisters?.length
    ? profile.sisters.map(s => `  ${s}`).join("\n")
    : "  (no sister sectors configured)";
  const etfLine = profile?.etf ? `  ${profile.etf}` : "  (no SPDR ETF mapped)";

  const prevBlock = prevHedges
    ? `Version: ${prevHedges.version} (last updated ${prevHedges.last_updated})
Prose: ${prevHedges.prose ?? "(missing)"}
Hedges:
${(prevHedges.hedges || []).map(h => `  - ${h.kind}: ${h.instrument} (tripwire ${h.tripwire_id}) — ${h.rationale}`).join("\n") || "  (none)"}`
    : "(no prior hedges — this is the first version)";

  return `You are designing concrete hedges for the ${sector} sector long bias inside a hedge-fund book. Output 1-3 candidates that tie to specific tripwires.

MACRO REGIME
  Label: ${macroRegime}

SECTOR THESIS DRIVERS (long bias)
${driversBlock}

SECTOR TRIPWIRES (each hedge MUST tie to one of these ids)
${tripwiresBlock}

INTRA-SECTOR PEERS (paired-short candidates — pick the structural laggard)
${peersBlock}

SECTOR SPDR ETF (for puts kind)
${etfLine}

SISTER SECTORS (for rotation kind)
${sisterBlock}

BOOK EXISTING HEDGES
  (none configured — assume no current hedge on this sector)

PREVIOUS HEDGES (drift gradually — keep when tripwires unchanged)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one short paragraph, 2-4 sentences. State the load-bearing risk we're hedging and the hedge logic.>",
  "hedges": [
    {
      "instrument":  "<concrete: 'short INTC', 'XLK puts 25-delta 6m', 'rotate ${sector}→Staples ~10%'>",
      "kind":        "paired_short" | "etf_puts" | "sister_rotation",
      "rationale":   "<one sentence: which tripwire this hedges, how the instrument behaves if it fires>",
      "tripwire_id": "<MUST match one of the tripwire ids above>",
      "sizing":      "<plain English: '~25% of sector long' or '1.5% portfolio notional'>"
    }
  ]
}

RULES
- 1-3 hedges only. Quality over quantity. If only one hedge is sensible, output one.
- "paired_short" must reference a peer ticker from the INTRA-SECTOR PEERS list. Pick the structural laggard (lowest TICKER_TREND_long.score, "cautious_bearish" or "bearish" regime).
- "etf_puts" must reference the sector SPDR ticker above (do not invent another ETF).
- "sister_rotation" must reference one of the SISTER SECTORS listed.
- Every tripwire_id must match an id in the tripwires list above. Don't fabricate a tripwire.
- Sizing should be defensive — these are hedges, not standalone positions. Prefer < 30% of the sector long for paired shorts and < 2% notional for puts.`;
}

function fmtNum(v) {
  if (v == null) return "?";
  const n = Number(v);
  if (!Number.isFinite(n)) return "?";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 10)   return n.toFixed(2);
  return n.toFixed(3);
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validateHedges(blob, tickers, sectorThesis) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 30) throw new Error("invalid output: prose missing");
  if (!Array.isArray(blob.hedges) || blob.hedges.length < 1 || blob.hedges.length > 3) {
    throw new Error(`invalid output: hedges must be 1-3, got ${blob.hedges?.length ?? "?"}`);
  }
  const tripwireIds = new Set((sectorThesis.tripwires || []).map(t => t.id));
  const validKinds = new Set(["paired_short", "etf_puts", "sister_rotation"]);
  for (const h of blob.hedges) {
    if (!validKinds.has(h.kind)) throw new Error(`invalid hedge: kind "${h.kind}"`);
    if (typeof h.instrument !== "string" || !h.instrument.trim()) throw new Error("invalid hedge: instrument missing");
    if (typeof h.rationale !== "string" || !h.rationale.trim()) throw new Error("invalid hedge: rationale missing");
    if (typeof h.sizing !== "string" || !h.sizing.trim()) throw new Error("invalid hedge: sizing missing");
    if (!tripwireIds.has(h.tripwire_id)) throw new Error(`invalid hedge: tripwire_id "${h.tripwire_id}" not in thesis.tripwires`);
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
