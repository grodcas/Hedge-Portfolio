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

*Last updated: 2026-02-25*
