/**
 * TICKER-NEWS-DRIFT-AGENT (#5 News drift) — per [TICKER_PIPELINE.md §5].
 *
 * Per-ticker analogue of M1 / S1. Maps each topic in TOPIC_FEED scoped to
 * `ticker:X` to one of the ticker thesis drivers (or none) with a sign,
 * writes a paragraph, lands on a verdict (intact / drifting / breaking).
 *
 * Inputs (per ticker):
 *   - 14d ticker topic feed (TOPIC_FEED scope = 'ticker:X')
 *   - Previous ticker thesis drivers + tripwires (TICKER_TREND_long.thesis_json)
 *   - Previous news_drift_json (continuity)
 *
 * Output (validated):
 *   {
 *     prose: string,
 *     verdict: "intact" | "drifting" | "breaking",
 *     driver_drift: { <driver_name>: int [-2..+2] },
 *     tripwires_fired: [tripwire_id, ...],
 *     topic_persistence: { <topic_id>: days_active },
 *     topic_count, version, last_updated, input_fingerprint, ticker_at_write
 *   }
 *
 * Writes TICKER_TREND_long.{news_drift_json,_updated_at,_model}.
 * Endpoint: GET /build?ticker=NVDA[&force=1].
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
    `SELECT thesis_json, news_drift_json, news_drift_updated_at
       FROM TICKER_TREND_long WHERE ticker = ?`,
  ).bind(ticker).first();
  if (!trendRow) throw new Error(`no TICKER_TREND_long row for ${ticker}`);

  // Drivers / tripwires can be empty on first ever drift (before #7 thesis
  // has run). The agent still runs — driver_drift is just an empty object,
  // verdict defaults to "intact" by the rules below.
  const thesis    = trendRow.thesis_json ? safeJson(trendRow.thesis_json) : null;
  const drivers   = Array.isArray(thesis?.drivers)   ? thesis.drivers   : [];
  const tripwires = Array.isArray(thesis?.tripwires) ? thesis.tripwires : [];

  const sinceDate = new Date(Date.now() - TOPIC_LOOKBACK_DAYS * 86400_000)
    .toISOString().slice(0, 10);
  const topicRes = await db.prepare(
    `SELECT id, topic_canonical, summary, date_first_seen, date_last_seen,
            days_active, mention_count, source_count, score
       FROM TOPIC_FEED
      WHERE scope = ?
        AND date_last_seen >= ?
      ORDER BY score DESC, date_last_seen DESC
      LIMIT 40`,
  ).bind(`ticker:${ticker}`, sinceDate).all();
  const topics = topicRes.results || [];

  const prevDrift   = trendRow.news_drift_json ? safeJson(trendRow.news_drift_json) : null;
  const prevVersion = Number.isInteger(prevDrift?.version) ? prevDrift.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    ticker,
    drivers:   drivers.map(d => d.name),
    tripwires: tripwires.map(t => t.id),
    topics: topics.map(t => [t.id, t.topic_canonical, t.days_active, t.mention_count, t.score]),
  }));

  if (!force && prevDrift?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      ticker,
      version: prevVersion,
      news_drift_updated_at: trendRow.news_drift_updated_at,
    };
  }

  if (topics.length === 0) {
    const now = new Date().toISOString();
    const drift = emptyDrift(prevVersion + 1, now, fingerprint, drivers, ticker);
    await persist(db, ticker, drift);
    return {
      action: "wrote-empty",
      reason: `no ticker:${ticker} topics in 14d window`,
      ticker,
      version: drift.version,
      news_drift_updated_at: now,
    };
  }

  const prompt = buildPrompt({ ticker, drivers, tripwires, topics, prevDrift });
  const blob = await callLLM(apiKey, prompt, { model: MODEL, env, caller: "ticker-news-drift" });
  validateDrift(blob, drivers, tripwires);

  const topicPersistence = {};
  for (const t of topics) {
    if (Number.isInteger(t.days_active)) topicPersistence[t.id] = t.days_active;
  }

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
    ticker_at_write:   ticker,
  };

  await persist(db, ticker, drift);

  return {
    action: "wrote",
    ticker,
    version: drift.version,
    verdict: drift.verdict,
    topic_count: topics.length,
    drivers_seen: Object.keys(drift.driver_drift).length,
    tripwires_fired: drift.tripwires_fired.length,
    news_drift_updated_at: now,
  };
}

async function persist(db, ticker, drift) {
  await db.prepare(
    `UPDATE TICKER_TREND_long
        SET news_drift_json       = ?,
            news_drift_updated_at = ?,
            news_drift_model      = ?
      WHERE ticker = ?`,
  ).bind(JSON.stringify(drift), drift.last_updated, MODEL, ticker).run();
}

function emptyDrift(version, now, fingerprint, drivers, ticker) {
  const driver_drift = {};
  for (const d of drivers) driver_drift[d.name] = 0;
  return {
    prose:             `No corroborated topics for ${ticker} in the last 14 days. Prior thesis stands by default.`,
    verdict:           "intact",
    driver_drift,
    tripwires_fired:   [],
    topic_persistence: {},
    topic_count:       0,
    version,
    last_updated:      now,
    input_fingerprint: fingerprint,
    ticker_at_write:   ticker,
  };
}

function buildPrompt({ ticker, drivers, tripwires, topics, prevDrift }) {
  const driversBlock = drivers.length
    ? drivers.map(d => `  - ${d.name}: ${d.rationale}`).join("\n")
    : "  (no prior thesis drivers — first run; driver_drift may be {})";
  const tripwiresBlock = tripwires.length
    ? tripwires.map(t => `  - [${t.id}] ${t.condition} — currently: ${t.currently}`).join("\n")
    : "  (no prior thesis tripwires)";
  const topicsBlock = topics.map(fmtTopicLine).join("\n");

  const prevBlock = prevDrift
    ? `Version: ${prevDrift.version ?? "?"} (last updated ${prevDrift.last_updated ?? "?"})
Verdict: ${prevDrift.verdict ?? "?"}
Driver drift: ${JSON.stringify(prevDrift.driver_drift ?? {})}
Tripwires fired: ${JSON.stringify(prevDrift.tripwires_fired ?? [])}`
    : "(no prior drift run)";

  const driverNamesJson = JSON.stringify(drivers.map(d => d.name));
  const tripwireIdsJson = JSON.stringify(tripwires.map(t => t.id));

  return `You are a senior equity analyst running the news-drift step for ${ticker}. For each topic in the 14-day ticker feed, decide whether it confirms / weakens / contradicts one of the THESIS DRIVERS, and whether it fires one of the TRIPWIRES. Then write a paragraph and land on a verdict.

TICKER
  ${ticker}

THESIS DRIVERS (the only valid driver_drift keys)
${driversBlock}

THESIS TRIPWIRES (the only valid tripwires_fired ids)
${tripwiresBlock}

TICKER TOPIC FEED (14d window — topic_id | days_active | mention_count | source_count | score)
${topicsBlock}

PREVIOUS DRIFT RUN (drift gradually — only swap signs when topics demand)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one paragraph, 4-6 sentences. Reference specific topic_canonical labels and the named driver each touches. State the verdict explicitly in the last sentence.>",
  "verdict": "intact" | "drifting" | "breaking",
  "driver_drift": {
    "<driver_name from THESIS DRIVERS>": <integer in [-2..+2], + = confirming, − = weakening>
  },
  "tripwires_fired": ["<tripwire id from THESIS TRIPWIRES>", ...]
}

RULES
- driver_drift keys MUST be exactly ${driverNamesJson}. Include every driver, even with score 0. If empty (no prior thesis), emit {}.
- tripwires_fired ids MUST be a subset of ${tripwireIdsJson}.
- ±2 = topic with high mention_count + source_count + days_active strongly confirms / contradicts driver. Single-day singletons rarely warrant ±2.
- Verdict: |max driver_drift| ≤ 1 AND no tripwires fired → "intact". Majority of drivers at −1 OR one at −2 OR a tripwire fired → "drifting". A driver at −2 AND a tripwire fired (or two tripwires) → "breaking".
- If drivers list is empty, default verdict is "intact" (we have no story to break yet).
- Prose must take a position on whether the ${ticker} thesis is intact / weakening / breaking. End with the verdict word.`;
}

function fmtTopicLine(t) {
  const persist = t.days_active == null ? "?" : `${t.days_active}d`;
  const mc      = t.mention_count == null ? "?" : t.mention_count;
  const sc      = t.source_count  == null ? "?" : t.source_count;
  const score   = t.score == null ? "?" : Number(t.score).toFixed(1);
  return `  [${t.id}] d=${persist} m=${mc} s=${sc} score=${score}  ${t.topic_canonical}`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validateDrift(blob, drivers, tripwires) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 60) {
    throw new Error("invalid output: prose missing or too short");
  }
  if (!VALID_VERDICTS.has(blob.verdict)) {
    throw new Error(`invalid verdict: ${blob.verdict}`);
  }
  if (!blob.driver_drift || typeof blob.driver_drift !== "object" || Array.isArray(blob.driver_drift)) {
    throw new Error("invalid output: driver_drift must be object");
  }
  const validDriverNames = new Set(drivers.map(d => d.name));
  for (const [name, score] of Object.entries(blob.driver_drift)) {
    if (!validDriverNames.has(name)) {
      throw new Error(`invalid driver_drift key: '${name}'`);
    }
    if (!Number.isInteger(score) || score < -2 || score > 2) {
      throw new Error(`invalid driver_drift score for '${name}': ${score}`);
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
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
