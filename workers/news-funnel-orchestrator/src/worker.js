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
