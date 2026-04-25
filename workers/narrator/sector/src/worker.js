// Narrator — Individual sector (Sprint 3)
//
// Same pipeline shape as narrator-regime and narrator-sector-landscape, but
// scoped to a single canonical sector. Writes 4 rows with
// entity_type='sector', entity_id=<sector name>.
//
// Routes:
//   GET /build?sector=X       — run the pipeline for one sector (force=1 bypasses stability)
//   GET /build-all            — fan out across all 8 canonical sectors (batched 3 at a time)
//   GET /status?sector=X      — latest narrative metadata for a sector
//   GET /latest?sector=X      — the 4 current rows as JSON (dashboard dev)

import { gatherSectorInputs, isCanonicalSector, listCanonicalSectors } from "../gather.js";
import { composeSectorReading } from "../current_reading.js";
import { runSectorIdentification } from "../identification.js";
import { runSectorRecommendation } from "../recommendation.js";
import { runLede } from "../lede.js";
import { insertNarrative, bumpConfirmed, fetchAllLatest } from "../../shared/sql.js";
import { hashStable, sectorStability } from "../../shared/stability.js";

const ENTITY_TYPE = "sector";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/build") {
      const sector = url.searchParams.get("sector");
      const force = url.searchParams.get("force") === "1";
      if (!sector) return json({ error: "missing ?sector=<name>" }, 400);
      if (!isCanonicalSector(sector)) {
        return json({ error: `unknown sector: ${sector}`, accepted: listCanonicalSectors() }, 400);
      }
      return handle(() => build({ env, sector, force }));
    }

    if (url.pathname === "/build-all") {
      const force = url.searchParams.get("force") === "1";
      return handle(() => buildAll({ env, force }));
    }

    if (url.pathname === "/status") {
      const sector = url.searchParams.get("sector");
      if (!sector || !isCanonicalSector(sector)) {
        return json({ error: "missing/invalid ?sector=<name>", accepted: listCanonicalSectors() }, 400);
      }
      return handle(() => status({ env, sector }));
    }

    if (url.pathname === "/latest") {
      const sector = url.searchParams.get("sector");
      if (!sector || !isCanonicalSector(sector)) {
        return json({ error: "missing/invalid ?sector=<name>", accepted: listCanonicalSectors() }, 400);
      }
      return handle(() => latest({ env, sector }));
    }

    return json({ error: "route not found", worker: "narrator-sector" }, 404);
  },
};

async function build({ env, sector, force }) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set on worker");
  const db = env.DB;

  const started = Date.now();
  const input = await gatherSectorInputs(db, sector);
  const date = input.as_of;

  const prevHash = input.previous.input_hash;
  const stabilityByThreshold = sectorStability(
    input.previous.identification?.numeric_snapshot_at_write || null,
    input.numeric_snapshot
  );
  const hashMatches = hashStable(prevHash, input.input_hash);
  const isStable = !force && hashMatches && stabilityByThreshold.stable
    && input.previous.identification && input.previous.recommendation && input.previous.lede;

  if (isStable) {
    const fields = ["current_reading", "identification", "recommendation", "lede"];
    await Promise.all(fields.map((f) =>
      bumpConfirmed(db, { entity_type: ENTITY_TYPE, entity_id: sector, field: f })
    ));
    return {
      ok: true,
      sector,
      stable: true,
      reason: "hash_and_thresholds_match",
      duration_ms: Date.now() - started,
      skipped_llm_calls: 3,
    };
  }

  const currentReading = composeSectorReading(input);

  const identification = await runSectorIdentification({ apiKey: env.OPENAI_API_KEY, input });
  if (!identification.ok) {
    throw new Error(`identification produced no valid bullets (dropped ${identification.dropped.length}): ${JSON.stringify(identification.dropped).slice(0, 500)}`);
  }

  const recommendation = await runSectorRecommendation({ apiKey: env.OPENAI_API_KEY, input, identification });
  if (!recommendation.ok) {
    throw new Error(`recommendation invalid: ${JSON.stringify(recommendation.dropped).slice(0, 500)}`);
  }

  const lede = await runLede({
    apiKey: env.OPENAI_API_KEY,
    sector,
    currentReading,
    identification,
    recommendation,
  });

  const sources = collectSources(identification.bullets);
  const commonInput = { input_hash: input.input_hash };

  const [crId, idId, recId, ledeId] = await Promise.all([
    insertNarrative(db, {
      entity_type: ENTITY_TYPE,
      entity_id: sector,
      date,
      field: "current_reading",
      content_json: { ...currentReading, numeric_snapshot_at_write: input.numeric_snapshot },
      model: "deterministic",
      ...commonInput,
    }),
    insertNarrative(db, {
      entity_type: ENTITY_TYPE,
      entity_id: sector,
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
      entity_id: sector,
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
      entity_id: sector,
      date,
      field: "lede",
      content_json: { text: lede.text, words: lede.words, source: lede.source },
      model: lede.source,
      ...commonInput,
    }),
  ]);

  return {
    ok: true,
    sector,
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

// Fan-out over all 8 canonical sectors, batched 3 at a time to stay under
// per-worker concurrency limits and OpenAI rate windows.
async function buildAll({ env, force }) {
  const started = Date.now();
  const sectors = listCanonicalSectors();
  const BATCH = 3;
  const results = [];
  for (let i = 0; i < sectors.length; i += BATCH) {
    const slice = sectors.slice(i, i + BATCH);
    const batchResults = await Promise.all(slice.map(async (sector) => {
      try {
        return await build({ env, sector, force });
      } catch (e) {
        return { ok: false, sector, error: e.message || String(e) };
      }
    }));
    results.push(...batchResults);
  }
  const summary = {
    ok: results.every((r) => r.ok),
    duration_ms: Date.now() - started,
    sectors_built: results.filter((r) => r.ok && !r.stable).length,
    sectors_stable: results.filter((r) => r.ok && r.stable).length,
    sectors_failed: results.filter((r) => !r.ok).length,
    results,
  };
  return summary;
}

async function status({ env, sector }) {
  const rows = await fetchAllLatest(env.DB, { entity_type: ENTITY_TYPE, entity_id: sector });
  return {
    ok: true,
    entity_type: ENTITY_TYPE,
    sector,
    rows: rows.map((r) => ({
      field: r.field,
      date: r.date,
      model: r.model,
      input_hash: r.input_hash,
      last_confirmed_at: r.last_confirmed_at,
    })),
  };
}

async function latest({ env, sector }) {
  const rows = await fetchAllLatest(env.DB, { entity_type: ENTITY_TYPE, entity_id: sector });
  const out = {};
  for (const r of rows) out[r.field] = r.content;
  return { ok: true, entity_type: ENTITY_TYPE, sector, ...out };
}

function collectSources(bullets) {
  return (bullets || []).map((b) => b.source).filter(Boolean);
}

async function handle(fn) {
  try {
    const body = await fn();
    return json(body);
  } catch (e) {
    console.error("[narrator-sector] error:", e);
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
