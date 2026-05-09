/**
 * MACRO-SECTOR-READ-AGENT (S6) — lede paragraph for the Sector slide-out.
 *
 * Per [MAP_PIPELINE.md §S6]. Stitches the sector slide-out into ONE
 * paragraph at the top. Least-risky agent — purely synthetic.
 *
 * Inputs (per /build?sector=X) — short structured slices, NOT full texts:
 *   - Sector thesis prose + top driver name
 *   - Top implementation action (highest magnitude)
 *   - Top hedge (first hedges[].instrument)
 *   - Sector News drift verdict        HARDCODED "intact" until S1 (MS-3e)
 *
 * Output (validated):
 *   { prose: string, version, last_updated, input_fingerprint, regime_at_write }
 *
 * Writes SECTOR_TREND_long.{read_json,_updated_at,_model}.
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";

const VALID_SECTORS = new Set([
  "Technology", "ConsDisc", "Communication", "Finance",
  "Energy", "Healthcare", "Staples", "Industrial",
]);

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
    `SELECT thesis_json, implementation_json, hedges_json,
            read_json, read_updated_at
       FROM SECTOR_TREND_long WHERE sector = ?`,
  ).bind(sector).first();
  if (!sectorRow) throw new Error(`no SECTOR_TREND_long row for ${sector}`);
  if (!sectorRow.thesis_json)         throw new Error(`no thesis_json for ${sector}`);
  if (!sectorRow.implementation_json) throw new Error(`no implementation_json for ${sector}`);
  if (!sectorRow.hedges_json)         throw new Error(`no hedges_json for ${sector}`);

  const thesis = JSON.parse(sectorRow.thesis_json);
  const impl   = JSON.parse(sectorRow.implementation_json);
  const hedges = JSON.parse(sectorRow.hedges_json);

  const macroRow = await db.prepare(
    `SELECT regime FROM BETA_10_Daily_macro
      WHERE thesis_json IS NOT NULL ORDER BY creation_date DESC LIMIT 1`,
  ).first();

  const driftVerdict = "intact"; // S1 deferred MS-3e

  const topDriver  = (thesis.drivers || [])[0]?.name || "(none)";
  const topAction  = [...(impl.actions || [])]
    .sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0))[0] || null;
  const topHedge   = (hedges.hedges || [])[0] || null;

  const prevRead = sectorRow.read_json ? safeJson(sectorRow.read_json) : null;
  const prevVersion = Number.isInteger(prevRead?.version) ? prevRead.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    sector,
    macro_regime:  macroRow?.regime ?? null,
    thesis_prose:  thesis.prose,
    top_driver:    topDriver,
    top_action:    topAction ? `${topAction.action} ${topAction.ticker} mag${topAction.magnitude}` : null,
    top_hedge:     topHedge ? `${topHedge.kind}:${topHedge.instrument}` : null,
    drift_verdict: driftVerdict,
  }));

  if (!force && prevRead?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      sector,
      version: prevVersion,
      read_updated_at: sectorRow.read_updated_at,
    };
  }

  const prompt = buildPrompt({
    sector,
    macroRegime: macroRow?.regime || "unclassified",
    thesis, impl, topAction, topHedge, driftVerdict, prevRead,
  });

  const blob = await callLLM(apiKey, prompt, { model: MODEL, env, caller: "macro-sector-read" });
  validateRead(blob);

  const now = new Date().toISOString();
  const read = {
    prose:        blob.prose.trim(),
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    regime_at_write: macroRow?.regime ?? null,
  };

  await db.prepare(
    `UPDATE SECTOR_TREND_long
        SET read_json = ?, read_updated_at = ?, read_model = ?
      WHERE sector = ?`,
  ).bind(JSON.stringify(read), now, MODEL, sector).run();

  return {
    action: "wrote",
    sector,
    version: read.version,
    read_updated_at: now,
  };
}

function buildPrompt({ sector, macroRegime, thesis, impl, topAction, topHedge, driftVerdict, prevRead }) {
  const topDriversBlock = (thesis.drivers || []).slice(0, 3).map(d => `  - ${d.name}`).join("\n") || "  (none)";
  const topActionBlock = topAction
    ? `  ${topAction.action} ${topAction.ticker} (magnitude ${topAction.magnitude}) — ${topAction.rationale}`
    : "  (no actions)";
  const topHedgeBlock = topHedge
    ? `  ${topHedge.kind}: ${topHedge.instrument} (tripwire ${topHedge.tripwire_id}) — ${topHedge.rationale}`
    : "  (no hedge)";
  const prevBlock = prevRead?.prose
    ? `Version: ${prevRead.version} (last updated ${prevRead.last_updated})
Prose: ${prevRead.prose}`
    : "(no prior sector read)";

  return `You are writing the lede paragraph for the ${sector} sector slide-out. ONE paragraph that stitches the thesis verdict, the load-bearing name action, and the primary hedge. Synthesise — do not add new claims.

MACRO REGIME
  Label: ${macroRegime}

SECTOR THESIS PROSE (full — quote facts you'd surface in a 1-paragraph lede)
${thesis.prose}

TOP SECTOR DRIVERS
${topDriversBlock}

IMPLEMENTATION SUMMARY
${impl.prose ?? "(no prose)"}

TOP IMPLEMENTATION ACTION (highest magnitude)
${topActionBlock}

PRIMARY HEDGE
${topHedgeBlock}

SECTOR NEWS-DRIFT VERDICT
  ${driftVerdict}

PREVIOUS SECTOR READ
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<ONE paragraph, 3-5 sentences. State the sector thesis verdict, the load-bearing name action with the actual ticker, and the primary hedge — in that order.>"
}

RULES
- Synthesise only — every claim must trace back to the inputs above.
- Take a position. No hedging language ("may", "could go either way").
- Reference the load-bearing ticker by name and the hedge instrument by name.
- Reference at least one specific number or driver from the thesis prose.
- Do NOT introduce numbers that aren't in the inputs.`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validateRead(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 60) {
    throw new Error("invalid output: prose missing or too short");
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
