const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS"
];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-daily-news")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    // --------------------------------------------------
    // Phase 1: Search all 25 tickers in PARALLEL
    // --------------------------------------------------
    console.log("Phase 1: Searching all 25 tickers in parallel...");

    const searchResults = await Promise.allSettled(
      TICKERS.map(async (ticker) => {
        try {
          const res = await env.NEWS_SEARCH_AGENT.fetch("https://internal/search-news", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker })
          });
          if (!res.ok) {
            console.error(`Search failed for ${ticker}: ${res.status}`);
            return { ticker, has_news: false };
          }
          return await res.json();
        } catch (err) {
          console.error(`Search error for ${ticker}:`, err.message);
          return { ticker, has_news: false, error: err.message };
        }
      })
    );

    const allResults = searchResults.map((r, i) =>
      r.status === "fulfilled" ? r.value : { ticker: TICKERS[i], has_news: false }
    );

    const withNews = allResults.filter(r => r.has_news);
    console.log(`Phase 1 done: ${withNews.length}/${TICKERS.length} tickers have news`);

    // --------------------------------------------------
    // Phase 2: Curator selects & scores (single call)
    // --------------------------------------------------
    console.log("Phase 2: Curating...");

    let curated;
    try {
      const curatorRes = await env.NEWS_CURATOR_AGENT.fetch("https://internal/curate-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results: allResults })
      });
      if (!curatorRes.ok) {
        console.error(`Curator failed: ${curatorRes.status}`);
        curated = fallback(allResults);
      } else {
        curated = await curatorRes.json();
      }
    } catch (err) {
      console.error("Curator error:", err.message);
      curated = fallback(allResults);
    }

    console.log(`Phase 2 done: ${curated.selected?.length || 0} selected`);

    // --------------------------------------------------
    // Phase 3: Write to D1
    // --------------------------------------------------
    const dayOfWeek = new Date().getDay();
    const isMonday = dayOfWeek === 1;

    for (const item of (curated.selected || [])) {
      const T = item.ticker;
      const id = await shortHash(`AI-Search|${item.date}|${T}|${item.headline}`);

      // Write to BETA_01_News
      await db.prepare(`
        INSERT INTO BETA_01_News
          (id, tickers, date, source, title, summary, sentiment, magnitude, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          summary=excluded.summary, sentiment=excluded.sentiment,
          magnitude=excluded.magnitude, created_at=excluded.created_at
      `).bind(id, JSON.stringify([T]), item.date, "AI-Search", item.headline, item.summary, item.sentiment, item.magnitude, now).run();

      // Determine last_important
      let lastImportant = item.summary;
      let lastImportantDate = item.date;
      if (!isMonday) {
        const prev = await db.prepare(`
          SELECT last_important, last_important_date, magnitude
          FROM ALPHA_05_Daily_news WHERE ticker = ? ORDER BY created_at DESC LIMIT 1
        `).bind(T).first();
        if (prev?.last_important && Math.abs(prev.magnitude || 0) > Math.abs(item.magnitude || 0)) {
          lastImportant = prev.last_important;
          lastImportantDate = prev.last_important_date;
        }
      }

      // Check SEC filings
      const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const { results: secFilings } = await db.prepare(`
        SELECT id FROM ALPHA_01_Reports WHERE ticker = ? AND type IN ('10-Q','10-K') AND date >= ? AND date <= ?
      `).bind(T, twoDaysAgo.toISOString().slice(0, 10), today).all();

      const idDate = new Date();
      if (!isMonday) { const d = dayOfWeek === 0 ? 6 : dayOfWeek - 1; idDate.setDate(idDate.getDate() - d); }
      const dailyId = `${T}-${idDate.toISOString().slice(0, 10)}`;
      const label = item.magnitude > 0 ? "BULLISH" : item.magnitude < 0 ? "BEARISH" : "NEUTRAL";
      const fullSummary = `[${label} ${item.magnitude > 0 ? "+" : ""}${item.magnitude.toFixed(1)}] ${item.summary}`;

      await db.prepare(`
        INSERT INTO ALPHA_05_Daily_news
          (id, ticker, summary, todays_important, last_important, last_important_date, new_sec, sentiment, magnitude, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          summary=excluded.summary, todays_important=excluded.todays_important,
          last_important=excluded.last_important, last_important_date=excluded.last_important_date,
          new_sec=excluded.new_sec, sentiment=excluded.sentiment, magnitude=excluded.magnitude,
          created_at=excluded.created_at
      `).bind(dailyId, T, fullSummary, item.headline, lastImportant, lastImportantDate, JSON.stringify(secFilings.map(f => f.id)), item.sentiment, item.magnitude, now).run();

      if (secFilings.length > 0) {
        await db.prepare(`INSERT INTO PROC_01_Job_queue (date, worker, input, status) VALUES (?, ?, ?, ?)`).bind(now, "trend-orchestrator", JSON.stringify({ ticker: T }), "pending").run();
      }
    }

    // --------------------------------------------------
    // Phase 4: Handle non-selected tickers (Form 4/8-K)
    // --------------------------------------------------
    const selectedSet = new Set((curated.selected || []).map(s => s.ticker));
    for (const T of TICKERS) {
      if (selectedSet.has(T)) continue;
      const { results: reports } = await db.prepare(`
        SELECT id, summary FROM ALPHA_01_Reports WHERE ticker = ? AND date = ? AND type IN ('4','8-K')
      `).bind(T, today).all();
      for (const r of reports) {
        if (!r.summary) {
          await db.prepare(`INSERT INTO PROC_01_Job_queue (date, worker, input, status) VALUES (?, ?, ?, ?)`).bind(now, "report-orchestrator", JSON.stringify({ report_id: r.id }), "pending").run();
        }
      }
      const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const { results: sec } = await db.prepare(`
        SELECT id FROM ALPHA_01_Reports WHERE ticker = ? AND type IN ('10-Q','10-K') AND date >= ? AND date <= ?
      `).bind(T, twoDaysAgo.toISOString().slice(0, 10), today).all();
      if (sec.length > 0) {
        await db.prepare(`INSERT INTO PROC_01_Job_queue (date, worker, input, status) VALUES (?, ?, ?, ?)`).bind(now, "trend-orchestrator", JSON.stringify({ ticker: T }), "pending").run();
      }
    }

    return Response.json({
      ok: true, searched: TICKERS.length,
      withNews: withNews.length,
      selected: curated.selected?.length || 0,
      market_theme: curated.market_theme
    });
  },
};

function fallback(allResults) {
  const withNews = allResults.filter(r => r.has_news && r.headline);
  return {
    selected: withNews.map(r => ({ ticker: r.ticker, date: r.date, headline: r.headline, summary: r.summary, sentiment: r.sentiment, magnitude: r.magnitude, sources: r.sources })),
    rejected: allResults.filter(r => !r.has_news).map(r => r.ticker),
    market_theme: "Curation unavailable"
  };
}

async function shortHash(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
