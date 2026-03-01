# Data Sources

The pipeline collects financial data from 6 categories of external sources. Each has its own scraper module, output format, and fragility profile.

---

## 1. Press Releases

**Module**: `press/index.js` + `press/summary.js`
**Technology**: Puppeteer (headless browser)
**Output**: `AA_press_releases_today.json`, `AA_press_summary.json`

### Architecture (3-tier)

```
Tier 1: Feed Discovery          press/feeds/AAPL.js, MSFT.js, ... (25 scripts)
  │     Puppeteer loads company newsroom, extracts {title, date, url}
  ▼
Tier 2: Article Extraction      press/articles/AAPL.js, MSFT.js, ... (25 scripts)
  │     Puppeteer loads article URL, extracts full text via Cheerio
  ▼
Tier 3: AI Summarization        press/summary.js
        OpenAI gpt-4.1-mini generates ~300-word summary per article
```

### Key Details

- Each ticker has **dedicated CSS selectors** in both its feed and article scripts. This is the primary maintenance burden — when a company redesigns their newsroom, the corresponding selectors break.
- `index.js` spawns each feed scraper as a child process with a **60-second timeout**.
- Results are filtered to **today and yesterday** via `normalizeDate()`.
- Health check: for each ticker, scrapes the latest article to verify the extraction pipeline works end-to-end.
- `summary.js` saves both the AI `summary` and the `rawContent` — the raw content is used later by the hallucination checker.

### Fragility

- **48 CSS selectors** (2 per ticker) that break on website redesigns
- Feed scripts output JSON to stdout, parsed with `eval()` (should be `JSON.parse()`)
- BRK.B publishes press releases as PDFs, which cannot be parsed
- Sequential processing: ~25 Puppeteer launches, one at a time

---

## 2. SEC Edgar

**Module**: `edgar/fetch.js` → `dispatch.js` → `dispatch-cluster.js`
**Technology**: HTTP fetch (SEC API) + Cheerio (HTML parsing)
**Output**: `edgar_raw_html/`, `edgar_parsed_json/`, `edgar_clustered_json/`

### Architecture (3-stage)

```
Stage 1: Fetch               edgar/fetch.js
  │      SEC API → download HTML filings (10-K, 10-Q, 8-K, Form 4)
  │      2-day lookback, 800ms rate limiting, accession-suffixed filenames
  ▼
Stage 2: Parse                edgar/dispatch.js → edgar_parsers/TICKER_TYPE.js
  │      Route each HTML to its ticker/type-specific parser
  │      Extract: items, paragraphs, tables, transactions
  ▼
Stage 3: Cluster              edgar/dispatch-cluster.js
         Group parsed content into 3-6K character chunks for AI processing
```

### Parser Types

| Filing | Parser Logic | Output |
|--------|-------------|--------|
| Form 4 | Extract "Table I" non-derivative transactions: security, date, code, amount, price | `[{cluster, content: "SECURITY: ... DATE: ... CODE: P/S/A..."}]` |
| 8-K | Extract text between first "Item" and "Signature(s)", split by item number | `[{item, text}]` |
| 10-K | Recursive DOM walker between item boundaries (Item 1, 7, 8), extract titles/text/tables | `[{type, text/title/rows}]` |
| 10-Q | Same pattern as 10-K for Items 1, 2, 3 | Same structure |

### Key Details

- **25 tickers** with hardcoded CIK numbers
- User-Agent: `"HedgeAI Research (contact: alifonsom2@gmail.com)"`
- Parsers are mostly **cloned from AAPL templates** via `AA_copy_parsers.js` — exception: `CVX_10K_item8.js` has custom boundary logic
- After download, `dispatch.js` and `dispatch-cluster.js` run via `execSync`

### Fragility

- SEC HTML is not standardized across filers — parser assumptions can fail for specific companies
- `execSync` for dispatch/cluster: if clustering crashes, the whole fetch fails
- CIK numbers are hardcoded (stable but would break on corporate restructuring)

---

## 3. Macro Indicators

**Module**: `macro/index.js` + `macro/scraper.js`
**Technology**: HTTP APIs + CSV parsing
**Output**: `macro_summary.json`

### Data Sources

| Indicator | API | Key |
|-----------|-----|-----|
| CPI (5 series: Headline, Core, Energy, Food, Shelter) | BLS API v2 | `BLS_KEY` |
| PPI (3 series: Final Demand, Goods, Services) | BLS API v2 | `BLS_KEY` |
| Employment (Payrolls, Unemployment) | BLS API v2 | `BLS_KEY` |
| Bank Reserves | FRED API | `FRED_KEY` |
| Consumer Sentiment | UMich CSV | None |
| Inflation Expectations (1Y, 5Y) | UMich CSV | None |
| VIX Term Structure (VIX, VIX3M, VIX9D) | Yahoo Finance | None |
| Gamma Regime | Computed from VIX data | N/A |
| FOMC Statement | Fed RSS + HTML scrape | None |
| CBOE Skew | CBOE CSV | None |

### Output Format

Each indicator produces: `{ heading, date, summary: { previous, current, pct_change } }`

### Fragility

- Yahoo Finance uses the unofficial `query1.finance.yahoo.com` endpoint — frequently rate-limited
- UMich CSV parsing relies on hardcoded column indices
- No retry logic on API failures

---

## 4. White House / FOMC

**Module**: `whitehouse/index.js` + `whitehouse/parser.js`
**Technology**: `node-fetch` + Cheerio
**Output**: `whitehouse_summary.json`

### Key Details

- Scrapes `whitehouse.gov/news/` listing page
- Filters to **today only** (no yesterday fallback unlike press)
- For each article: fetches full page, extracts text from `.wp-block-post-content`, summarizes with gpt-4.1-mini
- Output: `{ WhiteHouse: [{ title, date, summary }] }`

### Fragility

- WordPress Gutenberg block selectors (`.wp-block-post`, `.wp-block-post-title`) — relatively stable
- Today-only filter means empty results if pipeline runs before WH publishes
- No Puppeteer needed (server-rendered content)

---

## 5. Financial News

**Module**: `news/index.js`
**Technology**: Cheerio (HTML parsing) + OpenAI
**Output**: `news_summary.json`

### Key Details

- **Not automated** — requires manually downloaded HTML files placed in:
  - `news/BLOOMBERG/files/`
  - `news/WSJ/files/`
  - `news/REUTERS/files/`
- Source-specific CSS selectors for text extraction:
  - Bloomberg: `p[data-component="paragraph"]`
  - WSJ: `p[data-type="paragraph"]`
  - Reuters: `div[data-testid^="paragraph-"]`
- AI summarizes each article and detects relevant portfolio tickers
- All articles get today's date regardless of actual publication date

### Fragility

- Manual download is the primary bottleneck (Bloomberg, WSJ, Reuters are paywalled)
- CSS selectors are site-specific and change with redesigns

---

## 6. Market Sentiment

**Module**: `sentiment/index.js`
**Technology**: Puppeteer (CBOE), file parsing (AAII), HTTP (COT)
**Output**: `sentiment_summary.json`

### Data Sources

| Indicator | Source | Method |
|-----------|--------|--------|
| Put/Call Ratios (~18 values) | CBOE daily stats page | Puppeteer — finds "PUT/CALL RATIO" labels in `<td>` |
| AAII Sentiment Survey | Local `AAII.mhtml` file | MHTML parsing — extracts bullish/neutral/bearish % from table |
| COT Futures Positioning | CFTC weekly text file | HTTP — finds E-MINI S&P and NASDAQ MINI rows, extracts net positions |

### Fragility

- AAII requires manual MHTML download (not automated)
- CBOE uses JavaScript-rendered content requiring Puppeteer
- COT column indices are hardcoded to the CFTC report format

---

## Summary: Automation vs Manual

| Source | Automated | Manual Step |
|--------|-----------|-------------|
| Press Releases | Full | None (but selectors break) |
| SEC Edgar | Full | None |
| Macro Indicators | Full | None |
| White House | Full | None |
| News | Partial | Download HTML files from paywalled sites |
| Sentiment (CBOE, COT) | Full | None |
| Sentiment (AAII) | Partial | Download MHTML file |

---

[Back to STRUCTURE](../STRUCTURE.md)
