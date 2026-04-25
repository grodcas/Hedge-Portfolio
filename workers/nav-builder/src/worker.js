/**
 * NAV BUILDER — Sprint 7
 *
 * Reads POSITION_01_Daily for ?date= (default today), aggregates into
 * gross_long / gross_short / net_value / cash / leverage / day_pnl.
 * Starts from INITIAL_CASH_USD and tracks cash through the full ledger
 * (sells add cash, buys subtract).
 *
 * Second pass back-fills POSITION_01_Daily.weight_pct = market_value / net_value
 * for each position.
 *
 * Idempotent: upserts on date.
 */

const INITIAL_CASH_USD = 1_000_000;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/compute-nav") {
      return new Response("Not found", { status: 404 });
    }

    const db = env.DB;
    // Default to the latest POSITION_01_Daily date (which itself tracks the
    // latest PRICE_01_Daily date). Keeps NAV consistent with available data.
    let target = url.searchParams.get("date");
    if (!target) {
      const latest = await db.prepare(`SELECT MAX(date) AS d FROM POSITION_01_Daily`).first();
      target = latest?.d || new Date().toISOString().slice(0, 10);
    }
    const now = new Date().toISOString();

    console.log(`[NAV] Building NAV for ${target}`);

    // 1. Read positions for the target date
    const positions = (await db.prepare(
      `SELECT ticker, qty, avg_cost, market_price, market_value
       FROM POSITION_01_Daily WHERE date = ?`
    ).bind(target).all()).results || [];

    // 2. Compute cash from full ledger up to target date
    // cash = INITIAL + sells_proceeds - buys_cost - fees
    const cashRow = await db.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN side='SELL' THEN qty*price ELSE 0 END), 0) AS sells,
         COALESCE(SUM(CASE WHEN side='BUY'  THEN qty*price ELSE 0 END), 0) AS buys,
         COALESCE(SUM(fees), 0) AS fees
       FROM TRADE_01_Ledger WHERE trade_date <= ?`
    ).bind(target).first();
    const cash = INITIAL_CASH_USD + (cashRow?.sells || 0) - (cashRow?.buys || 0) - (cashRow?.fees || 0);

    // 3. Aggregate gross long / short
    let grossLong = 0, grossShort = 0, positionsCount = 0;
    for (const p of positions) {
      if (p.market_value == null) continue;
      if (p.market_value >= 0) grossLong += p.market_value;
      else grossShort += Math.abs(p.market_value);
      positionsCount++;
    }
    const netValue = grossLong - grossShort + cash;
    const leverage = netValue > 0 ? (grossLong + grossShort) / netValue : null;

    // 4. Compute day P&L vs prior NAV row
    const prior = await db.prepare(
      `SELECT net_value FROM NAV_01_Daily WHERE date < ? ORDER BY date DESC LIMIT 1`
    ).bind(target).first();
    const dayPnlUsd = prior?.net_value != null ? (netValue - prior.net_value) : null;
    const dayPnlPct = (dayPnlUsd != null && prior.net_value > 0)
      ? dayPnlUsd / prior.net_value * 100
      : null;

    // 5. Write NAV row
    await db.prepare(`
      INSERT INTO NAV_01_Daily
        (date, gross_long, gross_short, net_value, cash, leverage, day_pnl_usd, day_pnl_pct, positions_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        gross_long = excluded.gross_long, gross_short = excluded.gross_short,
        net_value = excluded.net_value, cash = excluded.cash, leverage = excluded.leverage,
        day_pnl_usd = excluded.day_pnl_usd, day_pnl_pct = excluded.day_pnl_pct,
        positions_count = excluded.positions_count, created_at = excluded.created_at
    `).bind(target, grossLong, grossShort, netValue, cash, leverage, dayPnlUsd, dayPnlPct, positionsCount, now).run();

    // 6. Back-fill weight_pct on POSITION_01_Daily
    if (netValue > 0) {
      await db.prepare(
        `UPDATE POSITION_01_Daily
         SET weight_pct = (market_value / ?) * 100
         WHERE date = ? AND market_value IS NOT NULL`
      ).bind(netValue, target).run();
    }

    console.log(`[NAV] ${target}: gross_long=${grossLong.toFixed(0)} net=${netValue.toFixed(0)} positions=${positionsCount}`);
    return Response.json({
      ok: true,
      date: target,
      net_value: netValue,
      gross_long: grossLong,
      gross_short: grossShort,
      cash,
      positions_count: positionsCount,
    });
  },
};
