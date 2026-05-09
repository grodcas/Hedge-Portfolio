/**
 * MACRO-FOMC-SUMMARY-AGENT (M7) — bullets summarising the latest FOMC meeting.
 *
 * Per [MAP_PIPELINE.md §M7]. Independent of the per-refresh agents — runs
 * once when a new MACRO_STATE_fomc row lands and stays cached until the
 * NEXT meeting (~6 weeks). Does NOT re-run on news.
 *
 * Inputs:
 *   - Latest MACRO_STATE_fomc row  (statement_text, decision_summary,
 *                                   meeting_date)
 *   - Prior FOMC row               (for the deterministic statement diff —
 *                                   we don't compute a wordwise diff here;
 *                                   we hand BOTH texts to the LLM and let it
 *                                   highlight changed language)
 *   - FOMC_PROJECTIONS for current meeting (dot plot + SEP — only populated
 *     at quarterly meetings; absent rows handled gracefully)
 *   - FOMC_PROJECTIONS for prior meeting (delta context for SEP shifts)
 *   - Thesis drivers + tripwires   (ONLY for tagging which bullets touch a
 *                                   driver — same principle as Earnings
 *                                   summary)
 *
 * Output (validated):
 *   {
 *     meeting_date,
 *     bullets: [{
 *       category:        "decision" | "dot_plot" | "sep" | "statement_diff" |
 *                        "powell_qa" | "balance_sheet" | "dissents" |
 *                        "market_reaction",
 *       text:            string,
 *       source:          string,                 // "statement" | "dot plot" | ...
 *       touches_driver:  string | null,
 *       touches_tripwire: string | null
 *     }],
 *     version, last_updated, fomc_meeting_date_at_write
 *   }
 *
 * Writes BETA_10_Daily_macro.{fomc_summary_json,_updated_at,_model}.
 *
 * Re-run trigger (orchestrator side): NEW MACRO_STATE_fomc.meeting_date >
 * fomc_meeting_date_at_write inside the existing fomc_summary_json. Otherwise
 * cached.
 *
 * Note: Powell press conference transcript is NOT in D1 today (lives in the
 * fomc-statement-fetcher's scope but isn't ingested as a column). If a
 * future migration adds it, slot it in alongside statement_text.
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
    `SELECT id, regime, thesis_json,
            fomc_summary_json, fomc_summary_updated_at, creation_date
       FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC LIMIT 1`,
  ).first();
  if (!macroRow) throw new Error("no BETA_10_Daily_macro row");
  if (!macroRow.thesis_json) throw new Error("no thesis_json yet — fire macro-thesis-agent first");
  const thesis = JSON.parse(macroRow.thesis_json);

  const fomcRes = await db.prepare(
    `SELECT meeting_date, title, decision_summary, statement_text, source_url
       FROM MACRO_STATE_fomc
      ORDER BY meeting_date DESC LIMIT 2`,
  ).all();
  const fomcRows = fomcRes.results || [];
  if (fomcRows.length === 0) throw new Error("no MACRO_STATE_fomc row — ingest a meeting first");
  const latest = fomcRows[0];
  const prior  = fomcRows[1] || null;

  // SEP / dot plot for current + prior meeting.
  const projRes = await db.prepare(
    `SELECT meeting_date, indicator, year, stat, value, unit
       FROM FOMC_PROJECTIONS
      WHERE meeting_date IN (?, ?)
      ORDER BY meeting_date DESC, indicator, year, stat`,
  ).bind(latest.meeting_date, prior?.meeting_date ?? "").all();
  const projections = projRes.results || [];
  const projLatest = projections.filter(p => p.meeting_date === latest.meeting_date);
  const projPrior  = projections.filter(p => p.meeting_date === prior?.meeting_date);

  // No-op if we've already summarised this meeting.
  const prev = macroRow.fomc_summary_json ? safeJson(macroRow.fomc_summary_json) : null;
  const prevVersion = Number.isInteger(prev?.version) ? prev.version : 0;
  if (!force && prev?.fomc_meeting_date_at_write === latest.meeting_date) {
    return {
      action: "noop",
      reason: `already summarised meeting ${latest.meeting_date}`,
      version: prevVersion,
      fomc_summary_updated_at: macroRow.fomc_summary_updated_at,
    };
  }

  const prompt = buildPrompt({
    thesis,
    latest, prior,
    projLatest, projPrior,
    prevSummary: prev,
  });

  const blob = await callLLM(apiKey, prompt, { model: MODEL, env, caller: "macro-fomc-summary" });
  validateSummary(blob);

  const now = new Date().toISOString();
  const summary = {
    meeting_date: latest.meeting_date,
    bullets:      blob.bullets,
    version:      prevVersion + 1,
    last_updated: now,
    fomc_meeting_date_at_write: latest.meeting_date,
  };

  await db.prepare(
    `UPDATE BETA_10_Daily_macro
        SET fomc_summary_json = ?, fomc_summary_updated_at = ?, fomc_summary_model = ?
      WHERE id = ?`,
  ).bind(JSON.stringify(summary), now, MODEL, macroRow.id).run();

  return {
    action: "wrote",
    macro_row_id: macroRow.id,
    meeting_date: latest.meeting_date,
    version: summary.version,
    bullets_count: summary.bullets.length,
    fomc_summary_updated_at: now,
  };
}

function buildPrompt({ thesis, latest, prior, projLatest, projPrior, prevSummary }) {
  const driversBlock = (thesis.drivers || []).map(d => `  - ${d.name}`).join("\n") || "  (none)";
  const tripwiresBlock = (thesis.tripwires || []).map(t => `  - [${t.id}] ${t.condition}`).join("\n") || "  (none)";

  const projFmt = (rows) => rows.length
    ? rows.map(r => `  ${r.meeting_date} | ${r.indicator.padEnd(12)} | ${String(r.year).padEnd(11)} | ${r.stat.padEnd(22)} | ${r.value}${r.unit || ""}`).join("\n")
    : "  (no FOMC_PROJECTIONS rows for this meeting — SEP/dot-plot bullets must be omitted)";

  const priorBlock = prior
    ? `Date:      ${prior.meeting_date}
Decision:  ${prior.decision_summary || "(none)"}
Statement: ${prior.statement_text}`
    : "(no prior meeting in MACRO_STATE_fomc)";

  const prevBlock = prevSummary
    ? `(prior summary was for ${prevSummary.fomc_meeting_date_at_write}; this is a re-run for a NEW meeting)`
    : "(no prior summary)";

  return `You are summarising the most recent FOMC meeting for a hedge-fund Macro slide-out. Bullet list, each tagged.

THESIS DRIVERS (use to flag which bullets touch a driver)
${driversBlock}

THESIS TRIPWIRES (use to flag which bullets touch a tripwire)
${tripwiresBlock}

LATEST FOMC MEETING
Date:      ${latest.meeting_date}
Title:     ${latest.title}
Decision:  ${latest.decision_summary || "(none)"}
Statement:
${latest.statement_text}

PRIOR FOMC MEETING (for delta context — quote changed language verbatim where useful)
${priorBlock}

DOT PLOT + SEP — LATEST MEETING (FOMC_PROJECTIONS)
${projFmt(projLatest)}

DOT PLOT + SEP — PRIOR MEETING
${projFmt(projPrior)}

PREVIOUS SUMMARY
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "bullets": [
    {
      "category":         "decision" | "dot_plot" | "sep" | "statement_diff" |
                          "powell_qa" | "balance_sheet" | "dissents" |
                          "market_reaction",
      "text":             "<one sentence, with the actual numbers / language change quoted>",
      "source":           "statement" | "dot plot" | "SEP table" |
                          "statement diff vs prior" | "press conference transcript" |
                          "prior meeting",
      "touches_driver":   "<driver name> | null",
      "touches_tripwire": "<tripwire id> | null"
    }
  ]
}

RULES
- 4–8 bullets. Order by category (decision first; dot_plot, sep, statement_diff next; powell_qa, balance_sheet, dissents, market_reaction last).
- OMIT categories you cannot ground in the inputs above. If FOMC_PROJECTIONS is empty, do NOT emit dot_plot or sep bullets — better silent than fabricated.
- powell_qa and market_reaction bullets must be omitted unless the statement text explicitly references them — Powell transcript and intraday tape data are NOT in this prompt.
- Each bullet must reference an actual number or a verbatim phrase change from the prior statement.
- statement_diff bullets must quote the changed phrase from BOTH the prior and latest statement, even if short ("eased" → "eased but remains somewhat elevated").
- touches_driver / touches_tripwire must reference EXACT names/ids from the lists above, or null.
- Do NOT invent dissents — only emit a dissents bullet if the statement names dissenters.`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validateSummary(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (!Array.isArray(blob.bullets) || blob.bullets.length < 1 || blob.bullets.length > 8) {
    throw new Error(`invalid output: bullets must be 1-8, got ${blob.bullets?.length ?? "?"}`);
  }
  const validCats = new Set(["decision","dot_plot","sep","statement_diff","powell_qa","balance_sheet","dissents","market_reaction"]);
  for (const b of blob.bullets) {
    if (!validCats.has(b.category)) throw new Error(`invalid bullet: bad category "${b.category}"`);
    if (typeof b.text !== "string" || b.text.trim().length < 15) throw new Error("invalid bullet: text missing or too short");
    if (typeof b.source !== "string" || !b.source.trim()) throw new Error("invalid bullet: source missing");
    if (b.touches_driver !== null && typeof b.touches_driver !== "string") throw new Error("invalid bullet: touches_driver must be string or null");
    if (b.touches_tripwire !== null && typeof b.touches_tripwire !== "string") throw new Error("invalid bullet: touches_tripwire must be string or null");
  }
}
