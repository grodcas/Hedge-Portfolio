/**
 * MACRO-SECTOR-NEWS-DRIFT-AGENT (S1) — per-sector news drift.
 *
 * Per [MAP_PIPELINE.md §S1]. Maps each sector-topic in TOPIC_FEED to one of
 * the sector thesis drivers (or none) with a sign, writes a paragraph,
 * lands on a verdict (intact / drifting / breaking).
 *
 * Same shape as M1 (macro-news-drift) but per-sector.
 *
 * Inputs (per sector):
 *   - 14d sector topic feed (TOPIC_FEED scope IN sectorScopes(sector))
 *   - Previous sector thesis drivers + tripwires (SECTOR_TREND_long.thesis_json)
 *   - Previous news_drift_json (continuity)
 *
 * Sector-name reconciliation: VALID_SECTORS uses the operations-agent
 * convention (ConsDisc / Finance / Staples / Industrial), but topic-feed-builder
 * lets the LLM pick its own sector labels (ConsumerDiscretionary, Financials,
 * etc.). SECTOR_TOPIC_SCOPES below maps each canonical sector to all known
 * synonyms so the WHERE clause catches both.
 *
 * Output (validated):
 *   {
 *     prose: string,
 *     verdict: "intact" | "drifting" | "breaking",
 *     driver_drift: { <driver_name>: int [-2..+2] },
 *     tripwires_fired: [tripwire_id, ...],
 *     topic_persistence: { <topic_id>: days_active },
 *     topic_count, version, last_updated, input_fingerprint
 *   }
 *
 * Writes SECTOR_TREND_long.{news_drift_json,_updated_at,_model}.
 *
 * Endpoint: GET /build?sector=X[&force=1].
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";
const TOPIC_LOOKBACK_DAYS = 14;
const VALID_VERDICTS = new Set(["intact", "drifting", "breaking"]);

const VALID_SECTORS = new Set([
  "Technology", "ConsDisc", "Communication", "Finance",
  "Energy", "Healthcare", "Staples", "Industrial",
]);

// Topic-feed-builder lets the LLM pick its own sector labels
// (ConsumerDiscretionary, Financials, Industrials, ConsumerStaples). Map the
// operations-agent canonical name to every scope we might find in TOPIC_FEED.
const SECTOR_TOPIC_SCOPES = {
  Technology:    ["sector:Technology"],
  ConsDisc:      ["sector:ConsDisc", "sector:ConsumerDiscretionary"],
  Communication: ["sector:Communication"],
  Finance:       ["sector:Finance", "sector:Financials"],
  Energy:        ["sector:Energy"],
  Healthcare:    ["sector:Healthcare"],
  Staples:       ["sector:Staples", "sector:ConsumerStaples"],
  Industrial:    ["sector:Industrial", "sector:Industrials"],
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
      const out = await build(env.DB, apiKey, sector, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(db, apiKey, sector, force) {
  const sectorRow = await db.prepare(
    `SELECT sector, regime, thesis_json, news_drift_json, news_drift_updated_at
       FROM SECTOR_TREND_long WHERE sector = ?`,
  ).bind(sector).first();
  if (!sectorRow) throw new Error(`no SECTOR_TREND_long row for ${sector}`);
  if (!sectorRow.thesis_json) throw new Error(`no sector thesis_json yet for ${sector} (S2 must fire first)`);

  const thesis    = JSON.parse(sectorRow.thesis_json);
  const drivers   = Array.isArray(thesis.drivers)   ? thesis.drivers   : [];
  const tripwires = Array.isArray(thesis.tripwires) ? thesis.tripwires : [];

  // ---------- Topic feed (per-sector, 14d) ----------
  const scopes = SECTOR_TOPIC_SCOPES[sector] || [`sector:${sector}`];
  const sinceDate = new Date(Date.now() - TOPIC_LOOKBACK_DAYS * 86400_000)
    .toISOString().slice(0, 10);
  const placeholders = scopes.map(() => "?").join(",");
  const topicRes = await db.prepare(
    `SELECT id, scope, topic_canonical, summary, date_first_seen, date_last_seen,
            days_active, mention_count, source_count, score
       FROM TOPIC_FEED
      WHERE scope IN (${placeholders})
        AND date_last_seen >= ?
      ORDER BY score DESC, date_last_seen DESC
      LIMIT 40`,
  ).bind(...scopes, sinceDate).all();
  const topics = topicRes.results || [];

  const prevDrift = sectorRow.news_drift_json ? safeJson(sectorRow.news_drift_json) : null;
  const prevVersion = Number.isInteger(prevDrift?.version) ? prevDrift.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    sector,
    drivers:   drivers.map(d => d.name),
    tripwires: tripwires.map(t => t.id),
    topics: topics.map(t => [t.id, t.scope, t.topic_canonical, t.days_active, t.mention_count, t.score]),
  }));

  if (!force && prevDrift?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      sector,
      version: prevVersion,
      news_drift_updated_at: sectorRow.news_drift_updated_at,
    };
  }

  if (topics.length === 0) {
    const now = new Date().toISOString();
    const drift = emptyDrift(prevVersion + 1, now, fingerprint, drivers);
    await persist(db, sector, drift);
    return {
      action: "wrote-empty",
      reason: `no ${sector} topics in 14d window`,
      sector,
      version: drift.version,
      news_drift_updated_at: now,
    };
  }

  const prompt = buildPrompt({ sector, drivers, tripwires, topics, prevDrift });
  const blob = await callLLM(apiKey, prompt, { model: MODEL });
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
  };

  await persist(db, sector, drift);

  return {
    action:           "wrote",
    sector,
    version:          drift.version,
    verdict:          drift.verdict,
    topic_count:      topics.length,
    drivers_seen:     Object.keys(drift.driver_drift).length,
    tripwires_fired:  drift.tripwires_fired.length,
    news_drift_updated_at: now,
  };
}

async function persist(db, sector, drift) {
  await db.prepare(
    `UPDATE SECTOR_TREND_long
        SET news_drift_json       = ?,
            news_drift_updated_at = ?,
            news_drift_model      = ?
      WHERE sector = ?`,
  ).bind(JSON.stringify(drift), drift.last_updated, MODEL, sector).run();
}

function emptyDrift(version, now, fingerprint, drivers) {
  const driver_drift = {};
  for (const d of drivers) driver_drift[d.name] = 0;
  return {
    prose:             "No corroborated sector topics in the last 14 days. Prior sector thesis stands by default.",
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

function buildPrompt({ sector, drivers, tripwires, topics, prevDrift }) {
  const driversBlock = drivers.length
    ? drivers.map(d => `  - ${d.name}: ${d.rationale}`).join("\n")
    : "  (no drivers)";
  const tripwiresBlock = tripwires.length
    ? tripwires.map(t => `  - [${t.id}] ${t.condition} — currently: ${t.currently}`).join("\n")
    : "  (no tripwires)";
  const topicsBlock = topics.map(fmtTopicLine).join("\n");

  const prevBlock = prevDrift
    ? `Version: ${prevDrift.version ?? "?"} (last updated ${prevDrift.last_updated ?? "?"})
Verdict: ${prevDrift.verdict ?? "?"}
Driver drift: ${JSON.stringify(prevDrift.driver_drift ?? {})}
Tripwires fired: ${JSON.stringify(prevDrift.tripwires_fired ?? [])}`
    : "(no prior drift run)";

  const driverNamesJson = JSON.stringify(drivers.map(d => d.name));
  const tripwireIdsJson = JSON.stringify(tripwires.map(t => t.id));

  return `You are a senior sector analyst running the news-drift step for the ${sector} sector thesis. For each topic in the 14-day sector feed, decide whether it confirms / weakens / contradicts one of the SECTOR THESIS DRIVERS, and whether it fires one of the TRIPWIRES. Then write a paragraph and land on a verdict.

SECTOR
  ${sector}

SECTOR THESIS DRIVERS (the only valid driver_drift keys)
${driversBlock}

SECTOR THESIS TRIPWIRES (the only valid tripwires_fired ids)
${tripwiresBlock}

SECTOR TOPIC FEED (14d window — topic_id | scope | days_active | mention_count | source_count | score)
${topicsBlock}

PREVIOUS DRIFT RUN (drift gradually — only swap signs when topics demand)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one paragraph, 4-6 sentences. Reference specific topic_canonical labels and the named driver each touches. State the verdict explicitly in the last sentence.>",
  "verdict": "intact" | "drifting" | "breaking",
  "driver_drift": {
    "<driver_name from SECTOR THESIS DRIVERS>": <integer in [-2..+2], + = confirming, − = weakening>
  },
  "tripwires_fired": ["<tripwire id from SECTOR THESIS TRIPWIRES>", ...]
}

RULES
- driver_drift keys MUST be exactly ${driverNamesJson}. Include every driver, even with score 0.
- tripwires_fired ids MUST be a subset of ${tripwireIdsJson}.
- ±2 means a topic with high mention_count + source_count + days_active strongly confirms / contradicts the driver. Single-day singletons rarely warrant ±2.
- Verdict mapping: |max driver_drift| ≤ 1 AND no tripwires fired → "intact". A clear majority of drivers at −1 or one at −2 OR a tripwire fired → "drifting". A driver at −2 AND a tripwire fired (or two tripwires) → "breaking".
- Prose must take a position on whether the ${sector} thesis is intact / weakening / breaking. End with the verdict word.`;
}

function fmtTopicLine(t) {
  const persist = t.days_active == null ? "?" : `${t.days_active}d`;
  const mc      = t.mention_count == null ? "?" : t.mention_count;
  const sc      = t.source_count  == null ? "?" : t.source_count;
  const score   = t.score == null ? "?" : Number(t.score).toFixed(1);
  return `  [${t.id}] ${t.scope.padEnd(28)} d=${persist} m=${mc} s=${sc} score=${score}  ${t.topic_canonical}`;
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
