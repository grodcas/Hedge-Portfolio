/**
 * MACRO-SECTOR-NOTES-AGENT (S3) — corroborated sector bullets per
 * driver/tripwire.
 *
 * Per [MAP_PIPELINE.md §S3]. Per-sector analogue of M3.
 *
 * Inputs (per sector):
 *   - 14d sector topic feed (TOPIC_FEED scoped to this sector — synonyms
 *     resolved via SECTOR_TOPIC_SCOPES)
 *   - Sector thesis drivers + tripwires (SECTOR_TREND_long.thesis_json)
 *   - Sector news_drift driver_drift signs (SECTOR_TREND_long.news_drift_json)
 *
 * Output:
 *   {
 *     bullets: [{
 *       claim, driver_tags, tripwire_tags, source_topic_id,
 *       source_count, scope
 *     }],
 *     bullet_count, version, last_updated, input_fingerprint
 *   }
 *
 * Writes SECTOR_TREND_long.{notes_json,_updated_at,_model}.
 *
 * Endpoint: GET /build?sector=X[&force=1].
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";
const TOPIC_LOOKBACK_DAYS = 14;
const MAX_BULLETS = 10;

const VALID_SECTORS = new Set([
  "Technology", "ConsDisc", "Communication", "Finance",
  "Energy", "Healthcare", "Staples", "Industrial",
]);

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
    `SELECT sector, thesis_json, news_drift_json, notes_json, notes_updated_at
       FROM SECTOR_TREND_long WHERE sector = ?`,
  ).bind(sector).first();
  if (!sectorRow) throw new Error(`no SECTOR_TREND_long row for ${sector}`);
  if (!sectorRow.thesis_json) throw new Error(`no sector thesis_json yet for ${sector} (S2 must fire first)`);

  const thesis    = JSON.parse(sectorRow.thesis_json);
  const drivers   = Array.isArray(thesis.drivers)   ? thesis.drivers   : [];
  const tripwires = Array.isArray(thesis.tripwires) ? thesis.tripwires : [];
  const drift     = sectorRow.news_drift_json ? safeJson(sectorRow.news_drift_json) : null;

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
      LIMIT 30`,
  ).bind(...scopes, sinceDate).all();
  const topics = topicRes.results || [];

  const prevNotes   = sectorRow.notes_json ? safeJson(sectorRow.notes_json) : null;
  const prevVersion = Number.isInteger(prevNotes?.version) ? prevNotes.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    sector,
    drivers:   drivers.map(d => d.name),
    tripwires: tripwires.map(t => t.id),
    drift_signs: drift?.driver_drift ?? null,
    topics: topics.map(t => [t.id, t.topic_canonical, t.days_active, t.source_count, t.score]),
  }));

  if (!force && prevNotes?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      sector,
      version: prevVersion,
      notes_updated_at: sectorRow.notes_updated_at,
    };
  }

  if (topics.length === 0) {
    const now = new Date().toISOString();
    const notes = {
      bullets: [],
      bullet_count: 0,
      version: prevVersion + 1,
      last_updated: now,
      input_fingerprint: fingerprint,
    };
    await persist(db, sector, notes);
    return { action: "wrote-empty", reason: `no ${sector} topics in 14d window`, sector, version: notes.version };
  }

  const prompt = buildPrompt({ sector, drivers, tripwires, drift, topics, prevNotes });
  const blob = await callLLM(apiKey, prompt, { model: MODEL });
  validateNotes(blob, drivers, tripwires, topics);

  const topicById = new Map(topics.map(t => [t.id, t]));
  const sorted = [...blob.bullets].sort((a, b) => relevanceScore(b, topicById) - relevanceScore(a, topicById));
  const truncated = sorted.slice(0, MAX_BULLETS);

  const now = new Date().toISOString();
  const notes = {
    bullets:       truncated,
    bullet_count:  truncated.length,
    version:       prevVersion + 1,
    last_updated:  now,
    input_fingerprint: fingerprint,
  };

  await persist(db, sector, notes);

  return {
    action:           "wrote",
    sector,
    version:          notes.version,
    bullet_count:     notes.bullet_count,
    notes_updated_at: now,
  };
}

async function persist(db, sector, notes) {
  await db.prepare(
    `UPDATE SECTOR_TREND_long
        SET notes_json       = ?,
            notes_updated_at = ?,
            notes_model      = ?
      WHERE sector = ?`,
  ).bind(JSON.stringify(notes), notes.last_updated, MODEL, sector).run();
}

function relevanceScore(bullet, topicById) {
  const driverTags = (bullet.driver_tags   || []).length;
  const tripTags   = (bullet.tripwire_tags || []).length;
  const tagScore   = driverTags + 2 * tripTags;
  const t = topicById.get(bullet.source_topic_id);
  const corro = t ? (t.source_count || 0) : 0;
  const persist = t ? (t.days_active || 0) : 0;
  return tagScore * 100 + corro * 5 + persist;
}

function buildPrompt({ sector, drivers, tripwires, drift, topics, prevNotes }) {
  const driversBlock = drivers.length
    ? drivers.map(d => `  - ${d.name}: ${d.rationale}`).join("\n")
    : "  (no drivers)";
  const tripwiresBlock = tripwires.length
    ? tripwires.map(t => `  - [${t.id}] ${t.condition} — currently: ${t.currently}`).join("\n")
    : "  (no tripwires)";
  const driftBlock = drift
    ? `  Verdict: ${drift.verdict}\n  Driver drift signs: ${JSON.stringify(drift.driver_drift || {})}`
    : "  (no drift run yet)";
  const topicsBlock = topics.map(t =>
    `  [${t.id}] ${t.scope.padEnd(28)} d=${t.days_active ?? "?"}d m=${t.mention_count ?? "?"} s=${t.source_count ?? "?"}  ${t.topic_canonical}\n      → ${t.summary || "(no summary)"}`,
  ).join("\n");
  const prevBlock = prevNotes?.bullets?.length
    ? `Prior bullets (${prevNotes.bullets.length}):\n` + prevNotes.bullets.slice(0, 5).map(b => `  - ${b.claim}`).join("\n")
    : "(no prior notes)";

  const driverNamesJson = JSON.stringify(drivers.map(d => d.name));
  const tripwireIdsJson = JSON.stringify(tripwires.map(t => t.id));
  const topicIdsJson    = JSON.stringify(topics.map(t => t.id));

  return `You are a senior ${sector} sector analyst. Extract a thin list of corroborated, one-line claims from the sector topic feed below. Each bullet must touch at least one sector thesis driver OR one tripwire — drop topics that don't.

SECTOR
  ${sector}

SECTOR THESIS DRIVERS (valid driver_tags)
${driversBlock}

SECTOR THESIS TRIPWIRES (valid tripwire_tags)
${tripwiresBlock}

NEWS DRIFT (per-driver signs from S1)
${driftBlock}

SECTOR TOPIC FEED (14d window — pick at most ${MAX_BULLETS} most-relevant)
${topicsBlock}

PREVIOUS NOTES (for continuity, don't repeat)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "bullets": [
    {
      "claim": "<one short factual sentence — what happened, with the number / date / actor. No interpretation, no hedging.>",
      "driver_tags":   ["<driver_name from SECTOR THESIS DRIVERS>", ...],
      "tripwire_tags": ["<tripwire id from SECTOR THESIS TRIPWIRES>", ...],
      "source_topic_id": "<TOPIC_FEED id from above>"
    }
  ]
}

RULES
- ${MAX_BULLETS} bullets MAX. Drop topics that don't touch a driver or tripwire.
- Each claim is ONE short factual sentence with the number, date, or actor explicit. No analysis.
- driver_tags MUST be a subset of ${driverNamesJson}. tripwire_tags MUST be a subset of ${tripwireIdsJson}.
- Each bullet MUST have ≥1 tag total (driver OR tripwire). Bullets with zero tags will be rejected.
- source_topic_id MUST be one of ${topicIdsJson}.
- Prefer topics with high days_active and source_count. A 1-day singleton is rarely worth a bullet.`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validateNotes(blob, drivers, tripwires, topics) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (!Array.isArray(blob.bullets)) throw new Error("invalid output: bullets must be array");
  if (blob.bullets.length === 0) throw new Error("invalid output: bullets is empty");
  const driverNames  = new Set(drivers.map(d => d.name));
  const tripwireIds  = new Set(tripwires.map(t => t.id));
  const topicIds     = new Set(topics.map(t => t.id));
  for (const b of blob.bullets) {
    if (!b || typeof b.claim !== "string" || b.claim.trim().length < 10) {
      throw new Error(`invalid bullet: claim missing or too short`);
    }
    if (!Array.isArray(b.driver_tags))   throw new Error("invalid bullet: driver_tags must be array");
    if (!Array.isArray(b.tripwire_tags)) throw new Error("invalid bullet: tripwire_tags must be array");
    if (b.driver_tags.length + b.tripwire_tags.length === 0) {
      throw new Error(`invalid bullet: no tags ('${b.claim.slice(0, 40)}')`);
    }
    for (const dt of b.driver_tags) {
      if (!driverNames.has(dt)) throw new Error(`invalid driver_tag '${dt}'`);
    }
    for (const tt of b.tripwire_tags) {
      if (!tripwireIds.has(tt)) throw new Error(`invalid tripwire_tag '${tt}'`);
    }
    if (typeof b.source_topic_id !== "string" || !topicIds.has(b.source_topic_id)) {
      throw new Error(`invalid source_topic_id '${b.source_topic_id}'`);
    }
    const t = topics.find(x => x.id === b.source_topic_id);
    if (t) {
      b.source_count = t.source_count;
      b.scope        = t.scope;
    }
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
