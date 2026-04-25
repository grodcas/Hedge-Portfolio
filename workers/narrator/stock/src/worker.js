// Narrator — Individual stock (Sprint 5)
//
// Per-ticker pipeline producing 6 NARRATIVE_01_Content rows:
//   current_reading (deterministic)
//   ident_long      (GPT-5)
//   ident_short     (GPT-5)
//   rec_long        (GPT-5)
//   rec_short       (GPT-5)
//   lede            (GPT-4o-mini)
//
// Writes entity_type='stock', entity_id=<ticker>.
//
// Routes:
//   GET /build?ticker=X[&force=1] — build one stock
//   GET /build-all[?force=1]      — fan-out across all 25, batched 5
//   GET /status?ticker=X          — latest narrative metadata
//   GET /latest?ticker=X          — the 6 current rows as JSON

import { gatherStockInputs, isKnownTicker, listKnownTickers } from "../gather.js";
import { composeStockReading } from "../current_reading.js";
import { runStockIdentification } from "../identification.js";
import { runStockRecommendation } from "../recommendation.js";
import { runLede } from "../lede.js";
import { insertNarrative, bumpConfirmed, fetchAllLatest } from "../../shared/sql.js";
import { hashStable, stockStability } from "../../shared/stability.js";

const ENTITY_TYPE = "stock";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/build") {
      const ticker = url.searchParams.get("ticker");
      const force = url.searchParams.get("force") === "1";
      if (!ticker) return json({ error: "missing ?ticker=<SYMBOL>" }, 400);
      if (!isKnownTicker(ticker)) {
        return json({ error: `unknown ticker: ${ticker}`, accepted: listKnownTickers() }, 400);
      }
      return handle(() => build({ env, ticker, force }));
    }

    if (url.pathname === "/build-all") {
      const force = url.searchParams.get("force") === "1";
      return handle(() => buildAll({ env, force }));
    }

    if (url.pathname === "/status") {
      const ticker = url.searchParams.get("ticker");
      if (!ticker || !isKnownTicker(ticker)) {
        return json({ error: "missing/invalid ?ticker", accepted: listKnownTickers() }, 400);
      }
      return handle(() => status({ env, ticker }));
    }

    if (url.pathname === "/latest") {
      const ticker = url.searchParams.get("ticker");
      if (!ticker || !isKnownTicker(ticker)) {
        return json({ error: "missing/invalid ?ticker", accepted: listKnownTickers() }, 400);
      }
      return handle(() => latest({ env, ticker }));
    }

    return json({ error: "route not found", worker: "narrator-stock" }, 404);
  },
};

async function build({ env, ticker, force }) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set on worker");
  const db = env.DB;

  const started = Date.now();
  const input = await gatherStockInputs(db, ticker);
  const date = input.as_of;

  const prevHash = input.previous.input_hash;
  const stabilityByThreshold = stockStability(
    input.previous.ident_long?.numeric_snapshot_at_write || null,
    input.numeric_snapshot
  );
  const hashMatches = hashStable(prevHash, input.input_hash);
  const allPrev = input.previous.ident_long && input.previous.ident_short
    && input.previous.rec_long && input.previous.rec_short && input.previous.lede;
  const isStable = !force && hashMatches && stabilityByThreshold.stable && allPrev;

  if (isStable) {
    const fields = ["current_reading", "ident_long", "ident_short", "rec_long", "rec_short", "lede"];
    await Promise.all(fields.map((f) =>
      bumpConfirmed(db, { entity_type: ENTITY_TYPE, entity_id: ticker, field: f })
    ));
    return {
      ok: true,
      ticker,
      stable: true,
      reason: "hash_and_thresholds_match",
      duration_ms: Date.now() - started,
      skipped_llm_calls: 5,
    };
  }

  const currentReading = composeStockReading(input);

  // Long + tactical identification run in parallel to cut wall-clock.
  const [identLong, identShort] = await Promise.all([
    runStockIdentification({ apiKey: env.OPENAI_API_KEY, input, horizon: "long" }),
    runStockIdentification({ apiKey: env.OPENAI_API_KEY, input, horizon: "short" }),
  ]);

  if (!identLong.ok) {
    throw new Error(`ident_long failed (dropped ${identLong.dropped.length}): ${JSON.stringify(identLong.dropped).slice(0, 400)}`);
  }
  if (!identShort.ok) {
    throw new Error(`ident_short failed (dropped ${identShort.dropped.length}): ${JSON.stringify(identShort.dropped).slice(0, 400)}`);
  }

  // Recommendations then run in parallel, seeded from each horizon's identification.
  const [recLong, recShort] = await Promise.all([
    runStockRecommendation({ apiKey: env.OPENAI_API_KEY, input, identification: identLong, horizon: "long" }),
    runStockRecommendation({ apiKey: env.OPENAI_API_KEY, input, identification: identShort, horizon: "short" }),
  ]);

  if (!recLong.ok) throw new Error(`rec_long invalid: ${JSON.stringify(recLong.dropped).slice(0, 400)}`);
  if (!recShort.ok) throw new Error(`rec_short invalid: ${JSON.stringify(recShort.dropped).slice(0, 400)}`);

  const lede = await runLede({
    apiKey: env.OPENAI_API_KEY,
    ticker,
    currentReading,
    identLong, identShort,
    recLong, recShort,
  });

  const sources = dedupeSources(identLong.bullets, identShort.bullets);
  const commonInput = { input_hash: input.input_hash };
  const snapshot = input.numeric_snapshot;

  const writes = await Promise.all([
    insertNarrative(db, {
      entity_type: ENTITY_TYPE, entity_id: ticker, date,
      field: "current_reading",
      content_json: { ...currentReading, numeric_snapshot_at_write: snapshot },
      model: "deterministic",
      ...commonInput,
    }),
    insertNarrative(db, {
      entity_type: ENTITY_TYPE, entity_id: ticker, date,
      field: "ident_long",
      content_json: {
        bullets: identLong.bullets,
        missing_factors: identLong.missing_factors,
        dropped: identLong.dropped,
        numeric_snapshot_at_write: snapshot,
      },
      sources_json: sources.long,
      model: "gpt-5",
      ...commonInput,
    }),
    insertNarrative(db, {
      entity_type: ENTITY_TYPE, entity_id: ticker, date,
      field: "ident_short",
      content_json: {
        bullets: identShort.bullets,
        missing_factors: identShort.missing_factors,
        dropped: identShort.dropped,
        numeric_snapshot_at_write: snapshot,
      },
      sources_json: sources.short,
      model: "gpt-5",
      ...commonInput,
    }),
    insertNarrative(db, {
      entity_type: ENTITY_TYPE, entity_id: ticker, date,
      field: "rec_long",
      content_json: {
        stance: recLong.stance,
        signposts: recLong.signposts,
        dropped: recLong.dropped,
      },
      model: "gpt-5",
      ...commonInput,
    }),
    insertNarrative(db, {
      entity_type: ENTITY_TYPE, entity_id: ticker, date,
      field: "rec_short",
      content_json: {
        stance: recShort.stance,
        signposts: recShort.signposts,
        dropped: recShort.dropped,
      },
      model: "gpt-5",
      ...commonInput,
    }),
    insertNarrative(db, {
      entity_type: ENTITY_TYPE, entity_id: ticker, date,
      field: "lede",
      content_json: { text: lede.text, words: lede.words, source: lede.source },
      model: lede.source,
      ...commonInput,
    }),
  ]);

  return {
    ok: true,
    ticker,
    stable: false,
    duration_ms: Date.now() - started,
    rows: {
      current_reading: writes[0],
      ident_long:      writes[1],
      ident_short:     writes[2],
      rec_long:        writes[3],
      rec_short:       writes[4],
      lede:            writes[5],
    },
    bullets_long:       identLong.bullets.length,
    bullets_short:      identShort.bullets.length,
    signposts_long:     recLong.signposts.length,
    signposts_short:    recShort.signposts.length,
    dropped_long:       identLong.dropped.length,
    dropped_short:      identShort.dropped.length,
    lede_source:        lede.source,
    stability_breaches: stabilityByThreshold.breaches,
    input_hash: input.input_hash,
  };
}

// Fan-out over all 25 tickers, batched 5 at a time.
async function buildAll({ env, force }) {
  const started = Date.now();
  const tickers = listKnownTickers();
  const BATCH = 5;
  const results = [];
  for (let i = 0; i < tickers.length; i += BATCH) {
    const slice = tickers.slice(i, i + BATCH);
    const batchResults = await Promise.all(slice.map(async (ticker) => {
      try {
        return await build({ env, ticker, force });
      } catch (e) {
        return { ok: false, ticker, error: e.message || String(e) };
      }
    }));
    results.push(...batchResults);
  }
  return {
    ok: results.every((r) => r.ok),
    duration_ms: Date.now() - started,
    built:  results.filter((r) => r.ok && !r.stable).length,
    stable: results.filter((r) => r.ok && r.stable).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

async function status({ env, ticker }) {
  const rows = await fetchAllLatest(env.DB, { entity_type: ENTITY_TYPE, entity_id: ticker });
  return {
    ok: true,
    entity_type: ENTITY_TYPE,
    ticker,
    rows: rows.map((r) => ({
      field: r.field,
      date: r.date,
      model: r.model,
      input_hash: r.input_hash,
      last_confirmed_at: r.last_confirmed_at,
    })),
  };
}

async function latest({ env, ticker }) {
  const rows = await fetchAllLatest(env.DB, { entity_type: ENTITY_TYPE, entity_id: ticker });
  const out = {};
  for (const r of rows) out[r.field] = r.content;
  return { ok: true, entity_type: ENTITY_TYPE, ticker, ...out };
}

function dedupeSources(longBullets, shortBullets) {
  const dedupe = (arr) => {
    const seen = new Set();
    const out = [];
    for (const b of arr || []) {
      if (!b.source) continue;
      const key = `${b.source.table || ""}|${b.source.id || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(b.source);
    }
    return out;
  };
  return { long: dedupe(longBullets), short: dedupe(shortBullets) };
}

async function handle(fn) {
  try {
    const body = await fn();
    return json(body);
  } catch (e) {
    console.error("[narrator-stock] error:", e);
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
