# Pipeline Execution Guide

This document describes the local data ingestion pipeline (`npm run pipeline`).

## Overview

The pipeline runs 8 sequential steps to ingest, validate, and upload market data from multiple sources.

```
npm run pipeline
    │
    ├─► Step 1: Press Releases    (25 tickers)
    ├─► Step 2: White House       (FOMC + WH statements)
    ├─► Step 3: News             (Bloomberg, WSJ, Reuters)
    ├─► Step 4: SEC Edgar        (10-K, 10-Q, 8-K, Form 4)
    ├─► Step 5: Macro            (8 economic indicators)
    ├─► Step 6: Sentiment        (AAII, Put/Call, COT)
    ├─► Step 7: Upload           (POST to portfolio-ingestor)
    └─► Step 8: Summarize        (Generate validation report)
```

## Step Details

### Step 1: Press Releases

**Module:** `src/steps/ingest-press.js`
**Scrapers:** `press/feeds/*.js` → `press/articles/*.js`

Two-stage scraping:
1. **Feed Stage** - Discover new press releases from IR pages
2. **Article Stage** - Extract full article content

**Output:** `press/AA_press_summary.json`

```json
{
  "AAPL": [
    {
      "date": "2026-02-25",
      "heading": "Apple Reports Q1 Results",
      "summary": "AI-generated summary..."
    }
  ]
}
```

### Step 2: White House

**Module:** `src/steps/ingest-whitehouse.js`
**Scrapers:** `whitehouse/index.js`

Scrapes FOMC statements and White House press briefings.

**Output:** `whitehouse/whitehouse_summary.json`

### Step 3: News

**Module:** `src/steps/ingest-news.js`
**Scrapers:** `news/index.js`

Parses manually downloaded news HTML from Bloomberg, WSJ, Reuters.

**Output:** `news/news_summary.json`

### Step 4: SEC Edgar

**Module:** `src/steps/ingest-edgar.js`
**Scrapers:** `edgar/fetch.js`

Fetches SEC filings for all 25 tickers:
- 10-K (Annual Reports)
- 10-Q (Quarterly Reports)
- 8-K (Current Reports)
- Form 4 (Insider Trading)

**Clustering:** Large filings are split into clusters by Item (7, 8, 1A, etc.)

**Output:** `edgar/clustered_json/`

### Step 5: Macro

**Module:** `src/steps/ingest-macro.js`
**Scrapers:** `macro/index.js`

Scrapes 8 economic indicators:
- CPI (Headline + Core)
- PPI
- Employment Situation
- FOMC Statement
- Bank Reserves
- University of Michigan Sentiment
- ISM Manufacturing

**Output:** `macro/macro_summary.json`

### Step 6: Sentiment

**Module:** `src/steps/ingest-sentiment.js`
**Scrapers:** `sentiment/index.js`

Scrapes 3 sentiment indicators:
- AAII Investor Sentiment
- Put/Call Ratio (Equity + Index)
- COT Futures (ES + NQ)

**Output:** `sentiment/sentiment_summary.json`

### Step 7: Upload

**Module:** `src/steps/upload.js`

POSTs all ingested data to the portfolio-ingestor worker:

| Endpoint | Data |
|----------|------|
| `POST /ingest/press` | Press releases |
| `POST /ingest/news` | News articles |
| `POST /ingest/whitehouse` | WH/FOMC statements |
| `POST /ingest/macro` | Macro indicators |
| `POST /ingest/sentiment` | Sentiment indicators |

Edgar data is ingested locally via the edgar module.

### Step 8: Summarize

**Module:** `src/steps/summarize.js`

Generates a validation summary report:
- Counts ingested items per source
- Reports validation pass/fail status
- Saves log to `logs/pipeline_YYYY-MM-DD.json`

---

## Configuration

**File:** `src/lib/config.js`

```javascript
{
  useAI: true,           // Use AI for validation
  validatePress: true,   // Run press validation
  validateNews: true,    // Run news validation
  skipIngestion: false,  // Skip scraping (validation only)
  logDir: "logs/"        // Log output directory
}
```

## Pipeline Result Object

```javascript
{
  date: "2026-02-25",
  steps: {},
  validation: {
    press: { passed: 22, failed: 3, issues: [...] },
    policy: { passed: 3, failed: 0 },
    news: { passed: 15, failed: 0 },
    sec: { results: [...], comparison: {...} },
    macro: { passed: 8, failed: 0 },
    sentiment: { passed: 3, failed: 0 }
  },
  ingestedData: {
    press: [...],
    whitehouse: [...],
    news: [...],
    sec: [...],
    macro: [...],
    sentiment: [...]
  },
  summary: "...",
  logFile: "logs/pipeline_2026-02-25.json"
}
```

---

## Validation System

The pipeline includes 6-stage validation. See [VALIDATION_SYSTEM_SPEC.md](./VALIDATION_SYSTEM_SPEC.md) for details.

| Checker | File | Purpose |
|---------|------|---------|
| SEC | `validation/lib/sec-checker.js` | Compare vs SEC API |
| Macro | `validation/lib/macro-checker.js` | URL/format/data checks |
| Sentiment | `validation/lib/sentiment-checker.js` | Indicator validation |
| Press | `validation/lib/press-checker.js` | Parser health check |
| News | `validation/lib/news-checker.js` | Article extraction |
| Policy | `validation/lib/policy-checker.js` | WH/FOMC validation |

---

## Running the Pipeline

```bash
# Full pipeline run
npm run pipeline

# Validation only (skip ingestion)
npm run validate

# Fact verification
npm run verify

# Start dashboard
npm run dashboard
```

---

## Directory Structure

```
src/
├── pipeline.js           # Main orchestrator
├── verify.js             # Standalone fact verification
├── lib/
│   └── config.js         # Configuration
└── steps/
    ├── ingest-press.js   # Step 1
    ├── ingest-whitehouse.js # Step 2
    ├── ingest-news.js    # Step 3
    ├── ingest-edgar.js   # Step 4
    ├── ingest-macro.js   # Step 5
    ├── ingest-sentiment.js # Step 6
    ├── upload.js         # Step 7
    ├── summarize.js      # Step 8
    └── verify-facts.js   # Fact verification helper
```

---

*Last updated: 2026-02-25*
