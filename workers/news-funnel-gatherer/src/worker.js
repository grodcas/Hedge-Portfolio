/**
 * NEWS FUNNEL — STAGE 1: GATHERER
 *
 * Pure HTTP worker — no AI calls.
 * Fetches headlines from Google News RSS (tickers + macro) and Finnhub company news.
 * Deduplicates by title similarity and counts frequency.
 * Returns structured JSON of all headlines.
 */

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS"
];

// Google News RSS search queries per ticker
// BRK.B needs special handling (dot in ticker)
const TICKER_QUERIES = Object.fromEntries(
  TICKERS.map(t => [t, t === "BRK.B" ? "Berkshire+Hathaway+stock" : `${t}+stock`])
);

const MACRO_CATEGORIES = [
  { id: "central_banks",  query: "federal+reserve+interest+rates+monetary+policy",   label: "Central Banks & Monetary Policy" },
  { id: "inflation",      query: "CPI+PPI+inflation+consumer+prices",               label: "Inflation & Prices" },
  { id: "geopolitics",    query: "geopolitics+war+sanctions+military+conflict",      label: "Geopolitics & Conflicts" },
  { id: "trade",          query: "tariffs+trade+war+imports+exports",                label: "Trade & Tariffs" },
  { id: "energy",         query: "oil+prices+OPEC+natural+gas+energy",              label: "Energy & Commodities" },
  { id: "labor",          query: "unemployment+jobs+report+employment+labor",        label: "Labor Market" },
  { id: "tech",           query: "AI+artificial+intelligence+tech+semiconductor",    label: "Technology & AI" },
  { id: "markets",        query: "stock+market+S%26P+500+Wall+Street+rally+crash",  label: "Markets & Indices" },
];

const RSS_BASE = "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/gather-headlines")
      return new Response("Not found", { status: 404 });

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // ---- PHASE A: Google News RSS (tickers + macro) ----
    const rssResults = await gatherGoogleRSS(today);

    // ---- PHASE B: Finnhub company news ----
    const finnhubResults = await gatherFinnhub(env.FINNHUB_KEY, yesterday, today);

    // ---- PHASE C: Merge & deduplicate ----
    const allHeadlines = mergeAndDeduplicate(rssResults, finnhubResults, today);

    return Response.json({
      ok: true,
      date: today,
      stats: {
        rss_ticker_headlines: rssResults.ticker.reduce((s, t) => s + t.items.length, 0),
        rss_macro_headlines: rssResults.macro.reduce((s, m) => s + m.items.length, 0),
        finnhub_headlines: finnhubResults.reduce((s, t) => s + t.items.length, 0),
        total_after_dedup: allHeadlines.ticker.reduce((s, t) => s + t.items.length, 0) +
                           allHeadlines.macro.reduce((s, m) => s + m.items.length, 0),
      },
      headlines: allHeadlines,
    });
  },
};

// =========================================================
// Google News RSS
// =========================================================

async function gatherGoogleRSS(today) {
  const tickerResults = [];
  const macroResults = [];

  // Fetch ticker RSS in batches of 5 with 1.5s delay between batches
  const tickerEntries = Object.entries(TICKER_QUERIES);
  for (let i = 0; i < tickerEntries.length; i += 5) {
    const batch = tickerEntries.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(([ticker, query]) => fetchRSS(query, ticker, "ticker"))
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) tickerResults.push(r.value);
    }
    if (i + 5 < tickerEntries.length) await sleep(1500);
  }

  // Fetch macro RSS in one batch
  const macroSettled = await Promise.allSettled(
    MACRO_CATEGORIES.map(cat => fetchRSS(cat.query, cat.id, "macro", cat.label))
  );
  for (const r of macroSettled) {
    if (r.status === "fulfilled" && r.value) macroResults.push(r.value);
  }

  return { ticker: tickerResults, macro: macroResults };
}

async function fetchRSS(query, id, type, label) {
  try {
    const res = await fetch(`${RSS_BASE}${query}+when:2d`, {
      headers: { "User-Agent": "HedgeAI-Research/1.0" },
    });
    if (!res.ok) {
      console.error(`RSS failed for ${id}: ${res.status}`);
      return { id, type, label: label || id, items: [] };
    }
    const xml = await res.text();
    const items = parseRSSItems(xml);
    return { id, type, label: label || id, items };
  } catch (err) {
    console.error(`RSS error for ${id}:`, err.message);
    return { id, type, label: label || id, items: [] };
  }
}

function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const description = extractTag(block, "description");
    const source = extractTag(block, "source");

    // Google News titles often end with " - Source Name"
    let cleanTitle = title;
    let sourceName = source || "";
    const dashIdx = title.lastIndexOf(" - ");
    if (dashIdx > 0 && !source) {
      cleanTitle = title.slice(0, dashIdx).trim();
      sourceName = title.slice(dashIdx + 3).trim();
    }

    items.push({
      title: decodeEntities(cleanTitle),
      source: decodeEntities(sourceName),
      url: link,
      date: pubDate ? new Date(pubDate).toISOString().slice(0, 10) : null,
      description: decodeEntities(description || "").slice(0, 300),
    });
  }
  return items.slice(0, 20); // cap at 20 per feed
}

function extractTag(xml, tag) {
  // Handle CDATA sections
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`);
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(regex);
  return m ? m[1].trim() : "";
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

// =========================================================
// Finnhub
// =========================================================

async function gatherFinnhub(apiKey, from, to) {
  if (!apiKey) {
    console.error("FINNHUB_KEY not set — skipping Finnhub");
    return [];
  }

  const results = [];

  // Finnhub allows 60 req/min, we have 25 tickers — safe to do in parallel
  const settled = await Promise.allSettled(
    TICKERS.map(async (ticker) => {
      // Finnhub doesn't support BRK.B format
      const symbol = ticker === "BRK.B" ? "BRK-B" : ticker;
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${apiKey}`
        );
        if (!res.ok) return { ticker, items: [] };
        const data = await res.json();
        return {
          ticker,
          items: (data || []).slice(0, 15).map(n => ({
            title: n.headline,
            source: n.source,
            url: n.url,
            date: new Date(n.datetime * 1000).toISOString().slice(0, 10),
            description: (n.summary || "").slice(0, 300),
            finnhub_summary: n.summary || "",
          })),
        };
      } catch (err) {
        console.error(`Finnhub error for ${ticker}:`, err.message);
        return { ticker, items: [] };
      }
    })
  );

  for (const r of settled) {
    if (r.status === "fulfilled") results.push(r.value);
  }
  return results;
}

// =========================================================
// Merge & Deduplicate
// =========================================================

function mergeAndDeduplicate(rss, finnhub, today) {
  // --- Ticker headlines ---
  const tickerMap = {};
  for (const t of TICKERS) tickerMap[t] = [];

  // Add RSS ticker headlines
  for (const feed of rss.ticker) {
    for (const item of feed.items) {
      tickerMap[feed.id]?.push({ ...item, origin: "google_rss" });
    }
  }

  // Add Finnhub headlines
  for (const feed of finnhub) {
    for (const item of feed.items) {
      tickerMap[feed.ticker]?.push({ ...item, origin: "finnhub" });
    }
  }

  // Deduplicate per ticker and count frequency
  const tickerResults = TICKERS.map(t => ({
    ticker: t,
    items: deduplicateItems(tickerMap[t] || [], today),
  }));

  // --- Macro headlines ---
  const macroResults = rss.macro.map(feed => ({
    category: feed.id,
    label: feed.label,
    items: deduplicateItems(feed.items, today).slice(0, 25),
  }));

  return { ticker: tickerResults, macro: macroResults };
}

function deduplicateItems(items, today) {
  const seen = [];

  for (const item of items) {
    if (!item.title) continue;
    const normalized = item.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

    // Check if similar title already exists
    let found = false;
    for (const s of seen) {
      if (titleSimilarity(s.normalized, normalized) > 0.6) {
        s.frequency++;
        // Prefer the version with a Finnhub summary
        if (item.finnhub_summary && !s.item.finnhub_summary) {
          s.item.finnhub_summary = item.finnhub_summary;
        }
        // Prefer today's date
        if (item.date === today && s.item.date !== today) {
          s.item.date = item.date;
        }
        found = true;
        break;
      }
    }

    if (!found) {
      seen.push({ normalized, frequency: 1, item });
    }
  }

  // Sort: today first, then by frequency
  seen.sort((a, b) => {
    const aToday = a.item.date === today ? 1 : 0;
    const bToday = b.item.date === today ? 1 : 0;
    if (aToday !== bToday) return bToday - aToday;
    return b.frequency - a.frequency;
  });

  return seen.map(s => ({ ...s.item, frequency: s.frequency }));
}

function titleSimilarity(a, b) {
  const wordsA = new Set(a.split(" ").filter(w => w.length > 3));
  const wordsB = new Set(b.split(" ").filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / Math.max(wordsA.size, wordsB.size);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
