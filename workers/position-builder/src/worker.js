/**
 * POSITION BUILDER — Sprint 7
 *
 * Reads the full TRADE_01_Ledger up to ?date= (default today), replays it
 * to compute per-ticker {qty, avg_cost}, joins to PRICE_01_Daily for the
 * target date + previous trading day, and writes POSITION_01_Daily rows.
 *
 * Weighted-average cost on BUYs. On SELLs, qty reduces but avg_cost stays
 * (for display). Realized-P&L FIFO accounting is done separately by the
 * /query/trades/closed endpoint — this builder only tracks open book state.
 *
 * Idempotent: upserts on shortHash(ticker|date). Skips tickers with qty=0.
 */

async function shortHash(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/compute-positions") {
      return new Response("Not found", { status: 404 });
    }

    const db = env.DB;
    // Default to the most recent PRICE_01_Daily date rather than "today" —
    // PRICE_01 often lags the wall clock by 1-2 days (weekends, holidays,
    // fetcher cadence). Using "today" leaves market_value null.
    let target = url.searchParams.get("date");
    if (!target) {
      const latest = await db.prepare(`SELECT MAX(date) AS d FROM PRICE_01_Daily`).first();
      target = latest?.d || new Date().toISOString().slice(0, 10);
    }
    const now = new Date().toISOString();

    console.log(`[POSITION] Building positions for ${target}`);

    // 1. Load ledger up to target date
    const trades = (await db.prepare(
      `SELECT ticker, trade_date, side, qty, price
       FROM TRADE_01_Ledger
       WHERE trade_date <= ?
       ORDER BY trade_date, created_at`
    ).bind(target).all()).results || [];

    if (trades.length === 0) {
      return Response.json({ ok: true, positions: 0, date: target, note: "no trades" });
    }

    // 2. Load target-date prices + most-recent prior trading day price
    const pricesToday = (await db.prepare(
      `SELECT ticker, close FROM PRICE_01_Daily WHERE date = ?`
    ).bind(target).all()).results || [];
    const priceByTicker = Object.fromEntries(pricesToday.map(p => [p.ticker, p.close]));

    // Prior-day prices: pick the most recent date < target per ticker.
    // One subquery avoids N round-trips.
    const priorRows = (await db.prepare(
      `SELECT p.ticker, p.close
       FROM PRICE_01_Daily p
       INNER JOIN (
         SELECT ticker, MAX(date) AS md
         FROM PRICE_01_Daily
         WHERE date < ?
         GROUP BY ticker
       ) g ON p.ticker = g.ticker AND p.date = g.md`
    ).bind(target).all()).results || [];
    const priorByTicker = Object.fromEntries(priorRows.map(p => [p.ticker, p.close]));

    // 3. Replay ledger -> {qty, avg_cost} per ticker
    const book = {}; // ticker -> { qty, cost_basis_sum }
    for (const t of trades) {
      const b = book[t.ticker] ||= { qty: 0, cost_basis_sum: 0 };
      if (t.side === "BUY") {
        b.qty += t.qty;
        b.cost_basis_sum += t.qty * t.price;
      } else { // SELL — reduce qty proportionally, keep avg_cost by reducing cost_basis_sum
        if (b.qty > 0) {
          const avgCost = b.cost_basis_sum / b.qty;
          b.qty -= t.qty;
          b.cost_basis_sum -= t.qty * avgCost;
          if (b.qty < 1e-9) { b.qty = 0; b.cost_basis_sum = 0; }
        }
      }
    }

    // 4. Write POSITION_01_Daily rows
    let written = 0;
    for (const [ticker, b] of Object.entries(book)) {
      if (b.qty <= 1e-9) continue; // closed position
      const avgCost = b.cost_basis_sum / b.qty;
      const mktPrice = priceByTicker[ticker] ?? null;
      const priorPrice = priorByTicker[ticker] ?? null;
      const mktValue = mktPrice != null ? b.qty * mktPrice : null;
      const unrlzPnl = mktPrice != null ? (mktPrice - avgCost) * b.qty : null;
      const dayPnlPct = (mktPrice != null && priorPrice != null && priorPrice > 0)
        ? (mktPrice - priorPrice) / priorPrice * 100
        : null;
      const id = await shortHash(`${ticker}|${target}`);
      await db.prepare(`
        INSERT INTO POSITION_01_Daily
          (id, date, ticker, qty, avg_cost, market_price, market_value, unrlz_pnl_usd, day_pnl_pct, weight_pct, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
        ON CONFLICT(id) DO UPDATE SET
          qty = excluded.qty, avg_cost = excluded.avg_cost,
          market_price = excluded.market_price, market_value = excluded.market_value,
          unrlz_pnl_usd = excluded.unrlz_pnl_usd, day_pnl_pct = excluded.day_pnl_pct,
          created_at = excluded.created_at
      `).bind(id, target, ticker, b.qty, avgCost, mktPrice, mktValue, unrlzPnl, dayPnlPct, now).run();
      written++;
    }

    console.log(`[POSITION] Wrote ${written} positions for ${target}`);
    return Response.json({ ok: true, positions: written, date: target });
  },
};
