/**
 * BIG-MOVERS-WHY
 *
 * Identifies the day's biggest movers in each direction from PRICE_01_Daily
 * and pairs each with a GPT-5 explanation grounded in that ticker's BETA_12
 * headlines for the day. Fills MOVER_EXPLANATIONS_daily for the portfolio UI.
 *
 * Endpoint:
 *   GET /build?date=YYYY-MM-DD&n=5   — defaults to today, top 5 each direction
 */

import { assertProseMatchesMoveSign } from "../../_shared/agent-validators.js";

const TRACKED_TICKERS = new Set([
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "MS", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX",
]);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const db = env.DB;
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const n = Math.max(1, Math.min(10, parseInt(url.searchParams.get("n") || "5", 10)));

    // Load prices for the date, filter to tracked tickers, compute intraday %.
    const pricesRes = await db
      .prepare(`SELECT ticker, open, close FROM PRICE_01_Daily WHERE date = ?`)
      .bind(date)
      .all();
    const moves = [];
    for (const r of pricesRes.results || []) {
      if (!TRACKED_TICKERS.has(r.ticker)) continue;
      if (!(r.open > 0)) continue;
      const pct = ((r.close - r.open) / r.open) * 100;
      moves.push({ ticker: r.ticker, pct });
    }

    if (moves.length === 0) {
      return Response.json(
        { ok: false, error: `no PRICE_01 rows for ${date}` },
        { status: 404 },
      );
    }

    // Top N up and top N down
    const ups = [...moves].sort((a, b) => b.pct - a.pct).slice(0, n);
    const downs = [...moves].sort((a, b) => a.pct - b.pct).slice(0, n);

    const picked = [
      ...ups.map((m, i) => ({ ...m, direction: "up", rank: i + 1 })),
      ...downs.map((m, i) => ({ ...m, direction: "down", rank: i + 1 })),
    ];

    console.log(
      `[movers] ${date}  ups=${ups.map((u) => `${u.ticker}(${u.pct.toFixed(1)}%)`).join(",")}  downs=${downs.map((d) => `${d.ticker}(${d.pct.toFixed(1)}%)`).join(",")}`,
    );

    const built = [];

    for (const m of picked) {
      try {
        const result = await explainMover(db, apiKey, date, m);
        built.push({ ticker: m.ticker, direction: m.direction, ok: true, thesis: result.thesis });
      } catch (e) {
        console.error(`[movers] ${m.ticker} FAILED: ${e.message}`);
        built.push({ ticker: m.ticker, direction: m.direction, ok: false, error: e.message });
      }
    }

    return Response.json({ ok: true, date, count: built.length, results: built });
  },
};

async function explainMover(db, apiKey, date, mover) {
  const { ticker, pct, direction, rank } = mover;

  // Pull today's headlines for this ticker
  const hRes = await db
    .prepare(
      `SELECT title, summary, sentiment, magnitude
         FROM BETA_12_News_digest
        WHERE type = 'ticker' AND ticker = ? AND date = ?
        ORDER BY rank ASC LIMIT 6`,
    )
    .bind(ticker, date)
    .all();
  const headlines = hRes.results || [];

  // Press releases in a 2-day window
  const twoDaysAgo = new Date(new Date(date).getTime() - 2 * 86400000)
    .toISOString()
    .slice(0, 10);
  const pRes = await db
    .prepare(
      `SELECT heading, summary, sentiment, magnitude
         FROM ALPHA_03_Press
        WHERE ticker = ? AND date BETWEEN ? AND ?
        ORDER BY date DESC LIMIT 3`,
    )
    .bind(ticker, twoDaysAgo, date)
    .all();
  const press = pRes.results || [];

  const headlinesBlock =
    headlines.length === 0
      ? "  (no headlines for this ticker today)"
      : headlines
          .map(
            (h, i) =>
              `  ${i + 1}. ${h.title}  (${h.sentiment || "-"}, mag=${h.magnitude ?? "?"})\n     ${(h.summary || "").slice(0, 220)}`,
          )
          .join("\n");

  const pressBlock =
    press.length === 0
      ? "  (none in the last 2 days)"
      : press
          .map(
            (p) =>
              `  • ${p.heading || ""}  (${p.sentiment || "-"}, mag=${p.magnitude ?? "?"})\n    ${(p.summary || "").slice(0, 200)}`,
          )
          .join("\n");

  const arrow = pct >= 0 ? "▲" : "▼";
  const prompt = `You are a senior equity analyst. Explain why ${ticker} moved ${arrow}${pct.toFixed(2)}% today (${date}). Ground the explanation in the ticker-specific news and press below.

TICKER: ${ticker}
MOVE: ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%  (direction: ${direction}, rank #${rank})
DATE: ${date}

TODAY'S HEADLINES
${headlinesBlock}

RECENT PRESS
${pressBlock}

TASK
Output EXACTLY this JSON — no markdown, no prose outside:

{
  "thesis":   "one sentence: the single reason this stock moved today",
  "headline": "the single most relevant headline title from the list above (or empty if none fit)",
  "bullets":  [{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}]
}

RULES
- thesis < 25 words, concrete
- bullets: 2-4 items, sorted by explanatory power, each < 20 words
- bias: "bull" = supports the upward move (use for up-movers unless contrarian), "bear" = supports downward move, "neutral" = unclear
- Ground everything in the headlines/press above. If there is NO news that explains the move, say so in thesis (e.g., "No material news — likely broad market / sector flows") and leave bullets noting that absence.
- DO NOT invent events that are not in the input.`;

  const blob = await callGPT5(apiKey, prompt);

  // Direction-sanity check: prose must not contradict the actual move sign.
  // Catches LLM howlers like "rose on strong earnings" written for a -3% day.
  assertProseMatchesMoveSign(blob.thesis, pct, `big-movers-why ${ticker} ${date}`);

  const id = await shortHash(`mover|${date}|${ticker}`);
  await db
    .prepare(
      `INSERT INTO MOVER_EXPLANATIONS_daily
         (id, date, ticker, direction, move_pct, rank, headline, thesis, bullets, raw_blob)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         direction = excluded.direction,
         move_pct  = excluded.move_pct,
         rank      = excluded.rank,
         headline  = excluded.headline,
         thesis    = excluded.thesis,
         bullets   = excluded.bullets,
         raw_blob  = excluded.raw_blob`,
    )
    .bind(
      id,
      date,
      ticker,
      direction,
      pct,
      rank,
      blob.headline || null,
      blob.thesis || "",
      JSON.stringify(blob.bullets || []),
      JSON.stringify(blob),
    )
    .run();

  return { thesis: blob.thesis };
}

async function shortHash(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

async function callGPT5(apiKey, prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
