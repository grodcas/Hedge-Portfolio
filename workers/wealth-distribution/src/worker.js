import { openaiFetch } from "../../_shared/openai-call.js";
/**
 * WEALTH DISTRIBUTION AGENT
 *
 * Reads all active OPERATION_01_Signals + current PORTFOLIO_01_Holdings +
 * macro regime, then calls gpt-5 to produce a TARGET wealth distribution
 * and deltas from current.
 *
 * Design principles (from the user spec):
 *   - ADAPTIVE: small changes from current, never wholesale rewrites
 *   - STABLE: should not change dramatically day-to-day
 *   - GUIDELINE: the user won't rebalance daily; this is a compass
 *   - The operations agent justifies WHY with detail, so this agent
 *     must MATCH the operations in its allocation reasoning
 *
 * Fires: when operations update (on-operations-update cadence).
 *
 * Endpoint:
 *   GET /build[?force=true]
 */

export default {
  async fetch(req, env) {
    globalThis.__OAI_CTX = { env, caller: "wealth-distribution" };
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
    const db = env.DB;
    const now = new Date().toISOString();

    // Load inputs in parallel
    const [holdingsRes, opsRes, macroRow] = await Promise.all([
      db.prepare(`SELECT ticker, weight_pct FROM PORTFOLIO_01_Holdings ORDER BY ticker`).all(),
      db.prepare(
        `SELECT id, sector, operations, macro_context, created_at, relevance_score
           FROM OPERATION_01_Signals
          WHERE superseded_by IS NULL
          ORDER BY sector`,
      ).all(),
      db.prepare(`SELECT summary FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1`).first(),
    ]);

    const holdings = holdingsRes.results || [];
    const activeOps = opsRes.results || [];

    if (holdings.length === 0) {
      return Response.json({ ok: false, error: "no holdings" }, { status: 500 });
    }

    // Current weights
    const currentWeights = {};
    for (const h of holdings) currentWeights[h.ticker] = Number(h.weight_pct) || 0;

    // Parse macro
    let macroRegime = "unknown";
    try {
      if (macroRow?.summary) {
        const blob = JSON.parse(macroRow.summary);
        macroRegime = (blob.trend || blob).regime || "unknown";
      }
    } catch {}

    // Format operations by sector
    const opsBlock = activeOps.length === 0
      ? "(no active operations)"
      : activeOps.map(row => {
          let ops;
          try { ops = JSON.parse(row.operations); } catch { ops = []; }
          const lines = ops.map(o => {
            const ct = o.counter_ticker ? ` / ${o.action_counter} ${o.counter_ticker}` : "";
            return `    ${o.action.toUpperCase()} ${o.ticker}${ct} [${o.risk}] — ${o.thesis || ""}`;
          }).join("\n");
          return `  ${row.sector} (created ${(row.created_at || "").slice(0, 10)}):\n${lines}`;
        }).join("\n\n");

    // Format current holdings
    const holdingsBlock = holdings.map(h =>
      `  ${h.ticker}: ${(h.weight_pct || 0).toFixed(1)}%`
    ).join("\n");

    const prompt = `You are a senior portfolio strategist. Given the current portfolio weights, active sector operations, and macro regime, produce a TARGET wealth distribution that gradually adapts the portfolio toward the operations' collective thesis.

MACRO REGIME: ${macroRegime}

CURRENT PORTFOLIO WEIGHTS
${holdingsBlock}

ACTIVE OPERATIONS (from operations agent)
${opsBlock}

TASK
Output EXACTLY this JSON:

{
  "target_weights": {"AAPL": 5.2, "MSFT": 6.1, ...},
  "rationale": [{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}],
  "summary": "one sentence: overall rebalancing thesis"
}

RULES
- target_weights must include ALL tickers currently in the portfolio.
- Weights must sum to approximately 100% (tolerance ±2%).
- STABILITY IS PARAMOUNT: most weights should stay within ±1% of current.
  Only shift >2% when an operation strongly demands it. A good rebalance
  adjusts 3-5 tickers by 0.5-2% and leaves the rest flat.
- Tickers with a BUY operation should see weight INCREASE (modestly).
- Tickers with a SELL operation should see weight DECREASE (modestly).
- Tickers whose counter is being shorted should see weight DECREASE
  slightly (or stay if the short is on SPY).
- Cash-equivalent or unused weight goes to the strongest BUY signals.
- rationale: 3-5 bullets, each < 20 words, explaining the key shifts.
  Reference specific tickers and their operations.
- If macro is bearish, skew conservatively (less aggressive reweighting).
- If macro is bullish, allow slightly larger shifts toward conviction.
- Do NOT suggest radical changes — the user rebalances monthly at most.`;

    const blob = await callGPT5(apiKey, prompt);
    if (!blob?.target_weights) throw new Error("invalid LLM output");

    // Compute deltas
    const deltas = {};
    for (const ticker of Object.keys(currentWeights)) {
      const target = Number(blob.target_weights[ticker]) || 0;
      const current = currentWeights[ticker] || 0;
      deltas[ticker] = Number((target - current).toFixed(2));
    }

    // Store
    const id = await shortHash(`rebal|${now}`);
    const triggeredBy = activeOps.map(o => o.id).join(",");

    await db.prepare(
      `INSERT INTO REBALANCE_01
         (id, created_at, triggered_by, current_weights, target_weights, deltas, rationale, raw_blob)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, now, triggeredBy,
      JSON.stringify(currentWeights),
      JSON.stringify(blob.target_weights),
      JSON.stringify(deltas),
      JSON.stringify(blob.rationale || []),
      JSON.stringify(blob),
    ).run();

    // Count meaningful shifts
    const shifts = Object.values(deltas).filter(d => Math.abs(d) >= 0.3).length;

    return Response.json({
      ok: true,
      summary: blob.summary,
      shifts_count: shifts,
      total_tickers: Object.keys(blob.target_weights).length,
    });
  },
};

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
