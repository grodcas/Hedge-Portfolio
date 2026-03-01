> [STRUCTURE](../STRUCTURE.md) · [Pipeline](pipeline.md) · [Data Sources](data-sources.md) · [Validation](validation.md) · [Worker & D1](worker-d1.md) · [Dashboard](dashboard.md)

# Cloudflare Worker & D1 Database

**Worker**: `portfolio-ingestor`
**URL**: `https://portfolio-ingestor.gines-rodriguez-castro.workers.dev`
**Database**: HEDGE_DB (D1)
**Config**: `workers/portfolio-ingestor/wrangler.jsonc`

The worker serves as the central data API — all data flows through it via POST `/ingest/*` (write) and GET `/query/*` (read). The dashboard reads exclusively from `/query/*` endpoints.

---

## Database Tables (15)

### ALPHA — Per-Ticker Data

| Table | Purpose | Written By |
|-------|---------|------------|
| `ALPHA_01_Reports` | SEC filing metadata + summaries | `/ingest/reports` |
| `ALPHA_02_Clusters` | Filing text clusters (3-6K chunks) | `/ingest/reports` |
| `ALPHA_03_Press` | Press release summaries | `/ingest/press` |
| `ALPHA_04_Trends` | Ticker trend summaries | `trend-builder` worker |
| `ALPHA_05_Daily_news` | Per-ticker daily news digests | `news-summarizer` worker |

### BETA — Market-Wide Data

| Table | Purpose | Written By |
|-------|---------|------------|
| `BETA_01_News` | Financial news articles | `/ingest/news` |
| `BETA_02_WH` | White House statements | `/ingest/whitehouse` |
| `BETA_03_Macro` | Macro indicator readings | `/ingest/macro` |
| `BETA_04_Sentiment` | Market sentiment data | `/ingest/sentiment` |
| `BETA_09_Trend` | Weekly macro trend narrative | `beta-trend-builder` worker |
| `BETA_10_Daily_macro` | Daily macro summary narrative | `daily-macro-summarizer` worker |

### GAMMA — AI Verification

| Table | Purpose | Written By |
|-------|---------|------------|
| `GAMMA_01_Verification` | Hallucination check results | `/ingest/verification` |

### PROC — Process Control

| Table | Purpose | Written By |
|-------|---------|------------|
| `PROC_01_Pipeline_logs` | Daily validation summary + logs | `/ingest/pipeline-validation` |
| `PROC_02_Workflow_status` | Workflow completion tracking | `job-engine-workflow` worker |

Full SQL definitions: see [DATABASE_SCHEMA.md](../reference/DATABASE_SCHEMA.md)

---

## API Routes — Query (GET)

### Combined Endpoints

| Route | Tables Queried | Response Shape |
|-------|---------------|----------------|
| `GET /query/all` | Macro, Sentiment, Trends, Daily_news, Daily_macro, Trend | `{ dailyMacro, macroTrend, tickerTrends, dailyNews, macro, sentiment }` |
| `GET /query/pipeline-validation?date=` | Pipeline_logs | `{ date, summary, validations, logs }` |

### Individual Endpoints

| Route | Table | Response Shape |
|-------|-------|----------------|
| `GET /query/daily-macro` | BETA_10_Daily_macro | `{ id, structure, summary, creation_date }` |
| `GET /query/macro-trend` | BETA_09_Trend | `{ id, summary, date }` |
| `GET /query/ticker-trends` | ALPHA_04_Trends | `{ TICKER: { id, summary, created_at } }` |
| `GET /query/daily-news` | ALPHA_05_Daily_news | `{ TICKER: { id, summary, todays_important, ... } }` |
| `GET /query/reports?ticker=` | ALPHA_01_Reports | `{ TICKER: [{ id, date, form_type, structure, summary }] }` |
| `GET /query/macro` | BETA_03_Macro | `{ Macro: [{ id, date, heading, summary }] }` |
| `GET /query/sentiment` | BETA_04_Sentiment | `{ Sentiment: [{ id, date, heading, summary }] }` |
| `GET /query/press?date=` | ALPHA_03_Press | `{ TICKER: [{ id, date, heading, summary }] }` |
| `GET /query/whitehouse` | BETA_02_WH | `{ WhiteHouse: [{ id, date, title, summary }] }` |
| `GET /query/news` | BETA_01_News | `{ SOURCE: [{ id, tickers, date, title, summary }] }` |
| `GET /query/verification?date=` | GAMMA_01_Verification | `{ date, results: [{ summaryId, score, issues, verifiedFacts, analysis }] }` |
| `GET /query/earnings-calendar` | ALPHA_01_Reports | `{ TICKER: { nextEarnings, type, lastFiling } }` |
| `GET /query/workflow-status` | PROC_02_Workflow_status | `{ id, status, completed_at }` |

---

## API Routes — Ingest (POST)

| Route | Body Shape | D1 Table | ID Hash |
|-------|-----------|----------|---------|
| `POST /ingest/macro` | `{ Macro: [{heading, date, summary}] }` | BETA_03_Macro | `SHA256(heading\|date)` |
| `POST /ingest/sentiment` | `{ Sentiment: [{heading, date, summary}] }` | BETA_04_Sentiment | `SHA256(heading\|date)` |
| `POST /ingest/news` | `{ SOURCE: [{date, title, tickers, summary}] }` | BETA_01_News | `SHA256(source\|date\|title)` |
| `POST /ingest/press` | `{ TICKER: [{date, heading, summary}] }` | ALPHA_03_Press | `SHA256(ticker\|date\|heading)` |
| `POST /ingest/whitehouse` | `{ WhiteHouse: [{date, title, summary}] }` | BETA_02_WH | `SHA256(date\|title)` |
| `POST /ingest/reports` | `{ ticker, reportType, reportDate, ... }` | ALPHA_01 + ALPHA_02 | `SHA256(ticker\|type\|date\|seq)` |
| `POST /ingest/verification` | `{ results: [{summaryId, score, issues}] }` | GAMMA_01_Verification | `SHA256(today\|id\|type)` |
| `POST /ingest/pipeline-validation` | `{ summary, validations, logs }` | PROC_01_Pipeline_logs | `SHA256(today\|pipeline)` |

All ingest endpoints use **upsert semantics** (`ON CONFLICT DO UPDATE`) — re-running the pipeline overwrites existing data for the same date without creating duplicates.

---

## Verification Data Format

The `issues` column in `GAMMA_01_Verification` stores JSON in two formats:

**Old format** (plain array):
```json
[{"claim": "...", "problem": "..."}]
```

**New format** (object with verified facts):
```json
{
  "problems": [{"claim": "...", "problem": "..."}],
  "verifiedFacts": [{"fact": "...", "evidence": "..."}],
  "analysis": "Overall assessment"
}
```

The query endpoint handles both formats transparently.

---

## Workflow Integration

After data upload, the pipeline triggers a `daily_update` action:

```
POST /run { action: "daily_update", tickers: [...] }
  │
  ▼
job-engine-workflow
  ├── news-summarizer → ALPHA_05_Daily_news
  ├── trend-builder → ALPHA_04_Trends (per ticker)
  ├── daily-macro-summarizer → BETA_10_Daily_macro
  ├── beta-trend-builder → BETA_09_Trend
  └── ... (20 workers total)
```

These workers write **directly to D1** (not through the portfolio-ingestor API). The full worker taxonomy is documented in [WORKER_TAXONOMY.md](../reference/WORKER_TAXONOMY.md).

---

## CORS & Auth

- CORS: `Access-Control-Allow-Origin: *` — open to any origin
- Authentication: **None**. The API is publicly accessible. Security relies on the URL being non-discoverable.

---

> [STRUCTURE](../STRUCTURE.md) · [Pipeline](pipeline.md) · [Data Sources](data-sources.md) · [Validation](validation.md) · [Worker & D1](worker-d1.md) · [Dashboard](dashboard.md)
