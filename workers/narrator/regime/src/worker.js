// Narrator — Regime (Sprint 1)
//
// Pipeline per NARRATIVE_BUILD_PLAN.md:
//   gather → stability check →
//   composeCurrentReading (deterministic) →
//   runIdentification (GPT-5)           →
//   runRecommendation (GPT-5)           →
//   runLede (GPT-4o-mini or fallback)   →
//   write to NARRATIVE_01_Content (4 rows: current_reading, identification, recommendation, lede)
//
// Routes:
//   GET /build           — run the pipeline; force=1 bypasses stability gate
//   GET /status          — latest narrative metadata (no LLM calls)
//   GET /latest          — return the 4 current rows as JSON (debug / dashboard dev)

import { gatherRegimeInputs } from "../gather.js";
import { composeCurrentReading } from "../current_reading.js";
import { runIdentification } from "../identification.js";
import { runRecommendation } from "../recommendation.js";
import { runLede } from "../lede.js";
import { insertNarrative, bumpConfirmed, fetchAllLatest } from "../../shared/sql.js";
import { hashStable, regimeStability } from "../../shared/stability.js";

const ENTITY_TYPE = "regime";
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
    return json({ error: "route not found", worker: "narrator-regime" }, 404);
  },
};

async function build({ env, force }) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set on worker");
  const db = env.DB;

  const started = Date.now();
  const input = await gatherRegimeInputs(db);
  const date = input.as_of;

  // Stability gate: if the numeric inputs haven't moved enough AND the hash
  // is identical, skip the LLM calls and just bump last_confirmed_at. Any
  // previous row bumped → dashboard shows it as "still current" without cost.
  const prevHash = input.previous.input_hash;
  const stabilityByThreshold = regimeStability(
    input.previous.identification?.numeric_snapshot_at_write || null,
    input.numeric_snapshot
  );
  const hashMatches = hashStable(prevHash, input.input_hash);
  const isStable = !force && hashMatches && stabilityByThreshold.stable && input.previous.identification && input.previous.recommendation && input.previous.lede;

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

  // Current reading (deterministic)
  const currentReading = composeCurrentReading(input);

  // Identification (GPT-5)
  const identification = await runIdentification({ apiKey: env.OPENAI_API_KEY, input });
  if (!identification.ok) {
    throw new Error(`identification produced no valid bullets (dropped ${identification.dropped.length}): ${JSON.stringify(identification.dropped).slice(0, 500)}`);
  }

  // Recommendation (GPT-5)
  const recommendation = await runRecommendation({ apiKey: env.OPENAI_API_KEY, input, identification });
  if (!recommendation.ok) {
    throw new Error(`recommendation invalid: ${JSON.stringify(recommendation.dropped).slice(0, 500)}`);
  }

  // Lede (GPT-4o-mini with deterministic fallback)
  const topMetrics = (input.indicators || []).slice(0, 3).map((i) => `${i.label} ${i.value}${i.unit || ""}`).join("; ");
  const lede = await runLede({
    apiKey: env.OPENAI_API_KEY,
    currentReading,
    identification,
    recommendation,
    topMetrics,
  });

  // Persist: 4 rows. sources_json captures the full citation audit trail.
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
        // Stored on the identification row so the next run's stability-check
        // can compare without re-reading the full row.
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
    console.error("[narrator-regime] error:", e);
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
