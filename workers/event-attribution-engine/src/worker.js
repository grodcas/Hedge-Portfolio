/**
 * EVENT ATTRIBUTION ENGINE — Diagnostic Layer
 *
 * Runs daily AFTER price-fetcher and assessment-engine.
 * For each ticker:
 *   1. Classify today's movement: macro / sector / company / none
 *   2. If company-specific, attribute to a recorded event using lag-weighted scoring
 *
 * This does NOT feed the assessment score. It is pure diagnostics:
 * it explains WHAT happened, so the user can validate whether the
 * pipeline's predictions are tracking reality.
 *
 * Lag weighting: normal distribution N(μ=3, σ=2), with floor 0.8 for
 * today (lag=0) and yesterday (lag=1).
 */

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS"
];

// Sector map — BRK.B now in Finance (per Round 2 fix)
const SECTOR_MAP = {
  AAPL: "Technology", MSFT: "Technology", GOOGL: "Technology", AMZN: "Technology",
  NVDA: "Technology", META: "Technology", INTC: "Technology", AMD: "Technology", NFLX: "Technology",
  TSLA: "Technology",
  JPM: "Finance", GS: "Finance", BAC: "Finance", MS: "Finance", "BRK.B": "Finance",
  XOM: "Energy", CVX: "Energy",
  UNH: "Healthcare", LLY: "Healthcare", JNJ: "Healthcare",
  PG: "Consumer", KO: "Consumer", HD: "Consumer",
  CAT: "Industrial", BA: "Industrial",
};

const SECTOR_ETF = {
  Technology: "XLK", Finance: "XLF", Energy: "XLE",
  Healthcare: "XLV", Consumer: "XLP", Industrial: "XLI",
};

// Classification thresholds (percent daily return)
const MACRO_THRESHOLD = 0.8;       // |SPY return| > this → macro move
const SECTOR_THRESHOLD = 0.5;      // |sector - SPY| > this → sector move
const COMPANY_THRESHOLD = 0.8;     // |ticker - sector| > this → company-specific

const INGESTOR_URL = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/attribute-events")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const today = new Date().toISOString().slice(0, 10);

    console.log(`[ATTRIBUTION] Starting for ${today}`);

    // =========================================================
    // 1. LOAD TODAY'S PRICES
    // =========================================================
    const priceDate = await db.prepare(`SELECT MAX(date) as d FROM PRICE_01_Daily`).first();
    if (!priceDate?.d) {
      return Response.json({ ok: false, error: "No price data" });
    }
    const workingDate = priceDate.d;

    const { results: priceRows } = await db.prepare(`
      SELECT ticker, open, close FROM PRICE_01_Daily WHERE date = ?
    `).bind(workingDate).all();

    const prices = {};
    for (const r of (priceRows || [])) prices[r.ticker] = r;

    const spy = prices["SPY"];
    const spyReturn = spy && spy.open > 0 ? ((spy.close - spy.open) / spy.open * 100) : null;

    // =========================================================
    // 2. LOAD EVENT CANDIDATES (last 14 days)
    // =========================================================
    const [pressRows, secRows, newsRows] = await Promise.all([
      db.prepare(`SELECT id, ticker, date, heading, sentiment, magnitude FROM ALPHA_03_Press WHERE date >= date(?, '-14 days')`).bind(workingDate).all(),
      db.prepare(`SELECT id, ticker, date, type FROM ALPHA_01_Reports WHERE date >= date(?, '-14 days') AND type IN ('10-K','10-Q','8-K','4')`).bind(workingDate).all(),
      db.prepare(`SELECT id, ticker, date, title, sentiment, magnitude FROM BETA_12_News_digest WHERE date >= date(?, '-14 days') AND type = 'ticker'`).bind(workingDate).all(),
    ]);

    // Index events by ticker
    const eventsByTicker = {};
    for (const t of TICKERS) eventsByTicker[t] = [];

    for (const p of (pressRows.results || [])) {
      if (!eventsByTicker[p.ticker]) continue;
      eventsByTicker[p.ticker].push({
        type: "press",
        id: p.id,
        date: p.date,
        heading: p.heading,
        sentiment: p.sentiment,
        magnitude: p.magnitude,
      });
    }

    for (const s of (secRows.results || [])) {
      if (!eventsByTicker[s.ticker]) continue;
      const fixedMaterialities = { "10-K": 0.8, "10-Q": 0.7, "8-K": 0.5, "4": 0.3 };
      eventsByTicker[s.ticker].push({
        type: "sec",
        id: s.id,
        date: s.date,
        heading: s.type + " filing",
        sentiment: null,
        magnitude: fixedMaterialities[s.type] || 0.3,
      });
    }

    for (const n of (newsRows.results || [])) {
      if (!eventsByTicker[n.ticker]) continue;
      eventsByTicker[n.ticker].push({
        type: "news",
        id: n.id,
        date: n.date,
        heading: n.title,
        sentiment: n.sentiment,
        magnitude: n.magnitude != null ? Math.abs(n.magnitude) : 0.3,
      });
    }

    // =========================================================
    // 3. CLASSIFY AND ATTRIBUTE PER TICKER
    // =========================================================
    const attributions = [];

    for (const ticker of TICKERS) {
      const p = prices[ticker];
      if (!p || p.open <= 0) continue;

      const tickerReturn = (p.close - p.open) / p.open * 100;

      const sector = SECTOR_MAP[ticker];
      const sectorEtfTicker = SECTOR_ETF[sector];
      const etf = prices[sectorEtfTicker];
      const sectorReturn = etf && etf.open > 0 ? ((etf.close - etf.open) / etf.open * 100) : null;

      const companyAlpha = sectorReturn != null ? tickerReturn - sectorReturn : null;

      // Classify movement
      let movementType = "none";
      if (spyReturn != null && Math.abs(spyReturn) > MACRO_THRESHOLD) {
        movementType = "macro";
      } else if (sectorReturn != null && spyReturn != null && Math.abs(sectorReturn - spyReturn) > SECTOR_THRESHOLD) {
        movementType = "sector";
      } else if (companyAlpha != null && Math.abs(companyAlpha) > COMPANY_THRESHOLD) {
        movementType = "company";
      }

      const attribution = {
        ticker,
        date: workingDate,
        movement_type: movementType,
        ticker_return: round2(tickerReturn),
        sector_return: sectorReturn != null ? round2(sectorReturn) : null,
        spy_return: spyReturn != null ? round2(spyReturn) : null,
        company_alpha: companyAlpha != null ? round2(companyAlpha) : null,
        top_event_type: null,
        top_event_id: null,
        top_event_date: null,
        top_event_lag: null,
        top_event_weight: null,
        explanation: null,
        candidates: [],
      };

      // Only run event attribution for company-specific movements
      if (movementType === "company") {
        const direction = tickerReturn > 0 ? 1 : -1;
        const candidates = [];

        for (const ev of eventsByTicker[ticker]) {
          const lag = daysBetween(ev.date, workingDate);
          if (lag < 0 || lag > 14) continue;

          const lagW = lagWeight(lag);
          const materiality = typeof ev.magnitude === "number" ? Math.abs(ev.magnitude) : 0.3;

          // Direction bonus: does event sentiment match movement direction?
          let dirBonus = 0;
          if (ev.sentiment) {
            const evDir = ev.sentiment === "bullish" ? 1 : ev.sentiment === "bearish" ? -1 : 0;
            if (evDir !== 0) {
              dirBonus = evDir === direction ? 0.2 : -0.3;
            }
          }

          const finalScore = lagW * materiality * (1 + dirBonus);

          candidates.push({
            type: ev.type,
            id: ev.id,
            date: ev.date,
            heading: ev.heading,
            lag,
            lag_weight: round3(lagW),
            materiality: round3(materiality),
            direction_bonus: round3(dirBonus),
            score: round3(finalScore),
          });
        }

        candidates.sort((a, b) => b.score - a.score);
        attribution.candidates = candidates.slice(0, 5);

        if (candidates.length > 0 && candidates[0].score > 0.2) {
          const top = candidates[0];
          attribution.top_event_type = top.type;
          attribution.top_event_id = top.id;
          attribution.top_event_date = top.date;
          attribution.top_event_lag = top.lag;
          attribution.top_event_weight = top.score;

          const dirWord = tickerReturn > 0 ? "+" : "";
          attribution.explanation = `${top.heading?.slice(0, 80) || top.type} (${top.lag}d ago, materiality ${top.materiality}). Most likely driver of ${dirWord}${round2(tickerReturn)}% move (${dirWord}${round2(companyAlpha)}% vs sector).`;
        } else {
          attribution.explanation = `Company-specific move of ${round2(companyAlpha)}% vs sector, but no material event found in last 14 days.`;
        }
      } else if (movementType === "macro") {
        attribution.explanation = `Macro-driven: S&P ${spyReturn > 0 ? "+" : ""}${round2(spyReturn)}% — market-wide move.`;
      } else if (movementType === "sector") {
        attribution.explanation = `Sector-driven: ${sector} ETF ${sectorReturn > 0 ? "+" : ""}${round2(sectorReturn)}% vs SPY ${spyReturn > 0 ? "+" : ""}${round2(spyReturn)}%.`;
      } else {
        attribution.explanation = `No notable movement.`;
      }

      attributions.push(attribution);
    }

    console.log(`[ATTRIBUTION] Classified ${attributions.length} tickers. Company-specific: ${attributions.filter(a => a.movement_type === "company").length}`);

    // =========================================================
    // 4. POST TO INGESTOR
    // =========================================================
    try {
      const payload = attributions.map(a => ({
        ...a,
        candidates_json: JSON.stringify(a.candidates),
        candidates: undefined,
      }));

      const res = await fetch(`${INGESTOR_URL}/ingest/attributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[ATTRIBUTION] Ingested ${data.inserted} rows`);
      }
    } catch (err) {
      console.error(`[ATTRIBUTION] Ingest failed: ${err.message}`);
    }

    return Response.json({
      ok: true,
      date: workingDate,
      total: attributions.length,
      company_specific: attributions.filter(a => a.movement_type === "company").length,
      attributions: attributions.map(a => ({
        ticker: a.ticker,
        movement_type: a.movement_type,
        return: a.ticker_return,
        top_event: a.top_event_type,
      })),
    });
  },
};

// =========================================================
// Helpers
// =========================================================

/**
 * Lag weight: Normal distribution N(μ=3, σ=2), with floor 0.8 for lag 0 and 1.
 * Peak at day 3. Decays toward 0 by day 10+.
 */
function lagWeight(lag) {
  if (lag < 0 || lag > 14) return 0;
  const natural = Math.exp(-Math.pow(lag - 3, 2) / 8); // σ² × 2 = 8
  if (lag === 0 || lag === 1) return Math.max(0.8, natural);
  return natural;
}

function daysBetween(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}
