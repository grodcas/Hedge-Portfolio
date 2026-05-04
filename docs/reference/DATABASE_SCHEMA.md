# Database Schema

This document describes the Cloudflare D1 database schema used by the HF system.

## Table Overview

| Category | Tables | Description |
|----------|--------|-------------|
| ALPHA | 01-05 | Per-ticker data (SEC filings, press, trends, daily news) |
| BETA | 01-10 | Macro and sentiment data (raw + processed) |
| PROC | 01-04 | Processing control (job queue, status, facts) |

---

## ALPHA Tables (Ticker-Specific)

### ALPHA_01_Reports

Stores summarized SEC filings (10-K, 10-Q, 8-K, Form 4).

```sql
CREATE TABLE ALPHA_01_Reports (
  id VARCHAR PRIMARY KEY,          -- SHA256(ticker|type|date)
  date DATE NOT NULL,              -- Filing date
  ticker VARCHAR NOT NULL,         -- e.g., "AAPL"
  type VARCHAR NOT NULL,           -- "10-K", "10-Q", "8-K", "4"
  structure TEXT,                  -- JSON array of selected cluster IDs
  summary TEXT,                    -- AI-generated report summary
  last_update INTEGER DEFAULT 1,   -- Version counter
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reports_ticker ON ALPHA_01_Reports(ticker);
CREATE INDEX idx_reports_date ON ALPHA_01_Reports(date);
```

### ALPHA_02_Clusters

Stores parsed SEC filing sections (Item 7, Item 8, etc.).

```sql
CREATE TABLE ALPHA_02_Clusters (
  id VARCHAR PRIMARY KEY,          -- reportId_itemKey_clusterIndex
  report_id VARCHAR NOT NULL,      -- FK to ALPHA_01_Reports
  date DATE NOT NULL,              -- Filing date
  item VARCHAR,                    -- "7", "8", "1A", "2", "3"
  content TEXT,                    -- Raw SEC text
  importance INTEGER,              -- 1-10 AI rating
  title VARCHAR,                   -- Cluster summary title
  summary TEXT,                    -- Cluster summary text
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_clusters_report ON ALPHA_02_Clusters(report_id);
CREATE INDEX idx_clusters_ticker ON ALPHA_02_Clusters(date);
```

### ALPHA_03_Press

Stores press release summaries.

```sql
CREATE TABLE ALPHA_03_Press (
  id VARCHAR PRIMARY KEY,          -- SHA256(ticker|date|heading)
  ticker VARCHAR NOT NULL,
  date DATE NOT NULL,
  heading TEXT NOT NULL,           -- Press release headline
  summary TEXT,                    -- AI summary (or null if pending)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_press_ticker ON ALPHA_03_Press(ticker);
CREATE INDEX idx_press_date ON ALPHA_03_Press(date);
```

### ALPHA_04_Trends

Stores yearly ticker trend narratives (from last 4 10-K/10-Q).

```sql
CREATE TABLE ALPHA_04_Trends (
  id VARCHAR PRIMARY KEY,          -- UUID
  ticker VARCHAR NOT NULL,
  summary TEXT NOT NULL,           -- 1-year trend narrative
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trends_ticker ON ALPHA_04_Trends(ticker);
```

### ALPHA_05_Daily_news

Stores per-ticker daily news synthesis.

```sql
CREATE TABLE ALPHA_05_Daily_news (
  id VARCHAR PRIMARY KEY,          -- ticker-weekStartDate
  ticker VARCHAR NOT NULL,
  summary TEXT,                    -- Daily synthesis
  todays_important TEXT,           -- Today's key event
  last_important TEXT,             -- Important event from prior week
  last_important_date DATE,        -- Date of last_important
  new_sec TEXT,                    -- JSON array of new 10-K/10-Q IDs
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_daily_news_ticker ON ALPHA_05_Daily_news(ticker);
```

---

## BETA Tables (Macro/Sentiment)

### BETA_01_News

Stores raw news articles.

```sql
CREATE TABLE BETA_01_News (
  id VARCHAR PRIMARY KEY,          -- SHA256(source|date|title)
  tickers TEXT,                    -- JSON array of affected tickers
  date DATE NOT NULL,
  source VARCHAR NOT NULL,         -- "Bloomberg", "WSJ", "Reuters"
  title TEXT NOT NULL,
  summary TEXT,                    -- AI summary (or null)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_news_date ON BETA_01_News(date);
CREATE INDEX idx_news_source ON BETA_01_News(source);
```

### BETA_02_WH

Stores White House statements.

```sql
CREATE TABLE BETA_02_WH (
  id VARCHAR PRIMARY KEY,          -- SHA256(date|title)
  date DATE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_wh_date ON BETA_02_WH(date);
```

### BETA_03_Macro

Stores raw macro indicators.

```sql
CREATE TABLE BETA_03_Macro (
  id VARCHAR PRIMARY KEY,          -- SHA256(heading|date)
  date DATE NOT NULL,
  type VARCHAR NOT NULL,           -- "CPI", "PPI", "Employment", "FOMC", etc.
  summary TEXT,                    -- JSON or text value
  last_update INTEGER DEFAULT 1,   -- Version counter
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_macro_type ON BETA_03_Macro(type);
CREATE INDEX idx_macro_date ON BETA_03_Macro(date);
```

### BETA_04_Sentiment

Stores raw sentiment indicators.

```sql
CREATE TABLE BETA_04_Sentiment (
  id VARCHAR PRIMARY KEY,          -- SHA256(heading|date)
  date DATE NOT NULL,
  type VARCHAR NOT NULL,           -- "PUT_CALL_RATIO", "AAII_SENTIMENT", "COT_FUTURES"
  summary TEXT,                    -- JSON or text value
  last_update INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sentiment_type ON BETA_04_Sentiment(type);
CREATE INDEX idx_sentiment_date ON BETA_04_Sentiment(date);
```

### BETA_05_Macro_Processed

Stores weekly macro synthesis.

```sql
CREATE TABLE BETA_05_Macro_Processed (
  id VARCHAR PRIMARY KEY,          -- macro-weekStartDate
  date DATE NOT NULL,
  summary TEXT NOT NULL,           -- Synthesized macro narrative
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### BETA_06_Sentiment_Processed

Stores weekly sentiment synthesis.

```sql
CREATE TABLE BETA_06_Sentiment_Processed (
  id VARCHAR PRIMARY KEY,          -- sentiment-weekStartDate
  date DATE NOT NULL,
  summary TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### BETA_07_News_Processed

Stores daily news synthesis.

```sql
CREATE TABLE BETA_07_News_Processed (
  id VARCHAR PRIMARY KEY,          -- SHA256(date|news)
  date DATE NOT NULL,
  summary TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### BETA_08_Gen_Processed

Stores weekly macro + sentiment synthesis.

```sql
CREATE TABLE BETA_08_Gen_Processed (
  id VARCHAR PRIMARY KEY,          -- gen-weekStartDate
  date DATE NOT NULL,
  summary TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### BETA_09_Trend

Stores weekly macro trend narrative.

```sql
CREATE TABLE BETA_09_Trend (
  id VARCHAR PRIMARY KEY,          -- trend-weekStartDate
  date DATE NOT NULL,
  summary TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### BETA_10_Daily_macro

Stores daily macro + sentiment consolidation.

```sql
CREATE TABLE BETA_10_Daily_macro (
  id VARCHAR PRIMARY KEY,          -- daily-macro-YYYY-MM-DD
  structure TEXT,                  -- JSON array of {Table, Type, id}
  summary TEXT NOT NULL,
  creation_date DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## PROC Tables (Processing Control)

### PROC_01_Job_queue

Job queue for worker orchestration (LIFO processing).

```sql
CREATE TABLE PROC_01_Job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  worker VARCHAR NOT NULL,         -- Worker name (e.g., "news-orchestrator")
  input TEXT,                      -- JSON input for worker
  status VARCHAR DEFAULT 'pending', -- "pending", "running", "done", "failed"
  last_update DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_queue_status ON PROC_01_Job_queue(status);
CREATE INDEX idx_queue_worker ON PROC_01_Job_queue(worker);
```

### PROC_02_Workflow_status

Tracks workflow completion for dashboard auto-refresh.

```sql
CREATE TABLE PROC_02_Workflow_status (
  id VARCHAR PRIMARY KEY,          -- 'latest' (singleton)
  status VARCHAR NOT NULL,         -- "done", "running"
  completed_at DATETIME
);
```

### PROC_04_Fact_verification

Stores AI summary fact verification results.

```sql
CREATE TABLE PROC_04_Fact_verification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary_id VARCHAR NOT NULL,     -- Reference to verified summary
  summary_table VARCHAR NOT NULL,  -- Which table (ALPHA_01_Reports, etc.)
  fact_claim TEXT NOT NULL,        -- The factual claim
  fact_type VARCHAR,               -- "numeric" or "qualitative"
  source_id VARCHAR,               -- Source document ID
  source_location VARCHAR,         -- "line:123,char:456"
  source_quote TEXT,               -- Exact quote from source
  status VARCHAR NOT NULL,         -- VERIFIED | NOT_FOUND | CONTRADICTED
  confidence REAL,                 -- 0.0 to 1.0
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fact_summary ON PROC_04_Fact_verification(summary_id, summary_table);
CREATE INDEX idx_fact_status ON PROC_04_Fact_verification(status);
```

---

## Table Relationships

```
ALPHA_01_Reports
    │
    ├──► ALPHA_02_Clusters (report_id → id)
    │
    └──► ALPHA_04_Trends (last 4 reports → trend)

ALPHA_05_Daily_news
    │
    ├──► ALPHA_01_Reports (new_sec references)
    ├──► ALPHA_03_Press (ticker match)
    └──► BETA_01_News (ticker match)

BETA_03_Macro + BETA_04_Sentiment
    │
    ├──► BETA_05_Macro_Processed
    ├──► BETA_06_Sentiment_Processed
    ├──► BETA_08_Gen_Processed
    ├──► BETA_09_Trend
    └──► BETA_10_Daily_macro

PROC_01_Job_queue
    │
    └──► Processed by job-engine-workflow
         │
         └──► PROC_02_Workflow_status (completion tracking)
```

---

## ID Generation

Most tables use deterministic IDs via SHA256 hashing:

```javascript
// Example: Press release ID
const id = crypto.createHash('sha256')
  .update(`${ticker}|${date}|${heading}`)
  .digest('hex')
  .substring(0, 16);
```

This ensures:
- Idempotent inserts (same data = same ID)
- Conflict resolution via `ON CONFLICT DO UPDATE`
- No duplicate records

---

## Migrations 0035–0041 (SPRINT_pipeline_implementation, 2026-05-04)

These migrations apply the parameter swap from `docs/active/sprint-output/PARAMETER_DECISIONS.md §0`. All forward-only — no destructive ops, no DROP COLUMN.

### 0035 · FUND_01_Fundamentals — typed multiples

Added columns (all `REAL`, populated by `fetch-fundamentals.js` from AV OVERVIEW):

- `peg_ratio` — PEG (PEGRatio in raw_json)
- `ev_ebitda` — EV / EBITDA
- `ev_sales` — EV / Revenue
- `pb_ratio` — Price / Book
- `ps_ratio` — Price / Sales TTM
- `roe_ttm` — Return on Equity TTM
- `roa_ttm` — Return on Assets TTM

### 0036 · FUND_01_Quarterly (new table) — full quarterly history

```
ticker × fiscal_period_ending → 26 financial fields merged across IS / BS / CF
```

Replaces the old "[cur, YoY] only" persistence in `FUND_01_Fundamentals`. Supplies the 8q / 20q sparklines on the Book table and Name slide-out's Fundamentals card.

Written by `fetch-fundamentals.js` → POST `/ingest/fundamentals-quarterly`.

### 0037 · BETA_10_Daily_macro — structured regime / confidence / tripwires

Added columns:

- `regime TEXT` — 5-bucket label (bullish / cautious_bullish / neutral / cautious_bearish / bearish)
- `confidence REAL` — 0..1
- `tripwires_json TEXT` — JSON array `[{name, threshold, current_value, status}]`

Producer: `macro-intelligence-builder` (Wave 2000) starts populating on next run.

### 0038 · TICKER_TREND_long + SECTOR_TREND_long — tripwires_json

Per-thesis structured tripwire flags. Same shape as the macro version. Producers: `ticker-trend-long` (Wave 3000), `sector-trend-long` (Wave 1700).

### 0039 · PEER_SET_config (new table)

```
ticker PRIMARY KEY · peers_json TEXT · source TEXT · updated_at
```

One-time bootstrap import from `config/peers-mapping.json` produced by `scripts/bootstrap-peers.js`.

### 0040 · SENTIMENT_STATE_indicators (new table)

Typed mirror of the local pipeline's `BETA_04_Sentiment` JSON blob — same shape as `MACRO_STATE_indicators`. Codes: `PUTCALL_EQUITY`, `PUTCALL_INDEX`, `PUTCALL_TOTAL`, `AAII_BULLISH`, `AAII_BEARISH`, `AAII_BULL_BEAR`, `COT_ES_AM_NET`, `COT_ES_LF_NET`, `COT_NQ_AM_NET`, `COT_NQ_LF_NET`.

Written by `sentiment-state-fetcher` (own cron 00:25 UTC).

### 0041 · FOMC_PROJECTIONS (new table)

```
meeting_date × indicator × year × stat → value
```

Indicators: `GDP`, `UNEMPLOYMENT`, `PCE`, `CORE_PCE`, `FED_FUNDS` (dot plot).
Years: `'2026'`, `'2027'`, `'2028'`, `'Longer run'`.
Stats: `median`, `central_tendency_low`, `central_tendency_high`, `range_low`, `range_high`.

Written by `fomc-statement-fetcher` (extended in this sprint to also pull SEP HTML at projection meetings — March / June / Sept / Dec).

---

## MACRO_STATE_indicators — indicator codes (post-SPRINT_pipeline_implementation)

`macro-state-fetcher` writes the following daily/weekly/monthly to this single table. **Codes are descriptive, not raw FRED IDs.** Source field disambiguates (FRED / BLS / CBOE / YAHOO / NAAIM / ISM).

| Source | Code | Series ID | Cadence | Unit |
|---|---|---|---|---|
| FRED | FEDFUNDS | DFF | daily | % |
| FRED | FED_TARGET_UPPER | DFEDTARU | daily | % |
| FRED | FED_TARGET_LOWER | DFEDTARL | daily | % |
| FRED | DGS2 | DGS2 | daily | % |
| FRED | DGS10 | DGS10 | daily | % |
| FRED | REAL_5Y | DFII5 | daily | % |
| FRED | BREAKEVEN_5Y | T5YIE | daily | % |
| FRED | BREAKEVEN_5Y5Y_FWD | T5YIFR | daily | % |
| FRED | OAS_IG | BAMLC0A0CM | daily | % |
| FRED | OAS_HY | BAMLH0A0HYM2 | daily | % |
| FRED | FED_TOTAL_ASSETS | WALCL | weekly | $M |
| FRED | BANK_RESERVES | WRESBAL | weekly | $M |
| FRED | DXY_BROAD | DTWEXBGS | daily | index |
| FRED | WTI | DCOILWTICO | daily | $/bbl |
| FRED | GOLD | GOLDAMGBD228NLBM | daily | $/oz |
| FRED | VIX | VIXCLS | daily | index |
| FRED | INITIAL_CLAIMS | ICSA | weekly | claims |
| FRED | UMICH_SENT | UMCSENT | monthly | index |
| FRED | INFL_EXP_1Y | MICH | monthly | % |
| BLS | CPI_HEADLINE | CUUR0000SA0 | monthly | index |
| BLS | CPI_CORE | CUUR0000SA0L1E | monthly | index |
| BLS | PPI_FINAL_DEMAND | WPSFD4 | monthly | index |
| BLS | NFP | CES0000000001 | monthly | k |
| BLS | UNEMP | LNS14000000 | monthly | % |
| CBOE | SKEW | (CSV) | daily | index |
| YAHOO | EURUSD | EURUSD=X | daily | rate |
| YAHOO | COPPER | HG=F | daily | $/lb |
| YAHOO | VVIX | ^VVIX | daily | index |
| NAAIM | NAAIM | (CSV/page) | weekly | index |
| ISM | ISM_MFG | (page scrape) | monthly | index |
| ISM | ISM_SVC | (page scrape) | monthly | index |

---

*Last updated: 2026-05-04 (SPRINT_pipeline_implementation sub-sprint G)*
