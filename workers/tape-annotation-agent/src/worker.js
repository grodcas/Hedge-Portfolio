/**
 * TAPE-ANNOTATION-AGENT (the 25th agent) — per [TICKER_PIPELINE.md "Tape annotation"].
 *
 * One CAUTIOUS sentence next to a big move ("possibly tied to TSMC capex
 * topic — 3rd day active"), NEVER causal. The candidate topics are
 * pre-filtered deterministically server-side; the LLM only writes prose +
 * picks which (if any) candidate is the most plausible association.
 *
 * Inputs (per qualifying mover row):
 *   - The move itself (date, ticker, direction, move_pct, rank) from
 *     MOVER_EXPLANATIONS_daily
 *   - Up to N TOPIC_FEED rows scoped to ticker:X with date_first_seen ≤ move
 *     date AND date_last_seen ≥ move date − 14d. Sorted by score DESC,
 *     days_active DESC. The pre-filter is the safety rail — the LLM cannot
 *     pick a topic that wasn't already temporally plausible.
 *
 * Output (validated, written to MOVER_EXPLANATIONS_daily.annotation_json):
 *   {
 *     sentence:    string,             // ONE cautious sentence
 *     topic_id:    string | null,      // citation; null if no plausible match
 *     confidence:  "low" | "medium",   // never "high" — the contract is cautious
 *     candidates_seen: int,            // how many topics were in the pre-filter
 *     ticker, date, version, last_updated, input_fingerprint
 *   }
 *
 * Endpoints:
 *   GET /build?date=YYYY-MM-DD            — annotate every unannotated mover
 *                                           on that date.
 *   GET /build?date=...&ticker=X          — annotate a single mover row.
 *   GET /build?date=...&force=1           — bypass cache + re-annotate.
 *
 * Model: gpt-5-mini (per the spec — the cautious-prose job is small).
 *
 * Safety rules baked into the validator:
 *   - Sentence MUST contain "possibly", "tentatively", "may be tied to", or
 *     "could be associated with" — the cautious phrasing the contract requires.
 *   - Sentence MUST NOT contain causal verbs ("caused", "drove", "because of",
 *     "due to") — the contract is "tag, do not claim".
 *   - topic_id MUST be one of the candidates we showed the LLM (or null).
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5-mini";
const TOPIC_LOOKBACK_DAYS = 14;
const MAX_CANDIDATES = 8;
const VALID_CONFIDENCE = new Set(["low", "medium"]);

// Cautious-phrasing whitelist. Sentence must contain at least one phrase
// from this list — that's the visible signal the agent stayed inside its
// "tag, never claim" contract.
const CAUTIOUS_PHRASES = [
  "possibly",
  "tentatively",
  "may be tied",
  "could be associated",
  "could be tied",
  "may be associated",
];

// Causal verbs blacklist. If any of these appear, the LLM crossed the line
// from association to causation. Validator rejects → orchestrator logs an
// error → agent retries on next pass.
const CAUSAL_PHRASES = [
  "caused",
  "drove",
  "because of",
  "due to",
  "as a result",
  "triggered by",
  "the reason",
];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const date   = url.searchParams.get("date");
    const ticker = url.searchParams.get("ticker");
    const force  = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
    if (!date) return Response.json({ ok: false, error: "date query param required (YYYY-MM-DD)" }, { status: 400 });

    try {
      const out = await build(env, env.DB, apiKey, date, ticker, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(env, db, apiKey, date, ticker, force) {
  // Pull the moves to annotate. If ?ticker= is set, that single row;
  // otherwise every mover for the date.
  const movesRes = ticker
    ? await db.prepare(
        `SELECT id, date, ticker, direction, move_pct, rank, headline,
                annotation_json, annotation_updated_at
           FROM MOVER_EXPLANATIONS_daily
          WHERE date = ? AND ticker = ?`,
      ).bind(date, ticker).all()
    : await db.prepare(
        `SELECT id, date, ticker, direction, move_pct, rank, headline,
                annotation_json, annotation_updated_at
           FROM MOVER_EXPLANATIONS_daily
          WHERE date = ?
          ORDER BY ABS(move_pct) DESC`,
      ).bind(date).all();
  const moves = movesRes?.results || [];
  if (moves.length === 0) {
    return { action: "noop", reason: `no MOVER_EXPLANATIONS_daily rows for date=${date}${ticker ? ` ticker=${ticker}` : ""}` };
  }

  const results = [];
  for (const m of moves) {
    if (!force && m.annotation_json) {
      results.push({ ticker: m.ticker, action: "noop", reason: "already annotated" });
      continue;
    }
    try {
      const r = await annotateMove(db, apiKey, m);
      results.push(r);
    } catch (err) {
      results.push({ ticker: m.ticker, action: "error", error: err.message });
    }
  }

  return { date, ticker: ticker ?? null, count: moves.length, results };
}

async function annotateMove(db, apiKey, move) {
  // Pull candidate topics: ticker-scoped, temporally plausible (visible
  // before-or-on the move date and still active within 14d before it).
  const moveDate = move.date;  // YYYY-MM-DD
  const lookbackDate = isoMinusDays(moveDate, TOPIC_LOOKBACK_DAYS);
  const candRes = await db.prepare(
    `SELECT id, topic_canonical, summary, date_first_seen, date_last_seen,
            days_active, mention_count, source_count, score
       FROM TOPIC_FEED
      WHERE scope = ?
        AND date_first_seen <= ?
        AND date_last_seen  >= ?
      ORDER BY score DESC, days_active DESC
      LIMIT ?`,
  ).bind(`ticker:${move.ticker}`, moveDate, lookbackDate, MAX_CANDIDATES).all();
  const candidates = candRes?.results || [];

  const fingerprint = await sha256(JSON.stringify({
    move: [move.id, move.date, move.ticker, move.direction, move.move_pct],
    candidates: candidates.map(c => [c.id, c.topic_canonical, c.days_active, c.score]),
  }));

  // Empty-candidate path: write a "no plausible match" annotation, no LLM call.
  if (candidates.length === 0) {
    const now = new Date().toISOString();
    const annotation = {
      sentence:        "No corroborated topic in the prior 14d window — possibly an unexplained move worth investigating.",
      topic_id:        null,
      confidence:      "low",
      candidates_seen: 0,
      ticker:          move.ticker,
      date:            move.date,
      version:         1,
      last_updated:    now,
      input_fingerprint: fingerprint,
    };
    await persist(db, move.id, annotation);
    return { ticker: move.ticker, action: "wrote-empty", topic_id: null };
  }

  const prompt = buildPrompt({ move, candidates });
  const blob = await callLLM(apiKey, prompt, { model: MODEL, env, caller: "tape-annotation" });
  validate(blob, candidates);

  const now = new Date().toISOString();
  const prev = move.annotation_json ? safeJson(move.annotation_json) : null;
  const prevVersion = Number.isInteger(prev?.version) ? prev.version : 0;
  const annotation = {
    sentence:         blob.sentence.trim(),
    topic_id:         blob.topic_id,
    confidence:       blob.confidence,
    candidates_seen:  candidates.length,
    ticker:           move.ticker,
    date:             move.date,
    version:          prevVersion + 1,
    last_updated:     now,
    input_fingerprint: fingerprint,
  };
  await persist(db, move.id, annotation);
  return { ticker: move.ticker, action: "wrote", topic_id: annotation.topic_id, confidence: annotation.confidence };
}

async function persist(db, id, annotation) {
  await db.prepare(
    `UPDATE MOVER_EXPLANATIONS_daily
        SET annotation_json       = ?,
            annotation_updated_at = ?,
            annotation_model      = ?
      WHERE id = ?`,
  ).bind(JSON.stringify(annotation), annotation.last_updated, MODEL, id).run();
}

function isoMinusDays(yyyymmdd, days) {
  const t = Date.parse(yyyymmdd + "T00:00:00Z");
  return new Date(t - days * 86400_000).toISOString().slice(0, 10);
}

function buildPrompt({ move, candidates }) {
  const dirArrow = move.direction === "down" ? "↓" : "↑";
  const candidatesBlock = candidates.map(c =>
    `  [${c.id}] d=${c.days_active}d m=${c.mention_count} s=${c.source_count} score=${(c.score ?? 0).toFixed(1)}  first ${c.date_first_seen} → last ${c.date_last_seen}\n      ${c.topic_canonical}\n      → ${c.summary || "(no summary)"}`,
  ).join("\n");
  const idsJson = JSON.stringify(candidates.map(c => c.id));

  return `You are writing a CAUTIOUS one-sentence tape annotation for a stock move. The contract is "tag, never claim" — you may suggest a possible association with one of the candidate topics, but you must NEVER assert causation.

THE MOVE
  ${move.date}  ${move.ticker}  ${dirArrow}${(move.move_pct ?? 0).toFixed(2)}%   (rank ${move.rank ?? "?"} ${move.direction || "?"} mover)

CANDIDATE TOPICS (pre-filtered: ticker-scoped, visible at-or-before the move date, still active within 14d before it)
${candidatesBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "sentence":   "<ONE short sentence, max ~25 words. Must contain a cautious phrase like 'possibly', 'tentatively', 'may be tied to', or 'could be associated with'. Reference the topic by its canonical label, NOT its id.>",
  "topic_id":   "<one of ${idsJson} OR null if none of the candidates is a plausible association>",
  "confidence": "low" | "medium"
}

RULES
- The sentence MUST contain at least one of: "possibly", "tentatively", "may be tied", "could be associated", "could be tied", "may be associated".
- The sentence MUST NOT contain causal verbs / phrases: "caused", "drove", "because of", "due to", "as a result", "triggered by", "the reason".
- topic_id MUST be one of the candidate ids OR null. Never invent an id.
- Prefer topics with high days_active (persistence beats one-day singletons).
- "medium" confidence requires days_active ≥ 3 AND source_count ≥ 3. Otherwise "low".
- If no candidate plausibly fits the direction or the magnitude of the move, pick null and say so cautiously.
- Refer to the topic by its canonical label inside the sentence, not by the id.`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validate(blob, candidates) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.sentence !== "string" || blob.sentence.trim().length < 10) {
    throw new Error("invalid output: sentence missing or too short");
  }
  const sentLower = blob.sentence.toLowerCase();
  if (!CAUTIOUS_PHRASES.some(p => sentLower.includes(p))) {
    throw new Error(`invalid output: sentence missing cautious phrase ('${blob.sentence.slice(0, 60)}…')`);
  }
  for (const causal of CAUSAL_PHRASES) {
    if (sentLower.includes(causal)) {
      throw new Error(`invalid output: sentence contains causal phrase '${causal}' — contract violation`);
    }
  }
  if (blob.topic_id !== null) {
    const validIds = new Set(candidates.map(c => c.id));
    if (typeof blob.topic_id !== "string" || !validIds.has(blob.topic_id)) {
      throw new Error(`invalid topic_id '${blob.topic_id}' — must be a candidate id or null`);
    }
  }
  if (!VALID_CONFIDENCE.has(blob.confidence)) {
    throw new Error(`invalid confidence: ${blob.confidence}`);
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
