/**
 * NEWS FUNNEL — ORCHESTRATOR
 *
 * Coordinates the three stages:
 *   1. Call news-funnel-gatherer → get all headlines
 *   2. Call news-funnel-filter  → AI selects relevant headlines
 *   3. For each selected headline, call Gemini with Google Search grounding → get summary
 *   4. Write final digest to D1 (BETA_12_News_digest)
 */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/run-news-funnel")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    console.log(`[NEWS FUNNEL] Starting for ${today}`);

    // ---------- WEEKEND SKIP ----------
    // US equities don't trade Sat/Sun and news velocity drops sharply.
    // Bypassable with ?force=1 for backfill / testing.
    const url2 = new URL(req.url);
    const force = url2.searchParams.get("force") === "1";
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0=Sun, 6=Sat
    if (!force && (dow === 0 || dow === 6)) {
      console.log(`[NEWS FUNNEL] ${today} is a weekend (dow=${dow}) — skipping`);
      return Response.json({
        ok: true, date: today, skipped: true, reason: "weekend",
      });
    }

    // ---------- IDEMPOTENCY: skip if BETA_12 already has today's digest ----------
    // News funnel makes ~33 gpt-5-mini calls + ~40 Gemini calls per run.
    // That's the most expensive single stage. Retries would burn ~$0.10 each.
    // If BETA_12_News_digest already has rows for today, skip entirely.
    try {
      const existing = await db.prepare(
        `SELECT COUNT(*) AS n FROM BETA_12_News_digest WHERE date = ?`
      ).bind(today).first();
      if ((existing?.n || 0) > 0) {
        console.log(`[NEWS FUNNEL] BETA_12 already has ${existing.n} rows for ${today} — skipping`);
        return Response.json({
          ok: true,
          date: today,
          skipped: true,
          reason: "already_complete",
          existing_rows: existing.n,
        });
      }
    } catch (err) {
      console.warn(`[NEWS FUNNEL] Idempotency check failed, proceeding: ${err.message}`);
    }

    // =========================================================
    // STAGE 1: GATHER HEADLINES
    // =========================================================
    console.log("[NEWS FUNNEL] Stage 1: Gathering headlines...");

    let gathered;
    try {
      const gatherRes = await env.NEWS_FUNNEL_GATHERER.fetch("https://internal/gather-headlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!gatherRes.ok) throw new Error(`Gatherer returned ${gatherRes.status}`);
      gathered = await gatherRes.json();
    } catch (err) {
      console.error("[NEWS FUNNEL] Stage 1 FAILED:", err.message);
      return Response.json({ ok: false, stage: 1, error: err.message });
    }

    console.log(`[NEWS FUNNEL] Stage 1 done: ${gathered.stats.total_after_dedup} headlines`);

    // =========================================================
    // STAGE 2: FILTER & RANK
    // =========================================================
    console.log("[NEWS FUNNEL] Stage 2: Filtering headlines...");

    let filtered;
    try {
      const filterRes = await env.NEWS_FUNNEL_FILTER.fetch("https://internal/filter-headlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headlines: gathered.headlines, date: today }),
      });
      if (!filterRes.ok) throw new Error(`Filter returned ${filterRes.status}`);
      filtered = await filterRes.json();
      if (!filtered.ok) throw new Error(filtered.error || "filter returned not ok");
    } catch (err) {
      console.error("[NEWS FUNNEL] Stage 2 FAILED:", err.message);
      return Response.json({ ok: false, stage: 2, error: err.message });
    }

    console.log(`[NEWS FUNNEL] Stage 2 done: ${filtered.stats.total_ticker_headlines} ticker + ${filtered.stats.total_macro_headlines} macro`);

    // =========================================================
    // STAGE 2.5: GLOBAL RERANK — cap to 14 ticker + 6 macro = 20 total
    // =========================================================
    // Per-ticker filter has no idea that NVDA always makes news while UNH
    // rarely does. Without a global pass, every ticker contributes its
    // best 1–4 headlines and we end up summarizing ~100 items, most of
    // which are noise. The rerank scores rarity × magnitude so a real
    // UNH story beats a trash NVDA story.
    console.log("[NEWS FUNNEL] Stage 2.5: Global rerank to 14 ticker + 6 macro...");
    let reranked;
    try {
      reranked = await globalRerank(filtered, env.OPENAI_API_KEY, today);
    } catch (err) {
      console.error("[NEWS FUNNEL] Stage 2.5 FAILED:", err.message, "— falling back to magnitude top-N");
      reranked = magnitudeTopN(filtered, 14, 6);
    }
    const beforeT = filtered.ticker_news?.reduce((s, t) => s + (t.headlines?.length || 0), 0) || 0;
    const beforeM = filtered.macro_news?.length || 0;
    const afterT  = reranked.ticker_news?.reduce((s, t) => s + (t.headlines?.length || 0), 0) || 0;
    const afterM  = reranked.macro_news?.length || 0;
    console.log(`[NEWS FUNNEL] Stage 2.5 done: ticker ${beforeT}→${afterT}, macro ${beforeM}→${afterM}`);
    filtered = reranked;

    // =========================================================
    // STAGE 3: GEMINI SUMMARIES
    // =========================================================
    console.log("[NEWS FUNNEL] Stage 3: Generating summaries via Gemini...");

    // Collect all headlines that need summaries
    const toSummarize = [];

    for (const t of (filtered.ticker_news || [])) {
      for (const h of (t.headlines || [])) {
        // Skip if Finnhub already provided a summary (from gatherer)
        const gathered_ticker = gathered.headlines.ticker.find(gt => gt.ticker === t.ticker);
        const gathered_item = gathered_ticker?.items.find(gi =>
          gi.title === h.title && gi.finnhub_summary
        );

        toSummarize.push({
          type: "ticker",
          ticker: t.ticker,
          ...h,
          finnhub_summary: gathered_item?.finnhub_summary || null,
        });
      }
    }

    for (const m of (filtered.macro_news || [])) {
      toSummarize.push({ type: "macro", ...m });
    }

    // Call Gemini in batches of 5 (avoid rate limit)
    const summaries = [];
    for (let i = 0; i < toSummarize.length; i += 5) {
      const batch = toSummarize.slice(i, i + 5);
      const batchResults = await Promise.allSettled(
        batch.map(item => summarizeWithGemini(item, env.GEMINI_API_KEY, today))
      );
      for (let j = 0; j < batchResults.length; j++) {
        const item = batch[j];
        if (batchResults[j].status === "fulfilled") {
          summaries.push({ ...item, summary: batchResults[j].value });
        } else {
          console.error(`Gemini failed for "${item.title}":`, batchResults[j].reason?.message);
          summaries.push({ ...item, summary: item.finnhub_summary || item.relevance || item.portfolio_impact || "" });
        }
      }
      // Small delay between batches
      if (i + 5 < toSummarize.length) await sleep(500);
    }

    console.log(`[NEWS FUNNEL] Stage 3 done: ${summaries.length} summaries generated`);

    // =========================================================
    // STAGE 4: WRITE TO D1
    // =========================================================
    console.log("[NEWS FUNNEL] Stage 4: Writing to D1...");

    // Clear today's old entries
    await db.prepare("DELETE FROM BETA_12_News_digest WHERE date = ?").bind(today).run();

    let written = 0;
    for (const item of summaries) {
      const id = await shortHash(`${today}|${item.type}|${item.ticker || "macro"}|${item.rank}|${item.title}`);

      await db.prepare(`
        INSERT INTO BETA_12_News_digest
          (id, date, type, ticker, category, rank, title, summary, impact, source, sentiment, magnitude, frequency, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          summary=excluded.summary, impact=excluded.impact,
          sentiment=excluded.sentiment, created_at=excluded.created_at
      `).bind(
        id,
        today,
        item.type,
        item.ticker || null,
        item.category || null,
        item.rank,
        item.title,
        item.summary || "",
        item.type === "ticker" ? (item.relevance || "") : (item.portfolio_impact || ""),
        item.source || "",
        item.sentiment || "neutral",
        magnitudeFromSentiment(item.sentiment),
        item.frequency || 1,
        now,
      ).run();
      written++;
    }

    console.log(`[NEWS FUNNEL] Stage 4 done: ${written} rows written to BETA_12_News_digest`);

    return Response.json({
      ok: true,
      date: today,
      stages: {
        gathered: gathered.stats.total_after_dedup,
        filtered_ticker: filtered.stats.total_ticker_headlines,
        filtered_macro: filtered.stats.total_macro_headlines,
        summarized: summaries.length,
        written,
      },
    });
  },
};

// =========================================================
// Gemini with Google Search grounding
// =========================================================

async function summarizeWithGemini(item, apiKey, today) {
  // If Finnhub already has a good summary, use it directly
  if (item.finnhub_summary && item.finnhub_summary.length > 100) {
    return item.finnhub_summary;
  }

  if (!apiKey) {
    return item.relevance || item.portfolio_impact || "";
  }

  const searchQuery = item.title;
  const context = item.type === "ticker"
    ? `Focus on market impact for ${item.ticker} stock.`
    : `Focus on how this affects US equity markets, specifically these sectors: tech, pharma, oil/energy, banks, consumer, industrial.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Summarize the following news in 2-3 sentences. ${context} Be factual and concise.\n\nHeadline: ${searchQuery}\nDate: ${item.date || today}`,
          }],
        }],
        tools: [{ google_search: {} }],
        generationConfig: {
          maxOutputTokens: 200,
          temperature: 0.1,
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return text.trim();
}

// =========================================================
// Helpers
// =========================================================

function magnitudeFromSentiment(sentiment) {
  if (sentiment === "bullish") return 0.5;
  if (sentiment === "bearish") return -0.5;
  return 0;
}

async function shortHash(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// =========================================================
// Stage 2.5 — global rerank
// =========================================================

const TICKER_MAX = 14;
const MACRO_MAX  = 6;

// Tickers that almost always have news (high baseline volume) — the bar
// for inclusion should be higher. Quiet names (UNH, KO, XOM, CAT, BA, …)
// the bar is lower so a real story isn't drowned out.
const ALWAYS_LOUD = new Set(["NVDA","TSLA","AAPL","MSFT","GOOGL","AMZN","META","NFLX","AMD","INTC"]);

async function globalRerank(filtered, apiKey, today) {
  // Build flat candidate pool with stable IDs.
  const tickerPool = [];
  for (const t of filtered.ticker_news || []) {
    for (const h of t.headlines || []) {
      tickerPool.push({
        id: `t:${t.ticker}:${(h.title || "").slice(0, 40)}`,
        ticker: t.ticker,
        title: h.title,
        magnitude: h.magnitude || 0,
        sentiment: h.sentiment || "neutral",
        loud: ALWAYS_LOUD.has(t.ticker),
      });
    }
  }
  const macroPool = (filtered.macro_news || []).map(m => ({
    id: `m:${m.category}:${(m.title || "").slice(0, 40)}`,
    category: m.category,
    title: m.title,
    magnitude: m.magnitude || 0,
    sentiment: m.sentiment || "neutral",
  }));

  // If pool is already small, no rerank needed.
  if (tickerPool.length <= TICKER_MAX && macroPool.length <= MACRO_MAX) {
    return filtered;
  }

  if (!apiKey) {
    console.log("[NEWS FUNNEL] Stage 2.5 no API key — magnitude fallback");
    return magnitudeTopN(filtered, TICKER_MAX, MACRO_MAX);
  }

  const tickerLines = tickerPool.map(c =>
    `${c.id} | ${c.ticker}${c.loud ? " (LOUD)" : ""} | mag=${c.magnitude.toFixed(2)} | ${c.sentiment} | ${c.title}`
  ).join("\n");
  const macroLines = macroPool.map(c =>
    `${c.id} | ${c.category} | mag=${c.magnitude.toFixed(2)} | ${c.sentiment} | ${c.title}`
  ).join("\n");

  const userMsg =
`TODAY: ${today}

TICKER CANDIDATES (${tickerPool.length}):
${tickerLines}

MACRO CANDIDATES (${macroPool.length}):
${macroLines}

TASK: Pick exactly the top ${TICKER_MAX} ticker IDs and top ${MACRO_MAX} macro IDs that an equity hedge fund analyst would actually read today.

BALANCE RULES (very important):
- Magnitude is the primary signal. Items below 0.3 in magnitude should rarely make the cut.
- "(LOUD)" tickers (NVDA, TSLA, AAPL, MSFT, GOOGL, AMZN, META, NFLX, AMD, INTC) need a HIGHER bar — only include them when magnitude is genuinely material (>= 0.5 ideally).
- Quiet tickers (UNH, JNJ, KO, XOM, CVX, PG, HD, CAT, BA, GS, MS, BAC, JPM, LLY, BRK.B) get priority when they have a real story (a 0.4 here can beat a 0.4 LOUD).
- It is OK if some tickers contribute zero — that is normal on most days.
- Do NOT pad to fill the quota. If only 8 ticker stories truly matter today, return 8.
- Do NOT pick more than 2 stories from the same ticker.
- Macro: prefer diversity across categories.

OUTPUT (strict JSON, no markdown). Copy the ID strings VERBATIM from the candidate list — do not modify, paraphrase, or shorten:
{
  "ticker_ids": ["t:NVDA:...", ...],   // up to ${TICKER_MAX}
  "macro_ids":  ["m:central_banks:...", ...]  // up to ${MACRO_MAX}
}`;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: [
        { role: "system", content: "You are an equity hedge fund news editor. Output JSON only." },
        { role: "user", content: userMsg },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`rerank ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data.output || []).flatMap(o =>
    o.type === "message" ? (o.content || []).filter(c => c.type === "output_text").map(c => c.text) : []
  ).join("").trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : null;
  }
  if (!parsed) throw new Error("rerank returned no JSON");

  const keepTicker = new Set((parsed.ticker_ids || []).slice(0, TICKER_MAX));
  const keepMacro  = new Set((parsed.macro_ids  || []).slice(0, MACRO_MAX));

  // Rebuild filtered shape preserving original fields (relevance, etc).
  const newTicker = (filtered.ticker_news || []).map(t => ({
    ...t,
    headlines: (t.headlines || []).filter(h =>
      keepTicker.has(`t:${t.ticker}:${(h.title || "").slice(0, 40)}`)
    ),
  })).filter(t => t.headlines.length > 0);

  const newMacro = (filtered.macro_news || []).filter(m =>
    keepMacro.has(`m:${m.category}:${(m.title || "").slice(0, 40)}`)
  );
  newMacro.forEach((it, i) => { it.rank = i + 1; });

  return {
    ...filtered,
    ticker_news: newTicker,
    macro_news: newMacro,
    stats: {
      ...filtered.stats,
      total_ticker_headlines: newTicker.reduce((s, t) => s + t.headlines.length, 0),
      total_macro_headlines: newMacro.length,
      reranked: true,
    },
  };
}

// Magnitude-only fallback if the LLM rerank call fails.
function magnitudeTopN(filtered, tCap, mCap) {
  const allTicker = [];
  for (const t of filtered.ticker_news || []) {
    for (const h of t.headlines || []) allTicker.push({ t: t.ticker, h });
  }
  allTicker.sort((a, b) => Math.abs(b.h.magnitude || 0) - Math.abs(a.h.magnitude || 0));
  const keptTickerSet = new Set(allTicker.slice(0, tCap).map(x => `${x.t}|${x.h.title}`));

  const newTicker = (filtered.ticker_news || []).map(t => ({
    ...t,
    headlines: (t.headlines || []).filter(h => keptTickerSet.has(`${t.ticker}|${h.title}`)),
  })).filter(t => t.headlines.length > 0);

  const newMacro = [...(filtered.macro_news || [])]
    .sort((a, b) => Math.abs(b.magnitude || 0) - Math.abs(a.magnitude || 0))
    .slice(0, mCap);
  newMacro.forEach((it, i) => { it.rank = i + 1; });

  return { ...filtered, ticker_news: newTicker, macro_news: newMacro };
}
