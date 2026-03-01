> [STRUCTURE](../STRUCTURE.md) · [Pipeline](pipeline.md) · [Data Sources](data-sources.md) · [Validation](validation.md) · [Worker & D1](worker-d1.md) · [Dashboard](dashboard.md)

# Pipeline

**Entry point**: `src/pipeline.js`
**Command**: `npm run pipeline`

The pipeline is a 10-step sequential orchestrator that scrapes financial data from external sources, validates it, uploads it to Cloudflare D1, runs AI fact verification, and syncs the dashboard cache.

---

## Step Overview

| Step | Module | Purpose | Output |
|------|--------|---------|--------|
| 1 | `ingest-press.js` | Scrape 25 company newsrooms + AI summarize | `AA_press_summary.json` |
| 2 | `ingest-whitehouse.js` | Scrape White House + validate FOMC pages | `whitehouse_summary.json` |
| 3 | `ingest-news.js` | Parse pre-downloaded Bloomberg/WSJ/Reuters | `news_summary.json` |
| 4 | `ingest-edgar.js` | Download SEC filings → parse → cluster | `edgar_clustered_json/` |
| 5 | `ingest-macro.js` | Fetch BLS, FRED, UMich, Yahoo, Fed APIs | `macro_summary.json` |
| 6 | `ingest-sentiment.js` | Fetch CBOE put/call, AAII, COT futures | `sentiment_summary.json` |
| 7 | `upload.js` | POST to Cloudflare Worker + trigger workflow | D1 tables populated |
| 8 | `summarize.js` | Aggregate validation, upload summary to D1 | `PROC_01_Pipeline_logs` |
| 9 | `verify-facts.js` | AI hallucination check on press summaries | `GAMMA_01_Verification` |
| 10 | `sync-dashboard.js` | Poll workflow status, cache D1 data locally | `data/*.json` |

---

## Step Details

### Steps 1-6: Ingestion

Each step follows the same pattern:

```
1. Run scraper via importScript() (if !config.skipIngestion)
2. Run validation checker
3. Load output JSON file
4. Return { validation, data, actionRequired, hasWarnings }
```

The scraper scripts are **side-effect modules** — importing them triggers data fetching and file writing. The pipeline code itself doesn't call functions in them; the `import()` statement is the execution.

### Step 7: Upload

POSTs each data category to the Cloudflare Worker:

| Data | Endpoint | D1 Table |
|------|----------|----------|
| Macro | `POST /ingest/macro` | `BETA_03_Macro` |
| Sentiment | `POST /ingest/sentiment` | `BETA_04_Sentiment` |
| News | `POST /ingest/news` | `BETA_01_News` |
| Press | `POST /ingest/press` | `ALPHA_03_Press` |
| White House | `POST /ingest/whitehouse` | `BETA_02_WH` |
| SEC Reports | `POST /ingest/reports` | `ALPHA_01_Reports` + `ALPHA_02_Clusters` |

After uploading, triggers a `daily_update` workflow that runs the summarizer/builder workers.

SEC is different from the other 5: it runs a separate `AA_ingestor.js` script that reads clustered JSON files from disk and uploads each cluster individually.

### Step 8: Validation Summary

Aggregates pass/fail counts from all checkers and uploads to D1 as `pipeline-validation`. Also writes local `dashboard_DATE.json` and `pipeline_DATE.json` files.

### Step 9: AI Fact Verification

Loads `AA_press_summary.json` and for each article that has both `summary` and `rawContent`:
1. Sends both to OpenAI `gpt-4.1-mini` via the hallucination checker
2. The AI extracts factual claims, verifies each against the source, returns: score (0-100), verified facts with evidence, issues with explanations
3. Results are stored with `{problems, verifiedFacts, analysis}` packed into the `issues` JSON field
4. Uploaded to `GAMMA_01_Verification` in D1

Only press summaries are verified because they're the only ones with paired `rawContent`.

### Step 10: Sync Dashboard

1. Polls `/query/workflow-status` every 15 seconds (max 5 minutes) waiting for the `daily_update` workflow to complete
2. Once complete, fetches 7 D1 endpoints and caches responses as `data/*.json`
3. The dashboard can use this cache as a fallback (though the production dashboard reads directly from D1)

---

## Configuration

Defined in `src/lib/config.js`:

| Option | Default | Purpose |
|--------|---------|---------|
| `useAI` | `true` | Enable AI validation in checkers |
| `validatePress` | `true` | Run press validation |
| `validateNews` | `true` | Run news validation |
| `skipIngestion` | `false` | Skip scraping, only validate existing data |
| `logDir` | `logs/` | Where to write run logs |

---

## Results Object

The pipeline accumulates results into a single object:

```javascript
{
  date: "2026-03-01",
  validation: {
    press: [...],            // Press checker results
    policy: [...],           // Policy checker results
    news: [...],             // News checker results
    sec: { results, comparison },  // SEC checker + comparison
    macro: [...],            // Macro checker results
    sentiment: [...]         // Sentiment checker results
  },
  ingestedData: {
    press: { TICKER: [...] },
    whitehouse: { WhiteHouse: [...] },
    news: { SOURCE: [...] },
    sec: { TICKER: [...] },
    macro: { Macro: [...] },
    sentiment: { Sentiment: [...] }
  },
  summary: { hasErrors, hasWarnings, sections, calendarEvents, actionRequired },
  factVerification: { totalSummaries, verified, contradicted, verificationRate },
  dashboardSynced: boolean,
  logFile: "logs/pipeline_2026-03-01.json"
}
```

---

## Error Handling

- The entire pipeline is wrapped in `try/catch/finally` — an uncaught step error stops the pipeline.
- Step 9 (verification) has its own `try/catch` so verification failures don't kill the pipeline.
- Step 10 (sync) is conditional: only runs if upload produced a `workflowId`.
- Individual scraper failures within steps are logged as warnings; the step completes with partial results.

---

> [STRUCTURE](../STRUCTURE.md) · [Pipeline](pipeline.md) · [Data Sources](data-sources.md) · [Validation](validation.md) · [Worker & D1](worker-d1.md) · [Dashboard](dashboard.md)
