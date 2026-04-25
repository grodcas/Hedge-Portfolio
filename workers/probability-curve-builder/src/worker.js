// Probability curve builder
//
// Scaffold. Implementation deferred to before Sprints 4/5 start — the
// individual-stock and stock-landscape narratives depend on this table being
// populated (NARRATIVE_BUILD_PLAN Sprints 4 & 5).
//
// Purpose: populate SIGNAL_02_Probability with rolling Bayesian posterior
// probabilities per ticker per day:
//   p_favorable   — P(stock outperforms sector over N days | factors)
//   p_neutral     — P(in-line)
//   p_unfavorable — P(underperforms)
// Sum to 1.0. Rolling 30-day curve used by narrator and by the dashboard
// probability spark-line.
//
// Inputs:
//   - SIGNAL_01_Assessment (composite score + 8 factors per ticker per day)
//   - STOCK_FACTORS_daily (raw factor values)
//   - PRICE_01_Daily (outcome realization for the Bayesian update)
//   - historical factor→outcome joint distribution (bootstrapped from last
//     ~500 trading days, rebuilt periodically)
//
// Method (proposal — to be refined in implementation sprint):
//   1. For each ticker, compute factor vector on day t.
//   2. Look up conditional P(outcome | factor vector) from the empirical
//      joint distribution (nearest-neighbor or logistic regression).
//   3. Smooth with the prior-day posterior (Bayesian update) to produce the
//      day-t triple {p_favorable, p_neutral, p_unfavorable}.
//   4. Write to SIGNAL_02_Probability.
//
// Routes:
//   GET /build?ticker=<T>  — build one ticker's probability for today
//   GET /build-all         — fan out to all 25 portfolio tickers
//   GET /backfill?days=N   — rebuild last N days for all tickers
//
// Table SIGNAL_02_Probability already exists (migration 0013). No migration
// needed here; just wire the writer.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/build") {
      const ticker = url.searchParams.get("ticker");
      return json({
        status: "not_implemented",
        worker: "probability-curve-builder",
        ticker,
        message: "Scaffold only."
      });
    }

    if (url.pathname === "/build-all") {
      return json({
        status: "not_implemented",
        worker: "probability-curve-builder"
      });
    }

    if (url.pathname === "/backfill") {
      const days = url.searchParams.get("days");
      return json({
        status: "not_implemented",
        worker: "probability-curve-builder",
        days
      });
    }

    return json({ error: "route not found" }, 404);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" }
  });
}
