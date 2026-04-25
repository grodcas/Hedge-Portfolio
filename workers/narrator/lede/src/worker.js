// Narrator — Lede generator (Sprint 6)
//
// Standalone lede agent. One GPT-4o-mini call per entity. Reads the three
// (or five, for stocks) narrative fields already in NARRATIVE_01_Content,
// produces a 3–4 line lede, validates (≤45 words, number-grounded, ends
// with a forward-looking clause), writes field='lede' back.
//
// Entity types supported:
//   - regime            (id=null)
//   - sector_landscape  (id=null)
//   - stock_landscape   (id=null)
//   - sector            (id=<Sector>)
//   - stock             (id=<TICKER>)   — synthesises Long + Tactical horizons
//
// Routes:
//   GET /build?entity_type=X&entity_id=Y[&force=1]   — regenerate one entity's lede
//   GET /rebuild-missing                             — (re)generate ledes for every
//                                                       entity whose stored lede hash
//                                                       doesn't match the latest ident
//   GET /status                                      — sanity + entity metadata

import { callMiniText } from "../../shared/openai.js";
import { validateLede } from "../../shared/validate.js";
import { insertNarrative, fetchLatest } from "../../shared/sql.js";

const KNOWN_ENTITY_TYPES = new Set([
  "regime", "sector_landscape", "stock_landscape", "sector", "stock",
]);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/build") {
      const entity_type = url.searchParams.get("entity_type");
      const rawId = url.searchParams.get("entity_id");
      const entity_id = rawId === null || rawId === "" || rawId === "null" ? null : rawId;
      if (!entity_type || !KNOWN_ENTITY_TYPES.has(entity_type)) {
        return json({ error: "bad entity_type", accepted: [...KNOWN_ENTITY_TYPES] }, 400);
      }
      return handle(() => buildOne({ env, entity_type, entity_id }));
    }

    if (url.pathname === "/rebuild-missing") {
      return handle(() => rebuildMissing({ env }));
    }

    if (url.pathname === "/status") {
      return json({ worker: "narrator-lede", ok: true, entity_types: [...KNOWN_ENTITY_TYPES] });
    }

    return json({ error: "route not found" }, 404);
  },
};

async function buildOne({ env, entity_type, entity_id }) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set on worker");
  const db = env.DB;
  const started = Date.now();

  const bundle = await gatherNarrativeBundle(db, entity_type, entity_id);
  if (!bundle.hasAny) {
    throw new Error(`no narrative rows found for ${entity_type}/${entity_id ?? "(null)"}`);
  }

  // Build detailText (concat of all source blocks) for number-grounding check.
  const detailText = buildDetailText(bundle);
  const prompt = buildPrompt(entity_type, entity_id, bundle);

  let lede;
  try {
    const text = await callMiniText({
      apiKey: env.OPENAI_API_KEY,
      prompt,
      label: `lede-agent-${entity_type}-${entity_id || "_"}`,
      maxTokens: 120,
    });
    const v = validateLede(text, detailText);
    if (v.ok) {
      lede = { ok: true, text: v.text, words: v.words, source: "gpt-4o-mini" };
    } else {
      console.warn(`[narrator-lede] validation failed (${v.reason}) for ${entity_type}/${entity_id}; falling back`);
      lede = deterministic(bundle);
    }
  } catch (e) {
    console.warn(`[narrator-lede] API failure for ${entity_type}/${entity_id}: ${e.message}; falling back`);
    lede = deterministic(bundle);
  }

  // Reuse the latest identification's input_hash so the lede tracks with the
  // block it summarises — lets /rebuild-missing detect staleness cleanly.
  const input_hash = bundle.ident?.input_hash || bundle.identLong?.input_hash || null;
  const date = bundle.ident?.date
    || bundle.identLong?.date
    || bundle.currentReading?.date
    || new Date().toISOString().slice(0, 10);

  const id = await insertNarrative(db, {
    entity_type,
    entity_id,
    date,
    field: "lede",
    content_json: { text: lede.text, words: lede.words, source: lede.source },
    model: lede.source,
    input_hash,
  });

  return {
    ok: true,
    entity_type,
    entity_id,
    field: "lede",
    row_id: id,
    source: lede.source,
    words: lede.words,
    text: lede.text,
    duration_ms: Date.now() - started,
  };
}

async function rebuildMissing({ env }) {
  const db = env.DB;
  const started = Date.now();
  // Find every (entity_type, entity_id) that has an identification row but
  // either no lede row, or a lede whose input_hash doesn't match.
  const res = await db.prepare(`
    WITH ident_rows AS (
      SELECT entity_type, entity_id, date, input_hash
        FROM NARRATIVE_01_Content
        WHERE field IN ('identification','ident_long')
          AND superseded_by IS NULL
    ),
    lede_rows AS (
      SELECT entity_type, entity_id, input_hash AS lede_hash
        FROM NARRATIVE_01_Content
        WHERE field = 'lede' AND superseded_by IS NULL
    )
    SELECT i.entity_type, i.entity_id, i.date, i.input_hash, l.lede_hash
      FROM ident_rows i
      LEFT JOIN lede_rows l
        ON i.entity_type = l.entity_type
       AND IFNULL(i.entity_id,'') = IFNULL(l.entity_id,'')
  `).all();

  const candidates = (res.results || []).filter((r) =>
    !r.lede_hash || (r.input_hash && r.lede_hash !== r.input_hash)
  );

  const results = [];
  for (const c of candidates) {
    try {
      const r = await buildOne({ env, entity_type: c.entity_type, entity_id: c.entity_id });
      results.push({ ok: true, entity_type: c.entity_type, entity_id: c.entity_id, words: r.words, source: r.source });
    } catch (e) {
      results.push({ ok: false, entity_type: c.entity_type, entity_id: c.entity_id, error: e.message || String(e) });
    }
  }
  return {
    ok: results.every((r) => r.ok),
    duration_ms: Date.now() - started,
    regenerated: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

async function gatherNarrativeBundle(db, entity_type, entity_id) {
  if (entity_type === "stock") {
    const [cr, il, is, rl, rs] = await Promise.all([
      fetchLatest(db, { entity_type, entity_id, field: "current_reading" }),
      fetchLatest(db, { entity_type, entity_id, field: "ident_long" }),
      fetchLatest(db, { entity_type, entity_id, field: "ident_short" }),
      fetchLatest(db, { entity_type, entity_id, field: "rec_long" }),
      fetchLatest(db, { entity_type, entity_id, field: "rec_short" }),
    ]);
    return {
      kind: "stock",
      currentReading: cr,
      identLong: il, identShort: is, recLong: rl, recShort: rs,
      hasAny: Boolean(cr || il || is || rl || rs),
    };
  }
  const [cr, ident, rec] = await Promise.all([
    fetchLatest(db, { entity_type, entity_id, field: "current_reading" }),
    fetchLatest(db, { entity_type, entity_id, field: "identification" }),
    fetchLatest(db, { entity_type, entity_id, field: "recommendation" }),
  ]);
  return {
    kind: "single_horizon",
    currentReading: cr, ident, rec,
    hasAny: Boolean(cr || ident || rec),
  };
}

function buildDetailText(bundle) {
  if (bundle.kind === "stock") {
    return [
      bundle.currentReading?.content?.text || "",
      ...(bundle.identLong?.content?.bullets || []).map(bulletLine),
      ...(bundle.identShort?.content?.bullets || []).map(bulletLine),
      bundle.recLong?.content?.stance || "",
      bundle.recShort?.content?.stance || "",
      ...(bundle.recLong?.content?.signposts || []).map(signpostLine),
      ...(bundle.recShort?.content?.signposts || []).map(signpostLine),
    ].join("\n");
  }
  return [
    bundle.currentReading?.content?.text || "",
    ...(bundle.ident?.content?.bullets || []).map(bulletLine),
    bundle.rec?.content?.stance || "",
    ...(bundle.rec?.content?.signposts || []).map(signpostLine),
  ].join("\n");
}

function bulletLine(b) {
  if (!b) return "";
  return `${b.headline || ""} — ${b.number || ""} (${b.event || ""}). ${b.interpretation || ""}`;
}
function signpostLine(s) {
  if (!s) return "";
  return `${s.dated_event || ""}: ${s.trigger || ""} → ${s.action || ""}`;
}

function buildPrompt(entity_type, entity_id, bundle) {
  const entityLabel = entity_id ? `${entity_type} (${entity_id})` : entity_type;
  const detail = buildDetailText(bundle);
  const topSignpost = bundle.kind === "stock"
    ? (bundle.recShort?.content?.signposts?.[0] || bundle.recLong?.content?.signposts?.[0])
    : bundle.rec?.content?.signposts?.[0];
  const nextTrigger = topSignpost
    ? `${topSignpost.dated_event || ""}: ${topSignpost.trigger || ""}`
    : "(no dated trigger)";

  return [
    `You are writing the 3–4 line opening summary of an analyst's daily note for ${entityLabel}.`,
    ``,
    `STRICT RULES:`,
    `  1. Lead with the single most telling number.`,
    `  2. One sentence of diagnosis (from the identification block below).`,
    `  3. One sentence of stance (from the recommendation block below).`,
    `  4. End with the next dated test or trigger (explicit ISO date — e.g. "2026-05-06 FOMC" or "Next test: 2026-04-28").`,
    `  5. Max 45 words. No preamble. No hedging. No adjectives.`,
    `  6. Do NOT introduce any number that is not already in the detail below.`,
    ``,
    `DETAIL BLOCK:`,
    detail,
    ``,
    `NEXT DATED TRIGGER (for the closing clause):`,
    nextTrigger,
    ``,
    `Output: plain text, no JSON, no quotes. Just the 3–4 line lede.`,
  ].join("\n");
}

function deterministic(bundle) {
  const cr = bundle.currentReading?.content;
  const firstLine = _truncateSentence(cr?.lines?.[0] || cr?.text || "Update.", 120);
  let diag, stanceSnippet, signpost;
  if (bundle.kind === "stock") {
    diag = bundle.identLong?.content?.bullets?.[0]?.headline
        || bundle.identShort?.content?.bullets?.[0]?.headline
        || "read pending";
    const stance = bundle.recLong?.content?.stance || bundle.recShort?.content?.stance || "";
    stanceSnippet = _firstClause(stance) || "Stance pending";
    signpost = bundle.recShort?.content?.signposts?.[0] || bundle.recLong?.content?.signposts?.[0];
  } else {
    diag = bundle.ident?.content?.bullets?.[0]?.headline || "read pending";
    const stance = bundle.rec?.content?.stance || "";
    stanceSnippet = _firstClause(stance) || "Stance pending";
    signpost = bundle.rec?.content?.signposts?.[0];
  }
  const nextTest = signpost?.dated_event ? `Next test: ${signpost.dated_event}.` : "";
  const text = `${firstLine} ${diag}. ${stanceSnippet}. ${nextTest}`.trim().replace(/\s+/g, " ");
  const words = text.split(/\s+/).length;
  return { ok: true, text, words, source: "deterministic" };
}

// First independent clause — up to the first "," or ";" or stops at ~80 chars.
function _firstClause(s) {
  if (!s) return "";
  const raw = String(s).trim();
  const cut = raw.search(/[;,]/);
  const clause = cut > 0 ? raw.slice(0, cut) : raw;
  return _truncateSentence(clause, 110);
}

function _truncateSentence(s, maxLen) {
  if (!s) return "";
  const str = String(s).trim();
  if (str.length <= maxLen) return str;
  const cut = str.slice(0, maxLen).lastIndexOf(" ");
  return (cut > 40 ? str.slice(0, cut) : str.slice(0, maxLen)) + "…";
}

async function handle(fn) {
  try {
    return json(await fn());
  } catch (e) {
    console.error("[narrator-lede] error:", e);
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
