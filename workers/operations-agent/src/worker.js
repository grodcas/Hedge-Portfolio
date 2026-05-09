import { openaiFetch } from "../../_shared/openai-call.js";
/**
 * OPERATIONS AGENT — per-sector investment operations
 *
 * For each sector, reads long- and short-term ticker trends, the macro
 * regime, and the PREVIOUS active operations for the sector (for stability),
 * then calls gpt-5 to produce a set of suggested operations.
 *
 * An operation is a {buy, sell, short} on a ticker within the sector,
 * optionally paired with a counter-position (hedge). Operations are
 * SUGGESTIONS — the user chooses which to execute.
 *
 * NOT daily — fires when a sector's short-term trend changes, or on
 * a relevant macro flag, or force=true for bootstrap.
 *
 * Writes to OPERATION_01_Signals with sector-level granularity.
 * The old bundle for a sector gets superseded_by the new one's id.
 *
 * Endpoints:
 *   GET /build?sector=Technology[&force=true]
 *   GET /build-all[?force=true]
 */

// Canonical 8-sector SPDR/GICS map (matches stock-factor-builder / sector-factor-builder).
const SECTOR_MAP = {
  Technology:    ["AAPL", "MSFT", "NVDA", "INTC", "AMD"],
  ConsDisc:      ["AMZN", "TSLA", "HD"],
  Communication: ["GOOGL", "META", "NFLX"],
  Finance:       ["JPM", "GS", "BAC", "MS", "BRK.B"],
  Energy:        ["XOM", "CVX"],
  Healthcare:    ["UNH", "LLY", "JNJ"],
  Staples:       ["PG", "KO"],
  Industrial:    ["CAT", "BA"],
};
const ALL_SECTORS = Object.keys(SECTOR_MAP);

export default {
  async fetch(req, env) {
    globalThis.__OAI_CTX = { env, caller: "operations-agent" };
    const url = new URL(req.url);
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const force = url.searchParams.get("force") === "true";

    if (url.pathname === "/build") {
      const sector = url.searchParams.get("sector");
      if (!sector || !SECTOR_MAP[sector])
        return Response.json({ ok: false, error: `invalid sector, use: ${ALL_SECTORS.join(",")}` }, { status: 400 });
      const out = await buildForSector(env.DB, apiKey, sector, force);
      return Response.json({ ok: true, ...out });
    }

    if (url.pathname === "/build-all") {
      const results = [];
      for (const sector of ALL_SECTORS) {
        try {
          const out = await buildForSector(env.DB, apiKey, sector, force);
          results.push({ sector, ok: true, ops: out.operations_count });
          console.log(`[ops-agent] ${sector}: ${out.operations_count} operations`);
        } catch (e) {
          console.error(`[ops-agent] ${sector} FAILED: ${e.message}`);
          results.push({ sector, ok: false, error: e.message });
        }
      }
      return Response.json({ ok: true, results });
    }

    return new Response("Not found", { status: 404 });
  },
};

async function buildForSector(db, apiKey, sector, force) {
  const tickers = SECTOR_MAP[sector];
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  // Load all data in parallel
  const placeholders = tickers.map(() => "?").join(",");
  const [longRes, shortRes, macroRow, prevOpsRow] = await Promise.all([
    db.prepare(`SELECT * FROM TICKER_TREND_long WHERE ticker IN (${placeholders})`).bind(...tickers).all(),
    db.prepare(`SELECT * FROM TICKER_TREND_short WHERE ticker IN (${placeholders})`).bind(...tickers).all(),
    db.prepare(`SELECT summary FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1`).first(),
    db.prepare(
      `SELECT id, operations, created_at, relevance_score
         FROM OPERATION_01_Signals
        WHERE sector = ? AND superseded_by IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    ).bind(sector).first(),
  ]);

  const longs = Object.fromEntries((longRes.results || []).map(r => [r.ticker, r]));
  const shorts = Object.fromEntries((shortRes.results || []).map(r => [r.ticker, r]));

  // Parse macro context
  let macroRegime = "unknown";
  let macroContext = {};
  try {
    if (macroRow?.summary) {
      const blob = JSON.parse(macroRow.summary);
      const trend = blob.trend || blob;
      macroRegime = trend.regime || "unknown";
      macroContext = {
        regime: trend.regime,
        window: `${trend.window_start || "?"} → ${trend.window_end || "?"}`,
        drivers: (trend.drivers || []).slice(0, 3).map(d => d.text || d),
      };
    }
  } catch {}

  // Format ticker data
  const tickerBlock = tickers.map(t => {
    const lt = longs[t];
    const st = shorts[t];
    const longLine = lt
      ? `long: ${lt.regime} (${fmt(lt.score)}) — ${lt.thesis || ""}`
      : "long: (no data)";
    const shortLine = st
      ? `short: ${st.regime} (${fmt(st.score)}) — ${st.thesis || ""}`
      : "short: (no data)";
    return `  ${t}\n    ${longLine}\n    ${shortLine}`;
  }).join("\n");

  // Previous operations for stability
  let prevOpsBlock = "(no previous operations for this sector)";
  let prevOpsJson = [];
  if (prevOpsRow?.operations) {
    try {
      prevOpsJson = JSON.parse(prevOpsRow.operations);
      prevOpsBlock = `Previous bundle (created ${prevOpsRow.created_at || "?"}, relevance ${prevOpsRow.relevance_score ?? "?"}):\n` +
        prevOpsJson.map((op, i) =>
          `  ${i + 1}. ${op.action} ${op.ticker}${op.counter_ticker ? " / " + op.action_counter + " " + op.counter_ticker : ""}  (risk: ${op.risk || "?"})  ${op.thesis || ""}`
        ).join("\n");
    } catch {}
  }

  const prompt = `You are a senior portfolio manager at a hedge fund. Generate suggested OPERATIONS for the ${sector} sector based on the ticker-level trends and macro context below.

MACRO CONTEXT
  Regime: ${macroRegime}
  Window: ${macroContext.window || "?"}
  Drivers: ${(macroContext.drivers || []).join("; ") || "none"}

${sector.toUpperCase()} SECTOR — TICKER TRENDS
${tickerBlock}

PREVIOUS OPERATIONS (for stability — do NOT change these unless the data demands it)
${prevOpsBlock}

TASK
Output EXACTLY this JSON:

{
  "operations": [
    {
      "action": "buy" | "sell" | "short",
      "ticker": "SYM",
      "action_counter": "short" | "sell" | "buy" | null,
      "counter_ticker": "SYM or SPY" | null,
      "risk": "low" | "medium" | "high",
      "thesis": "one sentence: why this operation makes sense",
      "bullets": [{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}]
    }
  ],
  "sector_view": "one sentence: overall sector assessment",
  "changes_from_previous": "one sentence: what changed vs prior operations (or 'initial build')"
}

RULES
- 1-4 operations per sector. Quality over quantity — only suggest operations you'd put money behind.
- Each operation CAN be:
    * Simple: buy X (long-only, low risk)
    * Paired: buy X / short Y (market-neutral hedge, higher edge)
    * Hedged against market: buy X / short SPY (if you believe ticker > market)
- counter_ticker can be any ticker in this sector OR "SPY" for market hedge.
- If ALL tickers in the sector are performing well, it's OK to go bull in all — you don't NEED to short.
- "sell" means close an existing long, NOT short-sell.
- Stability rule: if the previous operations still hold (trends didn't shift), KEEP THEM. Only change when the data demands it. If keeping all previous ops, output them with the same tickers and theses.
- bullets: 2-4 per operation, sorted by importance, < 20 words each.
- risk: "low" = strong trend alignment + macro support, "medium" = mixed signals, "high" = counter-trend or speculative.
- Ground everything in the ticker trends and macro data above.
- It is LEGITIMATE to have zero operations (empty array) if nothing is actionable — but this should be rare.`;

  const blob = await callGPT5(apiKey, prompt);
  if (!blob?.operations) throw new Error("invalid LLM output");

  // Create new operations bundle
  const id = await shortHash(`ops|${sector}|${now}`);
  const relevance = 1.0; // starts at max; UI fades it over time

  await db.prepare(
    `INSERT INTO OPERATION_01_Signals
       (id, sector, created_at, last_confirmed_at, trigger_reason, operations,
        macro_context, relevance_score, superseded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).bind(
    id, sector, now, now,
    force ? "bootstrap" : "trend_shift",
    JSON.stringify(blob.operations),
    JSON.stringify(macroContext),
    relevance,
  ).run();

  // Supersede previous bundle
  if (prevOpsRow?.id) {
    await db.prepare(
      `UPDATE OPERATION_01_Signals SET superseded_by = ? WHERE id = ?`,
    ).bind(id, prevOpsRow.id).run();
  }

  return {
    sector,
    operations_count: blob.operations.length,
    sector_view: blob.sector_view,
    changes: blob.changes_from_previous,
  };
}

function fmt(v) {
  if (v == null) return "?";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "?";
}

async function shortHash(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

async function callGPT5(apiKey, prompt) {
  const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "gpt-5 error");
  const text = j.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty gpt-5 output");
  return JSON.parse(text);
}
