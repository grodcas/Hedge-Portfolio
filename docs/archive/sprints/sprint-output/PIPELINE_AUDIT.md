# PIPELINE_AUDIT · cron schedule × parsers × DB write paths × decision tagging

**Sprint**: SPRINT_pipeline_implementation · Sub-sprint D
**Date**: 2026-05-04
**Inputs**: [PARAMETER_DECISIONS.md §0](PARAMETER_DECISIONS.md), [v2_BALANCED_MOCKUP.md](../v2_BALANCED_MOCKUP.md)
**Discipline**: every row from §0 of the decisions doc gets a tag — **EXTEND / NEW / DEPRECATE / NO-OP**.

> The pipeline has **two layers**: a **local Node pipeline** (`src/pipeline.js`, run via `npm run pipeline` from the user's machine) and a **Cloudflare Workers + D1 layer** (40+ workers under `workers/`, orchestrated by `job-engine-workflow`). Most of what the v2-balanced mockup consumes lives in the Workers layer's typed tables (`MACRO_STATE_indicators`, `PRICE_01_Daily`, `FUND_01..03`, `BETA_12_News_digest`, `STOCK_FACTORS_daily`, `SECTOR_FACTORS_daily`, `TICKER_TREND_*`, `SECTOR_TREND_*`, `SIGNAL_*`, `NAV_01_Daily`, `POSITION_01_Daily`, `MOVER_EXPLANATIONS_daily`, `MACRO_STATE_fomc`, `MACRO_STATE_calendar`, `MACRO_STATE_news`). The local pipeline writes to the legacy `BETA_03_Macro` / `BETA_04_Sentiment` / `ALPHA_*` tables — useful for the dashboard's narrative tabs but **not the source of truth for the v2-balanced mockup's tiles**.

---

## §D.1 · Cron schedule summary

### Cloudflare-cron-triggered workers (5)

| Worker | Cron | Source | Writes |
|---|---|---|---|
| `economic-calendar-fetcher` | `0 0 * * *` (daily 00:00 UTC) | Finnhub economic calendar | `MACRO_STATE_calendar` |
| `macro-state-fetcher` | `10 0 * * *` (daily 00:10 UTC) | FRED + BLS | `MACRO_STATE_indicators` |
| `fomc-statement-fetcher` | `0 0 * * *` (daily 00:00 UTC) | federalreserve.gov RSS + statement page | `MACRO_STATE_fomc` |
| `valuation-curve-builder` | `15 1 * * *` and `30 1 * * *` (daily 01:15 + 01:30 UTC) | PRICE_01_Daily + FUND_01_Fundamentals | `SIGNAL_03_ValuationCurve_short / _long / _Realized` |
| `narrator/dispatcher` | `*/15 * * * *` and `0 6 * * *` (every 15 min + daily 06:00 UTC) | Reads all source tables, dispatches to per-entity narrators | `NARRATIVE_01_Content` |

### Job-engine-workflow orchestrator

`job-engine-workflow` exposes `/run` (POST). It is **triggered by the local pipeline's `upload.js` step** after the local-machine ingestion (press, WH, news, edgar, macro, sentiment, fundamentals) completes. So the chain is: local `npm run pipeline` → POSTs to job-engine-workflow `/run` → orchestrator fans out the Wave 1000–5500 chain via service bindings.

**Wave plan** (consolidated from the orchestrator's source):

| Wave | Workers | Depends on |
|---|---|---|
| 1000 | `price-fetcher`, `earnings-fetcher`, `beta-trend-orchestrator`, `news-funnel-orchestrator` | — (parallel root) |
| 1500 | `stock-factor-builder` | 1000 |
| 1550 / 1560 | `position-builder` → `nav-builder` | price-fetcher (1000) |
| 1600 | `sector-factor-builder` | 1500 + price-fetcher |
| 1700 / 1800 | `sector-trend-long` (daily, 8 calls) / `sector-trend-short` (trigger-gated) | 1600 |
| 2000 | `macro-intelligence-builder` | news-funnel + price-fetcher |
| 2500 | `signal-history-builder`, `big-movers-why` | news + price |
| 3000 | `assessment-engine`, `event-attribution-engine`, `ticker-trend-short` | price + earnings + macro |
| 4000 | `probability-engine`, `consensus-validator` | assessment-engine + ticker-trend-short |
| 5000 / 5500 | `operations-agent` → `wealth-distribution` | trends + macro |

Retry policy varies per worker: pure-math/free-API workers `{ limit: 2, delay: "5s" }`; orchestrators same; AI-heavy LLM workers `{ limit: 0, delay: "5s" }` (fail-fast to avoid wasting tokens on retries).

### Local Node pipeline (`src/pipeline.js`)

Run via `npm run pipeline` from the user's machine. Six parallel scrapers + fundamentals fetcher + upload step (which triggers the cloud orchestrator). No cron — run on demand.

| Step | Module | Source | Writes |
|---|---|---|---|
| 1 | `press/index.js` + `summary.js` | Puppeteer scrape of 25 company IRs | `ALPHA_03_Press` |
| 2 | `whitehouse/index.js` | whitehouse.gov/news/ | `BETA_02_WH` |
| 3 | `news/index.js` | manually downloaded HTML (Bloomberg / WSJ / Reuters) | `BETA_01_News` |
| 4 | `edgar/fetch.js` → `dispatch*.js` | data.sec.gov | `ALPHA_01_Reports`, `ALPHA_02_Clusters` |
| 5 | `macro/index.js` (calls `macro/scraper.js`) | BLS · FRED · UMich · Yahoo · Fed RSS · CBOE | `BETA_03_Macro` (NOT `MACRO_STATE_indicators`) |
| 6 | `sentiment/index.js` | CBOE Puppeteer · AAII MHTML/live · CFTC | `BETA_04_Sentiment` |
| 7 | `src/steps/fetch-fundamentals.js` | Alpha Vantage OVERVIEW + IS + BS + CF + SEC submissions API | `FUND_01_Fundamentals` (cur+YoY only) |
| 8 | `src/steps/upload.js` | local files | POST to `portfolio-ingestor` and `job-engine-workflow /run` |
| 9 | summarize / verify-facts / sync-dashboard | — | log files, validation table |

**Architectural note — the source-of-truth split**: the cron-driven `macro-state-fetcher` writes to **`MACRO_STATE_indicators`**, which the dashboard / mockup reads. The local `macro/index.js` writes to **`BETA_03_Macro`**, which is consumed by the BETA narrative summaries (BETA_05..09) — a separate downstream story. **The PPI / UMich Cons Sentiment / Inflation Expectations / Bank Reserves / VIX term structure / Skew that the v2-balanced mockup wants ARE ingested daily via the local pipeline, but they land in `BETA_03_Macro`, not `MACRO_STATE_indicators`. The dashboard never sees them.** Fixing this is the largest single line item in this sprint.

---

## §D.2 · Parser inventory

### Cloud workers — typed-table writers

| Worker | Endpoint | Source | Writes (table.column or POST) | Triggered by | Failure mode |
|---|---|---|---|---|---|
| `price-fetcher` | `/fetch-prices` | Polygon `/v2/aggs/ticker/{TK}/prev` | POST `/ingest/prices` → `PRICE_01_Daily` | Wave 1000 | Per-symbol Promise.allSettled; logs+continues |
| `earnings-fetcher` | `/fetch-earnings` | Finnhub earnings + recommendation-trends | POST `/ingest/earnings`, `/ingest/recommendations` → `FUND_02_Earnings`, `FUND_03_Recommendations` | Wave 1000 | Per-ticker error caught; logs+continues |
| `macro-state-fetcher` | `/build` (own cron) | FRED · BLS | `MACRO_STATE_indicators` direct write via `env.DB` | Own cron | Throws if FRED_KEY/BLS_KEY missing |
| `economic-calendar-fetcher` | `/build` (own cron) | Finnhub calendar | `MACRO_STATE_calendar` | Own cron | Throws on Finnhub error |
| `fomc-statement-fetcher` | `/build` (own cron) | federalreserve.gov RSS + statement page | `MACRO_STATE_fomc` | Own cron | Throws on RSS error |
| `news-funnel-orchestrator` (+ gatherer / filter) | `/run-news-funnel` | Google News RSS + Finnhub company news → gpt-5-mini ×33 + Gemini | `BETA_12_News_digest` | Wave 1000 | Throws after 1 retry |
| `stock-factor-builder` | `/compute-factors` | computed from `PRICE_01_Daily`, `FUND_01..03` | `STOCK_FACTORS_daily` | Wave 1500 | Pure math; fails fast |
| `sector-factor-builder` | `/compute-sector-factors` | computed from `STOCK_FACTORS_daily`, `PRICE_01_Daily`, `BETA_10_Daily_macro` | `SECTOR_FACTORS_daily` | Wave 1600 | Pure math; fails fast |
| `position-builder` | `/compute-positions` | `TRADE_01_Ledger` + `PRICE_01_Daily` | `POSITION_01_Daily` | Wave 1550 | Fails fast |
| `nav-builder` | `/compute-nav` | `POSITION_01_Daily` + `TRADE_01_Ledger` | `NAV_01_Daily` | Wave 1560 | Fails fast |
| `signal-history-builder` | `/build` | `BETA_12_News_digest` + `FUND_02_Earnings` + `PRICE_01_Daily` | `SIGNAL_HISTORY_daily` | Wave 2500 | Fails fast |
| `assessment-engine` | `/compute-assessments` | prices + earnings + macro | `SIGNAL_01_Assessment` | Wave 3000 | Fails fast |
| `probability-engine` | `/update-probabilities` | `SIGNAL_01_Assessment` | POST `/ingest/probabilities` → `SIGNAL_02_Probability` | Wave 4000 | Fails fast |
| `consensus-validator` | `/validate-consensus` | assessment + ticker-trend | POST `/ingest/consensus` → `SIGNAL_03_Consensus` | Wave 4000 | Fails fast |
| `valuation-curve-builder` | scheduled | `PRICE_01_Daily` + `FUND_01_Fundamentals` | `SIGNAL_03_ValuationCurve_short / _long / _Realized` | Own cron 01:15 + 01:30 UTC | Fails fast |
| `big-movers-why` | `/build` | top movers + `BETA_12_News_digest` + `ALPHA_03_Press` | `MOVER_EXPLANATIONS_daily` | Wave 2500 | LLM, fail-fast |
| `event-attribution-engine` | `/attribute-events` | prices + news + filings | `ALPHA_02_Attribution` | Wave 3000 | Pure math, fails fast |
| `ticker-trend-long / -short` | `/build-all` | per-ticker bundle | `TICKER_TREND_long / _short` | Wave 3000 | Fail-fast LLM |
| `sector-trend-long / -short` | `/build-all` | per-sector bundle | `SECTOR_TREND_long / _short` | Wave 1700 / 1800 | Fail-fast LLM |
| `macro-intelligence-builder` | `/build-macro-intelligence` | MACRO_STATE_* + SPY + BETA_12 | `BETA_10_Daily_macro` | Wave 2000 | Fail-fast LLM |
| `operations-agent` | `/build-all` | trends + macro | `OPERATION_01_Signals` | Wave 5000 | Fail-fast |
| `wealth-distribution` | `/build` | operations + portfolio config | `REBALANCE_01` | Wave 5500 | Pure math, fails fast |
| `8k- / form4- / qk- summarizers` | via report-orchestrator | `ALPHA_01_Reports` raw text | `ALPHA_01_Reports.summary` | report-orchestrator | LLM, fail-fast |
| `narrator/{dispatcher,lede,sector,stock,sector-landscape,stock-landscape}` | scheduled / dispatched | reads source tables (assessment, prices, trends, macro) | `NARRATIVE_01_Content` | Own cron + per-entity dispatch | LLM, fail-fast |

### Local pipeline parsers

| Module | Function | Source | Writes |
|---|---|---|---|
| `press/index.js` + `articles/{TICKER}.js` ×25 + `summary.js` | per-ticker IR scrape + AI summary | 25 company newsroom URLs (Puppeteer) | `ALPHA_03_Press` |
| `edgar/fetch.js` → `dispatch.js` → `dispatch-cluster.js` + `edgar_parsers/{TICKER}_{TYPE}.js` | filing fetch + parse + cluster | data.sec.gov | `ALPHA_01_Reports`, `ALPHA_02_Clusters` |
| `news/index.js` | manual HTML parse + AI summary | local files (Bloomberg/WSJ/Reuters) | `BETA_01_News` |
| `whitehouse/index.js` + `parser.js` | press scrape + AI summary | whitehouse.gov | `BETA_02_WH` |
| `macro/scraper.js :: getCPI` | BLS API v2 (5 series: Headline, Core, Energy, Food, Shelter) | `https://api.bls.gov/publicAPI/v2/...` | `BETA_03_Macro` (heading=CPI) |
| `macro/scraper.js :: getPPI` | BLS (3 series: Final Demand, Goods, Services) | BLS | `BETA_03_Macro` (heading=PPI) |
| `macro/scraper.js :: getEmployment` | BLS (NFP `CES0000000001`, UNRATE `LNS14000000`) | BLS | `BETA_03_Macro` (heading=Employment) |
| `macro/scraper.js :: getBankReserves` | FRED `WRESBAL` | FRED | `BETA_03_Macro` (heading=Bank Reserves) |
| `macro/scraper.js :: getInterestRates` | FRED `DFF`, `DFEDTARU`, `DFEDTARL` | FRED | `BETA_03_Macro` (heading=Interest Rates) |
| `macro/scraper.js :: getConsumerSentimentUMich` | UMich CSV `tbcics.csv` | UMich | `BETA_03_Macro` (heading=Consumer Sentiment) |
| `macro/scraper.js :: getInflationExpectations` | UMich CSV `tbcpx1px5.csv` | UMich | `BETA_03_Macro` (heading=Inflation Expectations) |
| `macro/scraper.js :: getVIXTermStructure` | yfinance ^VIX, ^VIX3M, ^VIX9D + computed gamma regime | Yahoo | `BETA_03_Macro` (heading=Gamma Regime (VIX)) |
| `macro/scraper.js :: getFOMC` + `getFOMCStatement` | Fed RSS + statement HTML | federalreserve.gov | `BETA_03_Macro` (heading=FOMC) |
| `macro/scraper.js :: getSkew` | CBOE daily skew CSV | cdn.cboe.com | **PARSED-BUT-LOST** — not pushed via ingest-macro |
| `macro/scraper.js :: getGammaRegime_ETF` | Polygon VIXY/VIXM | Polygon | **PARSED-BUT-LOST** — also not used; effectively dead |
| `sentiment/index.js :: scrapeAllPutCall` | CBOE daily PUT/CALL ratios via Puppeteer | cboe.com | `BETA_04_Sentiment` (heading=Put/Call Ratios (CBOE)) |
| `sentiment/index.js :: scrapeAAII` | aaii.com live + MHTML fallback | AAII | `BETA_04_Sentiment` (heading=AAII Sentiment Survey) |
| `sentiment/index.js :: scrapeCOT` | CFTC `FinFutWk.txt` | CFTC | `BETA_04_Sentiment` (heading=COT Futures (ES / NQ)) |
| `src/steps/fetch-fundamentals.js :: fetchOverview/IS/BS/CF` | AV OVERVIEW + IS/BS/CF + SEC submissions API for 10-Q lag-detect | alphavantage.co + data.sec.gov | `FUND_01_Fundamentals` typed cols + `raw_overview` JSON. **Quarterly statements: only [0] (cur) + [4] (YoY) are kept; quarters [1..3, 5..7] are discarded.** |
| `macro/backfill_fundamentals_finnhub.js` | one-shot Finnhub backfill (paid hooks: `/stock/metric`, `/quote`, `/price-target`) | finnhub.io | `FUND_01_Fundamentals` |

### One-shot scripts (not in cron, not in pipeline)

| Script | Purpose |
|---|---|
| `scripts/backfill-prices.js` | 2y of daily OHLCV per ticker via Polygon → POST `/ingest/prices`. Resumable + idempotent. |
| `scripts/backfill-earnings.js` | one-shot earnings history backfill |
| `scripts/backfill-recs.js` | one-shot recommendation history backfill |
| `scripts/bootstrap-peers.js` | one-shot peer mapping per ticker via Finnhub `/stock/peers` + `/stock/profile2` → writes `config/peers-mapping.json` |
| `scripts/scrape-ssga-pe.js` | scrapes SSGA PDF for sector forward P/E + dividend yield → `SECTOR_VALUATION_monthly` |

---

## §D.3 · DB write paths

**Schema source of truth**: `workers/portfolio-ingestor/migrations/0003-0034*.sql` plus the dated `docs/reference/DATABASE_SCHEMA.md` (the dated doc covers only the ALPHA_01..05 / BETA_01..10 / PROC tables; migrations 0006–0034 add ~25 more tables).

### Tables consumed by the v2-balanced mockup, mapped to writers

| Table | Columns we read | Writer | Cadence |
|---|---|---|---|
| `PORTFOLIO_01_Holdings` | ticker, shares, weight_pct, notes | hand-seeded via `scripts/seed-trades.js` / SQL (no parser) | manual |
| `POSITION_01_Daily` | date, ticker, qty, market_value, weight_pct, day_pnl_pct | `position-builder` Wave 1550 | daily |
| `NAV_01_Daily` | date, gross_long, gross_short, net_value, cash, leverage | `nav-builder` Wave 1560 | daily |
| `PRICE_01_Daily` | ticker, date, close (sparkline + 1y), open, high, low, volume | `price-fetcher` Wave 1000 + `scripts/backfill-prices.js` | daily |
| `FUND_01_Fundamentals` | pe_ratio, forward_pe, eps, revenue_ttm, profit_margin, operating_margin, market_cap, analyst_target, dividend_yield, beta, raw_json | `src/steps/fetch-fundamentals.js` (local) + `macro/backfill_fundamentals_finnhub.js` (one-shot) | daily local |
| `FUND_02_Earnings` | ticker, period, estimate, actual, surprise, surprise_pct, report_date | `earnings-fetcher` Wave 1000 | daily |
| `FUND_03_Recommendations` | ticker, date, strong_buy/buy/hold/sell/strong_sell | `earnings-fetcher` Wave 1000 | daily |
| `STOCK_FACTORS_daily` | fwd_pe, rel_pe_sigma, sue, piotroski_f, days_to_catalyst, peer_median_pe | `stock-factor-builder` Wave 1500 | daily |
| `SECTOR_FACTORS_daily` | regime_fit, earn_momentum, beat_rate_sector, valuation_sigma, rs_ratio, rs_momentum, stance_score, stance, fwd_pe_sector | `sector-factor-builder` Wave 1600 | daily |
| `MACRO_STATE_indicators` | release_date, period, indicator_code, indicator_name, value, prior, unit, source | `macro-state-fetcher` 00:10 UTC. **5 FRED daily codes + 4 BLS monthly codes — see §D.4 for what's missing** | daily |
| `MACRO_STATE_fomc` | meeting_date, title, decision_summary, statement_text, source_url | `fomc-statement-fetcher` 00:00 UTC | daily |
| `MACRO_STATE_news` | week_start, title, summary, source, url, sentiment, magnitude, why_it_matters, picked_by | `macro-intelligence-builder` Wave 2000 (sub-step "weekly news picker") | daily |
| `MACRO_STATE_calendar` | event_date, event_time, country, event_code, event_label, impact, consensus, prior, unit, source | `economic-calendar-fetcher` 00:00 UTC | daily |
| `BETA_12_News_digest` | date, type (ticker/macro), ticker, category, rank, title, summary, impact, source, sentiment, magnitude, frequency | `news-funnel-orchestrator` Wave 1000 | daily |
| `BETA_10_Daily_macro` | summary blob with regime / drivers / narrative / whats_next / spy_direction | `macro-intelligence-builder` Wave 2000 | daily |
| `TICKER_TREND_long` | regime, score, thesis, drivers (JSON), narrative (JSON), raw_blob | `ticker-trend-long` Wave 3000 | trigger-gated, ≤90d stale |
| `TICKER_TREND_short` | regime, score, thesis, drivers, narrative, trigger, trigger_detail | `ticker-trend-short` Wave 3000 | trigger-gated |
| `SECTOR_TREND_long / _short` | same shape, sector-scoped | `sector-trend-{long,short}` Wave 1700/1800 | daily / trigger |
| `SIGNAL_01_Assessment` | ticker, date, score, factors_json, explanation | `assessment-engine` Wave 3000 | daily |
| `SIGNAL_02_Probability` | ticker, date, p_favorable, p_neutral, p_unfavorable | `probability-engine` Wave 4000 | daily |
| `SIGNAL_03_Consensus` | dominant_narrative, our_conclusion, consensus_level, missed_factors, strongest_counter | `consensus-validator` Wave 4000 | daily |
| `SIGNAL_03_ValuationCurve_long / _short / _Realized` | fair_value, baseline_fair_value, adjustment_pct, rationale, gap_closed_pct | `valuation-curve-builder` 01:15 + 01:30 UTC | twice-daily |
| `MOVER_EXPLANATIONS_daily` | direction, move_pct, rank, headline, thesis, bullets | `big-movers-why` Wave 2500 | daily |
| `BETA_04_Sentiment` | put-call, AAII, COT (heading-keyed JSON in `summary` blob) | `sentiment/index.js` (local) | daily local |
| `BETA_03_Macro` | CPI / PPI / Employment / Bank Reserves / Interest Rates / UMich / VIX / FOMC / Skew (heading-keyed JSON) | `macro/index.js` (local) | daily local |
| `ALPHA_03_Press` | ticker, date, heading, summary | `press/index.js` (local) | daily local |
| `ALPHA_01_Reports` + `ALPHA_02_Clusters` | filings + clusters | `edgar/*` (local) + 8k/form4/qk summarizers (cloud) | daily |
| `SECTOR_VALUATION_monthly` | etf_ticker, sector_bucket, forward_pe, div_yield | `scripts/scrape-ssga-pe.js` | monthly |

### Tables / fields the mockup wants but are NOT WRITTEN

- `PORTFOLIO_01_Holdings.kind` — column does not exist.
- `FUND_01_Fundamentals.peg_ratio / ev_ebitda / ev_sales / pb / ps / roe / roa` — values are in `raw_json` (parsed by AV OVERVIEW) but not promoted to typed columns.
- `FUND_01_Fundamentals.quarterly_history_json` (or sibling tables for quarter-by-quarter) — currently AV `quarterlyReports` middle quarters [1..3, 5..7] are discarded. Only `[cur, YoY]` is persisted.
- `MACRO_STATE_indicators` rows for: PPI, UMich Cons Sentiment, Inflation Expectations 1Y/5Y, Bank Reserves (WRESBAL), DFII5, T5YIE, T5YIFR, BAMLC0A0CM, BAMLH0A0HYM2, DTWEXBGS, DCOILWTICO, GOLDAMGBD228NLBM, ICSA, ISM_MFG. (BETA_03_Macro has some of these via local pipeline — but the dashboard reads MACRO_STATE_*, not BETA_03_*, so the dashboard never sees them.)
- `BETA_03_Macro` rows for: CBOE Skew (parsed but not pushed), VIXY/VIXM gamma regime (parsed but not used).
- VVIX series anywhere — not ingested.
- NAAIM weekly survey — not ingested.
- A typed `regime` + `confidence` field on macro intelligence output (currently lives only inside the prose blob).
- A typed `tripwires` JSON column on macro thesis and ticker thesis output.
- Per-driver / per-event news tagging (driver_id ↔ news event mapping) — does not exist. AI sprint deliverable.
- Earnings call transcripts — no parser ingests them. AI sprint or new local parser.
- Dot-plot CSV / SEP table parsing — `MACRO_STATE_fomc.statement_text` exists, but the dot-plot CSV and SEP table aren't separately persisted.
- Peer-set table — `config/peers-mapping.json` exists from `bootstrap-peers.js`, but no D1 table.

---

## §D.4 · Per-decision tagging

Each row from `PARAMETER_DECISIONS.md §0` tagged: **EXTEND** (modify existing parser) · **NEW** (fresh file/migration) · **DEPRECATE** (soft-delete in §F) · **NO-OP** (already correct).

### v2-balanced mockup — the live decision set

| # | Decision row | Action | Detail |
|---|---|---|---|
| 1 | **20q Revenue / OpM / FCF + 8q Margin/FCF Book sparklines + 8q DSO / DIO / share count Δ + Altman / Beneish / ROIC** | **EXTEND** `src/steps/fetch-fundamentals.js` | Persist the full AV `quarterlyReports` array (today only `[0]+[4]` is kept). Either add typed columns for 20 quarters or, cleaner, add a `quarterly_history_json` blob on `FUND_01_Fundamentals` (or a new `FUND_01_Quarterly` table keyed `ticker × fiscal_period_ending`). Recompute Altman / Beneish / ROIC at query time from the persisted history. Migration needed. **No backfill in this sprint** — series populates forward. |
| 2 | **CBOE Skew → 7th Vol·Positioning tile** | **EXTEND** `macro/index.js` to push `getSkew()` output through `ingest-macro`, AND **EXTEND** `macro-state-fetcher` to add SKEW as a daily indicator code. Currently `getSkew` runs but the result never reaches DB. (Parsed-but-lost.) |
| 3 | **ICSA (Initial Claims)** | **EXTEND** `macro-state-fetcher` to add `ICSA` to its FRED_SERIES list. Daily series, 4w-avg derivable. |
| 4 | **ISM Mfg / ISM Services** | **NEW** parser. ISM publishes monthly to `ismworld.org` as embargoed press releases. No free API. Options: (a) scrape the ISM press release page on release day; (b) read the ISM PDF link and parse. Pipeline-sprint task: write a small `macro/scraper.js :: getISMMfg` and add to `MACRO_STATE_indicators` via macro-state-fetcher (or via a new lightweight worker). |
| 5 | **DFII5 (Real 5Y), T5YIE (5Y BE), T5YIFR (5Y5Y forward)** | **EXTEND** `macro-state-fetcher.FRED_SERIES` with these three codes. Daily FRED. |
| 6 | **BAMLC0A0CM (IG OAS), BAMLH0A0HYM2 (HY OAS)** | **EXTEND** `macro-state-fetcher.FRED_SERIES` with these two codes. Daily FRED. |
| 7 | **WALCL (Fed balance sheet)** | **EXTEND** `macro-state-fetcher.FRED_SERIES` with WALCL. Weekly H.4.1 release. |
| 8 | **DTWEXBGS (DXY broad-dollar proxy)** | **EXTEND** `macro-state-fetcher.FRED_SERIES`. Daily FRED. |
| 9 | **DCOILWTICO (WTI), GOLDAMGBD228NLBM (London Gold AM fix)** | **EXTEND** `macro-state-fetcher.FRED_SERIES`. Daily FRED. |
| 10 | **EURUSD, Copper (HG=F)** | **EXTEND** `price-fetcher`'s ALL_SYMBOLS list to add the FX/futures symbols (Polygon supports `C:EURUSD` and futures on paid tier; alternative on free tier is a yfinance-based supplementary fetcher). **Decision needed: stay on Polygon-paid for these, or add a yfinance fallback for the FX/commodity bucket.** |
| 11 | **VIX, VIX3M, VIX9D** | **NO-OP** for cross-asset Map's VIX tile (already in `BETA_03_Macro` via local pipeline) **BUT** the dashboard reads MACRO_STATE_*, so we'd need to also write VIX into `MACRO_STATE_indicators` to surface it cleanly. Cleaner option: **EXTEND** macro-state-fetcher to read FRED `VIXCLS` (daily VIX close, free, official) as a typed indicator code. |
| 12 | **VVIX** | **NEW**. yfinance `^VVIX` not currently fetched anywhere. Add to either `macro-state-fetcher` (if a yfinance helper exists in cloud workers — currently no, only Polygon) **OR** to `macro/scraper.js :: getVIXTermStructure` (which already pulls VIX/VIX3M/VIX9D from yfinance — can add VVIX trivially). Then push to MACRO_STATE_indicators. |
| 13 | **NAAIM weekly survey** | **NEW**. Free CSV at `naaim.org` (or RSS). New parser — small. Weekly cadence. Add to local pipeline OR a new lightweight cloud worker that runs weekly. |
| 14 | **PPI Final Demand row in the Recent prints table** | **EXTEND** `macro-state-fetcher.BLS_SERIES` with `WPSFD4` (PPI Final Demand). |
| 15 | **UMich Consumer Sentiment, Inflation Expectations 1Y/5Y rows in the Recent prints table** | **NEW** parsers in macro-state-fetcher, OR **EXTEND** macro-state-fetcher to call out to the same UMich CSV that local `macro/scraper.js` already parses. The UMich CSV is free / no auth, so cleaner to do it in the cloud worker (one less local-pipeline dependency for the dashboard). |
| 16 | **Bank Reserves (WRESBAL) row in the Recent prints table** | **NO-OP** if we already added WALCL via row 7. But strictly: WRESBAL ≠ WALCL — WRESBAL is reserves held at the Fed by depository institutions; WALCL is total Fed assets. The mockup labels the row "Bank Reserves (WRESBAL)" so add **WRESBAL** to macro-state-fetcher's FRED list (the local pipeline already pulls WRESBAL into BETA_03_Macro). |
| 17 | **CPI Headline, Core CPI, NFP, UNEMP rows** in the prints table | **NO-OP** — already in `macro-state-fetcher.BLS_SERIES`. |
| 18 | **P/C eq, AAII bull−bear, COT ES net** mini-tiles in cross-asset Vol·Positioning | **EXTEND**. The local `sentiment/index.js` already writes these to `BETA_04_Sentiment`, but again the dashboard reads typed MACRO/SENTIMENT cloud tables, not the BETA narrative blob. Two options: **(a)** add a typed sentiment cloud worker that mirrors `BETA_04_Sentiment` daily into a structured table (NEW worker `sentiment-state-fetcher`); or **(b)** have the dashboard query path read the BETA_04 JSON blob directly. **Decision needed**. (a) is cleaner and aligns with the MACRO_STATE_* pattern already in use. Pipeline sprint scope: **(a) NEW worker**. |
| 19 | **Stock-price 1y sparkline column in Book + Price detail card on Name slide-out** | **NO-OP**. `price-fetcher` Wave 1000 already covers 25 portfolio tickers + SPY + 11 sector ETFs. Dashboard query path reads PRICE_01_Daily. The mockup's only requirement is a 252-bar fetch, which is already there. (Backfill via `scripts/backfill-prices.js` is one-shot if we want immediate 1y of history.) |
| 20 | **SPY · 1Y card on Macro slide-out + Sector ETF · 1Y on Sector slide-out** | **NO-OP**. Same as row 19 — covered by price-fetcher. |
| 21 | **Fed funds + WALCL on Macro slide-out header** | **NO-OP** for Fed funds (DFF + DFEDTARU/L are in MACRO_STATE_indicators). **NEW** for WALCL — see row 7. |
| 22 | **Hedge `kind` column on PORTFOLIO_01_Holdings + hedge cover % + hedge table** | **NEW** migration to add `kind TEXT` column to `PORTFOLIO_01_Holdings`. Enum values: `null | hedge_macro | hedge_pair | core_long | core_short`. Pipeline sprint can do the migration. The dashboard's hedge cover % computes from this column once tagged. (User tags positions manually.) |
| 23 | **Recommendation block (sizing engine output)** | **NEW** — but it's a deterministic engine, not a parser. Delegated to a future sprint (sizing engine isn't a data-source problem). For pipeline-sprint scope: nothing to do; restore mockup slot stays static. |
| 24 | **FOMC dot-plot, SEP, statement-diff blocks** | **NEW** parser. `MACRO_STATE_fomc.statement_text` already exists; statement-diff is computed at query time. Dot-plot CSV / SEP table parsing requires a new fetcher (`fomc-projections-fetcher` worker, or extend `fomc-statement-fetcher` to pull the `*projections.csv` next to each meeting page). 8 meetings / year × 5 y = 40 historical projections — initialize-able. Pipeline sprint: add to `fomc-statement-fetcher` as a second parser path; new D1 columns/tables for dot-plot rows + SEP rows. |
| 25 | **Earnings-call transcript scraper (for Last earnings keypoints + Earnings-call tone delta)** | **NEW**. Free source candidates: motley-fool transcripts, company IR pages (some publish), seekingalpha (rate-limited). New local-pipeline parser (analogous to `news/index.js`) that ingests transcripts after each ticker's earnings → writes to `ALPHA_01_Reports` (or a new `ALPHA_06_Transcripts` table). Out-of-scope decision possibility: defer to AI sprint since it pairs with the tone-delta classifier. |
| 26 | **Per-driver / per-event news tagging (driver_id ↔ news mapping) for News-row impact tags + per-driver drift breakdown + Today's news drift breakdown by impact** | **OUT-OF-SCOPE** for this sprint (delegated to AI agent sprint). Confirmed in PARAMETER_DECISIONS.md §0: "AI sprint adds the classifier; one batch run initializes." |
| 27 | **Theme classifier (Tape 6-theme overlay)** | **OUT-OF-SCOPE** — same as row 26, AI sprint deliverable. |
| 28 | **Convergence engine (8 firing signals)** | **OUT-OF-SCOPE** — engine not a data-source problem. AI/wiring sprint. |
| 29 | **Per-driver tripwires (structured `tripwires` JSON column on `TICKER_TREND_long` and on macro intelligence output)** | **NEW** migration to add `tripwires_json TEXT` column to both. Producers (`ticker-trend-long`, `macro-intelligence-builder`) start writing on first run after migration. Forward-only, populates Wave 3000+ on next daily run. |
| 30 | **Typed `regime` + `confidence` columns on macro intelligence output** | **NEW** migration to add `regime TEXT` + `confidence REAL` columns (or a structured JSON) on `BETA_10_Daily_macro` (or sister table). Producer starts writing on first run after migration. |
| 31 | **Peer set config table (per-ticker → 5 peer tickers)** | **NEW** D1 table `PEER_SET_config` (or repurpose `config/peers-mapping.json` from `scripts/bootstrap-peers.js`). Migration + a one-shot import from the JSON. The 5-row Peer Comps table on the Name slide-out reads from this. |
| 32 | **Estimates per-quarter consensus + 4w revisions tape** | **DEPRECATE** in design intent (Refinitiv/Visible Alpha — paid). No parser to write; remove from mockup (already done in v2-balanced). No deprecation needed in code (parser doesn't exist in our pipeline). |

### DEPRECATE candidates (parsers currently running but not surfaced)

| Parser | Status | Action |
|---|---|---|
| `macro/scraper.js :: getGammaRegime_ETF` (Polygon VIXY/VIXM) | Parsed but not pushed; dashboard doesn't surface it; the `getVIXTermStructure` already gives the same gamma regime via free yfinance | **DEPRECATE** per §F protocol. Header comment + commented-out reference. |
| `macro/scraper.js :: getSkew` | Parsed but not pushed | **EXTEND** (wire it through), don't deprecate. |
| `macro/backfill_fundamentals_finnhub.js` | One-shot backfill using paid Finnhub `/stock/metric` endpoint. The daily AV path supersedes for forward writes; keep the script for one-time full-tier history, but mark not-for-cron. | **NO-OP** (it's one-shot, not in cron, no cleanup needed). Add a header note. |
| Local-pipeline `macro/scraper.js :: getCPI / getPPI / getEmployment` → BETA_03_Macro | Duplicates what macro-state-fetcher does (with structured fields). The BETA_03 narrative path still consumes these blobs. | **NO-OP** for now. Future sprint may consolidate. |

### NO-OP rows (already correct)

| Row | Reason |
|---|---|
| Cross-asset 2Y, 10Y, Fed funds, target upper/lower | already in `MACRO_STATE_indicators` |
| CPI Headline, Core CPI, NFP, UNEMP | already in `MACRO_STATE_indicators` |
| SPY + 11 sector ETF prices | already in `PRICE_01_Daily` via `price-fetcher` |
| FOMC statement | already in `MACRO_STATE_fomc` |
| Economic calendar (signposts) | already in `MACRO_STATE_calendar` |
| News digest (per-ticker / macro headlines) | already in `BETA_12_News_digest` |
| Earnings (estimates / actuals / surprise / report_date) | already in `FUND_02_Earnings` + `FUND_03_Recommendations` |
| Stock + sector factors | already in `STOCK_FACTORS_daily` + `SECTOR_FACTORS_daily` |
| Position + NAV daily | already in `POSITION_01_Daily` + `NAV_01_Daily` |
| Ticker / sector trends | already in `TICKER_TREND_*` + `SECTOR_TREND_*` |
| Mover explanations | already in `MOVER_EXPLANATIONS_daily` |

---

## §D · Summary action list for sub-sprints E + F + G

### EXTEND (modify existing parsers — 5 line items)
1. `macro-state-fetcher`: add ~14 new indicator codes (DFII5, T5YIE, T5YIFR, BAMLC0A0CM, BAMLH0A0HYM2, WALCL, WRESBAL, DTWEXBGS, DCOILWTICO, GOLDAMGBD228NLBM, ICSA, VIXCLS, PPI WPSFD4, UMich UMCSENT). Adjust window logic for weekly H.4.1 and monthly UMich.
2. `macro/scraper.js`: wire `getSkew()` output through `ingest-macro` step **AND** add SKEW as a typed indicator code in macro-state-fetcher.
3. `macro/scraper.js :: getVIXTermStructure`: add VVIX (`^VVIX`) to the symbols dict, push as typed indicator.
4. `src/steps/fetch-fundamentals.js`: persist full AV `quarterlyReports` array (currently dropping middle quarters). Migration: new `FUND_01_Quarterly` table or `quarterly_history_json` blob.
5. `price-fetcher`: add EURUSD + Copper (HG=F) symbols (paid Polygon plan needed for FX, or yfinance fallback parser).

### NEW parsers / workers (5 line items)
1. **ISM Mfg scraper** (no free API; scrape `ismworld.org` press release page on release day). Local pipeline OR small cloud worker.
2. **NAAIM weekly CSV scraper**. Free / no auth. Small new parser.
3. **`sentiment-state-fetcher` worker** — typed mirror of BETA_04 (P/C eq, AAII bull-bear, COT ES) into a structured cloud table (`SENTIMENT_STATE_indicators` analogue to `MACRO_STATE_indicators`). Daily.
4. **FOMC dot-plot + SEP parser** — extend `fomc-statement-fetcher` to also pull the meeting's `*projections.csv` and SEP table. New columns/tables.
5. **Earnings-call transcript scraper** — *defer to AI sprint* unless we want it live for the v2-balanced mockup's Last-earnings card. Recommend **defer**.

### NEW migrations (4 line items)
1. `PORTFOLIO_01_Holdings.kind TEXT` column.
2. `FUND_01_Fundamentals.peg_ratio / ev_ebitda / ev_sales / pb / ps / roe / roa` typed columns (or read at query time from raw_json — open question 1 in PARAMETER_DECISIONS).
3. `BETA_10_Daily_macro.regime TEXT + confidence REAL + tripwires_json TEXT`. Producer starts writing on first run.
4. `TICKER_TREND_long.tripwires_json TEXT`. Same.
5. **`PEER_SET_config` table** (ticker primary key + peer_tickers JSON array) + one-shot import from `config/peers-mapping.json`.

### DEPRECATE (1 line item)
1. `macro/scraper.js :: getGammaRegime_ETF` — superseded by `getVIXTermStructure`. Soft delete per §F.

### NO-OP (~15 mockup rows already covered)
Cross-asset 2Y/10Y/Fed funds, CPI/Core CPI/NFP/UNEMP, SPY + sector ETF prices, FOMC statement, economic calendar, news digest, earnings, factors, positions/NAV, trends, mover explanations.

### OUT-OF-SCOPE (this sprint) — confirm with user before E
- Driver-tagging classifier (AI sprint).
- Theme classifier for Tape (AI sprint).
- Convergence engine (engine sprint).
- Sizing engine for Recommendation block.
- Earnings-call transcript scraper (recommend deferring with the tone-delta classifier).

---

## Open questions for the user (resolve before sub-sprint E starts)

1. **Schema strategy for the 12 multiples** (PEG, EV/EBITDA, EV/Sales, P/B, P/S, ROE, ROA): typed columns on `FUND_01_Fundamentals` (cleanest, sortable, indexable) **or** read from `raw_json` at dashboard query time (zero-migration, but no SQL aggregation)?
2. **Quarterly history persistence**: typed `q1_revenue / q2_revenue / … / q20_revenue` columns (rigid, sortable) **or** a `FUND_01_Quarterly` companion table keyed `ticker × fiscal_period_ending` (flexible) **or** a `quarterly_history_json` blob on `FUND_01_Fundamentals` (least disruption)?
3. **EURUSD / Copper / VVIX**: stay on Polygon-paid (works today, costs the FX/futures uplift), **or** add a tiny yfinance fallback worker for free-tier? Recommend: yfinance, since the PARAMETER_DECISIONS rule is "free APIs only."
4. **ISM Mfg scrape**: ismworld.org press release page on release day is the only free path. Confirm OK to scrape; alternative is to defer ISM Mfg + ISM Services to a future sprint.
5. **Earnings-call transcript scraper**: motley-fool / IR pages / SeekingAlpha (rate-limited)? Pick one source. Or defer to AI sprint (recommended).
6. **Sentiment-state cloud worker (vs reading BETA_04 blob)**: confirm we want option (a) — a typed daily mirror in a cloud table — over option (b) — reading the BETA_04 JSON at query time. (a) is cleaner; (b) saves a worker.
7. **`kind` enum on PORTFOLIO_01_Holdings**: confirm the values: `null | hedge_macro | hedge_pair | core_long | core_short`. Add others?

---

> [INDEX](../../INDEX.md) · [Sprint plan](../SPRINT_pipeline_implementation.md) · [Audit inventory](AUDIT_INVENTORY.md) · [Parameter decisions](PARAMETER_DECISIONS.md)
