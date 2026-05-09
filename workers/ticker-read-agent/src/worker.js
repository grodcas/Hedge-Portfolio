/**
 * TICKER-READ-AGENT (#10 Read — lede) — per [TICKER_PIPELINE.md §10].
 *
 * Stitches the page into one paragraph at the top. Least-risky agent.
 *
 * Inputs (per ticker — only verdicts + the thesis prose, NOT the full
 * reading texts):
 *   - Thesis prose + drivers + tripwires (TICKER_TREND_long.thesis_json)
 *   - Recommendation action + stance + delta_weight_pct (recommendation_json)
 *   - 1-line verdict from each of the 6 readings (valuation, fundamentals,
 *     estimates, peers, news_drift, context)
 *
 * Output (validated):
 *   {
 *     prose: string,                  // one paragraph
 *     version, last_updated, input_fingerprint, ticker_at_write
 *   }
 *
 * Writes TICKER_TREND_long.{read_json,_updated_at,_model}. Runs LAST in the
 * per-ticker chain — the orchestrator gate enforces the dependency order.
 *
 * Endpoint: GET /build?ticker=NVDA[&force=1].
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";

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
      const out = await build(env, env.DB, apiKey, ticker, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(env, db, apiKey, ticker, force) {
  const trendRow = await db.prepare(
    `SELECT thesis_json, recommendation_json,
            valuation_json, fundamentals_json, estimates_json,
            peers_json, news_drift_json, context_json,
            read_json, read_updated_at
       FROM TICKER_TREND_long WHERE ticker = ?`,
  ).bind(ticker).first();
  if (!trendRow) throw new Error(`no TICKER_TREND_long row for ${ticker}`);
  if (!trendRow.thesis_json)         throw new Error(`no thesis_json yet for ${ticker} (#7 must fire first)`);
  if (!trendRow.recommendation_json) throw new Error(`no recommendation_json yet for ${ticker} (#9 must fire first)`);

  const thesis      = JSON.parse(trendRow.thesis_json);
  const rec         = JSON.parse(trendRow.recommendation_json);
  const valuation   = trendRow.valuation_json    ? safeJson(trendRow.valuation_json)    : null;
  const fundamentals= trendRow.fundamentals_json ? safeJson(trendRow.fundamentals_json) : null;
  const estimates   = trendRow.estimates_json    ? safeJson(trendRow.estimates_json)    : null;
  const peers       = trendRow.peers_json        ? safeJson(trendRow.peers_json)        : null;
  const drift       = trendRow.news_drift_json   ? safeJson(trendRow.news_drift_json)   : null;
  const context     = trendRow.context_json      ? safeJson(trendRow.context_json)      : null;

  const prevRead    = trendRow.read_json ? safeJson(trendRow.read_json) : null;
  const prevVersion = Number.isInteger(prevRead?.version) ? prevRead.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    ticker,
    thesis_prose:   thesis.prose,
    drivers:        (thesis.drivers   || []).map(d => d.name),
    tripwires:      (thesis.tripwires || []).map(t => t.id),
    rec:            [rec.stance, rec.delta_weight_pct, rec.window, rec.action],
    verdicts: {
      valuation:    valuation?.verdict ?? null,
      fundamentals: fundamentals?.verdict ?? null,
      estimates:    estimates?.verdict ?? null,
      peers:        peers?.relative_position ?? null,
      drift:        drift?.verdict ?? null,
      context:      context?.verdict ?? null,
    },
  }));

  if (!force && prevRead?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      ticker,
      version: prevVersion,
      read_updated_at: trendRow.read_updated_at,
    };
  }

  const prompt = buildPrompt({ ticker, thesis, rec, valuation, fundamentals, estimates, peers, drift, context, prevRead });
  const blob = await callLLM(apiKey, prompt, { model: MODEL, env, caller: "ticker-read" });
  validate(blob);

  const now = new Date().toISOString();
  const read = {
    prose:        blob.prose.trim(),
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    ticker_at_write: ticker,
  };

  await db.prepare(
    `UPDATE TICKER_TREND_long
        SET read_json       = ?,
            read_updated_at = ?,
            read_model      = ?
      WHERE ticker = ?`,
  ).bind(JSON.stringify(read), now, MODEL, ticker).run();

  return {
    action: "wrote",
    ticker,
    version: read.version,
    read_updated_at: now,
  };
}

function buildPrompt({ ticker, thesis, rec, valuation, fundamentals, estimates, peers, drift, context, prevRead }) {
  const driversBlock = (thesis.drivers || []).slice(0, 5).map(d => `  - ${d.name}`).join("\n") || "  (none)";
  const tripwiresBlock = (thesis.tripwires || []).slice(0, 5).map(t => `  - [${t.id}] ${t.condition}`).join("\n") || "  (none)";

  const verdictsBlock = `  valuation:    ${valuation?.verdict || "(none)"}${valuation?.vs_what ? ` (vs ${valuation.vs_what})` : ""}
  fundamentals: ${fundamentals?.verdict || "(none)"}
  estimates:    ${estimates?.verdict || "(none)"}${estimates?.fade_year ? ` (fade ${estimates.fade_year})` : ""}
  peers:        ${peers?.relative_position || "(none)"}${peers?.premium_status ? ` / ${peers.premium_status}` : ""}
  drift:        ${drift?.verdict || "(none)"}${drift?.tripwires_fired?.length ? ` (fired: ${drift.tripwires_fired.join(",")})` : ""}
  context:      ${context?.verdict || "(none)"}`;

  const recBlock = `  stance:           ${rec.stance}
  delta_weight_pct: ${rec.delta_weight_pct}%
  window:           ${rec.window}
  action:           ${rec.action}`;

  const prevBlock = prevRead?.prose
    ? `Version: ${prevRead.version} (last updated ${prevRead.last_updated})
Prose: ${prevRead.prose}`
    : "(no prior read)";

  return `You are writing the lede paragraph for the ${ticker} slide-out. ONE paragraph that stitches the thesis verdict, the load-bearing driver, the nearest tripwire, and the recommendation. Do not introduce new claims — synthesise only what is below.

THESIS PROSE
${thesis.prose}

THESIS DRIVERS (top)
${driversBlock}

THESIS TRIPWIRES (top)
${tripwiresBlock}

READING VERDICTS (1-line each — DO NOT cite full prose, just the verdicts)
${verdictsBlock}

RECOMMENDATION
${recBlock}

PREVIOUS READ (drift gradually — only rewrite when a top input materially changed)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<ONE paragraph, 3-5 sentences. State the thesis verdict, name at least ONE driver and ONE tripwire by name, mention the recommendation stance + window. No headers, no bullets.>"
}

RULES
- Synthesise only — every claim must trace back to text above.
- Name at least ONE driver explicitly (use the same wording as the drivers block) AND ONE tripwire (use the [id] in brackets or its condition).
- Mention the recommendation stance ("trim", "add", "hold", "exit") AND the window ("today", "this_week", "weeks", "months").
- The lede must take a position; no hedging language ("may", "could", "we'll watch").
- Do NOT introduce a number that isn't in the inputs above.
- Do NOT cite the full reading prose — only the verdict words.`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validate(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 80) {
    throw new Error("invalid output: prose missing or too short");
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
