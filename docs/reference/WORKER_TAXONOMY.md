# Worker Taxonomy

This document describes the Cloudflare Workers architecture and naming conventions.

## Overview

The system uses 20 Cloudflare Workers organized into four categories:
- **Orchestrators** - Manage job dependencies, enqueue work
- **Processors** - Transform and synthesize data with AI
- **Builders** - Create structures and trends
- **Infrastructure** - Job queue and data ingestion

## Worker Categories

### Infrastructure Workers

| Worker | Purpose | Input | Output |
|--------|---------|-------|--------|
| `job-engine-workflow` | Main job queue orchestrator using Durable Objects | PROC_01_Job_queue | Executes workers in LIFO order |
| `portfolio-ingestor` | Data hub for all ingestion endpoints | HTTP POST requests | ALPHA_* and BETA_* tables |

### Orchestrators (5)

Orchestrators manage job dependencies using LIFO queue ordering.

| Worker | Purpose | Input | Output |
|--------|---------|-------|--------|
| `report-orchestrator` | Routes 10-K/10-Q/8-K/Form4 to processors | Report ID | Enqueues processing jobs |
| `trend-orchestrator` | Queues report processing + trend builder | Ticker | Enqueues 4 report jobs + trend |
| `news-orchestrator` | Ensures filings summarized before news | Ticker + Date | Enqueues filing jobs + news |
| `gen-orchestrator` | Queues macro/sentiment synthesis | Date | Enqueues gen processing |
| `beta-trend-orchestrator` | Queues macro trend synthesis | Date | Enqueues trend processing |

### Processors (10)

Processors use AI to transform and synthesize data.

| Worker | Purpose | AI Model | Input Table | Output Table |
|--------|---------|----------|-------------|--------------|
| `qk-summarizer` | Cluster text summarization | GPT-4o-mini | ALPHA_02_Clusters | ALPHA_02_Clusters (summary) |
| `qk-report-summarizer` | Multi-cluster report synthesis | GPT-4o-mini | ALPHA_02_Clusters | ALPHA_01_Reports (summary) |
| `8k-summarizer` | 8-K filing summarization | GPT-4o-mini | ALPHA_02_Clusters | ALPHA_01_Reports |
| `form4-summarizer` | Insider trading summarization | GPT-4o-mini | ALPHA_02_Clusters | ALPHA_01_Reports |
| `news-summarizer` | Daily ticker news synthesis | GPT-4o-mini | BETA_01_News | ALPHA_05_Daily_news |
| `macro-summarizer` | Macro indicator synthesis | GPT-4o-mini | BETA_03_Macro | BETA_05_Macro_Processed |
| `sentiment-summarizer` | Sentiment indicator synthesis | GPT-4o-mini | BETA_04_Sentiment | BETA_06_Sentiment_Processed |
| `macro-news-summarizer` | Market news + WH synthesis | GPT-4o-mini | BETA_01_News | BETA_07_News_Processed |
| `daily-macro-summarizer` | Daily macro consolidation | GPT-4o-mini | BETA_03/04 | BETA_10_Daily_macro |
| `gen-builder` | Macro + sentiment synthesis | GPT-4o-mini | BETA_05/06 | BETA_08_Gen_Processed |

### Builders (3)

Builders create structures and long-form narratives.

| Worker | Purpose | AI Model | Input Table | Output Table |
|--------|---------|----------|-------------|--------------|
| `qk-structure-builder` | Select metric-anchored clusters | GPT-4o-mini | ALPHA_02_Clusters | ALPHA_01_Reports (structure) |
| `trend-builder` | 1-year ticker trend narrative | GPT-4o-mini | ALPHA_01_Reports | ALPHA_04_Trends |
| `beta-trend-builder` | Weekly macro trend narrative | GPT-4o-mini | BETA_08 + BETA_03 | BETA_09_Trend |

## Service Bindings

The `job-engine-workflow` binds to all workers via `wrangler.jsonc`:

```
Case Name (in switch)     → Binding Name           → Service Name
─────────────────────────────────────────────────────────────────
beta-macro-processor      → beta_macro_processor   → macro-summarizer
beta-sentiment-processor  → beta_sentiment_processor → sentiment-summarizer
beta-gen-processor        → beta_gen_processor     → gen-builder
beta-trend-processor      → beta_trend_processor   → beta-trend-builder
beta-gen-orchestrator     → BETA_GEN_ORCHESTRATOR  → gen-orchestrator
beta-trend-orchestrator   → BETA_TREND_ORCHESTRATOR → beta-trend-orchestrator
report-orchestrator       → REPORT_ORCHESTRATOR    → report-orchestrator
news-orchestrator         → NEWS_ORCHESTRATOR      → news-orchestrator
trend-orchestrator        → TREND_ORCHESTRATOR     → trend-orchestrator
form4-summarizer          → form4_summarizer       → form4-summarizer
8k-summarizer             → eightk_summarizer      → 8k-summarizer
qk-cluster-summarizer     → qk_cluster_summarizer  → qk-summarizer
qk-structure-builder      → qk_structure_builder   → qk-structure-builder
qk-report-summarizer      → qk_report_summarizer   → qk-report-summarizer
news-summarizer           → news_summarizer        → news-summarizer
trend-builder             → trend_builder          → trend-builder
daily-macro-summarizer    → DAILY_MACRO_SUMMARIZER → daily-macro-summarizer
macro-news-summarizer     → macro_news_summarizer  → macro-news-summarizer
```

## LIFO Job Queue Pattern

Workers use LIFO (Last In, First Out) ordering for dependency resolution:

```
1. Orchestrator receives high-level task
2. Orchestrator enqueues FINAL job FIRST (so it runs last)
3. Orchestrator enqueues DEPENDENCY jobs LAST (so they run first)
4. Queue processes in LIFO order
5. Dependencies complete before final job runs
```

Example: `trend-orchestrator` for ticker AAPL:
```
1. Enqueue: trend-builder (AAPL)        ← Runs LAST
2. Enqueue: report-orchestrator (Q4)    ← Runs 4th
3. Enqueue: report-orchestrator (Q3)    ← Runs 3rd
4. Enqueue: report-orchestrator (Q2)    ← Runs 2nd
5. Enqueue: report-orchestrator (Q1)    ← Runs FIRST
```

## Naming Convention (Current vs Ideal)

Current naming has inconsistencies. Ideal naming would be:

| Current Name | Category | Ideal Name |
|--------------|----------|------------|
| `qk-summarizer` | processor | `cluster-processor` |
| `qk-report-summarizer` | processor | `report-processor` |
| `qk-structure-builder` | builder | `structure-builder` |
| `macro-summarizer` | processor | `macro-processor` |
| `sentiment-summarizer` | processor | `sentiment-processor` |
| `gen-builder` | processor | `gen-processor` |
| `beta-trend-builder` | builder | `macro-trend-builder` |
| `beta-trend-orchestrator` | orchestrator | `macro-trend-orchestrator` |

**Note:** Renaming deployed workers requires:
1. Updating wrangler.jsonc bindings
2. Updating job-engine switch cases
3. Redeploying all affected workers
4. Ensuring no in-flight jobs reference old names

## Database Tables

### ALPHA Tables (Ticker-specific)
- `ALPHA_01_Reports` - 10-K/10-Q/8-K summaries
- `ALPHA_02_Clusters` - Parsed SEC filing sections
- `ALPHA_03_Press` - Press release summaries
- `ALPHA_04_Trends` - Yearly ticker trend narratives
- `ALPHA_05_Daily_news` - Per-ticker daily news summary

### BETA Tables (Macro/Sentiment)
- `BETA_01_News` - Raw news articles
- `BETA_02_WH` - White House statements
- `BETA_03_Macro` - Raw macro indicators
- `BETA_04_Sentiment` - Raw sentiment indicators
- `BETA_05_Macro_Processed` - Weekly macro synthesis
- `BETA_06_Sentiment_Processed` - Weekly sentiment synthesis
- `BETA_07_News_Processed` - Daily news synthesis
- `BETA_08_Gen_Processed` - Weekly gen synthesis
- `BETA_09_Trend` - Weekly macro trend
- `BETA_10_Daily_macro` - Daily macro consolidation

### PROC Tables (Processing)
- `PROC_01_Job_queue` - Job queue (LIFO)
- `PROC_02_Workflow_status` - Completion tracking
- `PROC_04_Fact_verification` - Fact verification results

## Worker Directory Structure

```
workers/
├── job-engine-workflow/    # Main orchestrator
├── portfolio-ingestor/     # Data hub
│
├── Orchestrators/
│   ├── report-orchestrator/
│   ├── trend-orchestrator/
│   ├── news-orchestrator/
│   ├── gen-orchestrator/
│   └── beta-trend-orchestrator/
│
├── Processors/
│   ├── qk-summarizer/          # Cluster processing
│   ├── qk-report-summarizer/   # Report synthesis
│   ├── 8k-summarizer/
│   ├── form4-summarizer/
│   ├── news-summarizer/
│   ├── macro-summarizer/
│   ├── sentiment-summarizer/
│   ├── macro-news-summarizer/
│   ├── daily-macro-summarizer/
│   └── gen-builder/            # Actually a processor
│
├── Builders/
│   ├── qk-structure-builder/
│   ├── trend-builder/
│   └── beta-trend-builder/
│
└── schema/
    └── PROC_04_Fact_verification.sql
```

---

*Last updated: 2026-02-25*
