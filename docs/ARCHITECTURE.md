# HF System Architecture

## Overview

HF (Hedge Fund Intelligence) is an automated financial data pipeline that ingests, processes, validates, and synthesizes market data from 8+ sources into AI-powered insights.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA SOURCES                                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │  Press  │ │   SEC   │ │  Macro  │ │Sentiment│ │  News   │ │  FOMC   │   │
│  │25 tickers│ │ Edgar   │ │8 metrics│ │3 sources│ │3 journals│ │  + WH   │   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │
└───────┼──────────┼──────────┼──────────┼──────────┼──────────┼─────────────┘
        │          │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LOCAL INGESTION (Node.js)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  src/pipeline.js                                                     │    │
│  │  ├── steps/ingest-press.js      → press/index.js + press/summary.js │    │
│  │  ├── steps/ingest-whitehouse.js → whitehouse/index.js               │    │
│  │  ├── steps/ingest-news.js       → news/index.js                     │    │
│  │  ├── steps/ingest-edgar.js      → edgar/fetch.js                    │    │
│  │  ├── steps/ingest-macro.js      → macro/index.js                    │    │
│  │  ├── steps/ingest-sentiment.js  → sentiment/index.js                │    │
│  │  ├── steps/upload.js            → POST to portfolio-ingestor        │    │
│  │  └── steps/summarize.js         → Final validation report           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                     │                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  validation/                                                         │    │
│  │  ├── lib/sec-checker.js    ─┐                                       │    │
│  │  ├── lib/macro-checker.js   │                                       │    │
│  │  ├── lib/sentiment-checker.js ├── 6-stage validation               │    │
│  │  ├── lib/press-checker.js   │                                       │    │
│  │  ├── lib/news-checker.js    │                                       │    │
│  │  └── lib/policy-checker.js ─┘                                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ HTTP POST
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE WORKERS (20)                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  portfolio-ingestor                                                  │    │
│  │  POST /ingest/macro, /ingest/sentiment, /ingest/news, etc.          │    │
│  │  GET  /query/daily-macro, /query/ticker-trends, /query/all          │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                            │
│  ┌──────────────────────────────▼──────────────────────────────────────┐    │
│  │  job-engine-workflow (Durable Objects)                               │    │
│  │  ├── Reads PROC_01_Job_queue (LIFO)                                 │    │
│  │  ├── Dispatches to orchestrators/processors/builders                │    │
│  │  └── Updates PROC_02_Workflow_status on completion                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                 │                                            │
│  ┌──────────────────────────────▼──────────────────────────────────────┐    │
│  │  Orchestrators          Processors           Builders                │    │
│  │  ├── report-*          ├── qk-summarizer    ├── qk-structure-*      │    │
│  │  ├── trend-*           ├── 8k-summarizer    ├── trend-builder       │    │
│  │  ├── news-*            ├── form4-*          └── beta-trend-*        │    │
│  │  ├── gen-*             ├── news-summarizer                          │    │
│  │  └── beta-trend-*      ├── macro-*                                  │    │
│  │                        └── sentiment-*                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLOUDFLARE D1 DATABASE                             │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                   │
│  │ ALPHA Tables  │  │ BETA Tables   │  │ PROC Tables   │                   │
│  │ (per-ticker)  │  │ (macro/sent)  │  │ (processing)  │                   │
│  │ 01: Reports   │  │ 01: News      │  │ 01: Job_queue │                   │
│  │ 02: Clusters  │  │ 02: WH        │  │ 02: Status    │                   │
│  │ 03: Press     │  │ 03: Macro     │  │ 04: Facts     │                   │
│  │ 04: Trends    │  │ 04: Sentiment │  └───────────────┘                   │
│  │ 05: Daily_news│  │ 05-10: Proc'd │                                      │
│  └───────────────┘  └───────────────┘                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DASHBOARD                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  dashboard/server.js (Express, port 4200)                           │    │
│  │  ├── Fetches from portfolio-ingestor API                            │    │
│  │  ├── Polls /query/workflow-status for auto-refresh                  │    │
│  │  └── Falls back to local JSON cache                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  6 Tabs: Overview │ Daily │ Macro │ Portfolio │ Validation │ Check  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### Local Pipeline (`src/`)

| Component | File | Responsibility |
|-----------|------|----------------|
| Pipeline | `src/pipeline.js` | Main orchestrator, runs 8 steps in sequence |
| Config | `src/lib/config.js` | Configuration (useAI, skipIngestion, etc.) |
| Steps | `src/steps/*.js` | Individual ingestion/validation steps |

### Scrapers

| Component | Directory | Responsibility |
|-----------|-----------|----------------|
| Press | `press/feeds/` + `press/articles/` | Two-stage press release scraping |
| Edgar | `edgar/` | SEC filing download and clustering |
| Macro | `macro/` | Economic indicators (CPI, PPI, etc.) |
| Sentiment | `sentiment/` | AAII, Put/Call, COT |
| News | `news/` | Bloomberg, WSJ, Reuters parsing |
| Whitehouse | `whitehouse/` | FOMC statements, WH news |

### Validation (`validation/`)

| Component | File | Responsibility |
|-----------|------|----------------|
| SEC Checker | `lib/sec-checker.js` | Compare ingested vs SEC API |
| Macro Checker | `lib/macro-checker.js` | URL, format, data validation |
| Press Checker | `lib/press-checker.js` | Parser health check validation |
| News Checker | `lib/news-checker.js` | Article extraction validation |
| Fact Checker | `agents/*.js` | AI-based fact verification |

### Workers (`workers/`)

See [WORKER_TAXONOMY.md](./WORKER_TAXONOMY.md) for complete worker documentation.

## Data Flow

### Daily Update Flow

```
1. npm run pipeline
   │
   ├─► Step 1: Press (25 tickers)
   │   └─► press/feeds/*.js → press/articles/*.js → AA_press_summary.json
   │
   ├─► Step 2: White House
   │   └─► whitehouse/index.js → whitehouse_summary.json
   │
   ├─► Step 3: News
   │   └─► news/index.js (parse downloaded HTML) → news_summary.json
   │
   ├─► Step 4: SEC Edgar
   │   └─► edgar/fetch.js → edgar_raw_html/ → clustered_json/
   │
   ├─► Step 5: Macro
   │   └─► macro/index.js → macro_summary.json
   │
   ├─► Step 6: Sentiment
   │   └─► sentiment/index.js → sentiment_summary.json
   │
   ├─► Step 7: Upload
   │   └─► POST to portfolio-ingestor (5 endpoints)
   │   └─► Edgar local ingestion
   │
   └─► Step 8: Summarize
       └─► Generate validation report → logs/
```

### Worker Processing Flow

```
1. portfolio-ingestor receives data via POST
   │
2. Data written to D1 tables (ALPHA_03_Press, BETA_03_Macro, etc.)
   │
3. curl -X POST .../run?action=daily_update
   │
4. job-engine-workflow enqueues jobs to PROC_01_Job_queue
   │
5. Workflow processes jobs in LIFO order:
   │
   ├─► news-orchestrator (per ticker)
   │   └─► Ensures filings summarized → news-summarizer
   │
   ├─► daily-macro-summarizer
   │   └─► Consolidates macro + sentiment
   │
   └─► beta-trend-orchestrator
       └─► Synthesizes weekly macro trend
   │
6. PROC_02_Workflow_status.completed_at updated
   │
7. Dashboard auto-refreshes on completion
```

## Configuration

### Environment Variables (`.env`)

```bash
OPENAI_API_KEY=sk-...        # For AI validation and summarization
```

### Pipeline Config (`src/lib/config.js`)

```javascript
{
  useAI: true,           // Use AI for article validation
  validatePress: true,   // Run press release validation
  validateNews: true,    // Run news validation
  skipIngestion: false,  // Skip scraping (validation only)
  logDir: "logs/"        // Validation log directory
}
```

## Key Commands

```bash
# Run full pipeline
npm run pipeline

# Run just validation
npm run validate

# Run fact verification
npm run verify

# Start dashboard
npm run dashboard

# Trigger worker processing
curl -X POST https://job-engine-workflow.../run?action=daily_update
```

## Directory Structure

```
HF/
├── src/                  # Pipeline code
│   ├── pipeline.js       # Main entry point
│   ├── verify.js         # Standalone fact verification
│   ├── lib/              # Shared utilities
│   └── steps/            # 9 pipeline steps
│
├── press/                # Press release scrapers
│   ├── feeds/            # Stage 1 (25 tickers)
│   ├── articles/         # Stage 2 (23 tickers)
│   └── index.js          # Orchestrator
│
├── edgar/                # SEC filing scrapers
├── macro/                # Economic indicators
├── sentiment/            # Market sentiment
├── news/                 # News sources
├── whitehouse/           # Policy/FOMC
│
├── validation/           # 6-stage validation
│   ├── lib/              # Checkers
│   └── agents/           # AI fact-checking
│
├── workers/              # 20 Cloudflare workers
├── dashboard/            # Web UI
├── docs/                 # Documentation
├── logs/                 # Validation logs
└── data/                 # JSON cache
```

---

*Last updated: 2026-02-25*
