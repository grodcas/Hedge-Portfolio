# SPRINT · API budget cleanup · 2026-05-06 (run BEFORE historical-init)

> Prereq for [SPRINT_2026-05-06_historical_init.md](SPRINT_2026-05-06_historical_init.md). Without this, two callers will fight over Alpha Vantage's 25/day cap and the historical-init sprint's MS-6d will 403.

**Effort**: ~45 min · **Output**: a coordinated AV budget, event-driven consensus refresh, and a single source of truth for daily API usage.

## The problem this fixes

**Alpha Vantage free tier = 25 requests/day TOTAL across all callers.** Today the laptop's `fetch-fundamentals.js` already burns up to 25 OVERVIEW + N statement calls every pipeline run. Adding the planned daily `consensus-fetcher` cron on top would push us to ~50 expected AV calls/day → guaranteed 403s before noon.

Independently, the consensus refresh is event-driven by nature (consensus only meaningfully changes around earnings prints), so a daily cron was wrong from the start.

## Locked defaults

- AV daily budget shared between `fetch-fundamentals` (laptop pipeline) and `consensus-fetcher` (Cloudflare cron). No new caller may be added without reviewing this budget.
- Consensus refresh window: **`-7d ≤ today ≤ +2d` around `EARNINGS_CALENDAR_consensus.next_earnings_date`** for that ticker, OR last fetch > 7 days ago. Hardcoded.
- All AV-using callers must log a single line per ticker: `AV {endpoint} {ticker} fetched | budget_used_today=N/25`.

---

## MS-6.0a · Move consensus-fetcher to event-driven (~15 min)

**File**: `workers/consensus-fetcher/src/worker.js`

Add at the start of the per-ticker loop:

```js
// Event-driven gate. Skip unless we're in the earnings window OR the row is stale.
const cal = await db.prepare(
  `SELECT next_earnings_date FROM EARNINGS_CALENDAR_consensus WHERE ticker = ?`
).bind(ticker).first();

const last = await db.prepare(
  `SELECT MAX(created_at) AS ts FROM FUND_03_Estimates WHERE ticker = ?`
).bind(ticker).first();

const inWindow = cal?.next_earnings_date
  && Math.abs(daysBetween(today, cal.next_earnings_date)) <= 7;  // -7d to +7d, tighter check below
const tooStale = !last?.ts || daysBetween(today, last.ts.slice(0,10)) > 7;

if (!inWindow && !tooStale) {
  console.log(`[CONSENSUS] skip ${ticker} (last=${last?.ts?.slice(0,10) || "never"}, next_earn=${cal?.next_earnings_date || "none"})`);
  continue;
}
```

Tighten `inWindow` to `next_earnings_date - 7d ≤ today ≤ next_earnings_date + 2d` if you want the asymmetric pre/post window the user spec'd; the abs-7 above is a simpler proxy.

**Cron edit**: `workers/consensus-fetcher/wrangler.jsonc` change `"0 13 * * *"` → `"0 13 * * 1-5"`. No weekend AV burn.

**Done when**:
- Deploy + `/build`. With NVDA/UNH/XOM having freshly written `FUND_03_Estimates` rows from MS-4a, all three should skip.
- Force-fire one ticker via `?ticker=NVDA&force=1` to confirm the bypass path still works.

---

## MS-6.0b · OVERVIEW freshness gate in fetch-fundamentals (~10 min)

**File**: `src/steps/fetch-fundamentals.js`

The "OVERVIEW per ticker daily" branch already lives in `tickersForOverview`. Wrap the call site so we only fetch when the ticker's last OVERVIEW row is ≥3 days old.

Add (pseudo-edit; locate the actual selection block before the change):

```js
const overviewLastByTicker = await db.all(
  `SELECT ticker, MAX(date) AS last FROM FUND_01_Fundamentals
   WHERE source = 'av_overview' GROUP BY ticker`
);
const tooFresh = new Set(
  overviewLastByTicker
    .filter(r => daysBetween(today, r.last) < 3)
    .map(r => r.ticker)
);
const tickersForOverview = TICKERS.filter(t => !tooFresh.has(t));
```

(Adjust the source-tag constant to match what's actually written today; `'av_overview'` is illustrative — grep for the existing tag.)

**Done when**: pipeline log shows `FUNDAMENTALS skipping OVERVIEW for N tickers (≤3d old)` on a same-day re-run. First run after a 3d gap fetches normally.

---

## MS-6.0c · Shared AV budget logging (~5 min)

**File**: small helper module `workers/_shared/av-budget.js` (new):

```js
// One canonical log shape. The sprint runner greps for "AV_BUDGET" in
// pipeline.log to know how close we are to the 25/day ceiling.
export async function logAvCall(env, endpoint, ticker, ok) {
  const today = new Date().toISOString().slice(0, 10);
  // Optional: persist to a tiny D1 table PROC_03_AV_Usage(date, used) for the dashboard.
  console.log(`AV_BUDGET ${today} ${endpoint} ${ticker} ${ok ? "ok" : "fail"}`);
}
```

Wire one `logAvCall` line into every AV fetch site (consensus-fetcher, fetch-fundamentals OVERVIEW, fetch-fundamentals statements). Three call sites total.

**Done when**: a `/build` of consensus-fetcher emits at least one `AV_BUDGET` log line.

Optional follow-up (not in this sprint): persist to `PROC_03_AV_Usage` and surface on dashboard so the daily ceiling is visible.

---

## MS-6.0d · Earnings-fetcher freshness check (~10 min)

**File**: `workers/earnings-fetcher/src/worker.js`

Already calls Finnhub `/stock/earnings` and `/stock/recommendation` per ticker. Finnhub's 60/min free limit is loose, so this isn't urgent — but it is wasteful. Apply the same event-driven principle:

- `recommendation` per ticker only when `next_earnings_date - 14d ≤ today ≤ next_earnings_date + 7d` OR last fetch > 14 days.
- `earnings` (calendar) refresh: keep daily — it's the source of `next_earnings_date` everything else gates on.

**Done when**: a re-fire of the worker outside any earnings window emits `skip (no upcoming print, last fetch <14d ago)` for ≥80% of tickers.

---

## MS-6.0e · Smoke + commit + push (~5 min)

1. Force-fire each modified worker once (`?force=1` for the gated ones, `?ticker=NVDA&force=1` for consensus-fetcher).
2. Confirm AV_BUDGET log lines appear.
3. Confirm no 403s.
4. One commit per worker: `MS-6.0a`, `MS-6.0b`, `MS-6.0c`, `MS-6.0d`. Push to master.

**Done when**: ssh hedge-server, `git pull`, `npm run pipeline 2>&1 | grep -E "AV_BUDGET|skip"` → shows the new gate logs.

---

## Coordination with the historical-init sprint (MS-6a–h)

After MS-6.0 ships:

- MS-6d (the historical-init step that fires consensus-fetcher for all 25 tickers) **should bypass the gate** for the initial backfill. Use `?force=1&backfill=1` and burn ~25 AV calls in one shot. After that, the gate keeps daily usage at 3–8.
- MS-6c (Polygon fundamentals backfill) is unchanged — Polygon is a different budget.
- MS-6b (Yahoo) is unchanged — Yahoo is unmetered.

After both sprints:

- AV steady-state: **3–8/day** (mostly fetch-fundamentals OVERVIEW on tickers crossing the 3d gate, plus consensus-fetcher around earnings windows)
- Polygon steady-state: **~25–30/day** (well within free tier)
- Finnhub steady-state: **~5–15/day** (well within 60/min)

## Stop and ask

- If MS-6.0a finds no `EARNINGS_CALENDAR_consensus.next_earnings_date` populated for the portfolio (the gate becomes useless without it), check `earnings-fetcher` is producing rows. If it's not, fix that first — without next_earnings_date, the gate logic falls through to the 7-day staleness check (still useful, but loses the event signal).

## Out of scope

- Persisting AV budget to D1 (optional follow-up noted in 6.0c).
- Migrating fetch-fundamentals away from AV entirely. Polygon could replace some of it eventually, but not today.
- News funnel rerank or weekend skip — already shipped on master (`6d97ec6`, `8bfef14`).

---

## Order of operations 2026-05-06

1. **MS-6.0** (this sprint, ~45 min) — fix the AV budget so MS-6d doesn't 403.
2. **MS-6** (historical-init, ~5h) — backfill + fan-out.
3. **MS-5** (validation walk + cleanup) — once both above are done and the dashboard has 24h of clean data.
