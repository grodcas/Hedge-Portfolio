> [STRUCTURE](STRUCTURE.md)

# Test Checklist — System Validation

**Created**: 2026-04-10
**Status**: **Active** — Run before any rework begins
**Purpose**: Validate every component that was built before the rework. Confirm what works, document what's broken.

---

## How to Use

Run each test. Mark result: `[x]` pass, `[!]` broken, `[-]` skipped.
Record notes on failures — these become the fix list before rework begins.

---

## 1. Macro APIs (Individual)

Each function can be tested in Node REPL: `node --input-type=module`
```js
import { getCPI, getPPI, getEmployment, getBankReserves, getInterestRates, getVIXTermStructure, getConsumerSentimentUMich, getInflationExpectations, getFOMC, getSkew } from './macro/scraper.js'
```

| # | Test | Command | Success = | Result |
|---|------|---------|-----------|--------|
| 1.1 | BLS CPI | `await getCPI()` | Object with headline/core/food/shelter/energy, each with latest + previous values | [ ] |
| 1.2 | BLS PPI | `await getPPI()` | Object with finalDemand/goods/services, each with latest + previous | [ ] |
| 1.3 | BLS Employment | `await getEmployment()` | Object with payrolls + unemploymentRate, latest + previous | [ ] |
| 1.4 | FRED Bank Reserves | `await getBankReserves()` | Object with latest + previous, numeric values | [ ] |
| 1.5 | FRED Interest Rates | `await getInterestRates()` | Object with effective/upper/lower FFR values | [ ] |
| 1.6 | Yahoo VIX Term Structure | `await getVIXTermStructure()` | Object with vix/vix3m/vix9d values + gammaRegime | [ ] |
| 1.7 | UMich Consumer Sentiment | `await getConsumerSentimentUMich()` | Object with latest + previous, numeric index values | [ ] |
| 1.8 | UMich Inflation Expectations | `await getInflationExpectations()` | Object with 1Y + 5Y expectations, latest + previous | [ ] |
| 1.9 | Fed FOMC Statement | `await getFOMC()` | Object with title + link + date (or null if none recent) | [ ] |
| 1.10 | CBOE Skew | `await getSkew()` | Object with date + skew value | [ ] |

**Env required**: `BLS_KEY`, `FRED_KEY`

---

## 2. Macro Orchestrator (Full Run)

| # | Test | Command | Success = | Result |
|---|------|---------|-----------|--------|
| 2.1 | Full macro run | `node macro/index.js` | `macro/macro_summary.json` created with all indicators | [ ] |
| 2.2 | Output validation | Check JSON file | All 10+ indicators present, dates recent, values non-null | [ ] |

---

## 3. Sentiment Sources

| # | Test | Command | Success = | Result |
|---|------|---------|-----------|--------|
| 3.1 | Full sentiment run | `node sentiment/index.js` | `sentiment/sentiment_summary.json` created | [ ] |
| 3.2 | CBOE Put/Call ratios | Check output | Date is recent, ratio values are numeric (0.5-2.0 range) | [ ] |
| 3.3 | COT Futures | Check output | ES and NQ net positions present, numeric | [ ] |
| 3.4 | AAII Sentiment | Check output | Bullish/neutral/bearish % present (requires manual MHTML) | [ ] |

---

## 4. White House / FOMC

| # | Test | Command | Success = | Result |
|---|------|---------|-----------|--------|
| 4.1 | WH scraper | `node whitehouse/index.js` | `whitehouse/whitehouse_summary.json` created | [ ] |
| 4.2 | WH news listing | Check output | At least 1 article found (or empty array if no WH news today) | [ ] |
| 4.3 | Article text extraction | Check any article has summary | Summary is 100+ characters, coherent text | [ ] |

**Env required**: `OPENAI_API_KEY`

---

## 5. Press Release Scrapers (Per-Ticker)

Test each ticker individually: `node press/feeds/{TICKER}.js`
Success = JSON array output with `[{title, date, url}]`

| # | Ticker | Feed Discovery | Result | Notes |
|---|--------|---------------|--------|-------|
| 5.1 | AAPL | `node press/feeds/AAPL.js` | [ ] | |
| 5.2 | MSFT | `node press/feeds/MSFT.js` | [ ] | |
| 5.3 | GOOGL | `node press/feeds/GOOGL.js` | [ ] | |
| 5.4 | AMZN | `node press/feeds/AMZN.js` | [ ] | |
| 5.5 | NVDA | `node press/feeds/NVDA.js` | [ ] | |
| 5.6 | META | `node press/feeds/META.js` | [ ] | |
| 5.7 | BRK.B | `node press/feeds/BRK.B.js` | [ ] | Known: publishes PDFs |
| 5.8 | JPM | `node press/feeds/JPM.js` | [ ] | |
| 5.9 | GS | `node press/feeds/GS.js` | [ ] | |
| 5.10 | BAC | `node press/feeds/BAC.js` | [ ] | |
| 5.11 | XOM | `node press/feeds/XOM.js` | [ ] | |
| 5.12 | CVX | `node press/feeds/CVX.js` | [ ] | |
| 5.13 | UNH | `node press/feeds/UNH.js` | [ ] | |
| 5.14 | LLY | `node press/feeds/LLY.js` | [ ] | |
| 5.15 | JNJ | `node press/feeds/JNJ.js` | [ ] | |
| 5.16 | PG | `node press/feeds/PG.js` | [ ] | Known: content extraction broken (0 chars) |
| 5.17 | KO | `node press/feeds/KO.js` | [ ] | |
| 5.18 | HD | `node press/feeds/HD.js` | [ ] | |
| 5.19 | CAT | `node press/feeds/CAT.js` | [ ] | |
| 5.20 | BA | `node press/feeds/BA.js` | [ ] | |
| 5.21 | INTC | `node press/feeds/INTC.js` | [ ] | |
| 5.22 | AMD | `node press/feeds/AMD.js` | [ ] | |
| 5.23 | NFLX | `node press/feeds/NFLX.js` | [ ] | |
| 5.24 | MS | `node press/feeds/MS.js` | [ ] | |
| — | TSLA | **NO SCRAPER** | [-] | Missing from press/feeds/ entirely |

---

## 6. Press Article Extraction (Per-Ticker)

For each ticker that passed discovery (5.x), test article extraction with the URL from the feed:
`node press/articles/{TICKER}.js "{url_from_feed}"`
Success = 200+ characters of clean text output

| # | Ticker | Article Scraper | Result | Notes |
|---|--------|----------------|--------|-------|
| 6.1 | AAPL | `node press/articles/AAPL.js "{url}"` | [ ] | |
| 6.2 | MSFT | `node press/articles/MSFT.js "{url}"` | [ ] | |
| 6.3 | GOOGL | `node press/articles/GOOGL.js "{url}"` | [ ] | |
| 6.4 | AMZN | `node press/articles/AMZN.js "{url}"` | [ ] | |
| 6.5 | NVDA | `node press/articles/NVDA.js "{url}"` | [ ] | |
| 6.6 | META | `node press/articles/META.js "{url}"` | [ ] | |
| 6.7 | BRK.B | **NO ARTICLE SCRAPER** | [-] | PDFs — cannot parse |
| 6.8 | JPM | `node press/articles/JPM.js "{url}"` | [ ] | |
| 6.9 | GS | `node press/articles/GS.js "{url}"` | [ ] | |
| 6.10 | BAC | `node press/articles/BAC.js "{url}"` | [ ] | |
| 6.11 | XOM | `node press/articles/XOM.js "{url}"` | [ ] | |
| 6.12 | CVX | `node press/articles/CVX.js "{url}"` | [ ] | |
| 6.13 | UNH | `node press/articles/UNH.js "{url}"` | [ ] | |
| 6.14 | LLY | `node press/articles/LLY.js "{url}"` | [ ] | |
| 6.15 | JNJ | `node press/articles/JNJ.js "{url}"` | [ ] | |
| 6.16 | PG | `node press/articles/PG.js "{url}"` | [ ] | Known broken: 0 chars |
| 6.17 | KO | `node press/articles/KO.js "{url}"` | [ ] | |
| 6.18 | HD | `node press/articles/HD.js "{url}"` | [ ] | |
| 6.19 | CAT | `node press/articles/CAT.js "{url}"` | [ ] | |
| 6.20 | BA | `node press/articles/BA.js "{url}"` | [ ] | |
| 6.21 | INTC | `node press/articles/INTC.js "{url}"` | [ ] | |
| 6.22 | AMD | `node press/articles/AMD.js "{url}"` | [ ] | |
| 6.23 | NFLX | `node press/articles/NFLX.js "{url}"` | [ ] | |
| 6.24 | MS | `node press/articles/MS.js "{url}"` | [ ] | |

---

## 7. Press Full Orchestrator

| # | Test | Command | Success = | Result |
|---|------|---------|-----------|--------|
| 7.1 | Full press run | `node press/index.js` | `AA_press_releases_today.json` + `AA_press_summary.json` created | [ ] |
| 7.2 | Health check | Check `AA_press_releases_today.json` healthCheck | Count discovery:true vs false, content:true vs false | [ ] |

**Env required**: `OPENAI_API_KEY` (for summary.js)

---

## 8. SEC Edgar Pipeline

| # | Test | Command | Success = | Result |
|---|------|---------|-----------|--------|
| 8.1 | SEC API access | `curl -H "User-Agent: HedgeAI" https://data.sec.gov/submissions/CIK0000320193.json \| jq '.filings.recent.form[:5]'` | Returns array of form types | [ ] |
| 8.2 | Fetch filings | `node edgar/fetch.js` | HTML files in `edgar_raw_html/` for any recent filings | [ ] |
| 8.3 | Parse filings | Check `edgar_parsed_json/` | JSON files created from HTML files | [ ] |
| 8.4 | Cluster filings | Check `edgar_clustered_json/` | Clustered JSON files with text chunks | [ ] |

**Note**: If no filings were published in the last 2 days, steps 8.2-8.4 may produce empty results. This is normal. Check that the SEC API call (8.1) works and that the pipeline doesn't error.

---

## 9. Cloudflare Workers — Query Endpoints (Read-Only, Safe)

Test that the worker is alive and D1 has data. All GET requests, no side effects.

```bash
BASE=https://portfolio-ingestor.gines-rodriguez-castro.workers.dev
```

| # | Test | Command | Success = | Result |
|---|------|---------|-----------|--------|
| 9.1 | Worker alive | `curl $BASE/query/macro` | HTTP 200, JSON response | [ ] |
| 9.2 | Macro data | `curl $BASE/query/macro` | Array of macro indicators with dates and values | [ ] |
| 9.3 | Sentiment data | `curl $BASE/query/sentiment` | Array of sentiment indicators | [ ] |
| 9.4 | Press data | `curl $BASE/query/press` | Object with ticker keys, arrays of press items | [ ] |
| 9.5 | White House data | `curl $BASE/query/whitehouse` | Array of WH statements | [ ] |
| 9.6 | News data | `curl $BASE/query/news` | News articles (may be empty if news pipeline not run recently) | [ ] |
| 9.7 | Daily macro summary | `curl $BASE/query/daily-macro` | Object with summary text + structure | [ ] |
| 9.8 | Macro trend | `curl $BASE/query/macro-trend` | Object with summary text | [ ] |
| 9.9 | Macro news (5 layers) | `curl $BASE/query/macro-news` | Object with layer_calendar, layer_geopolitics, etc. | [ ] |
| 9.10 | Ticker trends | `curl $BASE/query/ticker-trends` | Object keyed by ticker, each with summary | [ ] |
| 9.11 | Daily news | `curl $BASE/query/daily-news` | Object keyed by ticker, each with sentiment + summary | [ ] |
| 9.12 | SEC reports (AAPL) | `curl "$BASE/query/reports?ticker=AAPL"` | Array of reports with type, date, summary | [ ] |
| 9.13 | Pipeline validation | `curl $BASE/query/pipeline-validation` | Validation summary object | [ ] |
| 9.14 | Verification results | `curl $BASE/query/verification` | Verification scores and issues | [ ] |
| 9.15 | Workflow status | `curl $BASE/query/workflow-status` | Status object with completion timestamp | [ ] |

---

## 10. Cloudflare Workers — Job Engine

| # | Test | Command | Success = | Result |
|---|------|---------|-----------|--------|
| 10.1 | Job engine alive | `curl -X POST $WORKFLOW/run -H "Content-Type: application/json" -d '{"action":"daily_macro"}'` | `{"ok":true, "workflowId":"..."}` | [ ] |
| 10.2 | Daily macro summarizer | Trigger 10.1, then check `curl $BASE/query/daily-macro` | Summary updated with today's date | [ ] |
| 10.3 | Single ticker news | `curl -X POST $WORKFLOW/run -H "Content-Type: application/json" -d '{"action":"daily_news","ticker":"AAPL"}'` | `{"ok":true}` | [ ] |
| 10.4 | Check news result | After 10.3, `curl $BASE/query/daily-news` | AAPL entry has today's date | [ ] |

```bash
WORKFLOW=https://job-engine-workflow.gines-rodriguez-castro.workers.dev
```

**Note**: 10.2 and 10.4 require waiting 30-60 seconds for the worker to complete before checking.

---

## 11. Dashboard

| # | Test | Command | Success = | Result |
|---|------|---------|-----------|--------|
| 11.1 | Server starts | `npm run dashboard` | "Listening on port 4200" without errors | [ ] |
| 11.2 | Home page loads | Open `http://localhost:4200` | Dashboard renders with tabs | [ ] |
| 11.3 | Dates API | `curl http://localhost:4200/api/dates` | JSON array of dates with data | [ ] |
| 11.4 | Dashboard data | `curl http://localhost:4200/api/dashboard/2026-04-10` | Full data object with macro, sentiment, etc. | [ ] |
| 11.5 | Overview tab | Click Overview tab | Health cards, today's stats, calendar events render | [ ] |
| 11.6 | Daily tab | Click Daily tab | Ticker cards with sentiment badges render | [ ] |
| 11.7 | Macro tab | Click Macro tab | FOMC countdown, macro trend summary render | [ ] |
| 11.8 | Portfolio tab | Click Portfolio tab | Ticker trend cards with earnings countdown render | [ ] |
| 11.9 | Validation tab | Click Validation tab | Validation tables render (may be stale data) | [ ] |
| 11.10 | Monthly Check tab | Click Monthly Check tab | Macro/press/policy tables with verify buttons render | [ ] |

---

## 12. Validation Runner

| # | Test | Command | Success = | Result |
|---|------|---------|-----------|--------|
| 12.1 | Full validation | `npm run validate` | Completes without crash, prints summary table | [ ] |
| 12.2 | SEC checker | Check output | Per-ticker SEC results (match/mismatch/no filings) | [ ] |
| 12.3 | Macro checker | Check output | All indicators show url:✓ format:✓ data:✓ | [ ] |
| 12.4 | Sentiment checker | Check output | Put/Call, AAII, COT checks | [ ] |
| 12.5 | Press checker | Check output | Per-ticker discovery/content checks | [ ] |
| 12.6 | Policy checker | Check output | WH and FOMC page checks | [ ] |

---

## Excluded from Testing (Too Long / Requires Chain)

These are not individual tests — they require full pipeline runs or multi-step worker chains:

- **Report summarization** (10-K/10-Q) — requires cluster summarization → structure building → report summarization chain. Test by triggering `report` action and waiting.
- **Trend building** — requires 4 quarterly reports already summarized. Test by triggering `trend` action for a ticker with history.
- **Full daily_update workflow** — triggers 4+ parallel job chains. Test after all individual components pass.
- **Fact verification** — requires fresh press summaries with rawContent. Test as part of full pipeline.
- **News search unified** — triggers 25+ AI web searches. Test single ticker first (10.3) before full run.

---

## Pre-existing Known Issues

| Issue | Component | Severity | Notes |
|-------|-----------|----------|-------|
| TSLA missing | Press scrapers | Medium | No feed or article scraper exists |
| BRK.B PDFs | Press scrapers | Low | Berkshire publishes press as PDF — cannot parse |
| PG content extraction | Press articles | Medium | CSS selectors return 0 chars |
| `eval()` in press/index.js | Press orchestrator | Medium | Security risk, should be `JSON.parse()` |
| AAII manual download | Sentiment | Low | Requires manual MHTML file save |
| Yahoo Finance rate limits | Macro | Low | Unofficial endpoint, may 429 |
| No .env.example | Configuration | Low | New setup requires guessing env vars |

---

> [STRUCTURE](STRUCTURE.md)
