/**
 * SIGNAL-HISTORY-BUILDER
 *
 * Aggregates per-ticker news for a given date into a single
 * SIGNAL_HISTORY_daily row per ticker. Feeds the 14-bar persistence strip
 * in the portfolio UI and supplies the trigger flags read by
 * ticker-trend-short.
 *
 * Sources (all in D1):
 *   - BETA_12_News_digest   — today's per-ticker headlines (1-4/ticker)
 *   - FUND_02_Earnings      — flags earnings report days
 *   - PRICE_01_Daily        — optional: flags significant intraday moves
 *
 * Output per row (idempotent on id = hash(date + ticker)):
 *   sentiment_score   — signed aggregate over the day's headlines
 *   magnitude         — max |magnitude| among today's headlines
 *   news_count        — count of rows aggregated
 *   earnings_flag     — 1 if FUND_02 has a report_date = date for this ticker
 *   trend_updated     — 0 at build time (set later by ticker-trend-short)
 *   top_headline      — title of the strongest-magnitude headline
 *
 * Endpoints:
 *   GET /build?date=YYYY-MM-DD   — defaults to today
 */

const TRACKED_TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "MS", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX",
];

// Trigger threshold: any headline with |magnitude| >= this tells
// ticker-trend-short to fire. Exposed so it can be tuned after
// observing real data.
const TRIGGER_MAGNITUDE = 0.6;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });

    const db = env.DB;
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

    console.log(`[sig-hist] building for ${date}`);

    const [newsRes, earningsRes, priceRes] = await Promise.all([
      db
        .prepare(
          `SELECT ticker, title, summary, sentiment, magnitude
             FROM BETA_12_News_digest
            WHERE type = 'ticker' AND date = ?`,
        )
        .bind(date)
        .all(),
      db
        .prepare(
          `SELECT DISTINCT ticker FROM FUND_02_Earnings WHERE report_date = ?`,
        )
        .bind(date)
        .all(),
      db
        .prepare(
          `SELECT ticker, open, close FROM PRICE_01_Daily WHERE date = ?`,
        )
        .bind(date)
        .all(),
    ]);

    const newsByTicker = new Map();
    for (const row of newsRes.results || []) {
      if (!row.ticker) continue;
      if (!newsByTicker.has(row.ticker)) newsByTicker.set(row.ticker, []);
      newsByTicker.get(row.ticker).push(row);
    }

    const earningsSet = new Set(
      (earningsRes.results || []).map((r) => r.ticker),
    );

    const priceByTicker = new Map();
    for (const r of priceRes.results || []) {
      if (r.open > 0) {
        const pct = ((r.close - r.open) / r.open) * 100;
        priceByTicker.set(r.ticker, pct);
      }
    }

    const built = [];

    for (const ticker of TRACKED_TICKERS) {
      const headlines = newsByTicker.get(ticker) || [];
      let sentimentScore = 0;
      let magnitudeMax = 0;
      let top = null;

      for (const h of headlines) {
        const mag = Math.abs(Number(h.magnitude) || 0);
        const signed = Number(h.magnitude) || 0; // magnitude already signed in BETA_12
        sentimentScore += signed;
        if (mag > magnitudeMax) {
          magnitudeMax = mag;
          top = h.title;
        }
      }
      // Average the sentiment across rows so it stays in [-1, 1]
      if (headlines.length > 0) sentimentScore = sentimentScore / headlines.length;

      const earningsFlag = earningsSet.has(ticker) ? 1 : 0;
      const priceMove = priceByTicker.get(ticker) ?? null;

      const id = await shortHash(`sig-hist|${date}|${ticker}`);

      await db
        .prepare(
          `INSERT INTO SIGNAL_HISTORY_daily
             (id, date, ticker, sentiment_score, magnitude, news_count,
              earnings_flag, trend_updated, top_headline)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
           ON CONFLICT(id) DO UPDATE SET
             sentiment_score = excluded.sentiment_score,
             magnitude = excluded.magnitude,
             news_count = excluded.news_count,
             earnings_flag = excluded.earnings_flag,
             top_headline = excluded.top_headline`,
        )
        .bind(
          id,
          date,
          ticker,
          sentimentScore,
          magnitudeMax,
          headlines.length,
          earningsFlag,
          top,
        )
        .run();

      built.push({
        ticker,
        news_count: headlines.length,
        magnitude: magnitudeMax,
        sentiment: sentimentScore.toFixed(2),
        earnings: earningsFlag,
        price_move_pct: priceMove,
        would_trigger: magnitudeMax >= TRIGGER_MAGNITUDE,
      });
    }

    const triggered = built.filter((b) => b.would_trigger).map((b) => b.ticker);
    console.log(
      `[sig-hist] ${date}: ${built.length} rows built, ${triggered.length} would trigger trend-short`,
    );

    return Response.json({
      ok: true,
      date,
      count: built.length,
      would_trigger: triggered,
      rows: built,
    });
  },
};

async function shortHash(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
