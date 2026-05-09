/**
 * MACRO-READ-AGENT (M6) — lede paragraph for the Macro slide-out.
 *
 * Per [MAP_PIPELINE.md §M6]. Stitches the slide-out into ONE paragraph
 * at the top. Least-risky agent — purely synthetic, no inference past
 * what its inputs already say.
 *
 * Inputs (NOT the full texts — short structured slices):
 *   - Thesis prose                 (BETA_10_Daily_macro.thesis_json.prose)
 *   - Top 3 thesis drivers          (drivers[0..2].name)
 *   - Positioning prose             (positioning_json.prose)
 *   - Top 3 positioning tilts       (tilts sorted by magnitude desc)
 *   - Top 1 signpost                (events[0].what_to_watch)
 *   - News-drift verdict            HARDCODED "intact" until M1 (MS-3e)
 *
 * Output (validated):
 *   { prose: string, version, last_updated, input_fingerprint, regime_at_write }
 *
 * Writes BETA_10_Daily_macro.{read_json,_updated_at,_model}.
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
    try {
      const out = await build(env, env.DB, apiKey, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(env, db, apiKey, force) {
  const macroRow = await db.prepare(
    `SELECT id, regime, thesis_json, positioning_json, signposts_json,
            read_json, read_updated_at, creation_date
       FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC LIMIT 1`,
  ).first();
  if (!macroRow) throw new Error("no BETA_10_Daily_macro row");
  if (!macroRow.thesis_json)      throw new Error("no thesis_json (M2 must fire first)");
  if (!macroRow.positioning_json) throw new Error("no positioning_json (M4 must fire first)");
  if (!macroRow.signposts_json)   throw new Error("no signposts_json (M5 must fire first)");

  const thesis      = JSON.parse(macroRow.thesis_json);
  const positioning = JSON.parse(macroRow.positioning_json);
  const signposts   = JSON.parse(macroRow.signposts_json);

  const driftVerdict = "intact";  // M1 News drift, deferred MS-3e

  const topDrivers = (thesis.drivers || []).slice(0, 3).map(d => d.name);
  const topTilts   = [...(positioning.tilts || [])]
    .sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0))
    .slice(0, 3)
    .map(t => `${t.stance} ${t.name} (mag ${t.magnitude})`);
  const topSignpost = signposts.events?.[0] || null;

  const prevRead = macroRow.read_json ? safeJson(macroRow.read_json) : null;
  const prevVersion = Number.isInteger(prevRead?.version) ? prevRead.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    regime: macroRow.regime,
    thesis_prose:      thesis.prose,
    positioning_prose: positioning.prose,
    top_drivers:       topDrivers,
    top_tilts:         topTilts,
    top_signpost:      topSignpost ? `${topSignpost.date}|${topSignpost.event_code}|${topSignpost.what_to_watch}` : null,
    drift_verdict:     driftVerdict,
  }));

  if (!force && prevRead?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      version: prevVersion,
      read_updated_at: macroRow.read_updated_at,
    };
  }

  const prompt = buildPrompt({
    regime: macroRow.regime || "unclassified",
    thesis, positioning, topSignpost, driftVerdict, prevRead,
  });

  const blob = await callLLM(apiKey, prompt, { model: MODEL, env, caller: "macro-read" });
  validateRead(blob);

  const now = new Date().toISOString();
  const read = {
    prose:        blob.prose.trim(),
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    regime_at_write: macroRow.regime ?? null,
  };

  await db.prepare(
    `UPDATE BETA_10_Daily_macro
        SET read_json = ?, read_updated_at = ?, read_model = ?
      WHERE id = ?`,
  ).bind(JSON.stringify(read), now, MODEL, macroRow.id).run();

  return {
    action: "wrote",
    macro_row_id: macroRow.id,
    version: read.version,
    read_updated_at: now,
  };
}

function buildPrompt({ regime, thesis, positioning, topSignpost, driftVerdict, prevRead }) {
  const topTilts = [...(positioning.tilts || [])]
    .sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0))
    .slice(0, 3)
    .map(t => `  - ${t.stance} ${t.name} — magnitude ${t.magnitude}, ${t.window}: ${t.rationale}`)
    .join("\n");
  const topDrivers = (thesis.drivers || []).slice(0, 3)
    .map(d => `  - ${d.name}`).join("\n");
  const signpostBlock = topSignpost
    ? `${topSignpost.date} ${topSignpost.event_code} (${topSignpost.country}) — ${topSignpost.what_to_watch}`
    : "(no signposts in horizon)";

  const prevBlock = prevRead?.prose
    ? `Version: ${prevRead.version} (last updated ${prevRead.last_updated})
Prose: ${prevRead.prose}`
    : "(no prior read)";

  return `You are writing the lede paragraph for the macro slide-out. ONE paragraph that stitches together the thesis verdict, the top tilt, and the next signpost. Do not add new claims — synthesise only what is below.

REGIME
  Label: ${regime}

THESIS VERDICT (full prose, but only quote facts you'd surface in a 1-paragraph lede)
${thesis.prose}

TOP THESIS DRIVERS
${topDrivers}

POSITIONING SUMMARY
${positioning.prose}

TOP TILTS BY MAGNITUDE
${topTilts}

TOP UPCOMING SIGNPOST
  ${signpostBlock}

NEWS-DRIFT VERDICT (1-line)
  ${driftVerdict}

PREVIOUS READ (drift gradually — only rewrite if a top input materially changed)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<ONE paragraph, 3-5 sentences. State the regime call, the load-bearing tilt, and the next signpost — in that order. No headers, no bullets.>"
}

RULES
- Synthesise only — every claim must trace back to a sentence above.
- The lede must take a position; no hedging language ("may", "could", "we'll watch").
- Reference at least one specific number from the thesis prose (e.g. a tripwire threshold or a Z-score) so the reader can connect the lede to the panel below.
- Do NOT introduce a number that isn't in the inputs.`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validateRead(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 80) {
    throw new Error("invalid output: prose missing or too short");
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
