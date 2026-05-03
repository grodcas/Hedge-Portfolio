# PIPELINE BUILD PLAN — Macro + Portfolio Layer

> **Working doc for the current build phase.** Future Claude sessions should read this first to pick up context. Updated 2026-04-18.

---

## 1. Context

Hedge-Portfolio is a hedge-fund-grade retail portfolio dashboard built over 6 months.

- **Backend**: mature. 33 Cloudflare Workers + D1 database with 23+ tables + 10-step daily pipeline that scrapes news, press releases, SEC filings, macro indicators, sentiment, White House.
- **Old dashboard** (working): `dashboard/index.html` + `dashboard/app.js`, Express proxy in `dashboard/server.js` on port 4200. Reads from D1 via `/query/*` endpoints.
- **New dashboard mockup** (target UI): `dashboard/portfolio-funnel-mockup.html` + `portfolio-funnel-mockup.js`. Restructured as PM / Portfolio (funnel) / Macro / News / Validation tabs + entity pages. Currently uses a stub `DATA` object.

**Goal of this phase**: complete the backend pipeline so all Macro + Portfolio layer data is computed and written to D1, then wire the new mockup dashboard to real D1 data.

---

## 2. Scope

### ✅ IN
- Macro tab (regime, indicators, event calendar, release summaries)
- Portfolio Layer 1 — Context / Regime
- Portfolio Layer 2 — Sector grid (6 factors) + RRG
- Portfolio Layer 3 — Stock shortlist (industry-standard factors)
- Portfolio Layer 4 — Weights (already wired via `REBALANCE_01`)
- Entity pages: stock, sector, indicator
- News tab (already mostly wired)
- Validation tab (already mostly wired)

### ❌ OUT (deferred)
- PM tab (needs trade ledger)
- Trade entry UI
- NAV curve / positions table / attribution waterfall
- Portfolio Layer 5 Feedback (needs trade history)
- Short interest (Phase deferred, `FINNHUB_KEY` ready when needed)
- Scenarios sensitivity

---

## 3. What already exists

### 3.1 D1 tables

| Layer | Tables |
|---|---|
| ALPHA (company intel) | `ALPHA_01_Reports`, `ALPHA_02_Clusters`, `ALPHA_03_Press`, `ALPHA_04_Trends` |
| BETA (market/macro) | `BETA_01_News`, `BETA_02_WH`, `BETA_03_Macro`, `BETA_04_Sentiment`, `BETA_09_Trend` (legacy), `BETA_10_Daily_macro` (current regime), `BETA_11_Macro_news`, `BETA_12_News_digest` |
| PRICE | `PRICE_01_Daily` (Polygon) |
| FUND | `FUND_01_Fundamentals` (AV), `FUND_02_Earnings` (Finnhub), `FUND_03_Recommendations` (Finnhub) |
| SIGNAL | `SIGNAL_01_Assessment`, `SIGNAL_02_Probability`, `SIGNAL_03_Consensus`, `SIGNAL_04_Attributions`, `SIGNAL_HISTORY_daily` |
| GAMMA | `GAMMA_01_Verification` (AI fact-check) |
| MACRO_STATE | `MACRO_STATE_indicators`, `MACRO_STATE_fomc`, `MACRO_STATE_news` |
| PORTFOLIO | `PORTFOLIO_01_Holdings`, `TICKER_TREND_long`, `TICKER_TREND_short`, `OPERATION_01_Signals`, `REBALANCE_01`, `MOVER_EXPLANATIONS_daily` |
| PROC | `PROC_01_Pipeline_logs`, `PROC_01_Job_queue`, `PROC_02_Workflow_status`, `PROC_03_News_staging`, `PROC_04_Fact_verification` |

### 3.2 Key existing workers

- **Fetchers**: `price-fetcher` (Polygon), `earnings-fetcher` (Finnhub), `fundamentals-fetcher` (Alpha Vantage, runs locally)
- **Signal compute**: `assessment-engine` (8 factors → score), `probability-engine`, `consensus-validator` (Gemini grounding), `event-attribution-engine`
- **Narrative**: `ticker-trend-long`, `ticker-trend-short`, `macro-intelligence-builder`
- **Operations**: `operations-agent` (sector clusters), `wealth-distribution` (REBALANCE_01)
- **News**: `news-funnel-orchestrator/filter/gatherer`
- **Orchestration**: `job-engine-workflow`, `report-orchestrator`

### 3.3 API keys already in `.env`

`FINNHUB_KEY`, `FMP_KEY`, `POLYGON_KEY`, `ALPHAVANTAGE_KEY`, `GEMINI_API_KEY`, `FRED_KEY`, `OPENAI_API_KEY`, `BLS_KEY`, `BEA_KEY`, `NASDAQ_KEY`. **No new accounts needed for this phase.**

---

## 4. Gaps to fill

### 4.1 Missing data
1. Sector-level factor scores (no aggregation worker)
2. Sector thesis narrative (no sector equivalent of `ticker-trend-*`)
3. 5 sector ETFs missing from `price-fetcher` (XLY, XLC, XLB, XLU, XLRE)
4. Peer group mapping (GICS → peer tickers)
5. ETF flows (for sector Flow factor)
6. Regime confidence scalar (macro-intelligence-builder emits label only)

### 4.2 Missing computations
1. Industry-standard stock factors: Fwd P/E, Rel P/E σ vs peers, EPS Rev 4w, Rev Breadth 4w, SUE, 12-1 momentum, 3m RS vs sector, Piotroski F, days-to-catalyst
2. Sector-level RS-Ratio + RS-Momentum (for RRG)
3. Sector aggregate Fwd P/E, breadth above 200dma

### 4.3 Missing endpoints
`/query/stock-factors`, `/query/sector-factors`, `/query/sector-trends`, `/query/regime-history`, `/query/indicator-history`, `/query/sector-peers`

---

## 5. The 5-phase plan

### Phase 1 — Extend existing fetchers

**1.1 Extend `price-fetcher`** — add 5 ETFs: XLY, XLC, XLB, XLU, XLRE. Config change only.

**1.2 Earnings revision history** — `FUND_03_Recommendations` already snapshots daily; just need a SQL view that computes 4-week deltas from consecutive snapshots. No new fetcher.

**1.3 Verify `fundamentals-fetcher` Piotroski coverage** — Piotroski F inputs (9 signals): ROA>0, CFO>0, ΔROA>0, CFO>NI (accruals), ΔLeverage<0, ΔCurrent ratio>0, no equity issuance, ΔGross margin>0, ΔAsset turnover>0. Needs AV `BALANCE_SHEET` + `CASH_FLOW` endpoints called in addition to `OVERVIEW` + `INCOME_STATEMENT`. Verify first; extend if missing.

### Phase 2 — New fetchers

**2.1 Bootstrap `config/peers-mapping.json`** — one-shot script. Call FMP `/stock_peers` 25× (once per portfolio ticker). Cache to file, no ongoing worker.

```
https://financialmodelingprep.com/api/v4/stock_peers?symbol=UNH&apikey=${FMP_KEY}
```

**2.2 New worker `etf-flows-fetcher`** — scrape SPDR ETF fund facts pages for shares outstanding + NAV, compute daily flow = `Δshares × NAV`. Fallback: Finnhub `/etf/profile`.

**Output table** `SECTOR_FLOWS_daily`:
```sql
CREATE TABLE SECTOR_FLOWS_daily (
  id TEXT PRIMARY KEY,
  sector TEXT NOT NULL,
  etf_ticker TEXT NOT NULL,
  date DATE NOT NULL,
  shares_outstanding REAL,
  nav REAL,
  flow_usd REAL,
  aum REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Phase 3 — Core compute workers

**3.1 New worker `stock-factor-builder`** — pure math, no LLM.

**Inputs**: `PRICE_01_Daily`, `FUND_01_Fundamentals`, `FUND_02_Earnings`, `FUND_03_Recommendations`, `config/peers-mapping.json`

**Output table** `STOCK_FACTORS_daily`:
```sql
CREATE TABLE STOCK_FACTORS_daily (
  id TEXT PRIMARY KEY,              -- hash(ticker|date)
  ticker TEXT NOT NULL,
  date DATE NOT NULL,
  sector TEXT,
  fwd_pe REAL,
  rel_pe_sigma REAL,                -- (fwd_pe - peer_median) / peer_σ
  eps_rev_4w REAL,
  rev_breadth_4w REAL,              -- (up_recs - down_recs) / total over 4w
  sue REAL,                          -- Bernard-Thomas 1989
  mom_12_1 REAL,                     -- Jegadeesh-Titman 1993
  rs_vs_sector_3m REAL,
  piotroski_f INTEGER,
  days_to_catalyst INTEGER,
  short_pct_float REAL,              -- nullable, deferred
  peer_median_pe REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Job wave**: ~500 (after price/fundamentals/earnings fetchers complete).

**3.2 New worker `sector-factor-builder`** — aggregation math + regime lookup, no LLM.

**Inputs**: `STOCK_FACTORS_daily`, `PRICE_01_Daily` (sector ETFs + SPY), `SECTOR_FLOWS_daily`, `BETA_10_Daily_macro` (current regime label)

**Output table** `SECTOR_FACTORS_daily`:
```sql
CREATE TABLE SECTOR_FACTORS_daily (
  id TEXT PRIMARY KEY,              -- hash(sector|date)
  sector TEXT NOT NULL,
  date DATE NOT NULL,
  regime_fit REAL,                   -- regime-conditional return, normalized
  earn_momentum REAL,                -- mean of constituent eps_rev_4w
  beat_rate_sector REAL,
  valuation_sigma REAL,              -- sector P/E z-score vs own 5y
  rel_strength_13w REAL,             -- sector ETF 13w - SPY 13w
  rs_ratio REAL,                     -- JdK RRG x-axis
  rs_momentum REAL,                  -- JdK RRG y-axis
  flow_5d REAL,                      -- 5d rolling from SECTOR_FLOWS_daily
  stance_score REAL,                 -- weighted sum of factors
  stance TEXT,                       -- OW / EW / UW bucket
  fwd_pe_sector REAL,
  breadth_above_200dma REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Stance score weights** (initial, tunable):
```
stance_score = 0.30*regime_fit
             + 0.20*earn_momentum
             + 0.15*valuation_sigma
             + 0.15*rel_strength_13w
             + 0.10*flow_5d
             + 0.10*beat_rate_sector
stance = OW if > 0.33 else UW if < -0.33 else EW
```

**Job wave**: ~600 (after stock-factor-builder + etf-flows-fetcher).

**3.3 New workers `sector-trend-long` + `sector-trend-short`** — LLM thesis, analogous to `ticker-trend-*`.

**Inputs**: `SECTOR_FACTORS_daily`, `TICKER_TREND_long` (constituents), `BETA_10_Daily_macro`

**Output tables** `SECTOR_TREND_long`, `SECTOR_TREND_short`:
Same shape as `TICKER_TREND_long/short` (regime, score, thesis, drivers_json, narrative_json) but keyed by sector instead of ticker.

**Trigger logic** (for `sector-trend-short`): fires when sector stance changes, sector RS crosses 0, or >7 days stale.

### Phase 4 — Endpoints + small additions

In `workers/portfolio-ingestor/src/worker.js` add:

| Endpoint | Purpose |
|---|---|
| `POST /ingest/stock-factors` | write STOCK_FACTORS_daily |
| `POST /ingest/sector-factors` | write SECTOR_FACTORS_daily |
| `POST /ingest/sector-flows` | write SECTOR_FLOWS_daily |
| `POST /ingest/sector-trends` | write SECTOR_TREND_long / short |
| `GET /query/stock-factors?ticker=&date=&days=` | read |
| `GET /query/sector-factors?sector=&date=&days=` | read |
| `GET /query/sector-trends?sector=` | read {long, short} pair |
| `GET /query/regime-history?days=730` | BETA_10_Daily_macro regime field over 2y |
| `GET /query/indicator-history?code=DGS10&days=720` | MACRO_STATE_indicators filtered |
| `GET /query/sector-peers?sector=Healthcare` | peers mapping + FUND_01 join |

Also: add `confidence` float to `macro-intelligence-builder` JSON output (prompt tweak, no new endpoint needed — read from `BETA_10_Daily_macro`).

### Phase 5 — Dashboard wiring

Replace mockup `DATA` stubs with `fetch('/api/...')` calls, mirroring old dashboard's proxy pattern. Add `/api/*` routes in `dashboard/server.js` forwarding to new `/query/*` endpoints.

**Shape changes to expect**:
- Stock shortlist: 6 invented columns → 9 standard factor columns (see 3.1 schema)
- Sector table: 6 stub columns → matches `SECTOR_FACTORS_daily` schema
- Sector entity page: `thesis` now comes from `SECTOR_TREND_long`
- Scatter Y-axis: CHEAP/FAIR/EXP categorical → `rel_pe_sigma` continuous float
- Gauge confidence: from `BETA_10_Daily_macro.confidence`
- RRG: uses `rs_ratio` / `rs_momentum` columns directly

---

## 6. URLs reference

| Source | URL | Auth |
|---|---|---|
| FMP peers (one-shot) | `https://financialmodelingprep.com/api/v4/stock_peers?symbol={T}&apikey=${FMP_KEY}` | existing |
| SPDR ETF pages | `https://www.ssga.com/us/en/intermediary/etfs/{xlv|xlk|...}` | none (scrape) |
| AV Balance Sheet | `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol={T}&apikey=${ALPHAVANTAGE_KEY}` | existing |
| AV Cash Flow | `https://www.alphavantage.co/query?function=CASH_FLOW&symbol={T}&apikey=${ALPHAVANTAGE_KEY}` | existing |
| Finnhub short int (fallback) | `https://finnhub.io/api/v1/stock/short-interest?symbol={T}&token=${FINNHUB_KEY}` | existing |

---

## 7. Design decisions log

- **`assessment-engine` stays unchanged.** Its composite score remains one column on the stock row. New `stock-factor-builder` emits standard industry factors in parallel, not as replacement.
- **No trade ledger.** PM tab stays stubbed.
- **No new paid subscriptions.** Existing keys cover everything.
- **`rs_ratio` / `rs_momentum` precomputed in D1** (not client-side) so the dashboard stays cheap and consistent across sessions.
- **Regime Fit is proprietary.** Label clearly in dashboard; document methodology in Validation tab.
- **CHEAP/FAIR/EXP badge stays as UI sortable** but backed by continuous `rel_pe_sigma`. Scatter Y-axis uses the continuous form.
- **Conviction (1–5 ★)** deferred — belongs with trade ledger work.
- **Short interest** deferred — add column to `STOCK_FACTORS_daily` as nullable now, backfill via Finnhub when picked up.

---

## 8. Progress tracker

### Sprint 1 — Stock-level pipeline  ✅ **DONE 2026-04-18**
- [x] Extend `price-fetcher` with 5 additional sector ETFs (XLY, XLC, XLB, XLU, XLRE)
- [x] Extend `fetch-fundamentals.js` to call AV `INCOME_STATEMENT` + `BALANCE_SHEET` + `CASH_FLOW` (alongside existing `OVERVIEW`)
- [x] Bootstrap `config/peers-mapping.json` via **Finnhub** one-shot script (FMP free-tier key returned 403 on `/stock_peers` and `/profile`)
- [x] Write migration `0022_add_stock_factors_table.sql` (23 ALTER FUND_01 + CREATE STOCK_FACTORS_daily)
- [x] Build `workers/stock-factor-builder/` (pure math, no LLM; writes direct to D1 to sidestep Cloudflare error 1042 on worker-to-worker public fetch)
- [x] Add `POST /ingest/stock-factors` + `GET /query/stock-factors` to `worker.js` (+ extended `/ingest/fundamentals` to accept Piotroski feedstock)
- [x] Wire into `job-engine-workflow` (wave **1500**, not 500 — base-1000 convention means 500 would run before fetchers)
- [x] Smoke test: `/query/stock-factors` returns 25 rows; `fwd_pe` 25/25, `rel_pe_sigma` 22/25, `sue` 25/25, `days_to_catalyst` 25/25. Nulls: `mom_12_1`/`rs_vs_sector_3m` (need ≥253d/≥63d PRICE_01 history), `eps_rev_4w`/`rev_breadth_4w` (need FUND_03 snapshots ≥20d apart), `piotroski_f` (needs local fetcher re-run with new IS/BS/CF endpoints to populate feedstock)

**Remaining follow-ups before Sprint 2**:
- Re-run local pipeline (`node src/pipeline.js`) so FUND_01 gets Piotroski feedstock — ~21 min with 4 AV endpoint passes. Flag if AV free-tier daily cap is hit.
- Wait ~2 months of daily pipeline runs for `mom_12_1` and `rs_vs_sector_3m` to populate (need 252d + 63d of PRICE_01 history for all 25 tickers including new ETFs).

### Sprint 2 — Sector-level pipeline  ✅ **DONE 2026-04-18**
- [ ] ~~Build `workers/etf-flows-fetcher/`~~ **DEFERRED** — Finnhub `/etf/profile` free-tier doesn't expose `shareOutstanding`; SSGA fund pages are React-rendered (regex-brittle). Table schema created anyway; `flow_5d` stays null until a reliable source is picked.
- [x] Migration `0023_add_sector_tables.sql` (renamed from plan doc's `_sector_flows_and_factors`)
- [x] Build `workers/sector-factor-builder/` (pure math, direct D1 write, 8 sectors keyed to `stock-factor-builder`'s SECTOR_BUCKET)
- [x] Add `/ingest/sector-factors`, `/ingest/sector-flows`, `/query/sector-factors`, `/query/sector-flows` endpoints
- [x] Wire into `job-engine-workflow` (wave **1600**, requires stock-factor-builder + price-fetcher)
- [x] Smoke test: `/query/sector-factors` returns 8 rows (not 11 — only the portfolio-exposed sectors). regime=cautious_bullish, stances {4 OW, 4 EW, 0 UW}. `fwd_pe_sector`, `regime_fit`, `beat_rate_sector`, `stance_score`, `stance` all populated.

**Self-resolving nulls** (need PRICE_01 history that accumulates with daily runs):
- `rs_ratio` / `rs_momentum`: need ≥85 days (JdK 63d + 21d lookback). Currently 2 days of ETF history.
- `breadth_above_200dma`: need ≥10 days to compute any DMA (threshold in worker). Currently 2 days.
- `valuation_sigma`: needs 252d rolling sector-PE history.

**Key deviations from doc §5**:
- Wave 1600 (not 600) for base-1000 convention.
- 8 sectors (not 11) — unexposed SPDRs (XLB/XLU/XLRE) deferred.
- `regime_fit` hardcoded regime×sector affinity matrix (not empirical conditional returns).
- Regime read is best-effort from latest BETA_10 row (not gated on macro-intel wave-2000).

### Sprint 3 — Sector narrative  ✅ **DONE 2026-04-18**
- [x] Migration `0024_add_sector_trend_tables.sql` (SECTOR_TREND_long + SECTOR_TREND_short mirror of TICKER_TREND schemas)
- [x] Build `workers/sector-trend-long/` (daily rebuild, 8 sectors, gpt-5, direct D1 write)
- [x] Build `workers/sector-trend-short/` (trigger-gated: stance_change / rs_cross / stale / force)
- [x] Add `/query/sector-trends` endpoint (mirror of `/query/ticker-trends` — returns `{long, short}`)
- [x] Wired into `job-engine-workflow`: wave 1700 (long) + 1800 (short), both require `sector-factor-builder`
- [x] Smoke test: 8/8 long + 8/8 short theses written. `/query/sector-trends?sector=Healthcare` returns populated thesis + drivers + narrative + regime + score.

**Day-1 output sanity**: Every sector returned `regime=neutral` with score ~0.05 because only 1 day of SECTOR_FACTORS_daily history is available — the prompt explicitly instructs the LLM to pick neutral when data is sparse and it followed the rule. As the 8-week factor trajectory accumulates, regimes will diverge.

**LLM cost**: gpt-5, 8 long + 8 short calls per day = ~16 OpenAI calls daily. Negligible vs. the existing 25-ticker trend calls.

**Key deviations from doc §5 Phase 3.3**:
- 8 sectors (not 11) — matches stock-factor-builder's SECTOR_BUCKET for consistency.
- Waves 1700 / 1800 (base-1000 convention).
- Direct D1 write from builders (Cloudflare loop-guard blocks public-URL worker→worker fetch).
- sector-trend-short's `rs_cross` trigger is dormant until PRICE_01 has ≥85 days of ETF history (same constraint as sector-factor-builder).

### Sprint 4 — Dashboard wiring  ✅ **DONE 2026-04-18**
- [x] Added `/api/stock-factors`, `/api/sector-factors`, `/api/sector-trends` proxy routes in `dashboard/server.js`
- [x] `DATA.sectors` now populated from `/api/sector-factors` via `transformSectors()` at bootstrap
- [x] `DATA.stockShortlist` populated from `/api/stock-factors` via `transformStockShortlist()`, grouped by display-sector
- [x] `DATA.rrgPoints` derived from sector-factors' `rs_ratio` + `rs_momentum`; empty-state when rs is null (≥85d history needed)
- [x] Stock shortlist updated to 10 columns: Ticker, Fwd P/E, Rel σ, EPS Rev, Breadth, SUE, 12–1 Mom, RS 3m, Piotroski, Days
- [x] Scatter: X = eps_rev_4w, Y = continuous `rel_pe_sigma` clamped ±2σ, bubble color = Piotroski F bucket
- [x] Sector entity page: fetches `/api/sector-trends?sector=X` on click, composes "Long-term view + Tactical (trigger)" thesis HTML, preserves all stub sections (business, snapshot, drivers, peers, catalysts)
- [x] Stock entity page: same pattern via existing `/api/ticker-trends?ticker=X`, response cached in `ENTITY_API_CACHE`

**Key deviations from plan**:
- Entity pages override **only thesis** (not drivers/narrative) to avoid shape mismatch between stub string-drivers and API object-drivers `[{text, bias}]`. Simpler and safer; stub drivers stay visible underneath the composed thesis.
- Sector grid shrinks from mockup's 11 stub rows to 8 real rows (portfolio-exposed sectors only). Sprint 5 can add ETF-only rows for XLB/XLU/XLRE.
- Error banner on bootstrap failure uses inline style instead of the full `showD1Error` pattern (lightweight single-shot).

**Out of scope (deferred)**:
- PM tab (needs trade ledger), Macro indicators, News/Validation tabs — already wired on old dashboard.
- Regime confidence gauge (`BETA_10.confidence` scalar) — Sprint 5.
- Sort-by-column on stock shortlist — not in the mockup today.

**Verification status**:
- ✅ `curl localhost:4200/api/stock-factors` → 25 rows.
- ✅ `curl localhost:4200/api/sector-factors` → 8 rows.
- ✅ `curl localhost:4200/api/sector-trends?sector=Healthcare` → populated long + short thesis.
- ✅ `npm run dashboard` starts cleanly; `/portfolio-funnel-mockup.html` serves (200 OK, 80KB).
- ⚠️ **Browser-render not tested** by Claude (no headless browser available). User should open `http://localhost:4200/portfolio-funnel-mockup.html` and verify: (a) sector grid shows 8 real rows with OW/EW/UW stances; (b) stock shortlist shows 10 columns with real fwd_pe values; (c) RRG shows "data accumulating" placeholder; (d) scatter plots ~22 bubbles; (e) clicking Healthcare tile shows real API thesis.

### Sprint 5 — Polish  ✅ **DONE 2026-04-19**
- [x] Added `confidence` (0–1 float) to trend + today gpt-5 prompts in `macro-intelligence-builder`; top-level `blob.confidence = Math.min(trend, today)`. Verified: new 2026-04-19 blob has confidence=0.58.
- [x] Added `/query/regime-history` (reads BETA_10_Daily_macro, returns {date, regime, confidence, action, window}).
- [x] Added `/query/indicator-history?code=&days=` (reads MACRO_STATE_indicators; bare call enumerates latest per code — 9 codes today).
- [x] Added `/query/sector-peers?ticker=` (serves bundled `config/peers-mapping.json`).
- [x] Wired event calendar: `bootstrapEventCalendar()` merges `/api/earnings-calendar` + `/api/fomc-calendar`, filters >30d stale, sorts upcoming-first.
- [x] 3 new proxy routes in `dashboard/server.js` (`/api/regime-history`, `/api/indicator-history`, `/api/sector-peers`).
- [x] Layer 1 signal chips wired to `/api/indicator-history` (DGS10, DGS2, CPI_CORE, FEDFUNDS). Remaining Layer-1 stubs (verdict text, netExposure gauge, style tilts) are trade-ledger-gated → Sprint 7.

### Sprint 7 — Trade ledger + Layers 4/5 wiring  ✅ **DONE 2026-04-19**

**Phase A (foundation + Layer 4 partial)** ✅:
- Migrations `0025_add_trade_ledger.sql`, `0026_add_position_nav_tables.sql` applied.
- `workers/position-builder/` — reads TRADE_01_Ledger + PRICE_01_Daily, replays ledger, writes POSITION_01_Daily. Default target = latest PRICE_01 date (PRICE_01 lags wall-clock).
- `workers/nav-builder/` — reads POSITION_01_Daily, aggregates gross/net/cash (INITIAL_CASH=$1M), back-fills `weight_pct` on positions.
- Ingestor endpoints: `POST /ingest/trades`, `GET /query/trades|positions|nav|trades/closed|portfolio-targets`.
- `config/portfolio-targets.json` (25 tickers × 4% target).
- `scripts/seed-trades.js` — seeded 24/25 tickers at 60-bar-old close (~2026-01-21) with notes="SEED". BRK.B skipped (no price history). Current NAV: **$1.042M** (+4.2% paper gain over 60 days).
- Layer 4 KPI strip wired: Net Exp **96.2%**, Gross **96.2%**, Positions **24**, Cash **3.8%**, NAV **$1.04M**.
- Layer 4 weight chart wired — 24 bars with real current weights vs 4% targets.
- Layer 1 gauge wired — shows real 96% net exposure (was stubbed 62).

**Phase B (Layer 4 decision trail + Layer 5 closed trades)** ✅:
- Decision trail composer picks the position with largest |current−target| gap (e.g., INTC at 4.8% vs 4.0% target), then pulls regime from `/api/daily-macro`, sector stance from `/api/sector-factors`, top-2 stock factors from `/api/stock-factors`, and emits a TRIM/ADD/AT-TARGET size recommendation.
- Closed-trades panel: new FIFO matcher in `/query/trades/closed` + `bootstrapClosedTrades()`. All seed trades are BUYs → panel shows "No closed trades yet — panel populates as sells are logged." (honest empty state).

**Still stubbed (Sprint 8)**:
- 30-day attribution waterfall (needs 30d of position × factor history).
- Conviction calibration (schema gap: no `conviction` column on TRADE_01_Ledger yet).
- Layer 1 verdict text + style tilts (verdict is hardcoded HTML; style tilts need per-ticker factor-exposure table).
- Portfolio optimizer for target weights (currently static `config/portfolio-targets.json`).
- CSV upload UI (seed script + `POST /ingest/trades` sufficient for now).
- Job-engine-workflow registration of position-builder/nav-builder at wave 1550/1560 (need to add `insertJob` calls in `workers/job-engine-workflow/src/index.js` for the daily cron).

### Sprint 8 — Final polish  ✅ **DONE 2026-04-19**

- **Layer 1 verdict + lede** now derived from `/api/daily-macro.summary`:
  - Verdict: `"Cautious Bullish — Stay long but hedge sticky-inflation risk"` (regime + recommendation headline).
  - Lede: composed from `trend.drivers[0]` + `trend.narrative[0]` + `recommendation.action` + `confidence`. Dynamic every day.
- **Style tilts** (Layer 1) computed as weighted-avg across positions from `/api/stock-factors`:
  - Quality: `—` (Piotroski null; populates once Sprint 6 IS/BS/CF passes complete Day +4).
  - Low vol: `—` (deferred — needs per-ticker 60d vol fetch).
  - Growth: **+0.01** (eps_rev_4w weighted avg). Value: **-0.10** (−rel_pe_sigma/2). Momentum: **+0.45** (mom_12_1 weighted avg).
  - `renderTilts()` now tolerates `score: null` → flat bar + `—`.
- **Migration 0027** adds `conviction INTEGER` to TRADE_01_Ledger (null allowed); `/ingest/trades` accepts it.
- **`/query/attribution`** — Brinson-Fachler-lite over NAV+SPY history. Returns `[]` until ≥5 days of NAV rows; panel shows *"Awaits data — Need 5+ days of NAV history."*
- **`/query/calibration`** — FIFO-matched closed trades bucketed by conviction (n≥3 per bucket). Returns `[]` today; panel shows *"Awaits data — Need closed trades with conviction recorded."*
- 2 new dashboard proxies: `/api/attribution`, `/api/calibration`.
- **Job-engine registration** — `position-builder` (wave 1550, requires price-fetcher) and `nav-builder` (wave 1560, requires position-builder) now part of the daily cron. Service bindings + `runJob` cases + `insertJob` calls + retry policy all in place. job-engine-workflow redeployed.

**After Sprint 8**: every visible dashboard widget is either real data or an explicit "awaits data" empty state. The plan is closed. Only out-of-scope remnants remain (CSV upload UI, portfolio optimizer, `flow_5d`/`valuation_sigma` — waiting on new data providers or organic history).

### Sprint 9 — Factor backfill + SSGA scraper  ✅ **DONE 2026-04-19**

- **Migration 0028** — new `SECTOR_VALUATION_monthly` table (forward_pe, div_yield, est_eps_growth_3_5y, raw_pdf_hash per ETF per month).
- **`scripts/scrape-ssga-pe.js`** — downloads 8 SSGA sector fact-sheet PDFs (`factsheet-emea-en_gb-<etf>.pdf`), parses with `pdf-parse` v2, POSTs to `/ingest/sector-valuation`. Ran: **8/8 sectors ingested** (XLK 29.14, XLV 17.65, XLF 14.76, XLE 16.95, XLP 19.61, XLI 25.66, XLY 25.26, XLC 15.58).
- **`sector-factor-builder`** — now also reads `SECTOR_VALUATION_monthly`; computes `valuation_sigma` as z-score of latest vs 12m rolling (activates at N≥3 months, null today).
- **`earn_momentum`** — already present in sector-factor-builder code; re-triggered post-Sprint-6 eps_rev_4w fix → **now 8/8** (`mean(eps_rev_4w)` across constituents).
- **`/query/returns-vol?days=60`** — new ingestor endpoint; per-ticker stdev of daily returns, single-query response.
- **`bootstrapStyleTilts()`** now consumes `/api/returns-vol` → **Low-vol tilt = -0.11** (portfolio slightly higher-vol than 2% baseline).
- **Layer 2 sector grid** — dropped `Flow` column entirely (was null-only, blocked permanently). Grid is now 6 columns: Sector / Fit / Earn / Val / RS / Stance.
- **`stock-factor-builder`** — added best-effort Yahoo `query1.finance.yahoo.com/v7/finance/quote` fetch for `short_pct_float`. Yahoo blocks Cloudflare worker egress (expected) → field stays null. Mechanism ready; `short_pct_float` will activate if Yahoo policy changes or a different data source is added.

**Post-Sprint-9 coverage**:
- Sector grid: 4/5 numeric columns populated (all except `valuation_sigma`, which needs 2 more monthly SSGA scrapes to cross the N≥3 threshold).
- Style tilts: **4/5 populated** (Quality still waits on Piotroski backfill via AV IS/BS/CF passes).
- Stock factors: `short_pct_float` 0/25 (Yahoo blocked); everything else unchanged.

**Still out of scope** (no further sprint planned): `flow_5d` (no free flow feed), CSV upload UI, portfolio optimizer. `valuation_sigma` and `short_pct_float` auto-populate organically as data accrues.

### Sprint 9.1 — Early-activation + Ghost wipe + Live validation  ✅ **DONE 2026-04-19**

- **`flow_5d` ghost wiped**: migration 0029 drops `SECTOR_FLOWS_daily`. `flow_5d` removed from `STANCE_WEIGHTS`, `stanceInputs`, INSERT clauses, dashboard stubs, and `sector-trend-long` SELECT. Dead endpoints `/ingest/sector-flows` and `/query/sector-flows` deleted. The column itself stays on the table (D1 can't DROP COLUMN cleanly) but is never written or read — eternal NULL, invisible to all code paths.
- **`valuation_sigma` activates today** via cross-sectional z-score: `(this sector's forward P/E − median of all 8 sectors' P/E) / stdev`. Uses SSGA's clean weighted-harmonic sector P/E (preferred over constituent-median which got skewed by BA outlier). Migration 0030 adds `valuation_sigma_method` column ("xsect" or "rolling") for audit. Falls back to the Sprint-9 rolling 12m z-score at N≥3 monthly SSGA snapshots (~June 2026).
- **Today's valuation sigmas**: Technology +1.95σ (rich), Industrial +1.31σ, ConsDisc +1.23σ, Staples +0.18σ, Healthcare -0.18σ, Energy -0.31σ, Communication -0.57σ, Finance -0.72σ (cheap). Matches intuition.
- **Attribution threshold lowered N≥5 → N≥2**: one day of active return now produces a 4-bucket waterfall. Activates tomorrow once today's NAV has a predecessor. Response header `X-Attribution-Days: <n>` exposed for UI labeling.
- **Calibration always renders the expected-prior curve** (5 reference points, 0.20→0.80 hit rate by conviction). Actual dots appear per bucket only when closed-trades data (n≥3) exists. Empty-state banner replaced with inline "actuals populate as trades close" note.
- **`scripts/validate-live.js`** — new pass/fail health-check script. 7 checks across macro, sector-factors, stock-factors, NAV, positions, sector-valuation. Exit 0 on all-pass. Expected pending items (Piotroski) tagged ⏳ but don't fail the run.
- **Dashboard**: sector grid shows all 4 numeric columns populated (Fit / Earn / Val / RS); Val column is the new x-sect σ. Waterfall empty-state text updated to "Need 2+ days of NAV history — bars activate tomorrow." Calibration shows the expected prior curve with the actuals note.

**Numerical data chapter closed.** Every dashboard number is either live, progressively enriching, or has an honest "awaits data" marker with a deterministic ETA. Remaining work (Sprint 10+): narrative wiring (news / press / SEC citations inside the gpt-5 thesis prompts).

### Sprint 6 — Historical backfill (pre-initialization)  ✅ **DAY-1 DONE 2026-04-19**

**Day-1 status** (2026-04-19):
- `scripts/backfill-prices.js` ✅ — 36/37 symbols × 500 bars each = 18 000 rows ingested (BRK.B only symbol that returned 0 bars from Polygon free tier)
- `scripts/backfill-earnings.js` ✅ — 100 rows (4 quarters × 25 tickers)
- `scripts/backfill-recs.js` ✅ — 100 rows (4 monthly buckets × 25 tickers)
- `stock-factor-builder` rec-delta logic rewritten (monthly-bucket baseline); SQL filter widened 45d → 75d
- `fetch-fundamentals.js` — `--pass=OVERVIEW|IS|BS|CF|ALL` CLI flag added; OVERVIEW pass complete (25/25)
- Builders re-triggered; **Layer 2 = 5/6, Layer 3 = 8/9, RRG + scatter fully populated**
- Still null: `piotroski_f` (awaits Day 2/3/4 AV IS/BS/CF passes)

**Day-2/3/4 remaining** (user runs at their convenience — AV free-tier cap resets daily):
- [ ] Day 2: `node src/steps/fetch-fundamentals.js --pass=IS`
- [ ] Day 3: `node src/steps/fetch-fundamentals.js --pass=BS`
- [ ] Day 4: `node src/steps/fetch-fundamentals.js --pass=CF` → re-trigger stock-factor-builder → `piotroski_f` populates



**Problem**: Sprints 1–4 shipped the pipeline, but most numeric factors (`mom_12_1`, `rs_vs_sector_3m`, `rs_ratio`, `rs_momentum`, `rel_strength_13w`, `breadth_above_200dma`, `piotroski_f`, improved `sue`) are null because PRICE_01_Daily has only ~2 days of history and `fetch-fundamentals.js` hasn't run with the Sprint 1 IS/BS/CF extensions. Organic backfill reaches ~85% field coverage around **2026-07-15** (≈90 trading days). This sprint compresses that to ~1 focused day by seeding D1 with historical data from the same APIs the daily pipeline already uses.

**Goal**: go from ~40% numeric coverage today to ~85–92% within 1 working day, then full coverage within 4 days (AV daily-cap gates Piotroski).

- [ ] **`scripts/backfill-prices.js`** — call Polygon `/v2/aggs/ticker/{T}/range/1/day/{from}/{to}` for 2 years per symbol (25 tickers + 12 ETFs + SPY = 37 calls at 5/min ≈ 8 min). POST each batch to `/ingest/prices`.
  - **Unlocks**: `mom_12_1`, `rs_vs_sector_3m`, `rs_ratio`, `rs_momentum`, `rel_strength_13w`, `breadth_above_200dma` — all immediately after the next `stock-factor-builder` + `sector-factor-builder` run.
- [ ] **`scripts/backfill-earnings.js`** — Finnhub `/stock/earnings?symbol=X&limit=16` for 16 past quarters per ticker (25 calls, ~30s). POST to `/ingest/earnings`.
  - **Unlocks**: `sue` with a properly estimated σ (current fallback returns null with <3 surprises).
- [ ] **`scripts/backfill-recs.js`** — Finnhub `/stock/recommendation?symbol=X` returns **monthly** bucket history (12 months). POST to `/ingest/recommendations`.
  - **Unlocks**: partial — see logic rewrite below.
- [ ] **Logic rewrite in `workers/stock-factor-builder/src/worker.js`** — `computeRecommendationDeltas()` currently looks for snapshots ~20 calendar days apart; Finnhub only supplies monthly buckets. Change baseline selection to "one bucket back" from latest, independent of day-gap threshold. No API change; just adapt the delta-finder.
  - **Unlocks**: `eps_rev_4w`, `rev_breadth_4w`.
- [ ] **Run `src/steps/fetch-fundamentals.js`** once with Sprint 1's 4-endpoint extensions (OVERVIEW + IS + BS + CF). Piotroski feedstock lands in FUND_01 via migration 0022 columns.
  - **Constraint**: Alpha Vantage free tier caps at 25 requests/day; 4 endpoints × 25 tickers = 100 calls → stagger across 4 days (OVERVIEW day 1, IS day 2, BS day 3, CF day 4) OR pay for AV premium ($50/mo) for single-day completion.
  - **Unlocks**: `piotroski_f`.
- [ ] **Backfill `MACRO_STATE_indicators`** via FRED (already used by beta-macro-processor) — trivial, decades of history available. Enables Sprint 5's `/query/indicator-history` endpoint meaningfully.
- [ ] Smoke test: re-trigger `stock-factor-builder` + `sector-factor-builder`; verify `/query/stock-factors` has non-null `mom_12_1` / `rs_vs_sector_3m` for all 25 tickers; `/query/sector-factors` has non-null `rs_ratio` / `rs_momentum` / `rel_strength_13w` / `breadth_above_200dma` for all 8 sectors.

**Still null after Sprint 6** (acknowledged and OUT of scope):
- `valuation_sigma` — needs 252d of rolling sector-P/E history; no free source for historical fwd P/E. Reconstructable via P÷E decomposition but requires assumptions. Wait for organic accumulation.
- `flow_5d` — no `etf-flows-fetcher` built. Blocked on Finnhub `/etf/profile` coverage uncertainty and SSGA React-rendered pages (deferred in Sprint 2).
- Trade-ledger fields (PM tab, Layer 4 KPI strip, Layer 5 attribution, style tilts) — orthogonal problem, not backfillable from public APIs.

**Effort estimate**: ~1 focused day (0.5 day of scripting, 0.5 day of running + verification). AV cap may push Piotroski completion to day +4.

**Expected coverage post-Sprint-6**:
- Layer 2 sector grid: 5/6 numeric columns populated (only `flow` null)
- Layer 3 stock shortlist: 7/9 or 9/9 depending on whether `valuation_sigma` has caught up
- RRG chart: fully populated
- Scatter chart: fully populated

---

## 9. Sprint 1 plan-mode brief

When user says "enter plan mode for Sprint 1":

### Objective
Get industry-standard stock factors (Fwd P/E, Rel P/E σ, EPS Rev 4w, Rev Breadth, SUE, 12-1 Mom, RS vs sector, Piotroski F, days-to-catalyst) computed daily and queryable via `/query/stock-factors`.

### Scope (8 tasks)

1. **`workers/price-fetcher/` config update**
   - Read current ETF list, add XLY, XLC, XLB, XLU, XLRE
   - Verify tickers land in `PRICE_01_Daily` after next run

2. **Inspect `fundamentals-fetcher`** (local script — find it, user said it runs locally)
   - Confirm AV calls: OVERVIEW, INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW
   - If missing BS/CF, add them
   - Verify FUND_01 schema has fields for Piotroski inputs; if not, migration to add

3. **Bootstrap peers mapping** — `scripts/bootstrap-peers.js`
   - Read 25 tickers from PORTFOLIO_01_Holdings or static list
   - Call FMP `/stock_peers` per ticker
   - Save `config/peers-mapping.json`: `{ "UNH": { "sector": "Healthcare", "peers": ["CI","HUM","ELV",...] } }`
   - One-time run, not a worker

4. **Migration `0022_add_stock_factors_table.sql`**
   - Schema exactly as in §5 Phase 3.1 of this doc
   - Add to `workers/portfolio-ingestor/migrations/`

5. **Build `workers/stock-factor-builder/`**
   - Clone structure of `workers/assessment-engine/`
   - Read inputs, compute 9 factors per ticker per day
   - POST to `/ingest/stock-factors`
   - Wave: 500 (after fetchers, before assessment-engine — or parallel to it)

6. **Add endpoints to `worker.js`**
   - `POST /ingest/stock-factors` (batch upsert)
   - `GET /query/stock-factors?ticker=&date=&days=` (read with optional filters)
   - Match idempotency pattern of other `/ingest` endpoints (hash `ticker|date`)

7. **Wire into `job-engine-workflow`**
   - Add stock-factor-builder to the daily wave graph
   - Requires: price-fetcher, fundamentals-fetcher, earnings-fetcher complete

8. **Smoke test**
   - Manually trigger run
   - Query `/query/stock-factors?ticker=UNH` — expect 1 row with all 9 factors populated
   - Query `/query/stock-factors?date=2026-04-18` — expect 25 rows

### Expected deliverable
All 25 portfolio tickers have a daily row in `STOCK_FACTORS_daily` with 9 industry-standard factor values. Queryable end-to-end.

### Estimated real effort
Half to full day of focused work.

---

## 10. Next session kickoff

**User will say something like**: "enter plan mode for Sprint 1"

**Claude should**:
1. Read this doc (`docs/PIPELINE_BUILD_PLAN.md`)
2. Read the 8 tasks in §9 above
3. Enter plan mode with the Sprint 1 scope
4. Before coding: verify `workers/price-fetcher/` structure, find `fundamentals-fetcher` local script, read existing migration patterns
5. Present a concrete implementation plan for user approval
6. Execute after approval, ticking off items in §8 as completed
