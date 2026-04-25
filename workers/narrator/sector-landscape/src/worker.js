// Narrator — Sector Landscape (Sprint 2)
//
// Same pipeline shape as narrator-regime, but outputs COMPARATIVE narrative
// across all sectors in one pass. Writes 4 rows with entity_type='sector_landscape',
// entity_id=null.
//
// Routes:
//   GET /build   — run the pipeline; force=1 bypasses stability gate
//   GET /status  — latest narrative metadata (no LLM calls)
//   GET /latest  — the 4 current rows as JSON (dashboard dev)

import { gatherLandscapeInputs } from "../gather.js";
import { composeLandscapeReading } from "../current_reading.js";
import { runLandscapeIdentification } from "../identification.js";
import { runLandscapeRecommendation } from "../recommendation.js";
import { runLede } from "../lede.js";
import { insertNarrative, bumpConfirmed, fetchAllLatest } from "../../shared/sql.js";
import { hashStable, sectorLandscapeStability } from "../../shared/stability.js";

const ENTITY_TYPE = "sector_landscape";
const ENTITY_ID = null;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/build") {
      const force = url.searchParams.get("force") === "1";
      return handle(() => build({ env, force }));
    }
    if (url.pathname === "/status") {
      return handle(() => status({ env }));
    }
    if (url.pathname === "/latest") {
      return handle(() => latest({ env }));
    }
    return json({ error: "route not found", worker: "narrator-sector-landscape" }, 404);
  },
};

async function build({ env, force }) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set on worker");
  const db = env.DB;

  const started = Date.now();
  const input = await gatherLandscapeInputs(db);
  const date = input.as_of;

  const prevHash = input.previous.input_hash;
  const stabilityByThreshold = sectorLandscapeStability(
    input.previous.identification?.numeric_snapshot_at_write || null,
    input.numeric_snapshot
  );
  const hashMatches = hashStable(prevHash, input.input_hash);
  const isStable = !force && hashMatches && stabilityByThreshold.stable
    && input.previous.identification && input.previous.recommendation && input.previous.lede;

  if (isStable) {
    const fields = ["current_reading", "identification", "recommendation", "lede"];
    await Promise.all(fields.map((f) =>
      bumpConfirmed(db, { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID, field: f })
    ));
    return {
      ok: true,
      stable: true,
      reason: "hash_and_thresholds_match",
      duration_ms: Date.now() - started,
      skipped_llm_calls: 3,
    };
  }

  const currentReading = composeLandscapeReading(input);

  const identification = await runLandscapeIdentification({ apiKey: env.OPENAI_API_KEY, input });
  if (!identification.ok) {
    throw new Error(`identification produced no valid bullets (dropped ${identification.dropped.length}): ${JSON.stringify(identification.dropped).slice(0, 500)}`);
  }

  const recommendation = await runLandscapeRecommendation({ apiKey: env.OPENAI_API_KEY, input, identification });
  if (!recommendation.ok) {
    throw new Error(`recommendation invalid: ${JSON.stringify(recommendation.dropped).slice(0, 500)}`);
  }

  const topSectors = (input.sectors || []).slice(0, 3).map((s) => `${s.sector} (${s.stance}, score ${s.stance_score})`).join("; ");
  const lede = await runLede({
    apiKey: env.OPENAI_API_KEY,
    currentReading,
    identification,
    recommendation,
    topSectors,
  });

  const sources = collectSources(identification.bullets);
  const commonInput = { input_hash: input.input_hash };

  const [crId, idId, recId, ledeId] = await Promise.all([
    insertNarrative(db, {
      entity_type: ENTITY_TYPE,
      entity_id: ENTITY_ID,
      date,
      field: "current_reading",
      content_json: { ...currentReading, numeric_snapshot_at_write: input.numeric_snapshot },
      model: "deterministic",
      ...commonInput,
    }),
    insertNarrative(db, {
      entity_type: ENTITY_TYPE,
      entity_id: ENTITY_ID,
      date,
      field: "identification",
      content_json: {
        bullets: identification.bullets,
        missing_factors: identification.missing_factors,
        dropped: identification.dropped,
        numeric_snapshot_at_write: input.numeric_snapshot,
      },
      sources_json: sources,
      model: "gpt-5",
      ...commonInput,
    }),
    insertNarrative(db, {
      entity_type: ENTITY_TYPE,
      entity_id: ENTITY_ID,
      date,
      field: "recommendation",
      content_json: {
        stance: recommendation.stance,
        signposts: recommendation.signposts,
        dropped: recommendation.dropped,
      },
      model: "gpt-5",
      ...commonInput,
    }),
    insertNarrative(db, {
      entity_type: ENTITY_TYPE,
      entity_id: ENTITY_ID,
      date,
      field: "lede",
      content_json: { text: lede.text, words: lede.words, source: lede.source },
      model: lede.source,
      ...commonInput,
    }),
  ]);

  return {
    ok: true,
    stable: false,
    duration_ms: Date.now() - started,
    rows: {
      current_reading: crId,
      identification: idId,
      recommendation: recId,
      lede: ledeId,
    },
    bullets_written: identification.bullets.length,
    signposts_written: recommendation.signposts.length,
    dropped_identification: identification.dropped.length,
    lede_source: lede.source,
    stability_breaches: stabilityByThreshold.breaches,
    input_hash: input.input_hash,
  };
}

async function status({ env }) {
  const rows = await fetchAllLatest(env.DB, { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID });
  return {
    ok: true,
    entity_type: ENTITY_TYPE,
    rows: rows.map((r) => ({
      field: r.field,
      date: r.date,
      model: r.model,
      input_hash: r.input_hash,
      last_confirmed_at: r.last_confirmed_at,
    })),
  };
}

async function latest({ env }) {
  const rows = await fetchAllLatest(env.DB, { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID });
  const out = {};
  for (const r of rows) out[r.field] = r.content;
  return { ok: true, entity_type: ENTITY_TYPE, ...out };
}

function collectSources(bullets) {
  return (bullets || []).map((b) => b.source).filter(Boolean);
}

async function handle(fn) {
  try {
    const body = await fn();
    return json(body);
  } catch (e) {
    console.error("[narrator-sector-landscape] error:", e);
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
