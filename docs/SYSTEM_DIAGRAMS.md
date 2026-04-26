# Hedge Portfolio — Visual Pipeline Atlas

**Companion to** `docs/SYSTEM_REPORT.md`. This document contains one diagram per dashboard feature, each showing the full chain from raw source → code module → D1 table → agent → dashboard field.

**How to read each cluster.** Every node is labeled with a prefix:

```
[R<n>]  Raw external source (API, RSS, file, IR page)
[C<n>]  Code module (Node script or Cloudflare Worker that scrapes / writes)
[T<n>]  D1 database table
[A<n>]  Processing agent (LLM call or deterministic builder)
[D<n>]  Dashboard field (visible thing on screen)
```

Numbering is **local to each cluster**. R1 in cluster 1 is unrelated to R1 in cluster 2. Each diagram is self-contained — read it, then read the reference key directly below it.

Flow direction is **top-down**. Arrows show data movement only; control flow (cron triggers, HTTP calls) is described in the key, not on the arrow.

---

## Index of clusters

| #  | Feature                                        | Tab            |
|----|-----------------------------------------------|----------------|
| 1  | Regime card — verdict + lede + 4 macro chips   | Portfolio · L1 |
| 2  | Net-exposure gauge                             | Portfolio · L1 |
| 3  | Style tilts                                    | Portfolio · L1 |
| 4  | Sector table + RRG + allocation bar            | Portfolio · L2 |
| 5  | Stock shortlist + scatter                      | Portfolio · L3 |
| 6  | Portfolio book — KPIs, NAV curve, positions, weights, decision trail | PM · Portfolio · L4 |
| 7  | Attribution waterfall                          | Portfolio · L5 |
| 8  | Calibration + closed trades                    | Portfolio · L5 |
| 9  | Calendar (events grid)                         | Calendar       |
| 10 | News stream                                    | News           |
| 11 | Top movers                                     | News           |
| 12 | Regime detail — 12-indicator board + events    | Portfolio · regime detail view |

\pagebreak

## Cluster 1 · Regime card — verdict + lede + 4 macro chips

```
EXTERNAL SOURCES
┌──────────────────────────────────────────────────────────────────┐
│ [R1] FRED API   — DGS10, DGS2, FEDFUNDS, FED_TARGET_UPPER/LOWER  │
│ [R2] BLS API    — CPI_HEADLINE, CPI_CORE, NFP, UNEMP             │
│ [R3] Fed RSS    — FOMC statement metadata + body                 │
│ [R4] Finnhub    — economic calendar (CPI/NFP/PMI release dates)  │
│ [R5] Polygon    — SPY daily bars (regime tension check)          │
│ [R6] FRED, BLS, UMich, CFTC, Fed RSS — re-fetched for BETA_03    │
└──────────────────────────────────────────────────────────────────┘
         │                  │                 │              │
         ▼                  ▼                 ▼              ▼
CODE MODULES (writers)
┌──────────────────────────────────────────────────────────────────┐
│ [C1] macro-state-fetcher          worker · cron 00:10 UTC        │
│      pulls R1 + R2 → T1                                          │
│ [C2] fomc-statement-fetcher       worker · cron 00:00 UTC        │
│      pulls R3 → T2                                               │
│ [C3] economic-calendar-fetcher    worker · cron 00:00 UTC        │
│      pulls R4 → T3                                               │
│ [C4] price-fetcher                worker · job-engine            │
│      pulls R5 → T5                                               │
│ [C5] macro/index.js               Node · pipeline step 5         │
│      pulls R6 → POST /ingest/macro → T4                          │
└──────────────────────────────────────────────────────────────────┘
         │                  │                 │              │
         ▼                  ▼                 ▼              ▼
DATABASE
┌──────────────────────────────────────────────────────────────────┐
│ [T1] MACRO_STATE_indicators                                      │
│ [T2] MACRO_STATE_fomc                                            │
│ [T3] MACRO_STATE_calendar                                        │
│ [T4] BETA_03_Macro                                               │
│ [T5] PRICE_01_Daily (SPY rows)                                   │
└──────────────────────────────────────────────────────────────────┘
         │                                                          
         ▼                                                          
AGENTS
┌──────────────────────────────────────────────────────────────────┐
│ [A1] macro-intelligence-builder · Call A "Trend"   GPT-5         │
│      reads T1+T2+T5 (8w window)            ──────► T6            │
│ [A2] macro-intelligence-builder · Call B "Today"   GPT-5         │
│      reads A1 + today T5                   ──────► T6            │
│ [A3] macro-intelligence-builder · Call C "Reco"    GPT-5         │
│      reads A1 + A2                         ──────► T6            │
│                                                                  │
│ [A4] narrator/regime · identification              GPT-5         │
│      reads T1+T2+T3+T6                     ──────► T7            │
│ [A5] narrator/regime · recommendation              GPT-5         │
│      reads A4 + T3                         ──────► T7            │
│ [A6] narrator/regime · lede                        GPT-4o-mini   │
│      reads A4 + A5                         ──────► T7            │
└──────────────────────────────────────────────────────────────────┘
         │                                                          
         ▼                                                          
DERIVED DB
┌──────────────────────────────────────────────────────────────────┐
│ [T6] BETA_10_Daily_macro     (regime, drivers, scenarios, tilt) │
│ [T7] NARRATIVE_01_Content    (entity_type='regime', 4 rows)      │
└──────────────────────────────────────────────────────────────────┘
         │                                                          
         ▼                                                          
DASHBOARD
┌──────────────────────────────────────────────────────────────────┐
│ [D1] Layer 1 verdict <h2 class="layer-verdict">                  │
│      "Late-cycle · cautious-bullish — quality leads"             │
│      ← bootstrapRegimeSignals → /api/daily-macro → T6            │
│      ← overlaid by /api/narrative regime lede → T7 (if fresh)    │
│                                                                  │
│ [D2] Layer 1 lede <p class="layer-lede">                         │
│      ← narrator/regime lede (A6) via T7                          │
│      ← falls back to T6 trend.drivers + recommendation.headline  │
│                                                                  │
│ [D3] 4 chips: 10Y / 2Y / Core CPI / Fed Funds                    │
│      ← bootstrapRegimeSignals → /api/indicator-history → T1      │
└──────────────────────────────────────────────────────────────────┘
```

**Reference**

| Tag | What                                                                            |
|-----|---------------------------------------------------------------------------------|
| R1  | FRED API · `api.stlouisfed.org/fred/series/observations`                        |
| R2  | BLS API · `api.bls.gov/publicAPI/v2/timeseries/data/`                           |
| R3  | Fed Reserve press monetary RSS · `federalreserve.gov/feeds/press_monetary.xml`  |
| R4  | Finnhub economic calendar · `finnhub.io/api/v1/calendar/economic`               |
| R5  | Polygon · `api.polygon.io/v2/aggs/ticker/SPY/...`                               |
| R6  | Same APIs as R1+R2 + UMich Sentiment + Yahoo VIX (re-fetched at pipeline time)  |
| C1  | `workers/macro-state-fetcher/src/worker.js` · daily 00:10 UTC                   |
| C2  | `workers/fomc-statement-fetcher/src/worker.js` · daily 00:00 UTC                |
| C3  | `workers/economic-calendar-fetcher/src/worker.js` · daily 00:00 UTC             |
| C4  | `workers/price-fetcher/src/worker.js` · called by job-engine-workflow           |
| C5  | `macro/index.js` · invoked by `src/steps/ingest-macro.js` at pipeline step 5    |
| T1  | `MACRO_STATE_indicators` (migration 0019)                                       |
| T2  | `MACRO_STATE_fomc` (migration 0019)                                             |
| T3  | `MACRO_STATE_calendar` (migration 0032)                                         |
| T4  | `BETA_03_Macro`                                                                 |
| T5  | `PRICE_01_Daily`                                                                |
| T6  | `BETA_10_Daily_macro` (one row per day; columns: structure, summary)            |
| T7  | `NARRATIVE_01_Content` (rows: entity='regime', kind in {current_reading, identification, recommendation, lede}) |
| A1  | `workers/macro-intelligence-builder/src/worker.js` — Call A · GPT-5 · prompt §6.8 of SYSTEM_REPORT |
| A2  | same file — Call B · GPT-5                                                      |
| A3  | same file — Call C · GPT-5                                                      |
| A4  | `workers/narrator/regime/identification.js` · GPT-5 · prompt §6.9              |
| A5  | `workers/narrator/regime/recommendation.js` · GPT-5 · prompt §6.10             |
| A6  | `workers/narrator/regime/lede.js` · GPT-4o-mini · prompt §6.11                 |
| D1  | `dashboard/index.html:1663` `<h2 class="layer-verdict">` · `dashboard/app.js:642 bootstrapRegimeSignals` |
| D2  | `dashboard/index.html:1666` `<p class="layer-lede">` · same bootstrap          |
| D3  | `dashboard/index.html:1677` `#regimeSignals` · `app.js renderRegimeSignals`    |

\pagebreak

## Cluster 2 · Net-exposure gauge

```
EXTERNAL SOURCES
┌──────────────────────────────────────────────────────────────────┐
│ [R1] User-entered trades (manual via dashboard form)              │
│ [R2] Polygon — daily price bars for held tickers                  │
└──────────────────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
CODE MODULES
┌──────────────────────────────────────────────────────────────────┐
│ [C1] dashboard/server.js · POST /api/trades → /ingest/trades     │
│      (R1 → T1)                                                   │
│ [C2] price-fetcher worker — pulls R2 → T2                        │
│ [C3] position-builder worker · job-engine                        │
│      reads T1 + T2  ────────────────────► T3                     │
│ [C4] nav-builder worker · job-engine                             │
│      reads T3                            ────► T4                │
└──────────────────────────────────────────────────────────────────┘
DATABASE
┌──────────────────────────────────────────────────────────────────┐
│ [T1] TRADE_01_Ledger        (one row per buy/sell)                │
│ [T2] PRICE_01_Daily                                              │
│ [T3] POSITION_01_Daily      (qty, avg_cost, market_value, weight) │
│ [T4] NAV_01_Daily           (gross_long, gross_short, net_value)  │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
DASHBOARD
┌──────────────────────────────────────────────────────────────────┐
│ [D1] Net-exposure gauge SVG #gaugeSvg                             │
│      ← bootstrapRegimeSignals → /api/nav?limit=1 → T4             │
│      ← computes (gross_long − gross_short) / net_value × 100      │
│      ← renderGauge() draws half-circle, value clamped to [0,100]  │
└──────────────────────────────────────────────────────────────────┘
```

**Reference**

| Tag | What                                                                       |
|-----|----------------------------------------------------------------------------|
| R1  | Trades entered manually in the dashboard or via `scripts/seed-trades.js`   |
| R2  | Polygon.io                                                                 |
| C1  | `dashboard/server.js` · `POST /api/trades` proxy → `portfolio-ingestor /ingest/trades` |
| C2  | `workers/price-fetcher/src/worker.js`                                      |
| C3  | `workers/position-builder/src/worker.js` · runs daily via `job-engine-workflow` |
| C4  | `workers/nav-builder/src/worker.js` · runs daily after position-builder    |
| T1  | `TRADE_01_Ledger` (migration 0025)                                         |
| T2  | `PRICE_01_Daily`                                                           |
| T3  | `POSITION_01_Daily` (migration 0026)                                       |
| T4  | `NAV_01_Daily` (migration 0026)                                            |
| D1  | `dashboard/index.html:1681` `<svg id="gaugeSvg">` · `app.js renderGauge()` |

**No LLM in this chain.** Everything is deterministic arithmetic.

\pagebreak

## Cluster 3 · Style tilts (Quality, Low vol, Growth, Value, Momentum)

```
EXTERNAL SOURCES
┌──────────────────────────────────────────────────────────────────┐
│ [R1] Polygon                — daily prices (returns-vol input)    │
│ [R2] Alpha Vantage          — OVERVIEW, IS, BS, CF (Piotroski)   │
│ [R3] Finnhub                — analyst recommendations             │
│ [R4] User trades + prices   — drives positions                    │
│ [R5] SEC EDGAR              — 10-Q filings (fiscal_period_ending) │
└──────────────────────────────────────────────────────────────────┘
         │            │           │            │           │
         ▼            ▼           ▼            ▼           ▼
CODE MODULES
┌──────────────────────────────────────────────────────────────────┐
│ [C1] price-fetcher                       → T1                     │
│ [C2] src/steps/fetch-fundamentals.js     → T2                     │
│      (event-driven on R5: SEC 10-Q + AV index lag check)          │
│ [C3] (FUND_03_Recommendations writer — currently sparse)→ T3     │
│ [C4] position-builder                    → T4                     │
│ [C5] stock-factor-builder                                         │
│      reads T1, T2, T3 → computes 9 factors per ticker → T5        │
└──────────────────────────────────────────────────────────────────┘
DATABASE
┌──────────────────────────────────────────────────────────────────┐
│ [T1] PRICE_01_Daily                                              │
│ [T2] FUND_01_Fundamentals (Piotroski feedstock)                  │
│ [T3] FUND_03_Recommendations                                     │
│ [T4] POSITION_01_Daily                                           │
│ [T5] STOCK_FACTORS_daily (piotroski_f, eps_rev_4w, rel_pe_sigma, │
│                           mom_12_1, …)                            │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
AGENTS
┌──────────────────────────────────────────────────────────────────┐
│ [A1] dashboard/app.js · bootstrapStyleTilts()                    │
│      reads T4 + T5 + /api/returns-vol (computed live from T1)    │
│      computes 5 weighted-avg tilts:                              │
│        Quality   = avg ((piotroski_f / 9 − 0.5) × 2)             │
│        Low vol   = (0.020 − avg(daily_vol)) / 0.010              │
│        Growth    = avg(eps_rev_4w × 20)                          │
│        Value     = avg(−rel_pe_sigma / 2)                        │
│        Momentum  = avg(mom_12_1)                                 │
│      writes DATA.regime.styleTilts (in-memory)                   │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
DASHBOARD
┌──────────────────────────────────────────────────────────────────┐
│ [D1] Layer 1 #tiltRows — 5 horizontal bars centered on 0,        │
│      rendered by app.js renderTilts()                             │
└──────────────────────────────────────────────────────────────────┘
```

**Reference**

| Tag | What                                                                       |
|-----|----------------------------------------------------------------------------|
| R1  | Polygon daily bars                                                         |
| R2  | Alpha Vantage OVERVIEW + INCOME_STATEMENT + BALANCE_SHEET + CASH_FLOW       |
| R3  | Finnhub `/stock/recommendation`                                            |
| R4  | Same as cluster 2 — manual trades + prices                                 |
| R5  | SEC EDGAR `/submissions/CIK{cik}.json` — gates whether AV is fetched today |
| C1  | `workers/price-fetcher/src/worker.js`                                      |
| C2  | `src/steps/fetch-fundamentals.js` · pipeline step 7b · event-driven smart-fetch |
| C3  | (No daily writer for FUND_03 today — recommendation freshness is sparse)   |
| C4  | `workers/position-builder/src/worker.js`                                   |
| C5  | `workers/stock-factor-builder/src/worker.js`                               |
| T1  | `PRICE_01_Daily`                                                           |
| T2  | `FUND_01_Fundamentals` (incl. fiscal_period_ending added in migration 0034) |
| T3  | `FUND_03_Recommendations`                                                  |
| T4  | `POSITION_01_Daily`                                                        |
| T5  | `STOCK_FACTORS_daily` (migration 0022)                                     |
| A1  | `dashboard/app.js · bootstrapStyleTilts()` — runs in browser, no LLM        |
| D1  | `dashboard/index.html:1686` `<div id="tiltRows">` · `app.js renderTilts()` |

**Known holes (see SYSTEM_REPORT §8):** 22/25 tickers have `piotroski_f = NULL` until smart-fetch back-fills (~5 nights). `short_pct_float` permanently NULL (Yahoo blocks Cloudflare egress). `eps_rev_4w` exact-zero on tickers with no recent recommendation changes — treated as "no signal".

\pagebreak

## Cluster 4 · Sector landscape — table, RRG, allocation bar, lede

```
EXTERNAL SOURCES
┌──────────────────────────────────────────────────────────────────┐
│ [R1] Polygon — daily prices for 8 SPDR sector ETFs (XLK, XLY,    │
│                XLC, XLF, XLE, XLV, XLP, XLI) and constituents    │
│ [R2] Alpha Vantage — fundamentals (forward_pe, sector mapping)   │
│ [R3] BETA_10_Daily_macro produced by cluster 1 (regime context)  │
│ [R4] BETA_12_News_digest from cluster 10 (news per sector)       │
└──────────────────────────────────────────────────────────────────┘
         │            │            │            │
         ▼            ▼            ▼            ▼
CODE MODULES
┌──────────────────────────────────────────────────────────────────┐
│ [C1] price-fetcher          → T1                                  │
│ [C2] stock-factor-builder   → T2  (used as input below)           │
│ [C3] sector-factor-builder                                        │
│      reads T1 + T2 → computes 8 sector rows per day               │
│      ─────────────────────────────────────────► T3               │
│ [C4] sector-trend-long      LLM · GPT-5 · reads ALPHA_01_Reports  │
│      ─────────────────────────────────────────► T4               │
│ [C5] sector-trend-short     LLM · GPT-5 · event-driven            │
│      reads T3 + T4 + ticker-trend-short  ──► T5                   │
└──────────────────────────────────────────────────────────────────┘
DATABASE
┌──────────────────────────────────────────────────────────────────┐
│ [T1] PRICE_01_Daily                                              │
│ [T2] STOCK_FACTORS_daily                                         │
│ [T3] SECTOR_FACTORS_daily  (regime_fit, earn_momentum,           │
│                             valuation_sigma, rel_strength_13w,    │
│                             rs_ratio, rs_momentum, stance, etc.)  │
│ [T4] SECTOR_TREND_long                                           │
│ [T5] SECTOR_TREND_short                                          │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
AGENTS
┌──────────────────────────────────────────────────────────────────┐
│ [A1] narrator/sector · identification          GPT-5 (per sector) │
│ [A2] narrator/sector · recommendation          GPT-5              │
│ [A3] narrator/sector · lede                    GPT-4o-mini        │
│      A1+A2+A3 read T3 + T5 + R3 + R4 ──► T6                       │
│                                                                  │
│ [A4] narrator/sector-landscape · identification  GPT-5            │
│ [A5] narrator/sector-landscape · recommendation  GPT-5            │
│ [A6] narrator/sector-landscape · lede            GPT-4o-mini      │
│      A4+A5+A6 read all 8 sectors of T3 + T5 ──► T6                │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
DERIVED DB
┌──────────────────────────────────────────────────────────────────┐
│ [T6] NARRATIVE_01_Content (entity_type ∈ {sector:<X>,             │
│                            sector-landscape}, 4 kinds each)       │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
DASHBOARD
┌──────────────────────────────────────────────────────────────────┐
│ [D1] Sector table 8 rows · 5 score columns + stance              │
│      ← bootstrapPortfolioTab → /api/sector-factors → T3           │
│      colours per-column thresholds; val column INVERTED (cheap=green) │
│ [D2] RRG quadrant chart                                          │
│      ← rs_ratio × rs_momentum from T3, dynamic-scale auto-fit     │
│ [D3] Allocation bar (sector weights)                             │
│      ← derived from T3 weight column (currently rebalance proxy)  │
│ [D4] Layer 2 lede ("OW / UW")                                    │
│      ← narrator/sector-landscape lede (A6) via /api/narrative→T6  │
└──────────────────────────────────────────────────────────────────┘
```

**Reference**

| Tag | What                                                                 |
|-----|----------------------------------------------------------------------|
| R1–R4 | as named above                                                     |
| C1  | `workers/price-fetcher/src/worker.js`                                |
| C2  | `workers/stock-factor-builder/src/worker.js`                         |
| C3  | `workers/sector-factor-builder/src/worker.js`                        |
| C4  | `workers/sector-trend-long/src/worker.js` · GPT-5                    |
| C5  | `workers/sector-trend-short/src/worker.js` · GPT-5                   |
| T3  | `SECTOR_FACTORS_daily` (migration 0023)                              |
| T4  | `SECTOR_TREND_long` (migration 0024)                                 |
| T5  | `SECTOR_TREND_short` (migration 0024)                                |
| T6  | `NARRATIVE_01_Content` (migration 0031)                              |
| A1–A6 | `workers/narrator/sector/*.js` and `.../sector-landscape/*.js` · prompts §6.9-6.11 |
| D1  | `dashboard/index.html` sector table body · `app.js renderSectorTable()` |
| D2  | `dashboard/index.html #rrgSvg` · `app.js renderRRG()`                |
| D3  | `dashboard/index.html #allocBar` · `app.js renderAllocBar()`         |
| D4  | `dashboard/index.html #layer2 .layer-lede` · overlaid by bootstrapRegimeSignals |

\pagebreak

## Cluster 5 · Stock shortlist + scatter

```
EXTERNAL SOURCES
┌──────────────────────────────────────────────────────────────────┐
│ [R1] Polygon          — prices                                   │
│ [R2] Alpha Vantage    — OVERVIEW + IS + BS + CF                  │
│ [R3] Finnhub          — analyst recs + earnings surprises         │
│ [R4] SEC EDGAR        — 10-Q filings (gates AV refresh)          │
└──────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
CODE MODULES
┌──────────────────────────────────────────────────────────────────┐
│ [C1] price-fetcher                              → T1              │
│ [C2] src/steps/fetch-fundamentals.js (event)    → T2              │
│ [C3] earnings-fetcher / FUND_03 writer          → T3, T4          │
│ [C4] stock-factor-builder                                         │
│      reads T1+T2+T3+T4 → 9 factors per ticker → T5                │
└──────────────────────────────────────────────────────────────────┘
DATABASE
┌──────────────────────────────────────────────────────────────────┐
│ [T1] PRICE_01_Daily                                              │
│ [T2] FUND_01_Fundamentals                                        │
│ [T3] FUND_02_Earnings                                            │
│ [T4] FUND_03_Recommendations                                     │
│ [T5] STOCK_FACTORS_daily                                         │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
AGENTS
┌──────────────────────────────────────────────────────────────────┐
│ [A1] narrator/stock-landscape · identification   GPT-5            │
│ [A2] narrator/stock-landscape · recommendation   GPT-5            │
│ [A3] narrator/stock-landscape · lede             GPT-4o-mini      │
│      reads ranked T5 + per-ticker SIGNAL_01_Assessment ──► T6     │
└──────────────────────────────────────────────────────────────────┘
DERIVED DB
┌──────────────────────────────────────────────────────────────────┐
│ [T6] NARRATIVE_01_Content (entity_type='stock-landscape')        │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
DASHBOARD
┌──────────────────────────────────────────────────────────────────┐
│ [D1] Stock-group rows (per-sector lists)                         │
│      ← /api/stock-factors → T5                                    │
│      ← classify() colors columns (exact-zero = neutral)           │
│ [D2] Scatter chart  EPS-Rev × Rel-P/E σ                           │
│      ← T5 — skips (0,0) sentinel; sector-color fallback           │
│ [D3] Layer 3 lede                                                 │
│      ← narrator/stock-landscape lede via T6                       │
└──────────────────────────────────────────────────────────────────┘
```

**Reference**

| Tag | What                                                                  |
|-----|-----------------------------------------------------------------------|
| C2  | Smart-fetch: skips a ticker if `T2.fiscal_period_ending ≥` SEC's latest 10-Q period |
| C4  | Computes: `fwd_pe`, `rel_pe_sigma`, `eps_rev_4w`, `rev_breadth_4w`, `sue`, `mom_12_1`, `rs_vs_sector_3m`, `piotroski_f`, `days_to_catalyst` |
| A1–A3 | `workers/narrator/stock-landscape/*.js` · prompts §6.9 (stock-landscape variant) |
| D1  | `dashboard/index.html #stockGroups` · `app.js renderStockGroups()`    |
| D2  | `dashboard/index.html #scatterSvg` · `app.js renderScatter()`         |
| D3  | `dashboard/index.html #layer3 .layer-lede`                            |

**Note:** `narrator/stock` (per-ticker, not landscape) writes its own rows to T6 used by the **stock entity detail view** when you click a ticker — separate from the Layer 3 grid.

\pagebreak

## Cluster 6 · Portfolio book — KPIs, NAV curve, positions table, weight chart, decision trail

This is the most-shared cluster: PM tab and Portfolio Layer 4 read from the same chain.

```
EXTERNAL SOURCES
┌──────────────────────────────────────────────────────────────────┐
│ [R1] User-entered trades                                         │
│ [R2] Polygon — daily prices for held tickers + SPY               │
│ [R3] BETA_10_Daily_macro (regime — feeds decision trail)          │
│ [R4] STOCK_FACTORS_daily (factors — feeds decision trail)         │
└──────────────────────────────────────────────────────────────────┘
         │            │           │             │
         ▼            ▼           ▼             ▼
CODE MODULES
┌──────────────────────────────────────────────────────────────────┐
│ [C1] /api/trades  → ingestor → T1                                │
│ [C2] price-fetcher                            → T2                │
│ [C3] position-builder                                             │
│      reads T1+T2 → qty × close, weight_pct  → T3                  │
│ [C4] nav-builder                                                  │
│      reads T3 → gross_long, gross_short, net_value, day_pnl  → T4 │
│ [C5] portfolio-ingestor /query/portfolio-targets                  │
│      currently flat 4% per ticker placeholder                     │
└──────────────────────────────────────────────────────────────────┘
DATABASE
┌──────────────────────────────────────────────────────────────────┐
│ [T1] TRADE_01_Ledger                                             │
│ [T2] PRICE_01_Daily                                              │
│ [T3] POSITION_01_Daily                                           │
│ [T4] NAV_01_Daily                                                │
│ [T5] (no targets table — placeholder served by ingestor)         │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
AGENTS
┌──────────────────────────────────────────────────────────────────┐
│ (none in this cluster — all deterministic)                       │
│                                                                  │
│ Decision trail composes from already-fetched data:               │
│ [A0] dashboard/app.js · bootstrapDecisionTrail()                 │
│      reads /api/daily-macro (T6 cluster 1), /api/sector-factors  │
│      (T3 cluster 4), /api/stock-factors (T5 cluster 5);          │
│      picks the ticker with biggest |current − target| gap         │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
DASHBOARD
┌──────────────────────────────────────────────────────────────────┐
│ [D1] PM tab KPI strip                                            │
│      ← /api/nav + /api/positions → T4 + T3                        │
│      ← labels Nd P&L using actual gap between latest 2 NAV rows   │
│ [D2] PM tab NAV curve  (NAV vs SPY benchmark)                    │
│      ← /api/nav (T4) + /api/ticker-history/SPY (T2)               │
│ [D3] PM tab positions table                                       │
│      ← /api/positions → T3                                        │
│ [D4] Layer 4 KPIs (same as D1)                                   │
│ [D5] Layer 4 weight chart (current dot → target dot per ticker)  │
│      ← /api/positions + /api/portfolio-targets (placeholder)      │
│ [D6] Layer 4 decision trail (4 numbered steps)                   │
│      ← composed by bootstrapDecisionTrail (A0 above)              │
└──────────────────────────────────────────────────────────────────┘
```

**Reference**

| Tag | What                                                                 |
|-----|----------------------------------------------------------------------|
| R1  | Manual via dashboard form, or one-shot `scripts/seed-trades.js`     |
| C1  | `dashboard/server.js POST /api/trades` → `portfolio-ingestor`        |
| C2  | `workers/price-fetcher/src/worker.js`                                |
| C3  | `workers/position-builder/src/worker.js`                             |
| C4  | `workers/nav-builder/src/worker.js`                                  |
| C5  | `workers/portfolio-ingestor /query/portfolio-targets` — returns hardcoded 4% per ticker (placeholder until `wealth-distribution` produces real targets) |
| T1–T4 | Tables as named                                                     |
| A0  | `dashboard/app.js bootstrapDecisionTrail()` · in-browser composition |
| D1  | `app.js renderKPIs()` · KPI strip                                    |
| D2  | `app.js renderPMNav()` · `#pmNavSvg`                                 |
| D3  | `app.js renderPMTable()` · `#pmTable`                                |
| D4  | shared with D1                                                       |
| D5  | `app.js renderWeightChart()` · `#weightChart`                        |
| D6  | `app.js renderDecisionTrail()` · `#decisionTrail`                    |

**Note on "1d" labeling.** When `T4.day_pnl_pct` rows are sparse (typical with daily pipeline runs that may skip a day), the label changes from "1d P&L" to "Nd P&L" — the dashboard reads the actual date gap between the two latest NAV rows and tells the user honestly what window the number covers.

\pagebreak

## Cluster 7 · Attribution waterfall (Layer 5)

```
EXTERNAL SOURCES                                       
┌──────────────────────────────────────────────────────────────────┐
│ [R1] Polygon SPY daily bars (benchmark)                          │
│ [R2] User trades + held-ticker prices (drives NAV)               │
└──────────────────────────────────────────────────────────────────┘
         │                         │
         ▼                         ▼
CODE MODULES
┌──────────────────────────────────────────────────────────────────┐
│ [C1] price-fetcher       → T1                                    │
│ [C2] position-builder    → T2                                    │
│ [C3] nav-builder         → T3                                    │
│ [C4] portfolio-ingestor /query/attribution                       │
│      computes live each request:                                 │
│        for each consecutive (NAV_today, NAV_prev) pair:           │
│          active = portfolioRet − spyRet                           │
│        sumRegime += active × 0.40                                 │
│        sumSector += active × 0.30                                 │
│        sumStock  += active × 0.20                                 │
│        sumSizing += active × 0.10                                 │
│      returns 4 rows in basis points                              │
└──────────────────────────────────────────────────────────────────┘
DATABASE
┌──────────────────────────────────────────────────────────────────┐
│ [T1] PRICE_01_Daily (SPY rows)                                   │
│ [T2] POSITION_01_Daily                                           │
│ [T3] NAV_01_Daily                                                │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
DASHBOARD
┌──────────────────────────────────────────────────────────────────┐
│ [D1] Layer 5 #waterfallSvg — 4 bars + total                       │
│      ← /api/attribution (computed at request time)                │
│      ← values in basis points; bp suffix in render                │
│      ← caption: "Proxy split (40/30/20/10) until per-position    │
│        attribution lands"                                         │
└──────────────────────────────────────────────────────────────────┘
```

**Reference**

| Tag | What                                                                 |
|-----|----------------------------------------------------------------------|
| C4  | `workers/portfolio-ingestor/src/worker.js` — `if (path === "/query/attribution")` block. **No worker writes the attribution split**; it is computed on every read. |
| D1  | `app.js renderWaterfall()` · `#waterfallSvg`                          |

**Honest disclaimer:** the 40/30/20/10 split is a fixed proxy until per-position-per-day attribution tables exist. The proxy is documented in the worker comment and the dashboard now prints the caveat directly under the chart.

\pagebreak

## Cluster 8 · Calibration curve + closed trades (Layer 5)

```
EXTERNAL SOURCES
┌──────────────────────────────────────────────────────────────────┐
│ [R1] User trades (must include sells for closed-trade FIFO)       │
│ [R2] Per-trade conviction (manual entry, 1–5)                     │
└──────────────────────────────────────────────────────────────────┘
         │                  │
         ▼                  ▼
CODE MODULES
┌──────────────────────────────────────────────────────────────────┐
│ [C1] /api/trades → /ingest/trades → T1 (with conviction)          │
│ [C2] portfolio-ingestor /query/trades/closed                      │
│      FIFO lot-matches T1 chronologically per ticker;             │
│      emits one row per closed lot                                 │
│ [C3] portfolio-ingestor /query/calibration                       │
│      groups closed trades by conviction bucket (1–5);            │
│      computes hit-rate per bucket if n ≥ 3, else null             │
└──────────────────────────────────────────────────────────────────┘
DATABASE
┌──────────────────────────────────────────────────────────────────┐
│ [T1] TRADE_01_Ledger (with conviction column added in 0027)      │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
DASHBOARD
┌──────────────────────────────────────────────────────────────────┐
│ [D1] Layer 5 #calibSvg                                           │
│      ← /api/calibration (computed live)                           │
│      shows expected-prior dashed line always; populates actuals   │
│      only when n ≥ 3 per bucket                                  │
│ [D2] Layer 5 #tradesList                                         │
│      ← /api/trades/closed                                         │
│      empty-state placeholder when no sells exist                  │
└──────────────────────────────────────────────────────────────────┘
```

**Reference**

| Tag | What                                                                 |
|-----|----------------------------------------------------------------------|
| C2  | `portfolio-ingestor /query/trades/closed` — FIFO lot-matching        |
| C3  | `portfolio-ingestor /query/calibration` — hit-rate bucketing         |
| D1  | `app.js renderCalibration()` · `#calibSvg` (shows empty-state caption "actuals populate as trades close" when no closed trades) |
| D2  | `app.js renderTrades()` · `#tradesList`                               |

**Status:** TRADE_01_Ledger currently has 25 BUY rows (seed) and zero SELL rows, so calibration actuals and closed trades are both empty. By design — populates as the user logs sells.

\pagebreak

## Cluster 9 · Calendar tab (rolling 6-week event grid)

```
EXTERNAL SOURCES
┌──────────────────────────────────────────────────────────────────┐
│ [R1] Finnhub /calendar/economic   — CPI, NFP, PMI, etc.          │
│ [R2] Finnhub earnings calendar    — per-ticker next-earnings     │
│ [R3] Hardcoded FOMC schedule      — from server.js                │
└──────────────────────────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
CODE MODULES
┌──────────────────────────────────────────────────────────────────┐
│ [C1] economic-calendar-fetcher  worker · cron 00:00 UTC          │
│      pulls R1 → T1                                               │
│ [C2] earnings-fetcher worker · job-engine                         │
│      pulls R2 → T2 (FUND_02_Earnings.report_date used downstream) │
│ [C3] portfolio-ingestor /query/earnings-calendar                 │
│      derives next-earnings estimates per ticker from T2 + ALPHA_01_Reports (last filing) │
│ [C4] dashboard/server.js /api/fomc-calendar                      │
│      returns hardcoded list R3                                    │
│ [C5] dashboard/server.js /api/calendar                           │
│      proxies portfolio-ingestor /query/calendar → T1              │
└──────────────────────────────────────────────────────────────────┘
DATABASE
┌──────────────────────────────────────────────────────────────────┐
│ [T1] MACRO_STATE_calendar (event_date, event_code, impact)       │
│ [T2] FUND_02_Earnings                                            │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
DASHBOARD
┌──────────────────────────────────────────────────────────────────┐
│ [D1] Calendar tab #calendarGrid · 6-week grid                    │
│      ← bootstrapCalendar() unions:                                │
│         /api/earnings-calendar (T2 via C3)                        │
│         /api/fomc-calendar     (R3 hardcoded via C4)              │
│         /api/calendar          (T1 via C5)                        │
│      filters to today−14 days … today+28 days                     │
│      renders days with up to 4 events per cell + impact tag       │
└──────────────────────────────────────────────────────────────────┘
```

**Reference**

| Tag | What                                                                 |
|-----|----------------------------------------------------------------------|
| R1  | `finnhub.io/api/v1/calendar/economic`                                |
| R3  | Static FOMC list in `dashboard/server.js`                            |
| C1  | `workers/economic-calendar-fetcher/src/worker.js` · daily 00:00 UTC  |
| C5  | `workers/portfolio-ingestor /query/calendar` (added recently)        |
| D1  | `dashboard/index.html #calendarGrid` · `app.js bootstrapCalendar()` + `renderCalendar()` |

\pagebreak

## Cluster 10 · News stream

```
EXTERNAL SOURCES
┌──────────────────────────────────────────────────────────────────┐
│ [R1] Google News RSS — per ticker (25 queries) + per macro       │
│      category (8 queries)                                         │
│ [R2] Finnhub /company-news — per ticker company news              │
└──────────────────────────────────────────────────────────────────┘
         │                       │
         ▼                       ▼
CODE MODULES
┌──────────────────────────────────────────────────────────────────┐
│ [C1] news-funnel-orchestrator  worker · job-engine               │
│      delegates 3 stages via service bindings:                     │
│        ├── news-funnel-gatherer  pulls R1+R2, dedupes             │
│        ├── news-funnel-filter    33 LLM calls (see A1, A2)        │
│        └── itself: 40 Gemini summary calls (see A3)               │
└──────────────────────────────────────────────────────────────────┘
                                                                    
AGENTS
┌──────────────────────────────────────────────────────────────────┐
│ [A1] news-funnel-filter · ticker prompts    GPT-5-mini × 25       │
│      picks 1–4 most-relevant headlines per ticker                 │
│      assigns sentiment + magnitude (0.05..1.00)                   │
│ [A2] news-funnel-filter · macro prompts     GPT-5-mini × 8        │
│      picks 1–2 most-impactful per macro category                  │
│ [A3] news-funnel-orchestrator · summaries   Gemini 2.5-flash × ~40│
│      "Summarize this news in 2-3 sentences" (Google Search ground)│
│      writes filtered + summarized rows ───► T1                    │
└──────────────────────────────────────────────────────────────────┘
DATABASE
┌──────────────────────────────────────────────────────────────────┐
│ [T1] BETA_12_News_digest (rank, type, ticker, category, title,   │
│                            summary, source, sentiment, magnitude) │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
DASHBOARD
┌──────────────────────────────────────────────────────────────────┐
│ [D1] News tab #newsStream — 12 items max                          │
│      ← /api/news-digest/{date} → T1                               │
│      sorts by |magnitude| desc; mat-pill = round(|mag| × 10)      │
│      sentiment chip: bullish=pos, bearish=neg, neutral=neu        │
└──────────────────────────────────────────────────────────────────┘
```

**Reference**

| Tag | What                                                                 |
|-----|----------------------------------------------------------------------|
| C1  | `workers/news-funnel-orchestrator/src/worker.js`                     |
| A1  | `workers/news-funnel-filter/src/worker.js` `filterTickerHeadlines()` · prompt §6.1 |
| A2  | same file, `filterMacroHeadlines()` · prompt §6.2                    |
| A3  | `news-funnel-orchestrator` summary loop · prompt §6.3                |
| T1  | `BETA_12_News_digest` (migration 0008)                                |
| D1  | `app.js renderNewsStream()` · `#newsStream`                          |

**Note:** A1 and A2 prompts contain explicit granular magnitude scale (0.05–1.00 with bands) to prevent ±0.5 bucketing. See SYSTEM_REPORT §6.1.

\pagebreak

## Cluster 11 · Top movers

```
EXTERNAL SOURCES
┌──────────────────────────────────────────────────────────────────┐
│ [R1] Polygon prices — drives daily move %                         │
│ [R2] BETA_12_News_digest from cluster 10 (per-ticker headlines)   │
│ [R3] ALPHA_03_Press from pipeline step 1 (recent press)           │
└──────────────────────────────────────────────────────────────────┘
         │                  │                 │
         ▼                  ▼                 ▼
CODE MODULES
┌──────────────────────────────────────────────────────────────────┐
│ [C1] price-fetcher           → T1                                │
│ [C2] news-funnel-orchestrator → T2 (cluster 10 result)            │
│ [C3] press scrapers + /ingest/press → T3                         │
│ [C4] big-movers-why  worker · job-engine                          │
│      reads T1 (today) + T2 + T3                                   │
│      picks top-5 up + top-5 down by abs(move%)                    │
│      calls A1 once per mover                                      │
└──────────────────────────────────────────────────────────────────┘
                                                                    
AGENTS
┌──────────────────────────────────────────────────────────────────┐
│ [A1] big-movers-why · Why-this-stock-moved   GPT-5                │
│      grounded in T2 + T3; outputs thesis + bullets                │
│      writes ───► T4                                               │
└──────────────────────────────────────────────────────────────────┘
DATABASE
┌──────────────────────────────────────────────────────────────────┐
│ [T1] PRICE_01_Daily                                              │
│ [T2] BETA_12_News_digest                                         │
│ [T3] ALPHA_03_Press                                              │
│ [T4] MOVER_EXPLANATIONS_daily (direction, move_pct, headline,    │
│                                 thesis, bullets, raw_blob)        │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
DASHBOARD
┌──────────────────────────────────────────────────────────────────┐
│ [D1] News tab #topDrivers — up to 5 items                         │
│      ← /api/movers → T4                                           │
│      sorts by |move_pct| desc; renders ticker + move + reason     │
└──────────────────────────────────────────────────────────────────┘
```

**Reference**

| Tag | What                                                                 |
|-----|----------------------------------------------------------------------|
| C4  | `workers/big-movers-why/src/worker.js` · prompt §6.7                 |
| T4  | `MOVER_EXPLANATIONS_daily` (migration 0021)                          |
| D1  | `app.js renderTopDrivers()` · `#topDrivers`                          |

\pagebreak

## Cluster 12 · Regime detail — 12-indicator board + latest events

This is what opens when the user clicks "Open full regime analysis" on the Layer 1 card.

```
EXTERNAL SOURCES
┌──────────────────────────────────────────────────────────────────┐
│ [R1] FRED — DGS10, DGS2, FEDFUNDS, FED_TARGET_*                   │
│ [R2] BLS  — CPI_HEADLINE, CPI_CORE, NFP, UNEMP                    │
│ [R3] Finnhub economic calendar (cluster 9 source)                 │
│ [R4] Hardcoded FOMC list, hardcoded earnings via cluster 9         │
└──────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
CODE MODULES
┌──────────────────────────────────────────────────────────────────┐
│ [C1] macro-state-fetcher       → T1   (cluster 1 reuses)          │
│ [C2] economic-calendar-fetcher → T2   (cluster 9 reuses)          │
│ [C3] earnings-fetcher          → T3   (cluster 5 reuses)          │
│ [C4] dashboard /api/indicator-history → T1                        │
│ [C5] dashboard /api/calendar          → T2                        │
└──────────────────────────────────────────────────────────────────┘
DATABASE
┌──────────────────────────────────────────────────────────────────┐
│ [T1] MACRO_STATE_indicators (latest row per indicator_code)      │
│ [T2] MACRO_STATE_calendar                                        │
│ [T3] FUND_02_Earnings (next earnings dates)                      │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
DASHBOARD
┌──────────────────────────────────────────────────────────────────┐
│ [D1] regime detail #macroIndicators — board of 7+ chips          │
│      ← bootstrapMacroIndicators() → /api/indicator-history        │
│      maps T1 → labels (10Y, 2Y, derived 2s10s curve, Core CPI,    │
│           CPI Headline, Fed Funds, NFP, Unemployment)             │
│      DATA.macroIndicators starts empty so failures show empty     │
│ [D2] regime detail #regimeLatestEvents — last 4 past + next 4    │
│      ← bootstrapCalendar populated DATA.calendarEvents            │
│      sorted chronologically; "upcoming" pill on future dates     │
└──────────────────────────────────────────────────────────────────┘
```

**Reference**

| Tag | What                                                                 |
|-----|----------------------------------------------------------------------|
| C4  | `workers/portfolio-ingestor /query/indicator-history`                |
| D1  | `app.js bootstrapMacroIndicators()` + `renderMacroIndicators()` · `#macroIndicators` |
| D2  | `app.js renderRegimeLatestEvents()` · `#regimeLatestEvents`           |

\pagebreak

## Map of agent → dashboard fields (cross-reference)

When one LLM agent feeds multiple dashboard fields, this table tells you everything that depends on it. Use it backwards: "if A1 (regime narrative identification) is wrong, what breaks?"

| Agent                                              | Feeds these dashboard fields                                                |
|----------------------------------------------------|-----------------------------------------------------------------------------|
| `macro-intelligence-builder` Calls A+B+C (GPT-5)  | Cluster 1 D1 (verdict), D2 (lede fallback), Cluster 4 D4 (sector lede context) |
| `narrator/regime` ident+reco+lede                  | Cluster 1 D2 (lede primary)                                                 |
| `narrator/sector` ident+reco+lede × 8 sectors      | Cluster 4 D4 (sector lede), entity-detail when user clicks a sector         |
| `narrator/sector-landscape` ident+reco+lede        | Cluster 4 D4 (when fresh, takes priority over per-sector lede)              |
| `narrator/stock-landscape` ident+reco+lede         | Cluster 5 D3                                                                |
| `narrator/stock` × 25 tickers                      | Stock entity-detail view (click on ticker)                                  |
| `news-funnel-filter` ticker × 25                   | Cluster 10 D1 (news stream — ticker headlines)                              |
| `news-funnel-filter` macro × 8                     | Cluster 10 D1 (news stream — macro headlines)                               |
| `news-funnel-orchestrator` Gemini summaries × 40   | Cluster 10 D1 (the summary text on each news item)                          |
| `big-movers-why` (GPT-5)                           | Cluster 11 D1 (top movers)                                                  |
| `valuation-curve-builder` short + long             | Stock entity-detail view (click on ticker → fair-value curves)              |
| `operations-agent` (GPT-5)                         | Stock entity-detail view (operations panel) — not yet on main dashboard     |
| `assessment-engine` explanation (GPT-4o-mini)      | Stock entity-detail view (composite-score explanation line)                 |

## Map of D1 table → dashboard fields (cross-reference)

| Table                            | Reads in dashboard                                                      |
|----------------------------------|-------------------------------------------------------------------------|
| `MACRO_STATE_indicators`         | C1 D3 (chips), C12 D1 (12-indicator board)                              |
| `MACRO_STATE_calendar`           | C9 D1 (calendar grid), C12 D2 (latest events list)                      |
| `MACRO_STATE_fomc`               | C1 (regime context inputs to A1, A4)                                    |
| `BETA_03_Macro`                  | C1 (regime context); also `/api/macro/{date}` queries (not in main UI)  |
| `BETA_10_Daily_macro`            | C1 D1 (verdict), C1 D2 (lede fallback), C6 D6 (decision trail regime step) |
| `NARRATIVE_01_Content`           | C1 D2, C4 D4, C5 D3, regime/sector/stock entity-detail panels           |
| `BETA_12_News_digest`            | C10 D1 (news stream)                                                    |
| `MOVER_EXPLANATIONS_daily`       | C11 D1 (top movers)                                                     |
| `STOCK_FACTORS_daily`            | C3 (style tilts), C5 D1 (stock rows), C5 D2 (scatter), C6 D6 (decision trail stock step) |
| `SECTOR_FACTORS_daily`           | C4 D1 (sector table), D2 (RRG), D3 (alloc bar), C6 D6 (decision trail sector step) |
| `SECTOR_TREND_short` + `_long`   | A1+A2 sector narrators (Cluster 4)                                      |
| `TICKER_TREND_short` + `_long`   | Stock entity-detail; A1+A2 stock narrators                              |
| `POSITION_01_Daily`              | C2 D1 (gauge), C3 (tilts weighting), C6 D1+D3+D5 (KPI/positions/weights) |
| `NAV_01_Daily`                   | C2 D1 (gauge), C6 D1+D2+D4 (KPI/NAV curve), C7 D1 (waterfall input)    |
| `TRADE_01_Ledger`                | C6 (positions/NAV chain), C8 D2 (closed trades)                         |
| `PRICE_01_Daily`                 | C2-C11 — used everywhere (factors, NAV, mover %s, NAV-curve benchmark)  |
| `FUND_01_Fundamentals`           | C3 (Piotroski feedstock), C5 (rel_pe_sigma calc)                        |
| `FUND_02_Earnings`               | C5 (SUE), C9 D1 (calendar earnings dates)                               |
| `FUND_03_Recommendations`        | C3 + C5 (eps_rev_4w, rev_breadth_4w)                                    |
| `ALPHA_03_Press`                 | C11 (mover ground-truth), narrator/stock context                        |
| `ALPHA_01_Reports`               | C9 (last-filing for next-earnings estimate), narrator/stock + ticker-trend-long context |
| `BETA_02_WH`                     | A1+A4 regime narrators (policy context)                                 |
| `MOVER_EXPLANATIONS_daily`       | C11 D1                                                                  |

---

**End of atlas.** Read this in conjunction with `docs/SYSTEM_REPORT.md`. Diagrams here are visual — prose definitions, prompts, and full schema details are in the report.
