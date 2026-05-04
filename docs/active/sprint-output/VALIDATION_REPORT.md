# VALIDATION_REPORT · per-parser sample-check

**Sprint**: SPRINT_pipeline_implementation · Sub-sprint G
**Date**: 2026-05-04 (deploy + smoke-test complete; user verifies values later)
**Inputs**: [PIPELINE_AUDIT.md §D.4](PIPELINE_AUDIT.md), [PARAMETER_DECISIONS.md §0](PARAMETER_DECISIONS.md)

## §0 · Deploy + smoke-test status (2026-05-04)

Migrations 0035–0041 applied to remote D1 (`portfolio-db`). All 4 new workers + 3 modified workers deployed. `/build` hit on each immediately after deploy:

| Worker | Status | Result |
|---|---|---|
| `portfolio-ingestor` (modified — typed multiples + `/ingest/fundamentals-quarterly`) | ✅ deployed | Endpoints accept new payload shape; awaits next `npm run pipeline` to ship rows. |
| `macro-state-fetcher` (extended — 14 new FRED + 1 new BLS) | ✅ working | 545 rows inserted (535 FRED + 10 BLS) on first build. |
| `yfinance-cross-asset-fetcher` (NEW) | ✅ working | 161 rows inserted across 4 symbols (EURUSD, COPPER, GOLD, VVIX). |
| `sentiment-state-fetcher` (NEW) | ✅ working | 10 typed rows inserted (3 P/C ratios + 3 AAII metrics + 4 COT nets). |
| `fomc-statement-fetcher` (extended — SEP/dot-plot) | ⚠️ partial | 4 FOMC statements ingested cleanly; **SEP / dot-plot parser failed** — actual SEP table structure differs from my regex (stats are column-groups not row-labels). See follow-up below. |
| `naaim-fetcher` (NEW) | ❌ data path broken | NAAIM CSV URL now 404; the `/programs/naaim-exposure-index/` page renders the value via Bricks Builder JS (not in static HTML). Worker logs + skips gracefully. **Follow-up**: probe alternative free sources (e.g., `naaim.org/feed`, `naaim.org/wp-json/...`) or accept this as a manual-update slot. |
| `ism-fetcher` (NEW) | ❌ data path broken | All ismworld.org URLs return 404 (site restructured). Worker logs + skips. **Follow-up**: locate the new URL pattern and update REPORT_PAGES, OR drop ISM entirely per the "fragile-by-design, discard if too much effort" rule from sprint design. |

## §0.1 · CBOE SKEW

Originally planned to ingest via `macro-state-fetcher` from `cdn.cboe.com/api/global/us_indices/daily_skew_values.csv`. **Cloudflare Workers egress IPs are 403'd by CBOE's CDN regardless of User-Agent / Referer** (verified 2026-05-04). The local pipeline path (`macro/scraper.js :: getSkew`) still works because residential IPs are allowed. SKEW remains PARSED-BUT-LOST in BETA_03_Macro; wiring it through requires a `/ingest/skew` endpoint in `portfolio-ingestor` plus a step in `src/steps/upload.js`. Deferred to a follow-up sprint.

## §0.2 · Gold series

`GOLDAMGBD228NLBM` (London AM fix) has been **retired by FRED**. Same for `GOLDPMGBD228NLBM`. Gold moved to `yfinance-cross-asset-fetcher` as `GC=F` (front-month gold futures) — works fine.

## §0.3 · DEPRECATION verification

`getGammaRegime_ETF` no longer called anywhere (it was already orphan code). Throws on call per soft-delete pattern.

## §0.4 · Follow-up tickets (next sprint candidates)

1. **FOMC SEP parser rewrite**: actual table has Median / Central Tendency / Range as colspan-4 column-groups, with year sub-columns inside each. My current regex assumes the inverse. ~30 min fix once tested against the live page.
2. **NAAIM**: investigate `naaim.org/feed` (RSS), inspect Bricks Builder data attribute on the rendered chart, or accept manual-update workflow.
3. **ISM**: locate new URL pattern post-site-restructure (April 2026 reorg). If URLs remain unstable, drop ISM per "fragile, discard" rule.
4. **CBOE SKEW**: add `/ingest/skew` endpoint to `portfolio-ingestor` so local pipeline can push the value already in BETA_03_Macro to MACRO_STATE_indicators.

---

> The sprint plan's §G.4 mandates: every new or extended parser must be run once and the value sample-checked against the source's published page before it ships. This file is the result of that gate. Each entry is one parser; the **Match?** field locks ship/no-ship. The user runs the pipeline once after deploy, fills in the values column, and verifies against the source URL — entries marked **Match? YES** are cleared to ship; **Match? NO** rows block until the discrepancy is resolved.

---

## How to fill in this report

For each entry below, after deploying the migration + worker:

```
1. Hit the worker's /build endpoint (or wait for cron).
2. Read back the value via the shown verification SQL or API call.
3. Open the source URL in a browser; record the published value.
4. Set "Match? YES / NO" — values must agree to the precision the source publishes.
5. If NO, log the discrepancy in the "Notes" column and DO NOT mark the parser shipped.
```

---

## EXTEND · macro-state-fetcher (new indicator codes)

After the worker's next cron tick (00:10 UTC), each new code should appear in `MACRO_STATE_indicators`. Verification SQL:

```sql
SELECT indicator_code, value, prior, release_date, source
FROM MACRO_STATE_indicators
WHERE indicator_code = '<CODE>'
ORDER BY release_date DESC
LIMIT 1;
```

| # | Indicator code | Source URL (FRED) | Value written | Value from source | Match? | Notes |
|---|---|---|---|---|---|---|
| 1 | REAL_5Y | https://fred.stlouisfed.org/series/DFII5 | 1.35 | | | |
| 2 | BREAKEVEN_5Y | https://fred.stlouisfed.org/series/T5YIE | 2.69 | | | |
| 3 | BREAKEVEN_5Y5Y_FWD | https://fred.stlouisfed.org/series/T5YIFR | 2.27 | | | |
| 4 | OAS_IG | https://fred.stlouisfed.org/series/BAMLC0A0CM | 0.81 | | | |
| 5 | OAS_HY | https://fred.stlouisfed.org/series/BAMLH0A0HYM2 | 2.83 | | | |
| 6 | FED_TOTAL_ASSETS | https://fred.stlouisfed.org/series/WALCL | 6699950 | | | Weekly H.4.1; report `$M` |
| 7 | BANK_RESERVES | https://fred.stlouisfed.org/series/WRESBAL | 2918599 | | | Weekly H.4.1; report `$M` |
| 8 | DXY_BROAD | https://fred.stlouisfed.org/series/DTWEXBGS | 118.7294 | | | Index |
| 9 | WTI | https://fred.stlouisfed.org/series/DCOILWTICO | 99.89 | | | $/bbl |
| 10 | GOLD | https://fred.stlouisfed.org/series/GOLDAMGBD228NLBM | 4573.2001953125 | | | London AM fix, $/oz |
| 11 | INITIAL_CLAIMS | https://fred.stlouisfed.org/series/ICSA | 189000 | | | Weekly; raw count (×k for display) |
| 12 | VIX | https://fred.stlouisfed.org/series/VIXCLS | 16.99 | | | |
| 13 | UMICH_SENT | https://fred.stlouisfed.org/series/UMCSENT | | | | Monthly |
| 14 | INFL_EXP_1Y | https://fred.stlouisfed.org/series/MICH | | | | Monthly |
| 15 | PPI_FINAL_DEMAND | https://fred.stlouisfed.org/series/PPIFIS | 154.006 | | | Cross-check vs BLS WPSFD4 |

## EXTEND · macro-state-fetcher (CBOE SKEW)

| # | Code | Source | Written | From source | Match? | Notes |
|---|---|---|---|---|---|---|
| 16 | SKEW | https://www.cboe.com/us/options/market_statistics/historical_data/ (or daily CSV at `cdn.cboe.com/api/global/us_indices/daily_skew_values.csv`) | | | | The CSV is what the worker pulls; Cboe's history page mirrors it for human eyes. |

## NEW · yfinance-cross-asset-fetcher (worker)

After cron tick (00:20 UTC), three rows in `MACRO_STATE_indicators` with `source = 'YAHOO'`.

| # | Code | Source | Written | From source | Match? | Notes |
|---|---|---|---|---|---|---|
| 17 | EURUSD | https://finance.yahoo.com/quote/EURUSD=X | 1.1716461181640625 | | | |
| 18 | COPPER | https://finance.yahoo.com/quote/HG=F | 5.9070000648498535 | | | Front-month futures |
| 19 | VVIX | https://finance.yahoo.com/quote/^VVIX | 96.12000274658203 | | | |

## NEW · naaim-fetcher (worker)

Cron Thursday 14:00 UTC. The CSV path historically migrates between subpaths — this worker tries the canonical CSV first then falls back to the page scrape. If both fail, the row is skipped (no fabricated values).

| # | Code | Source | Written | From source | Match? | Notes |
|---|---|---|---|---|---|---|
| 20 | NAAIM | https://www.naaim.org/programs/naaim-exposure-index/ | DEPRECATED 2026-05-04 | | | Weekly; `Mean` value |

## NEW · ism-fetcher (worker, BEST-EFFORT)

Cron daily 14:30 UTC. Idempotent — skips if current month already in DB. **Fragile by design**: ISM has no free API and the press-release page can restyle. If this worker fails for >2 months in a row, deprecate per §F protocol and drop the corresponding mockup tile.

| # | Code | Source | Written | From source | Match? | Notes |
|---|---|---|---|---|---|---|
| 21 | ISM_MFG | https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/pmi/ | DEPRECATED 2026-05-04 | | | Released first business day, ~10:00 ET |
| 22 | ISM_SVC | https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/services/ | DEPRECATED 2026-05-04 | | | Released third business day, ~10:00 ET |

## NEW · sentiment-state-fetcher (worker)

Cron daily 00:25 UTC. Reads `BETA_04_Sentiment` (written by local pipeline) and writes typed rows to `SENTIMENT_STATE_indicators`. Verification SQL:

```sql
SELECT indicator_code, value, prior, release_date, source
FROM SENTIMENT_STATE_indicators
WHERE release_date = (SELECT MAX(release_date) FROM SENTIMENT_STATE_indicators)
ORDER BY indicator_code;
```

| # | Code | Source | Written | From BETA_04_Sentiment blob | Match? | Notes |
|---|---|---|---|---|---|---|
| 23 | PUTCALL_EQUITY | local pipeline → BETA_04 | 0.46 | | | |
| 24 | PUTCALL_INDEX | local pipeline → BETA_04 | 0.98 | | | |
| 25 | PUTCALL_TOTAL | local pipeline → BETA_04 | 0.76 | | | |
| 26 | AAII_BULLISH | local pipeline → BETA_04 | 32.6 | | | |
| 27 | AAII_BEARISH | local pipeline → BETA_04 | 43.6 | | | |
| 28 | AAII_BULL_BEAR | local pipeline → BETA_04 | -11 | | | computed = bull − bear |
| 29 | COT_ES_AM_NET | local pipeline → BETA_04 | -18569 | | | |
| 30 | COT_ES_LF_NET | local pipeline → BETA_04 | -4195 | | | |
| 31 | COT_NQ_AM_NET | local pipeline → BETA_04 | -111440 | | | |
| 32 | COT_NQ_LF_NET | local pipeline → BETA_04 | -41884 | | | |

## EXTEND · fomc-statement-fetcher (dot plot + SEP)

After the next projection meeting (March / June / Sept / Dec), `FOMC_PROJECTIONS` should contain rows for the meeting date. Verification SQL:

```sql
SELECT meeting_date, indicator, year, stat, value
FROM FOMC_PROJECTIONS
WHERE meeting_date = (SELECT MAX(meeting_date) FROM FOMC_PROJECTIONS)
ORDER BY indicator, year, stat;
```

For a forced backfill of the most recent projection meeting, hit:
`GET https://fomc-statement-fetcher.<...>.workers.dev/projections?meeting=2026-03-19`

| # | Indicator | Year | Stat | Written | From source (SEP HTML) | Match? | Notes |
|---|---|---|---|---|---|---|---|
| 33 | FED_FUNDS | 2026 | median | | | | The dot plot's median |
| 34 | GDP | 2026 | median | | | | |
| 35 | UNEMPLOYMENT | 2026 | median | | | | |
| 36 | PCE | 2026 | median | | | | |
| 37 | CORE_PCE | 2026 | median | | | | |
| 38 | FED_FUNDS | 2026 | central_tendency_low | | | | |
| 39 | FED_FUNDS | 2026 | central_tendency_high | | | | |

(Full verification covers ≥4 indicators × 4 years × 3 stats = ≥48 rows per meeting; spot-check 5 representative rows.)

## EXTEND · fetch-fundamentals (full quarterlyReports)

After running `node src/steps/fetch-fundamentals.js --pass=ALL` (or the next nightly pipeline), `FUND_01_Quarterly` should contain ≥20 rows per ticker that hit IS/BS/CF this run.

```sql
SELECT ticker, COUNT(DISTINCT fiscal_period_ending) AS quarters
FROM FUND_01_Quarterly
GROUP BY ticker
ORDER BY ticker;
```

Plus the typed multiples on `FUND_01_Fundamentals`:

```sql
SELECT ticker, peg_ratio, ev_ebitda, ev_sales, pb_ratio, ps_ratio, roe_ttm, roa_ttm
FROM FUND_01_Fundamentals
WHERE date = (SELECT MAX(date) FROM FUND_01_Fundamentals)
ORDER BY ticker;
```

| # | Check | Expectation | Written | Match? | Notes |
|---|---|---|---|---|---|
| 40 | FUND_01_Quarterly · NVDA quarter count | ≥ 5 (after first run; 20 after AV indexes) | 0 | | First run will be partial — only tickers whose IS/BS/CF endpoints fired |
| 41 | FUND_01_Fundamentals.peg_ratio · NVDA | matches AV OVERVIEW.PEGRatio | | | |
| 42 | FUND_01_Fundamentals.ev_ebitda · NVDA | matches AV OVERVIEW.EVToEBITDA | | | |
| 43 | FUND_01_Fundamentals.pb_ratio · NVDA | matches AV OVERVIEW.PriceToBookRatio | | | |
| 44 | FUND_01_Fundamentals.roe_ttm · NVDA | matches AV OVERVIEW.ReturnOnEquityTTM | | | |
| 45 | FUND_01_Fundamentals.roa_ttm · NVDA | matches AV OVERVIEW.ReturnOnAssetsTTM | | | |

---

## DEPRECATION verification

After the §F change, `getGammaRegime_ETF` now throws on call. Confirm no callers still invoke it:

```bash
grep -rn "getGammaRegime_ETF" /Users/gines/Hedge-Portfolio --exclude-dir=node_modules
```

Expected: only the function definition itself + this validation report. If any caller remains, fix the caller before declaring deprecation complete.

---

## End-of-sprint shippable gate

Sprint G ships only if:

- [ ] All 45 entries above have **Match? YES**.
- [ ] No entries have **Match? NO** (any NO blocks the sprint).
- [ ] DEPRECATION verification has zero leftover callers.
- [ ] End-to-end pipeline run logs (npm run pipeline → cloud orchestrator) show no warnings about "missing parser" or "unknown column".
- [ ] Migrations 0035–0041 applied to production D1 without errors (verify via `npx wrangler d1 migrations list portfolio-d1`).

---

## Open items / out-of-scope (for future sprints)

- **Backfill of historical macro / sentiment series** — initialise the typed cloud tables from the existing local-pipeline BETA_03 / BETA_04 history. Out of scope per sprint plan §4 ("no backfill").
- **AV `quarterlyReports` historical backfill** — running `fetch-fundamentals.js --pass=ALL` on first run picks up AV's current 20q array per ticker. Older history (pre-AV-coverage) needs a separate backfill if needed.
- **Driver-tagging classifier (AI sprint)**: lights up news impact tags + per-driver drift breakdown.
- **Theme classifier (AI sprint)**: lights up Tape 6-theme overlay.
- **Sizing engine**: Recommendation block on Name slide-out.
- **Earnings transcript scraper**: deferred to AI sprint.

---

> [INDEX](../../INDEX.md) · [Sprint plan](../SPRINT_pipeline_implementation.md) · [Pipeline audit](PIPELINE_AUDIT.md) · [Parameter decisions](PARAMETER_DECISIONS.md)
