/**
 * TOPIC-FEED-BUILDER — daily clusterer for TOPIC_FEED.
 *
 * Reads the last 14 days of BETA_12_News_digest, asks gpt-5-mini to group the
 * headlines into canonical topic clusters, and upserts one TOPIC_FEED row per
 * (scope, canonical topic). Scope grammar: 'ticker:NVDA' | 'sector:Technology'
 * | 'macro:rates' | 'macro:fed' | 'macro:trade' | etc.
 *
 * Drives every news-drift / Notes / Tape annotation agent (M1, M3, S1, S3,
 * Ticker #5/#8, Tape).
 *
 * Endpoints:
 *   GET /build         — run a clustering pass. Returns {ok, clusters, upserts}.
 *   GET /build?days=N  — override the 14-day window (useful for back-tests).
 *   GET /status        — count + most recent upsert per scope.
 *
 * Cron: 02:00 UTC daily.
 */

import { recordApiCall } from "../../_shared/api-usage.js";
import { logCronRun } from "../../_shared/cron-log.js";

const DEFAULT_WINDOW_DAYS = 14;
const MODEL = "gpt-5-mini";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/build") {
        const days = parseInt(url.searchParams.get("days") || "", 10);
        return Response.json(await build(env, Number.isFinite(days) ? days : DEFAULT_WINDOW_DAYS));
      }
      if (url.pathname === "/status") return Response.json(await status(env));
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      logCronRun(env, "topic-feed-builder", () => build(env, DEFAULT_WINDOW_DAYS))
        .catch((e) => console.error(`[topic-feed] cron: ${e.message}`)),
    );
  },
};

async function build(env, windowDays) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY secret not set");
  // Cache env on a global the caller path can reach so callLLMTracked
  // gets it without threading env through the cluster pipeline.
  globalThis.__TFB_ENV = env;

  const today = new Date().toISOString().slice(0, 10);
  const windowStart = new Date(Date.now() - windowDays * 86400000)
    .toISOString()
    .slice(0, 10);

  // ---------- pull headlines ----------
  const { results: headlines } = await env.DB.prepare(
    `SELECT id, date, type, ticker, category, title, source
       FROM BETA_12_News_digest
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC, rank ASC`,
  ).bind(windowStart, today).all();

  if (!headlines || headlines.length === 0) {
    return { ok: true, window: { from: windowStart, to: today }, headlines: 0, clusters: 0, upserts: 0 };
  }

  // ---------- cluster via gpt-5-mini ----------
  const clusters = await clusterTopics(apiKey, headlines);

  // index headlines by id for fast lookup of date / source
  const byId = new Map();
  for (const h of headlines) byId.set(h.id, h);

  // ---------- upsert TOPIC_FEED ----------
  let upserts = 0;
  let skipped = 0;
  for (const c of clusters) {
    if (!c?.scope || !c?.topic_canonical || !Array.isArray(c?.source_ids)) {
      skipped++;
      continue;
    }
    const sources = c.source_ids.map((id) => byId.get(id)).filter(Boolean);
    if (sources.length === 0) {
      skipped++;
      continue;
    }

    const dates = sources.map((s) => s.date).sort();
    const dateFirstSeen = dates[0];
    const dateLastSeen = dates[dates.length - 1];
    const daysActive = daysBetween(dateFirstSeen, dateLastSeen) + 1;
    const mentionCount = sources.length;
    const sourceCount = new Set(sources.map((s) => s.source).filter(Boolean)).size;
    const score = mentionCount * Math.max(sourceCount, 1);
    const sourcesJson = JSON.stringify(sources.map((s) => s.id));
    const id = await shortHash(`${c.scope}|${c.topic_canonical}`);

    // Upsert: preserve the original date_first_seen across runs. mention_count,
    // sources_json, score, days_active, date_last_seen all reflect the most
    // recent /build's view of the 14-day window.
    await env.DB.prepare(
      `INSERT INTO TOPIC_FEED
         (id, scope, topic_canonical, summary, date_first_seen, date_last_seen,
          days_active, mention_count, source_count, sources_json, score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         summary         = excluded.summary,
         date_first_seen = MIN(date_first_seen, excluded.date_first_seen),
         date_last_seen  = MAX(date_last_seen,  excluded.date_last_seen),
         days_active     = CAST(julianday(MAX(date_last_seen, excluded.date_last_seen))
                                - julianday(MIN(date_first_seen, excluded.date_first_seen)) AS INTEGER) + 1,
         mention_count   = excluded.mention_count,
         source_count    = excluded.source_count,
         sources_json    = excluded.sources_json,
         score           = excluded.score`,
    )
      .bind(
        id,
        c.scope,
        c.topic_canonical,
        c.summary ?? null,
        dateFirstSeen,
        dateLastSeen,
        daysActive,
        mentionCount,
        sourceCount,
        sourcesJson,
        score,
      )
      .run();
    upserts++;
  }

  return {
    ok: true,
    window: { from: windowStart, to: today },
    headlines: headlines.length,
    clusters: clusters.length,
    upserts,
    skipped,
  };
}

async function status(env) {
  const summary = await env.DB.prepare(
    `SELECT COUNT(*) AS count,
            MIN(date_first_seen) AS earliest,
            MAX(date_last_seen)  AS latest
       FROM TOPIC_FEED`,
  ).first();
  const byScope = await env.DB.prepare(
    `SELECT substr(scope, 1, instr(scope, ':') - 1) AS scope_kind,
            COUNT(*) AS n,
            MAX(date_last_seen) AS latest
       FROM TOPIC_FEED
      GROUP BY scope_kind
      ORDER BY scope_kind`,
  ).all();
  return { ok: true, ...summary, by_scope: byScope.results || [] };
}

async function clusterTopics(apiKey, headlines) {
  // Trim each headline payload to the model — keep only what's load-bearing
  // for clustering. Source / ticker / category give the model enough to pick
  // a sensible scope without cluttering the prompt.
  const items = headlines.map((h) => ({
    id: h.id,
    date: h.date,
    type: h.type,
    ticker: h.ticker || undefined,
    category: h.category || undefined,
    title: h.title,
    source: h.source || undefined,
  }));

  const prompt =
    `You are a financial-news topic clustering engine. Given the headlines below, ` +
    `group them into canonical topic clusters and return JSON.\n\n` +
    `Output schema (return ONLY this JSON):\n` +
    `{\n` +
    `  "clusters": [\n` +
    `    {\n` +
    `      "scope": "ticker:NVDA" | "sector:Technology" | "macro:rates" | ...,\n` +
    `      "topic_canonical": "5–12 word de-duplicated label",\n` +
    `      "summary": "one sentence on the current state of this topic",\n` +
    `      "source_ids": ["<id from input>", ...]\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `Scope grammar (pick the narrowest accurate one):\n` +
    `- ticker:<SYMBOL>      — story is primarily about a single tracked ticker\n` +
    `- sector:<NAME>        — story affects a sector broadly. Names: Technology,\n` +
    `                         Healthcare, Energy, Financials, Industrials,\n` +
    `                         ConsumerDiscretionary, ConsumerStaples,\n` +
    `                         Communication, Materials, Utilities, RealEstate.\n` +
    `- macro:<theme>        — macro themes. Common values: rates, fed, inflation,\n` +
    `                         labor, growth, trade, geopolitics, energy, fx, credit.\n\n` +
    `Rules:\n` +
    `- Each headline belongs to at most ONE cluster (the most relevant scope).\n` +
    `- Aim for tight, meaningful clusters. Singletons are fine if the story is\n` +
    `  significant; otherwise prefer to merge.\n` +
    `- topic_canonical must be specific (e.g. "Fed signals September pause", not\n` +
    `  "monetary policy"). It is the de-duplicated label across all days.\n` +
    `- Use the input "ticker" / "category" fields as hints for scope.\n\n` +
    `Headlines:\n` +
    JSON.stringify(items);

  return await callLLMTracked(globalThis.__TFB_ENV, apiKey, prompt);
}

async function callLLMTracked(env, apiKey, prompt) {
  // Wrapper that records ok/fail to PROC_04_API_usage. Without this, a
  // sustained quota issue (like the 11-day OpenAI 429 stall in early May
  // 2026) is invisible to the Validator tab — the cron fires, the worker
  // throws, but no row in D1 says "topic-feed-builder failed".
  try {
    const out = await callLLM(apiKey, prompt);
    await recordApiCall({ env, caller: "topic-feed-builder", api: "openai", endpoint: MODEL, calls: 1, ok: true });
    return out;
  } catch (err) {
    await recordApiCall({ env, caller: "topic-feed-builder", api: "openai", endpoint: MODEL, calls: 1, ok: false });
    throw err;
  }
}

async function callLLM(apiKey, prompt) {
  // Canonical pattern lifted from operations-agent (worker.js:229–244).
  // Single retry on transient (HTTP 5xx / network) per MS-1f spec.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        if (res.status >= 500 && attempt === 0) {
          lastErr = new Error(`HTTP ${res.status}`);
          continue;
        }
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || `${MODEL} error`);
      const text = j.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error(`empty ${MODEL} output`);
      const parsed = JSON.parse(text);
      return Array.isArray(parsed?.clusters) ? parsed.clusters : [];
    } catch (err) {
      lastErr = err;
      if (attempt === 1) throw err;
    }
  }
  throw lastErr;
}

function daysBetween(d1, d2) {
  // Inclusive day count helper. d1, d2 are 'YYYY-MM-DD'.
  const ms = Date.parse(d2 + "T00:00:00Z") - Date.parse(d1 + "T00:00:00Z");
  return Math.max(0, Math.round(ms / 86400000));
}

async function shortHash(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
