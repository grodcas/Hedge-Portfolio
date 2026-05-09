/**
 * MACRO-NEWS-DRIFT-AGENT (M1) — per-topic driver classifier + drift verdict.
 *
 * Per [MAP_PIPELINE.md §M1]. Maps each macro topic in TOPIC_FEED to one of
 * the macro thesis drivers (or none) with a sign, writes a paragraph, lands
 * on a verdict (regime intact / drifting / breaking).
 *
 * Inputs:
 *   - 14d macro topic feed   (TOPIC_FEED rows WHERE scope LIKE 'macro:%'
 *                             AND date_last_seen >= today-14)
 *   - Previous macro drivers (BETA_10_Daily_macro.thesis_json.drivers — used
 *                             as the per-topic classification target)
 *   - Previous macro tripwires (.thesis_json.tripwires — for tripwires_fired)
 *   - Previous news_drift_json (driver_drift continuity across runs)
 *
 * Output (validated):
 *   {
 *     prose: string,                    // one paragraph synthesising the drift
 *     verdict: "intact" | "drifting" | "breaking",
 *     driver_drift: { <driver_name>: number in [-2..+2] },
 *     tripwires_fired: [tripwire_id, ...],
 *     topic_persistence: { <topic_id>: days_active },
 *     version, last_updated, input_fingerprint
 *   }
 *
 * Writes BETA_10_Daily_macro.{news_drift_json,_updated_at,_model}.
 *
 * Endpoints:
 *   GET /build           — assemble inputs, fingerprint, fire LLM iff changed.
 *   GET /build?force=1   — bypass the fingerprint check; always re-runs.
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";
const TOPIC_LOOKBACK_DAYS = 14;
const VALID_VERDICTS = new Set(["intact", "drifting", "breaking"]);

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
  // ---------- Latest macro row + thesis ----------
  const macroRow = await db.prepare(
    `SELECT id, regime, thesis_json, news_drift_json, news_drift_updated_at, creation_date
       FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC LIMIT 1`,
  ).first();
  if (!macroRow) throw new Error("no BETA_10_Daily_macro row");
  if (!macroRow.thesis_json) throw new Error("no thesis_json yet (M2 must fire first)");

  const thesis = JSON.parse(macroRow.thesis_json);
  const drivers   = Array.isArray(thesis.drivers)   ? thesis.drivers   : [];
  const tripwires = Array.isArray(thesis.tripwires) ? thesis.tripwires : [];

  // ---------- Macro topic feed (14d window) ----------
  const sinceDate = new Date(Date.now() - TOPIC_LOOKBACK_DAYS * 86400_000)
    .toISOString().slice(0, 10);
  const topicRes = await db.prepare(
    `SELECT id, scope, topic_canonical, summary, date_first_seen, date_last_seen,
            days_active, mention_count, source_count, score
       FROM TOPIC_FEED
      WHERE scope LIKE 'macro:%'
        AND date_last_seen >= ?
      ORDER BY score DESC, date_last_seen DESC
      LIMIT 60`,
  ).bind(sinceDate).all();
  const topics = topicRes.results || [];

  // ---------- Prior drift output ----------
  const prevDrift = macroRow.news_drift_json ? safeJson(macroRow.news_drift_json) : null;
  const prevVersion = Number.isInteger(prevDrift?.version) ? prevDrift.version : 0;

  // ---------- Fingerprint + no-op ----------
  // Fold every input the prompt renders. If unchanged + a prior drift exists,
  // skip the LLM call.
  const fingerprint = await sha256(JSON.stringify({
    regime: macroRow.regime,
    thesis_drivers:   drivers.map(d => d.name),
    thesis_tripwires: tripwires.map(t => t.id),
    topics: topics.map(t => [t.id, t.scope, t.topic_canonical, t.days_active, t.mention_count, t.score]),
  }));

  if (!force && prevDrift?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      version: prevVersion,
      news_drift_updated_at: macroRow.news_drift_updated_at,
    };
  }

  // ---------- Empty topic feed ----------
  // If TOPIC_FEED has no macro rows, write an "intact" no-op version rather
  // than calling the LLM with no signal. The orchestrator gate stops re-firing
  // until the topic feed actually has rows.
  if (topics.length === 0) {
    const now = new Date().toISOString();
    const drift = emptyDrift(prevVersion + 1, now, fingerprint, drivers);
    await persist(db, macroRow.id, drift);
    return {
      action: "wrote-empty",
      reason: "no macro topics in 14d window",
      macro_row_id: macroRow.id,
      version: drift.version,
      news_drift_updated_at: now,
    };
  }

  // ---------- Prompt + LLM ----------
  const prompt = buildPrompt({ regime: macroRow.regime, drivers, tripwires, topics, prevDrift });
  const blob = await callLLM(apiKey, prompt, { model: MODEL, env, caller: "macro-news-drift" });
  validateDrift(blob, drivers, tripwires);

  // topic_persistence is a deterministic mirror of days_active — assemble
  // server-side so the LLM can't drift the integers.
  const topicPersistence = {};
  for (const t of topics) {
    if (Number.isInteger(t.days_active)) topicPersistence[t.id] = t.days_active;
  }

  // ---------- Stamp + persist ----------
  const now = new Date().toISOString();
  const drift = {
    prose:             blob.prose.trim(),
    verdict:           blob.verdict,
    driver_drift:      blob.driver_drift,
    tripwires_fired:   blob.tripwires_fired,
    topic_persistence: topicPersistence,
    topic_count:       topics.length,
    version:           prevVersion + 1,
    last_updated:      now,
    input_fingerprint: fingerprint,
  };

  await persist(db, macroRow.id, drift);

  return {
    action:           "wrote",
    macro_row_id:     macroRow.id,
    version:          drift.version,
    verdict:          drift.verdict,
    topic_count:      topics.length,
    drivers_seen:     Object.keys(drift.driver_drift).length,
    tripwires_fired:  drift.tripwires_fired.length,
    news_drift_updated_at: now,
  };
}

async function persist(db, macroRowId, drift) {
  await db.prepare(
    `UPDATE BETA_10_Daily_macro
        SET news_drift_json       = ?,
            news_drift_updated_at = ?,
            news_drift_model      = ?
      WHERE id = ?`,
  ).bind(JSON.stringify(drift), drift.last_updated, MODEL, macroRowId).run();
}

function emptyDrift(version, now, fingerprint, drivers) {
  const driver_drift = {};
  for (const d of drivers) driver_drift[d.name] = 0;
  return {
    prose:             "No corroborated macro topics in the last 14 days. Prior thesis stands by default.",
    verdict:           "intact",
    driver_drift,
    tripwires_fired:   [],
    topic_persistence: {},
    topic_count:       0,
    version,
    last_updated:      now,
    input_fingerprint: fingerprint,
  };
}

function buildPrompt({ regime, drivers, tripwires, topics, prevDrift }) {
  const driversBlock = drivers.length
    ? drivers.map(d => `  - ${d.name}: ${d.rationale}`).join("\n")
    : "  (no drivers in current macro thesis)";
  const tripwiresBlock = tripwires.length
    ? tripwires.map(t => `  - [${t.id}] ${t.condition} — currently: ${t.currently}`).join("\n")
    : "  (no tripwires in current macro thesis)";
  const topicsBlock = topics.map(fmtTopicLine).join("\n");

  const prevBlock = prevDrift
    ? `Version: ${prevDrift.version ?? "?"} (last updated ${prevDrift.last_updated ?? "?"})
Verdict: ${prevDrift.verdict ?? "?"}
Driver drift: ${JSON.stringify(prevDrift.driver_drift ?? {})}
Tripwires fired: ${JSON.stringify(prevDrift.tripwires_fired ?? [])}`
    : "(no prior drift run)";

  const driverNamesJson = JSON.stringify(drivers.map(d => d.name));
  const tripwireIdsJson = JSON.stringify(tripwires.map(t => t.id));

  return `You are a senior macro strategist running the news-drift step for the macro thesis. For each topic in the 14-day macro feed, decide whether it confirms, weakens, or contradicts one of the THESIS DRIVERS, and whether it fires one of the THESIS TRIPWIRES. Then write a paragraph and land on a verdict (intact / drifting / breaking).

REGIME (deterministic classifier)
  Label: ${regime || "unclassified"}

THESIS DRIVERS (the only valid driver_drift keys are exactly these names)
${driversBlock}

THESIS TRIPWIRES (the only valid tripwires_fired ids are exactly these)
${tripwiresBlock}

MACRO TOPIC FEED (14d window — topic_id | scope | days_active | mention_count | source_count | score)
${topicsBlock}

PREVIOUS DRIFT RUN (drift gradually — only swap signs when topics demand)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one paragraph, 4-6 sentences. Reference specific topic_canonical labels and how each touches a named driver. State the verdict explicitly in the last sentence.>",
  "verdict": "intact" | "drifting" | "breaking",
  "driver_drift": {
    "<driver_name from THESIS DRIVERS>": <integer in [-2..+2], + = confirming, − = weakening>
  },
  "tripwires_fired": ["<tripwire id from THESIS TRIPWIRES>", ...]
}

RULES
- driver_drift keys MUST be exactly ${driverNamesJson}. Include every driver, even with score 0.
- tripwires_fired ids MUST be a subset of ${tripwireIdsJson}. Empty array is valid (most days nothing fires).
- A driver score of +2 / −2 means a topic with high mention_count + source_count + days_active strongly confirms / contradicts the driver. Single-day singletons rarely warrant ±2.
- Verdict mapping: |max driver_drift| ≤ 1 AND no tripwires fired → "intact". A clear majority of drivers at −1 or one at −2 OR a tripwire fired → "drifting". A driver at −2 AND a tripwire fired (or two tripwires) → "breaking".
- Weight days_active heavily: a topic that's persisted 7+ days is structural, a 1-day spike is noise.
- Prose must take a position. Avoid hedging language. End with the verdict word.`;
}

function fmtTopicLine(t) {
  const persist = t.days_active == null ? "?" : `${t.days_active}d`;
  const mc      = t.mention_count == null ? "?" : t.mention_count;
  const sc      = t.source_count  == null ? "?" : t.source_count;
  const score   = t.score == null ? "?" : Number(t.score).toFixed(1);
  return `  [${t.id}] ${t.scope.padEnd(18)} d=${persist} m=${mc} s=${sc} score=${score}  ${t.topic_canonical}`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validateDrift(blob, drivers, tripwires) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 60) {
    throw new Error("invalid output: prose missing or too short");
  }
  if (!VALID_VERDICTS.has(blob.verdict)) {
    throw new Error(`invalid verdict: ${blob.verdict} (must be intact/drifting/breaking)`);
  }
  if (!blob.driver_drift || typeof blob.driver_drift !== "object" || Array.isArray(blob.driver_drift)) {
    throw new Error("invalid output: driver_drift must be object");
  }
  const validDriverNames = new Set(drivers.map(d => d.name));
  for (const [name, score] of Object.entries(blob.driver_drift)) {
    if (!validDriverNames.has(name)) {
      throw new Error(`invalid driver_drift key: '${name}' not in current thesis drivers`);
    }
    if (!Number.isInteger(score) || score < -2 || score > 2) {
      throw new Error(`invalid driver_drift score for '${name}': ${score} (must be integer in [-2..+2])`);
    }
  }
  if (!Array.isArray(blob.tripwires_fired)) {
    throw new Error("invalid output: tripwires_fired must be array");
  }
  const validTripwireIds = new Set(tripwires.map(t => t.id));
  for (const id of blob.tripwires_fired) {
    if (typeof id !== "string" || !validTripwireIds.has(id)) {
      throw new Error(`invalid tripwire id in tripwires_fired: '${id}'`);
    }
  }

  // Verdict-mapping enforcement (the prompt RULES section line 244):
  //   "intact":   |max driver_drift| ≤ 1 AND no tripwires fired
  //   "drifting": majority of drivers ≤ -1 OR a single driver = -2 OR ≥ 1 tripwire fired
  //   "breaking": (a driver = -2 AND ≥ 1 tripwire) OR ≥ 2 tripwires fired
  // Without enforcement here, the LLM could ship verdict="intact" when the drift
  // dict shows -2 across the board. Reject that contradiction.
  const scores = Object.values(blob.driver_drift).map(Number).filter(Number.isFinite);
  const tripCount = blob.tripwires_fired.length;
  const minScore  = scores.length ? Math.min(...scores) : 0;
  const negCount  = scores.filter(s => s <= -1).length;
  const negShare  = scores.length ? negCount / scores.length : 0;
  let expected;
  if ((minScore === -2 && tripCount >= 1) || tripCount >= 2)         expected = "breaking";
  else if (minScore === -2 || negShare > 0.5 || tripCount >= 1)      expected = "drifting";
  else                                                               expected = "intact";
  if (blob.verdict !== expected) {
    throw new Error(
      `verdict mismatch: claimed "${blob.verdict}" but mapping rule says "${expected}" ` +
      `(min driver=${minScore}, neg share=${(negShare*100).toFixed(0)}%, tripwires fired=${tripCount})`
    );
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
