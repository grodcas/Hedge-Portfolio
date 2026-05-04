# AUDIT_INVENTORY · Mockup × Pipeline × DB three-way reconciliation

**Sprint**: SPRINT_2026-05-04_dashboard_balance · Sub-sprint A
**Date**: 2026-05-04
**Scope**: every *kind* of value the v2 mockup displays vs what the pipeline scrapes vs what the DB persists. Free-source decisions are deferred to PARAMETER_DECISIONS.md (sub-sprint B).

Tags: 🟢 AVAILABLE · 🔴 GAP · 🔵 UNUSED · 🟡 PARSED-BUT-LOST.

> Sources walked: `dashboard/mockup/index.html`, `src/pipeline.js` + `src/steps/*`, `macro/index.js` + `macro/scraper.js`, `sentiment/index.js`, `news/index.js`, `whitehouse/index.js`, `press/index.js`, `edgar/fetch.js`, `workers/portfolio-ingestor/migrations/0003-0034`, `workers/{macro-state-fetcher,sector-factor-builder,stock-factor-builder,macro-intelligence-builder,*-trend-long/short,probability-engine,valuation-curve-builder,news-funnel-*,price-fetcher,earnings-fetcher,economic-calendar-fetcher,position-builder,nav-builder}`, the dated `docs/reference/DATABASE_SCHEMA.md` (note: schema doc is several months stale — migrations 0006–0034 add ~20 tables not listed there).

---

## A.1 — Mockup parameter inventory (one row per *kind* of value)

### Top bar / Today

| # | Field | Mock value | Expected source |
|---|---|---|---|
| TB-1 | AI freshness pill | "AI fresh · 6m ago" | latest TICKER_TREND/SECTOR_TREND/MACRO_STATE_news created_at |
| TB-2 | Regime pill | "Late-cycle 72%" | macro regime classifier (label + confidence) |
| TB-3 | SPY o/n | "+0.3%" | SPY price overnight gap |
| TB-4 | Date | "Tue 26 Apr 2026" | trivial |
| T-1  | Tripwire counter | "0/4 tripwires" | macro thesis tripwire state |
| T-2  | News 24h count | "7" | per-day news count (held names) |
| T-3  | Big moves 14d count | "11" | count of |move|>2σ over 14d |
| T-4  | Attention queue (3 items) | NVDA Att 81, XOM 76, JNJ 71 | per-ticker attention score (composite, dashboard concept) |
| T-5  | Catalysts ≤14d (5 items) | earnings dates + macro events | FUND_02.report_date + MACRO_STATE_calendar |
| T-6  | Macro today (intraday times) | "08:30 Initial claims · cons 215k" | MACRO_STATE_calendar with event_time + consensus |
| T-7  | News drift 24h breakdown | "2 invalidate · 3 weaken · 2 confirm" | per-event driver-impact tagging (AI) |
| T-8  | Convergence summary | "firing on 2 names · 1 ADD 1 TRIM" | convergence engine output (composite of 8 signals) |

### Book (per-row table)

| # | Field | Mock value | Expected source |
|---|---|---|---|
| B-1 | Ticker / name | NVDA / NVIDIA Corp | PORTFOLIO_01_Holdings.ticker (name = static map) |
| B-2 | Sector code | "TEC" / "ENE" / "HCR"… | per-ticker sector mapping |
| B-3 | Side L/S | "LONG" / "SHORT" | implicit from POSITION_01.qty sign or static config |
| B-4 | Weight % current | "6.2%" | POSITION_01_Daily.weight_pct |
| B-5 | Target weight | "5.0%" | PORTFOLIO_01_Holdings.weight_pct |
| B-6 | Drift Δw, MTD% | "+1.2pp · +4.1%" | POSITION_01_Daily history vs target + month-start NAV |
| B-7 | Conv | "+72" | TICKER_TREND_long.score scaled to ±100 |
| B-8 | Thesis tag (INTACT/DRIFT/WEAK/BROKEN) | "DRIFT" | derived from regime + driver-state composite |
| B-9 | Att score 0–100 | "81/100" | composite attention metric (drift + thesis + DTC + drift) |
| B-10 | Forward P/E + own-5y z | "34.2 · z +0.4" | FUND_01.forward_pe + 5y rolling z |
| B-11 | EV/EBITDA + own-5y z | "29.8 · z +0.3" | enterprise-value/EBITDA + 5y z |
| B-12 | Margin sparkline (8q) | bar series 52→67% | 8 trailing quarters of operating margin |
| B-13 | FCF sparkline (8q) | bar series, latest $28b | 8 trailing quarters of FCF |
| B-14 | EPS revisions 4w | "+12 / 0" | sell-side estimate revisions count, 4w window |
| B-15 | News drift 30d | "−0.4" | aggregated sentiment×magnitude over 30d |
| B-16 | DTC (days to catalyst) | "18d" | days to next earnings or scheduled macro event |

### Map · Macro strip

| # | Field | Mock value | Expected source |
|---|---|---|---|
| M-1 | Regime label + confidence | "Late-cycle expansion · 72%" | regime classifier + confidence score |
| M-2 | "4 of 6 indicators consistent" | text | regime indicator vote count |
| M-3 | 12m regime trajectory bars | sparkline | 52w of regime classifier history |
| M-4 | Rates: 2Y, 10Y, 10–2, Real 5Y, 5Y BE, 5Y5Y | %s with 1w / 1m delta | FRED DGS2, DGS10, derived spread, DFII5, T5YIE, T5YIFR |
| M-5 | Credit: IG OAS, HY OAS | "102bp / 358bp" + delta | FRED BAMLC0A0CM, BAMLH0A0HYM2 |
| M-6 | FX/Comdty: DXY, EURUSD, WTI, Copper, Gold | levels + delta | FRED DTWEXBGS / yfinance EURUSD=X / FRED DCOILWTICO / yfinance HG=F / GC=F |
| M-7 | Vol/positioning: VIX, VVIX, NAAIM | 16.4 / 92.1 / 68 | yfinance ^VIX, ^VVIX; NAAIM weekly CSV |

### Map · Sector strip

| # | Field | Mock value | Expected source |
|---|---|---|---|
| S-1 | Sector code + name | "XLE Energy" | static 11-bucket map |
| S-2 | 1D / 5D / 1M return | %s | sector ETF prices |
| S-3 | RS-3M (vs SPY) | "+1.2" | SECTOR_FACTORS_daily.rs_ratio |
| S-4 | Breadth >50d MA | "82%" | % of sector constituents above their 50d MA |
| S-5 | 30d trajectory sparkline | per-sector | sector ETF prices |
| S-6 | Top mover (ticker + %) | "XOM +2.1%" | MOVER_EXPLANATIONS_daily filtered by sector |
| S-7 | Holdings count | "3 names · 8.4%" | derived from PORTFOLIO_01_Holdings × sector map |

### Convergence

| # | Field | Mock value | Expected source |
|---|---|---|---|
| CV-1 | Conv number | "+58" | TICKER_TREND_long.score |
| CV-2 | 8 firing signals (thesis / valuation / sector / catalyst / estimates / news / momentum / volatility) | per-row pos/neg | composite engine output; signals derive from: thesis-state (TICKER_TREND), valuation z (FUND_01 + history), sector stance (SECTOR_FACTORS), DTC (FUND_02), revisions (estimates feed), news drift (BETA_12), price momentum (PRICE_01), IV percentile (options) |
| CV-3 | "Other names approaching" footer | text | engine output |
| CV-4 | Suggested action verb (ADD/TRIM) | text | engine output |

### Hedges

| # | Field | Mock value | Expected source |
|---|---|---|---|
| H-1 | Net exposure (dollar) | "+50.2%" | NAV_01 + POSITION_01 (long − short) / NAV |
| H-2 | Net exposure (beta-adj) | "+63.4%" | Σ(weight × beta) where beta from FUND_01.beta |
| H-3 | Gross exposure | "84.0%" | (long + short) / NAV |
| H-4 | Hedge cover % | "10.2%" | hedge notional / book; needs `kind=hedge` flag on position |
| H-5 | Hedge table rows (kind/position/notional/cost/days/why) | put-spread, pair longs/shorts | needs hedge metadata model; not in schema |

### Name slide-out

| # | Field | Mock value | Expected source |
|---|---|---|---|
| N-1 | Header (tk/name/sec/side/wt/tgt/drift/MTD/QTD/conv/thesis/att) | see header | same as Book row + QTD from POSITION history |
| N-2 | ANALYST READ paragraphs (synthesis) | 2 paragraphs | TICKER_TREND_long.thesis + .narrative |
| N-3 | THESIS prose | paragraph | TICKER_TREND_long.thesis |
| N-4 | Drivers (4) with CONFIRM/WEAKEN counts | 4 rows | needs per-driver news-tagging (driver_id ↔ news event) |
| N-5 | Tripwires (4) with thresholds + status | 4 rows | per-driver threshold logic |
| N-6 | Conviction 12m sparkline | line chart | history of TICKER_TREND_long.score |
| N-7 | Sizing: current / target / range / last change | 4 fields | POSITION_01 + PORTFOLIO_01 + TRADE_LEDGER (or TRADE_CONVICTION) |
| N-8 | Recommendation block (verb + delta + prose) | "Trim toward 5.5%" | sizing-engine output (rules vs target + thesis-state + DTC) |
| N-9 | Notes (last 60d) | 4 entries | TICKER_TREND_long.narrative or note table (none yet) |
| N-10 | VALUATION STACK — Trailing P/E, Forward P/E, PEG, EV/EBITDA, EV/Sales, EV/FCF, P/B, P/S, FCF yield, Div yield, Buyback yield, Total yield | 12 rows | AV OVERVIEW gives most; some derive from financial statements |
| N-11 | Per-multiple Now / 5y mean / z / peer median / peer pctile / vs SPY | 6 cols × 12 rows | own-5y rolling history + peer set + SPY composite |
| N-12 | DCF fair value mid + range | "$890 ($720–$1040)" | SIGNAL_03_ValuationCurve_long.fair_value |
| N-13 | Reverse DCF (NTM growth, terminal growth, WACC) | "28% / 22% / 10.5%" | SIGNAL_03_ValuationCurve_long fields (or rationale text) |
| N-14 | FUNDAMENTALS 20q sparklines (revenue / op margin / FCF) | bar+line | 20 quarters of AV statements per ticker |
| N-15 | 3y CAGR / 8q slope label | derived | computed from N-14 series |
| N-16 | R&D %, Gross margin, DSO, DIO, Net debt/EBITDA, Share count Δ8q | 6 cells | AV INCOME_STATEMENT + BALANCE_SHEET full quarterlies |
| N-17 | Composite quality (Piotroski F, Altman Z, Beneish M, ROIC, ROE, ROA) | 6 cells | Piotroski → STOCK_FACTORS_daily; rest = derived from financials |
| N-18 | ESTIMATES (Q1/Q2/FY/FY+1 consensus / range / prior 4w / revisions / implied YoY) | 4 rows × 5 cols | sell-side estimates feed (consensus + range + revisions count) |
| N-19 | Price targets (median/high/low) + dispersion | 4 fields | sell-side PT distribution |
| N-20 | Rating distribution (52 analysts, SB/B/H/S) | bar | FUND_03_Recommendations |
| N-21 | 8q surprise history + SUE z-score | 8 numbers | FUND_02_Earnings + STOCK_FACTORS_daily.sue |
| N-22 | LAST EARNINGS keypoints (8 bullets) | bullets | 10-Q MD&A clusters + transcript + PR + dot-plot/SEP for FOMC variant |
| N-23 | NEWS (90d) row: date / src / headline / impact tag / driver / mag / why-icon | 8 rows visible | BETA_12_News_digest + per-driver mapping (AI) |
| N-24 | Aggregate thesis drift 30d + per-driver breakdown | "−0.4 · DC +1.4 · GM +0.4 · HS −0.5 · Inv −0.7" | aggregation of driver-tagged events |
| N-25 | 10-K Risk Factors y/y diff (NEW lines) | 3 entries | ALPHA_02_Clusters Item 1A, year-over-year diff |
| N-26 | MD&A tone delta vs prior quarter | 3 lines | ALPHA_02_Clusters Item 7 tone classifier |
| N-27 | Earnings call tone delta | 3 lines | transcript tone classifier (transcript not ingested today) |
| N-28 | PEERS table (5 rows × EV/EBITDA, OpMargin, RevYoY, FCF margin, RS-3m, Conv + median) | 5+1 rows | peer set per ticker × FUND_01/STOCK_FACTORS pulls |
| N-29 | CONTEXT — sector stance / RS / RRG quadrant / regime fit | 1 row | SECTOR_FACTORS_daily.stance + RS_ratio/momentum + macro regime |

### Macro slide-out

| # | Field | Mock value | Expected source |
|---|---|---|---|
| MA-1 | Header (regime / stance / 1w Δ / tripwire count / next signpost) | text | macro thesis output |
| MA-2 | ANALYST READ paragraphs | 2 paragraphs | macro-intelligence-builder narrative |
| MA-3 | MACRO THESIS prose | paragraph | macro-intelligence-builder thesis |
| MA-4 | Drivers (4) with thresholds + status | 4 rows | macro-intelligence-builder drivers JSON |
| MA-5 | Tripwires (4) with thresholds + status | 4 rows | macro-intelligence-builder tripwires JSON |
| MA-6 | Last FOMC keypoints (7 bullets — decision, dot plot, SEP, statement diff, Powell Q&A, balance sheet, market reaction) | bullets | MACRO_STATE_fomc + dot-plot/SEP fetcher (does not exist as a parser today) + market-reaction snapshot from PRICE_01 |
| MA-7 | Signposts next 30d | 4 events | MACRO_STATE_calendar |
| MA-8 | Positioning implication (3 rows: Net / Hedge / Style) | text | macro-intelligence-builder recommendation |
| MA-9 | Notes (last 60d) | 5 entries | macro-state news notes (MACRO_STATE_news) + user notes |

### Sector slide-out (XLE example)

| # | Field | Mock value | Expected source |
|---|---|---|---|
| SE-1 | Header (sector / stance / holdings / target / 1m Δ stance / RRG quadrant) | text | SECTOR_TREND_long + SECTOR_FACTORS_daily |
| SE-2 | ANALYST READ paragraphs | 2 paragraphs | SECTOR_TREND_long.narrative |
| SE-3 | SECTOR THESIS prose | paragraph | SECTOR_TREND_long.thesis |
| SE-4 | Drivers (4) with thresholds | 4 rows | SECTOR_TREND_long.drivers (JSON) |
| SE-5 | Tripwires (4) | 4 rows | SECTOR_TREND_long.drivers (JSON) |
| SE-6 | Implementation table (per-ticker current/target/drift/action) | 3 rows + total | PORTFOLIO_01 + POSITION_01 |
| SE-7 | Pair / Hedge ideas | 2 rows | static text or new metadata model — not in DB |

### Tape slide-out

| # | Field | Mock value | Expected source |
|---|---|---|---|
| TP-1 | News last 14d row (date / src / theme tags / headline / tickers) | 12 entries | BETA_12_News_digest + theme-tag overlay (AI) |
| TP-2 | Moves last 14d row (date / theme tags / ticker / desc / move%) | 8 entries | PRICE_01 |move|>2σ over 14d + theme-tag inheritance from concurrent news |
| TP-3 | Unexplained moves (theme=untagged) | 3 entries | same as above filtered to no-tag matches |
| TP-4 | Theme filter chips (tariffs, oil, ai-capex, rates, earnings, china) | 6 chips | curated theme vocabulary; tagged by AI |

---

## A.2 — Pipeline parameter inventory

Local-machine ingestion (`src/pipeline.js` orchestrates these in parallel):

| Parser | Series / fields fetched | Destination | Upstream | Auth |
|---|---|---|---|---|
| `press/index.js` + `summary.js` | per-ticker IR newsroom items + AI summary | ALPHA_03_Press | 25 company newsroom URLs (Puppeteer) | none |
| `whitehouse/index.js` | WH press items + AI summary | BETA_02_WH | whitehouse.gov/news/ | none |
| `news/index.js` | manually downloaded HTML from BLOOMBERG/WSJ/REUTERS | BETA_01_News | local files | manual |
| `edgar/fetch.js` → `dispatch.js` → `dispatch-cluster.js` | 10-K / 10-Q / 8-K / Form 4 raw HTML, parsed clusters | ALPHA_01_Reports + ALPHA_02_Clusters | data.sec.gov | none |
| `macro/scraper.js` :: `getCPI` | CPI Headline/Core/Energy/Food/Shelter | BETA_03_Macro | BLS API v2 (CUUR0000SA0…) | BLS_KEY |
| `macro/scraper.js` :: `getPPI` | PPI Final Demand/Goods/Services | BETA_03_Macro | BLS API v2 (WPSFD4…) | BLS_KEY |
| `macro/scraper.js` :: `getEmployment` | Nonfarm Payrolls, Unemployment Rate | BETA_03_Macro | BLS API v2 (CES0000000001, LNS14000000) | BLS_KEY |
| `macro/scraper.js` :: `getBankReserves` | Reserve balances WRESBAL | BETA_03_Macro | FRED | FRED_KEY |
| `macro/scraper.js` :: `getInterestRates` | DFF (Fed funds effective), DFEDTARU/L (target range) | BETA_03_Macro | FRED | FRED_KEY |
| `macro/scraper.js` :: `getConsumerSentimentUMich` | UMich ICS | BETA_03_Macro | sca.isr.umich.edu CSV | none |
| `macro/scraper.js` :: `getInflationExpectations` | UMich 1Y / 5Y inflation expectations | BETA_03_Macro | sca.isr.umich.edu CSV | none |
| `macro/scraper.js` :: `getVIXTermStructure` | ^VIX, ^VIX3M, ^VIX9D + computed gamma regime | BETA_03_Macro | Yahoo Finance v8/finance/chart | none |
| `macro/scraper.js` :: `getFOMC` + `getFOMCStatement` | RSS metadata + paragraphs | BETA_03_Macro | federalreserve.gov RSS + HTML | none |
| `macro/scraper.js` :: `getSkew` | CBOE SKEW index | BETA_03_Macro (latent — not pushed today) | cdn.cboe.com CSV | none |
| `macro/scraper.js` :: `getGammaRegime_ETF` | VIXY/VIXM closes | latent | api.polygon.io | POLYGON_KEY (paid tier) |
| `sentiment/index.js` :: `scrapeAllPutCall` | CBOE total / equity / index put-call ratios | BETA_04_Sentiment | cboe.com (Puppeteer) | none |
| `sentiment/index.js` :: `scrapeAAII` | AAII bullish/neutral/bearish | BETA_04_Sentiment | aaii.com live + AAII.mhtml fallback | none |
| `sentiment/index.js` :: `scrapeCOT` | E-MINI S&P / NASDAQ asset-mgr + leveraged-fund net | BETA_04_Sentiment | cftc.gov FinFutWk.txt | none |
| `src/steps/fetch-fundamentals.js` :: `fetchOverview` | sector, PE, ForwardPE, EPS, RevenueTTM, profit/op margin, market cap, 52w hi/lo, 50/200 DMA, analyst target, div yield, beta, **raw_overview** JSON | FUND_01_Fundamentals | alphavantage.co OVERVIEW | ALPHAVANTAGE_KEY (paid) |
| `…` :: `fetchIncomeStatement` | quarterlyReports[0] + [4] revenue, gross profit, net income (cur + YoY) | FUND_01 (extra cols) | AV INCOME_STATEMENT | AV_KEY |
| `…` :: `fetchBalanceSheet` | total assets/debt/current assets/current liabilities/shares outstanding (cur + YoY) | FUND_01 (extra cols) | AV BALANCE_SHEET | AV_KEY |
| `…` :: `fetchCashFlow` | operating cash flow (cur + YoY) | FUND_01 (extra cols) | AV CASH_FLOW | AV_KEY |
| `macro/backfill_fundamentals_finnhub.js` | metric (PE / forward PE / market cap / 52w hi/lo / 50/200 DMA / div yield / beta / **PB / PS / EV/EBITDA / EV/Sales / FCF yield / ROIC / ROE / ROA / current ratio / debt/equity** etc.), quote, price-target | FUND_01 | finnhub.io (paid tier) | FINNHUB_KEY |
| Worker: `price-fetcher` | OHLCV daily | PRICE_01_Daily | (likely Yahoo) | — |
| Worker: `earnings-fetcher` | EPS estimate / actual / surprise / report_date | FUND_02_Earnings | (likely Finnhub) | — |
| Worker: `macro-state-fetcher` | daily writer for MACRO_STATE_indicators (FRED + BLS series) | MACRO_STATE_indicators | FRED + BLS | keys |
| Worker: `economic-calendar-fetcher` | upcoming events (event_date, code, label, consensus, prior, impact, unit) | MACRO_STATE_calendar | Finnhub | FINNHUB_KEY |
| Worker: `fomc-statement-fetcher` | FOMC statement text | MACRO_STATE_fomc | federalreserve.gov | none |
| Worker: `news-funnel-orchestrator/gatherer/filter` | curated portfolio-relevant news, with sentiment + magnitude per ticker/macro | BETA_12_News_digest | various news APIs | varies |
| Worker: `sector-factor-builder` | regime_fit, earn_momentum, beat_rate_sector, valuation_sigma, rs_ratio, rs_momentum, stance_score, stance, fwd_pe_sector | SECTOR_FACTORS_daily | computed from PRICE_01 + FUND_01 | — |
| Worker: `stock-factor-builder` | fwd_pe, rel_pe_sigma, sue, piotroski_f, days_to_catalyst, short_pct_float (deferred), peer_median_pe | STOCK_FACTORS_daily | computed | — |
| Worker: `position-builder` | qty, market_value, day_pnl, weight_pct | POSITION_01_Daily | TRADE_LEDGER + PRICE_01 + NAV | — |
| Worker: `nav-builder` | gross_long, gross_short, net_value, cash, leverage, day_pnl | NAV_01_Daily | POSITION_01 + cash ledger | — |
| Worker: `macro-intelligence-builder` | regime label, drivers, tripwires, narrative, signposts, recommendation | (writes via narrator pattern; outputs blob fields) | LLM | OPENAI/ANTHROPIC |
| Worker: `ticker-trend-long/short` | regime, score, thesis, drivers, narrative, raw_blob | TICKER_TREND_long/short | LLM consuming ALPHA + FUND + PRICE + STOCK_FACTORS | LLM key |
| Worker: `sector-trend-long/short` | same shape, sector-scoped | SECTOR_TREND_long/short | LLM consuming SECTOR_FACTORS + constituents | LLM key |
| Worker: `valuation-curve-builder` | fair_value, baseline_fair_value, adjustment_pct, rationale, **NTM/terminal/WACC implied** in rationale | SIGNAL_03_ValuationCurve_long/short | LLM | LLM key |
| Worker: `probability-engine` | p_favorable / p_neutral / p_unfavorable | SIGNAL_02_Probability | LLM | LLM key |
| Worker: `assessment-engine` | score, factors_json, explanation | SIGNAL_01_Assessment | LLM | LLM key |
| Worker: `consensus-validator` | our_conclusion, dominant_narrative, consensus_level, missed_factors, strongest_counter | SIGNAL_03_Consensus | LLM | LLM key |
| Worker: `big-movers-why` | direction, move_pct, rank, headline, thesis, bullets | MOVER_EXPLANATIONS_daily | LLM grounded in BETA_12 + PRICE_01 | LLM key |
| Worker: `signal-history-builder` | sentiment_score, magnitude, news_count, earnings_flag, trend_updated, top_headline | SIGNAL_HISTORY_daily | composite | — |

---

## A.3 — DB schema inventory (live, per migrations 0003–0034 — not the dated reference doc)

> The dated `docs/reference/DATABASE_SCHEMA.md` covers ALPHA_01..05, BETA_01..10, PROC_01/02/04 only. Migrations 0006–0034 add the tables below. **All of the dashboard's load-bearing data lives in those newer tables, not in the BETA_03..10 / ALPHA_05 narrative-summary tables.**

### Persisted / source-of-truth tables (load-bearing for the dashboard)

| Table | Key columns | Load-bearing for |
|---|---|---|
| PORTFOLIO_01_Holdings | ticker, shares, avg_cost, weight_pct, notes | Book targets, sector implementation |
| POSITION_01_Daily | date, ticker, qty, avg_cost, market_price, market_value, weight_pct, day_pnl_pct | Book current weights, MTD/QTD |
| NAV_01_Daily | date, gross_long, gross_short, net_value, cash, leverage | Hedge KPIs |
| PRICE_01_Daily | ticker, date, OHLCV | sparklines, big-moves, RS, breadth |
| FUND_01_Fundamentals | ticker, date, pe_ratio, forward_pe, eps, revenue_ttm, profit_margin, operating_margin, market_cap, analyst_target, dividend_yield, beta, raw_json (+ AV legacy IS/BS/CF "current+YoY" fields) | Valuation table now-row, fundamentals tile, beta-adj exposure |
| FUND_02_Earnings | ticker, period, estimate, actual, surprise, surprise_pct, report_date | Surprise history, DTC, SUE |
| FUND_03_Recommendations | ticker, date, strong_buy/buy/hold/sell/strong_sell | Rating distribution bar |
| MACRO_STATE_indicators | release_date, period, indicator_code, indicator_name, value, prior, unit, source | Cross-asset rates / credit / FX cards |
| MACRO_STATE_fomc | meeting_date, title, decision_summary, statement_text | Last-FOMC card |
| MACRO_STATE_news | week_start, title, summary, sentiment, magnitude, why_it_matters | Macro notes / drift |
| MACRO_STATE_calendar | event_date, event_time, event_code, event_label, impact, consensus, prior | Today macro / signposts |
| BETA_12_News_digest | date, type, ticker, category, rank, title, summary, impact, source, sentiment, magnitude, frequency | Per-name news, news-drift, Tape news |
| ALPHA_01_Reports + ALPHA_02_Clusters | filings + clustered text | 10-K diff, MD&A tone, last earnings |
| ALPHA_03_Press | per-ticker press | Tape news |
| BETA_02_WH | WH press | Tape news (policy theme) |
| BETA_04_Sentiment | put-call, AAII, COT | latent (not surfaced in v2 mockup) |

### Signal / derived tables

| Table | What it persists |
|---|---|
| STOCK_FACTORS_daily | fwd_pe, rel_pe_sigma (peer), sue, piotroski_f, days_to_catalyst, short_pct_float, peer_median_pe |
| SECTOR_FACTORS_daily | regime_fit, earn_momentum, beat_rate_sector, valuation_sigma, rs_ratio, rs_momentum, stance_score, stance, fwd_pe_sector |
| TICKER_TREND_long / _short | regime, score, thesis, drivers, narrative, raw_blob |
| SECTOR_TREND_long / _short | same shape, sector-scoped |
| SIGNAL_01_Assessment | per-ticker per-day score + factors_json + explanation |
| SIGNAL_02_Probability | p_favorable / p_neutral / p_unfavorable per ticker per day |
| SIGNAL_03_Consensus | our vs market consensus reads |
| SIGNAL_03_ValuationCurve_long / _short | fair_value, baseline, rationale, contributing_events_json |
| SIGNAL_03_ValuationRealized | back-test of valuation-curve forecasts |
| SIGNAL_HISTORY_daily | per-ticker per-day rollup of news / earnings / trend triggers |
| MOVER_EXPLANATIONS_daily | per-ticker per-day why-it-moved |
| SECTOR_VALUATION_monthly | XLK/XLV/XLF/XLE/XLP/XLI/XLY/XLC forward_pe + div_yield (PDF source) |

---

## A.4 — Three-way reconciliation

### 🟢 AVAILABLE — ship as-is in the new mockup

| Mock # | What it shows | Backed by |
|---|---|---|
| TB-3, TB-4 | SPY o/n, date | PRICE_01 |
| T-5 | Catalysts ≤14d (earnings + macro) | FUND_02.report_date + MACRO_STATE_calendar |
| T-6 | Macro today (intraday) | MACRO_STATE_calendar (event_time + consensus + prior) |
| B-1, B-2, B-3, B-4, B-5, B-6 | Book row identity / sizing | PORTFOLIO_01 + POSITION_01 (sector + side require a static config layer — see notes) |
| B-7 | Conv | TICKER_TREND_long.score |
| B-10 | Forward P/E (now) | FUND_01.forward_pe |
| B-14 | EPS revisions 4w | computable from a daily-stored consensus history; **today** the revisions feed itself isn't ingested → see GAP |
| B-15 | News drift 30d | BETA_12 sentiment×magnitude rolling 30d |
| B-16 | DTC | FUND_02.report_date + MACRO_STATE_calendar |
| M-4 | Rates: 2Y, 10Y, real 5Y, 5Y BE, 5Y5Y (and 10–2 derived) | FRED via macro-state-fetcher |
| M-5 | Credit: IG OAS, HY OAS | FRED via macro-state-fetcher (if codes BAMLC0A0CM / BAMLH0A0HYM2 are wired — verify in B) |
| M-7 (VIX only) | VIX | yfinance ^VIX |
| S-1, S-2, S-3, S-5, S-7 | Sector code, returns, RS-3M, sparkline, holdings | SECTOR_FACTORS_daily + sector ETF prices (need ETF prices in PRICE_01 — verify in B) |
| S-6 | Top mover per sector | MOVER_EXPLANATIONS_daily |
| H-1, H-2, H-3 | Net dollar / beta-adj / gross exposure | NAV_01 + POSITION_01 + FUND_01.beta |
| N-1 | Header (full set) | combination of B-1..B-9 + POSITION_01 history for QTD |
| N-2, N-3 | Read + Thesis prose | TICKER_TREND_long.thesis + .narrative |
| N-6 | Conviction 12m | history of TICKER_TREND_long.score (assuming row history; verify retention) |
| N-7 | Sizing fields | PORTFOLIO_01 + POSITION_01 + TRADE_LEDGER |
| N-10 (Trailing P/E, Forward P/E, Div yield) | 3 of 12 multiples | FUND_01 |
| N-12 | DCF fair value | SIGNAL_03_ValuationCurve_long.fair_value |
| N-17 (Piotroski only) | Piotroski F | STOCK_FACTORS_daily.piotroski_f |
| N-20 | Rating distribution bar | FUND_03_Recommendations |
| N-21 | 8q surprise + SUE | FUND_02 + STOCK_FACTORS.sue |
| N-23 (without driver-tagging) | News rows date / src / headline / sentiment / magnitude | BETA_12_News_digest filtered by ticker |
| N-29 | Sector context (stance / RS / regime fit) | SECTOR_FACTORS_daily + macro regime |
| MA-2..MA-5, MA-8 | Macro read / thesis / drivers / tripwires / positioning | macro-intelligence-builder output |
| MA-6 (statement_text only) | FOMC keypoints summary text | MACRO_STATE_fomc.statement_text + LLM summary |
| MA-7 | Signposts next 30d | MACRO_STATE_calendar |
| MA-9 | Macro notes | MACRO_STATE_news |
| SE-1..SE-5 | Sector header / read / thesis / drivers / tripwires | SECTOR_TREND_long + SECTOR_FACTORS_daily |
| SE-6 | Implementation table | PORTFOLIO_01 + POSITION_01 |
| TP-1 (without theme overlay) | News last 14d rows | BETA_12_News_digest |
| TP-2, TP-3 (without theme overlay) | Moves last 14d, unexplained | PRICE_01 σ-rolling |

### 🔴 GAP — used in mockup, not in DB; sub-sprint B decides

| Mock # | Field | Why it's a gap |
|---|---|---|
| TB-1 | "AI fresh · 6m ago" | needs a global "latest narrative timestamp" rollup; trivial calc |
| TB-2 | Regime label + confidence | macro-intelligence-builder writes thesis blob but no formal `regime` + `confidence` columns; needs structured fields |
| T-1 | Tripwire counter | needs a structured tripwire table (currently lives in narrative blob) |
| T-2 | News 24h count (held names) | derivable from BETA_12; trivial calc |
| T-3 | Big moves 14d count | derivable from PRICE_01 σ-rolling; trivial calc |
| T-4 | Attention queue (top 3 by composite att score) | composite metric not defined or stored; needs a simple rule (e.g., drift+thesis-weight+DTC weight) |
| T-7 | News drift 24h breakdown by impact | needs per-event driver-impact tag (CONFIRM/WEAKEN/INVALIDATE) — AI-tagging step doesn't exist |
| T-8 | Convergence summary | convergence engine not implemented — composite of 8 signals (thesis, valuation, sector, catalyst, estimates, news, momentum, vol) |
| B-8 | Thesis tag | derivable from regime+driver-state but no structured drivers field today |
| B-9 | Att score | composite — needs definition (B decides drop or keep with simple rule) |
| B-10 (5y z), B-11 (level + 5y z) | own-5y z-scores | requires daily history of fwd_pe / EV-EBITDA — fwd_pe is in FUND_01 daily, but EV/EBITDA isn't stored today (PARSED-BUT-LOST below) |
| B-12, B-13 | 8q margin and FCF sparklines | only [0]+[4] quarterly slots stored today; need 8q persistence |
| CV-2 | 8 firing signals (full set) | engine doesn't exist; per-signal logic is spec'd in CONVERGENCE plan |
| H-4, H-5 | Hedge-cover % + hedge table | no `kind=hedge` flag or hedge-metadata model |
| N-4 | Drivers with CONFIRM/WEAKEN counts | needs per-driver news-tagging (AI agent) |
| N-5 | Tripwires | needs structured per-driver thresholds + status |
| N-8 | Recommendation block | sizing-engine not implemented |
| N-9 | Notes | no per-name notes table; could repurpose narrative |
| N-10 (PEG, EV/EBITDA, EV/Sales, EV/FCF, P/B, P/S, FCF yield, Buyback yield, Total yield) | 9 of 12 multiples | most are in AV OVERVIEW raw_json (PARSED-BUT-LOST); FCF yield / Buyback yield / Total yield are derived |
| N-11 | 5y mean / z / peer median / peer pctile / vs SPY columns | requires daily history of all multiples + a peer set + SPY composite |
| N-13 | Reverse DCF (NTM/terminal/WACC implied) | not currently structured (rationale text only) |
| N-14, N-15, N-16 | 20q sparklines + 8q deltas (R&D, GM, DSO, DIO, ND/EBITDA, share count) | quarterly persistence ≥8q not in FUND_01 today |
| N-17 (Altman, Beneish, ROIC, ROE, ROA) | composite quality scores | derivable from financials if quarterly history kept |
| N-18 | Estimates Q1/Q2/FY/FY+1 (consensus / range / prior 4w / revisions / implied YoY) | sell-side estimates feed not ingested |
| N-19 | Price targets (median / high / low / dispersion) | dispersion not stored — only single analyst_target field |
| N-22 | Last earnings keypoints | requires transcript ingestion (10-Q + PR exist) |
| N-24 | Aggregate thesis drift 30d + per-driver breakdown | depends on driver-tagged events (see N-4) |
| N-25, N-26 | 10-K Risk Factors y/y diff + MD&A tone delta | clusters exist; diff/tone classifier is computable, not persisted today |
| N-27 | Earnings call tone delta | transcript not ingested |
| N-28 | Peers table | no peer-set table or per-peer FUND/STOCK_FACTORS pull |
| MA-6 (dot plot, SEP, statement diff, market reaction blocks) | structured dot-plot / SEP / statement-diff fields | only `statement_text` lives today |
| SE-7 | Pair / Hedge ideas | no metadata model |
| TP-1, TP-2, TP-3 (theme overlay), TP-4 | Theme tags (tariffs / oil / ai-capex / rates / earnings / china) | curated taxonomy not in BETA_12.category vocabulary; needs an AI tagging step |
| M-6 | DXY, EURUSD, WTI, Copper, Gold | sector ETFs / commodities / FX may not be in PRICE_01 default 25-ticker universe — verify in B |
| M-7 (VVIX, NAAIM) | VVIX, NAAIM | yfinance ^VVIX free; NAAIM weekly free CSV — neither parsed today |

### 🔵 UNUSED — in DB, not surfaced in v2 mockup

| Table / column | Why interesting |
|---|---|
| BETA_04_Sentiment (put-call, AAII, COT) | could surface in cross-asset positioning column |
| MACRO_STATE_indicators rows beyond the cross-asset card (CPI/PPI/NFP/UNEMP/PCE/JOLTS/ICSA) | individual prints could surface as a per-release card or in Macro slide-out drivers |
| Bank Reserves WRESBAL, Fed funds DFF/upper/lower | Macro card on Fed posture / liquidity |
| UMich Consumer Sentiment + Inflation Expectations | could surface in Macro drivers (consumer / sticky inflation) |
| CBOE Skew | latent risk-tail indicator for cross-asset Vol·Positioning column |
| SIGNAL_HISTORY_daily | could power a "what fired today" mini-strip per name |
| SIGNAL_02_Probability (p_favorable / p_neutral / p_unfavorable) | aligns with the User-Profile final goal ("probability curves") — currently no UI surface in the v2 mockup |
| SIGNAL_03_Consensus (our vs market) | a high-signal row on each Name slide-out; currently absent |
| SIGNAL_03_ValuationRealized (back-tests) | could appear in Valuation card as "model accuracy at 5d / 21d horizons" |
| MOVER_EXPLANATIONS_daily.bullets | currently surfaced only as the sector top-mover label; the bullets / thesis text are unused |
| SECTOR_VALUATION_monthly | not used today; could feed sector valuation z directly |

### 🟡 PARSED-BUT-LOST — pipeline fetches, DB drops

| Source | Field | Where it goes today |
|---|---|---|
| AV OVERVIEW (`raw_json` blob) | PEGRatio, PriceToBookRatio, PriceToSalesRatioTTM, EVToEBITDA, EVToRevenue, ReturnOnEquityTTM, ReturnOnAssetsTTM, QuarterlyEarningsGrowthYoY, QuarterlyRevenueGrowthYoY, etc. | stored inside `FUND_01.raw_json` only — no typed columns, so dashboards can't sort/filter |
| AV INCOME_STATEMENT quarterlyReports[1..3, 5..7] | the 6 quarters between cur and YoY | dropped; only [0] and [4] are kept |
| AV BALANCE_SHEET quarterlyReports beyond cur+YoY | same | dropped |
| AV CASH_FLOW quarterlyReports beyond cur+YoY | same | dropped |
| Finnhub `/stock/metric` (when used) | EV/EBITDA, EV/Sales, P/B, P/S, FCF yield, ROIC, ROE, ROA, current ratio, debt/equity, beta, 52w hi/lo | bootstrap-only; Finnhub backfill writes to FUND_01 but the standard daily pipeline uses AV path which doesn't keep these as typed columns |
| `macro/scraper.js :: getSkew` | CBOE SKEW level | computed but not pushed via `ingest-macro` (verify) |
| `macro/scraper.js :: getGammaRegime_ETF` | VIXY / VIXM / regime | computed but not pushed |
| `news/index.js` | per-article ticker tags + summary | written to BETA_01 but the magnitude / sentiment overlay used by BETA_12 is computed downstream and may discard fields |

---

## Notes for sub-sprint B

1. **Verify the live wiring** before writing the new mockup, because some "AVAILABLE" rows depend on the worker being scheduled and the codes being correct: confirm `macro-state-fetcher` ingests DGS2/DGS10/DFII5/T5YIE/T5YIFR/BAMLC0A0CM/BAMLH0A0HYM2 and confirm `price-fetcher` ingests SPY + 11 sector ETFs + at least DXY/EURUSD/WTI/Copper/Gold/VIX/VVIX. If a row is "AVAILABLE in principle" but not actually written daily, treat it as 🔴 in B.

2. **Critical AV PARSED-BUT-LOST band** is the cheapest single win available in B → C: `raw_json` already holds PEG, P/B, P/S, EV/EBITDA, EV/Sales, ROE, ROA. Decision needed: surface them by parsing `raw_json` in the mockup (read-only — no schema change) **or** drop those slots until the pipeline sprint adds typed columns. The sprint constraint says no DB changes here, so the right call is to keep the slots and read from `raw_json` if the rationale doc accepts that approach, **or** drop them outright. B picks one.

3. **Driver-tagged news (N-4, N-23 driver column, N-24, T-7)** is the largest GAP cluster and is the AI-agent tagging step planned in `SPRINT_ai_agent_wiring.md`. The audit sprint should drop the per-driver counts and the impact-tag column from this mockup version, since adding it would mean inventing UI for capability the data layer doesn't yet provide.

4. **Convergence engine (T-8, CV-1..CV-4)** is similarly an engine that doesn't exist. B decides: keep with conviction-only (TICKER_TREND.score) labeling instead of "8 signals firing", or drop the surface.

5. **Sell-side estimates feed** (N-18, N-19 dispersion) — Finnhub gives consensus + range + price-target distribution on free tier; revisions count requires paid feeds. B picks the free subset (consensus + range + median PT + dispersion) and drops the revisions tape, OR drops the whole Estimates card.

6. **Hedges surface (H-4, H-5, SE-7)** — there is no hedge metadata model. Keep the headline KPIs (H-1/H-2/H-3 are AVAILABLE) and drop the hedge table + pair-ideas list. Reshape the Hedges section into a single net-exposure-and-hedge-cover strip.

7. **Tape theme overlay (TP-1..TP-4)** — without an AI tagging step, theme matching is the dashboard's central trick. B decides: keep Tape as plain news + plain moves + unexplained-flagged-by-no-news-within-±2d (deterministic match), drop the curated 6-theme vocabulary, **or** drop the Tape entirely until the AI sprint ships.

8. **20q fundamentals sparklines (N-14..N-16)** — without persisted quarterly history, these are deceptive. B drops them and replaces with 8q if AV's quarterlyReports are read at request-time on raw_json — but raw_json is OVERVIEW only, not statements. Likely outcome: drop, restore in pipeline-impl sprint.

9. **The sprint-output decision quality threshold** is "honest > full". Where a free source exists for a current rich slot, propose KEEP-with-new-source. Where no free source AND no calculation, drop. Where unsure, write the question into PARAMETER_DECISIONS.md so the user can answer in a 30-second back-and-forth.

---

> [INDEX](../../INDEX.md) · [Sprint plan](../SPRINT_2026-05-04_dashboard_balance.md)
