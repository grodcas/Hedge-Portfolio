/**
 * PROBABILITY ENGINE — Bayesian Daily Update
 *
 * Updates P(favorable)/P(neutral)/P(unfavorable) per ticker using today's
 * assessment factor scores. PURE MATH — no AI.
 *
 * Update rule:
 *   Read yesterday's probabilities (or prior 0.30/0.40/0.30 on first run)
 *   For each +1 factor: shift p_favorable up by |value*weight| * 0.02
 *   For each -1 factor: shift p_unfavorable up by |value*weight| * 0.02
 *   Floor each at 0.05, normalize so sum = 1.0
 */

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS"
];

const INGESTOR_URL = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

const PRIOR = { p_favorable: 0.30, p_neutral: 0.40, p_unfavorable: 0.30 };
const FLOOR = 0.05;
const SHIFT_PER_UNIT = 0.02;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/update-probabilities")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const today = new Date().toISOString().slice(0, 10);

    console.log(`[PROBABILITY] Starting for ${TICKERS.length} tickers (${today})`);

    // Load today's assessments
    const { results: assessments } = await db.prepare(`
      SELECT ticker, factors_json FROM SIGNAL_01_Assessment WHERE date = ?
    `).bind(today).all();

    if (!assessments || assessments.length === 0) {
      return Response.json({ ok: false, error: "No assessments for today" }, { status: 404 });
    }

    // Load yesterday's probabilities for priors
    const { results: priorRows } = await db.prepare(`
      SELECT ticker, p_favorable, p_neutral, p_unfavorable FROM SIGNAL_02_Probability
      WHERE date = (SELECT MAX(date) FROM SIGNAL_02_Probability WHERE date < ?)
    `).bind(today).all();

    const priorMap = {};
    for (const r of (priorRows || [])) {
      priorMap[r.ticker] = {
        p_favorable: r.p_favorable,
        p_neutral: r.p_neutral,
        p_unfavorable: r.p_unfavorable,
      };
    }

    // Compute new probabilities per ticker
    const probabilities = [];
    for (const a of assessments) {
      const prior = priorMap[a.ticker] || { ...PRIOR };
      let factors;
      try {
        factors = JSON.parse(a.factors_json);
      } catch {
        factors = [];
      }

      const updated = bayesianUpdate(prior, factors);
      probabilities.push({
        ticker: a.ticker,
        date: today,
        p_favorable: round(updated.p_favorable),
        p_neutral: round(updated.p_neutral),
        p_unfavorable: round(updated.p_unfavorable),
      });
    }

    console.log(`[PROBABILITY] Computed ${probabilities.length} probability states`);

    // POST to ingestor
    try {
      const res = await fetch(`${INGESTOR_URL}/ingest/probabilities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(probabilities),
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[PROBABILITY] Ingested ${data.inserted} rows`);
      }
    } catch (err) {
      console.error(`[PROBABILITY] Ingest failed: ${err.message}`);
    }

    return Response.json({
      ok: true,
      date: today,
      tickers: probabilities.length,
      probabilities: probabilities.map(p => ({
        ticker: p.ticker,
        pf: p.p_favorable,
        pn: p.p_neutral,
        pu: p.p_unfavorable,
      })),
    });
  },
};

function bayesianUpdate(prior, factors) {
  let shift_fav = 0;
  let shift_unfav = 0;

  for (const f of factors) {
    if (!f || typeof f.value !== "number") continue;
    const impact = Math.abs(f.value * (f.weight || 1)) * SHIFT_PER_UNIT;
    if (f.value > 0) shift_fav += impact;
    else if (f.value < 0) shift_unfav += impact;
  }

  let pf = prior.p_favorable + shift_fav;
  let pu = prior.p_unfavorable + shift_unfav;
  let pn = prior.p_neutral;

  // Apply floor
  pf = Math.max(FLOOR, pf);
  pn = Math.max(FLOOR, pn);
  pu = Math.max(FLOOR, pu);

  // Normalize
  const total = pf + pn + pu;
  return {
    p_favorable: pf / total,
    p_neutral: pn / total,
    p_unfavorable: pu / total,
  };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
