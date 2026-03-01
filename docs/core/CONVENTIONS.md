> [STRUCTURE](../STRUCTURE.md) · [Conventions](CONVENTIONS.md) · [Mistakes](MISTAKES.md) · [Diary](DIARY.md)

# Conventions

**Last updated**: 2026-03-01

Naming standards and patterns used across the codebase.

---

## File Naming

### Pipeline Output Files

| Category | Pattern | Example |
|----------|---------|---------|
| Press releases | `AA_press_releases_today.json` | Today's discovered press releases |
| Press summaries | `AA_press_summary.json` | AI-summarized press articles |
| Macro data | `macro_summary.json` | All macro indicators |
| Sentiment data | `sentiment_summary.json` | CBOE, AAII, COT data |
| White House | `whitehouse_summary.json` | WH articles + summaries |
| News | `news_summary.json` | Bloomberg/WSJ/Reuters summaries |

### SEC Edgar Files

| Stage | Pattern | Example |
|-------|---------|---------|
| Raw HTML | `TICKER_TYPE_DATE_ACCESSION.html` | `AAPL_10-K_2026-02-01_0000320193-26-000008.html` |
| Parsed JSON | `TICKER_TYPE_DATE_ACCESSION_parsed.json` | `AAPL_10-K_2026-02-01_0000320193-26-000008_parsed.json` |
| Clustered JSON | `TICKER_TYPE_DATE_ACCESSION_clustered.json` | Same pattern with `_clustered` suffix |

The accession suffix prevents filename collisions when multiple filings of the same type are filed on the same date (common with Form 4).

### Pipeline Logs

| File | Pattern | Example |
|------|---------|---------|
| Run log | `pipeline_YYYY-MM-DD.json` | `pipeline_2026-02-28.json` |
| Dashboard cache | `dashboard_YYYY-MM-DD.json` | `dashboard_2026-02-28.json` |
| Verification | `verification_YYYY-MM-DD.json` | `verification_2026-02-28.json` |

---

## D1 Database IDs

All primary keys are deterministic **SHA-256 hashes** of composite key fields. This ensures:
- **Idempotent upserts**: re-running the pipeline overwrites, never duplicates
- **No coordination needed**: any client can compute the same ID independently

### ID Formulas

| Table | Hash Input | Example |
|-------|-----------|---------|
| ALPHA_01_Reports | `ticker\|reportType\|reportDate\|report_seq` | `SHA256("AAPL\|10-K\|2026-02-01\|1")` |
| ALPHA_03_Press | `ticker\|date\|heading` | `SHA256("AAPL\|2026-02-28\|Q1 Results")` |
| ALPHA_04_Trends | `ticker\|summary` | Content-based — new summary = new row |
| BETA_01_News | `source\|date\|title` | `SHA256("Bloomberg\|2026-02-28\|Fed Holds Rates")` |
| BETA_02_WH | `date\|title` | `SHA256("2026-02-28\|Executive Order")` |
| BETA_03_Macro | `heading\|date` | `SHA256("CPI\|2026-02-28")` |
| GAMMA_01_Verification | `today\|summaryId\|summaryType` | `SHA256("2026-02-28\|AAPL\|press")` |
| PROC_01_Pipeline_logs | `today\|pipeline` | One row per day |

---

## D1 Table Naming

Tables follow a `CATEGORY_NN_Name` pattern:

| Prefix | Category | Tables |
|--------|----------|--------|
| `ALPHA` | Per-ticker data | Reports, Clusters, Press, Trends, Daily_news |
| `BETA` | Market-wide data | News, WH, Macro, Sentiment, Trend, Daily_macro |
| `GAMMA` | AI verification | Verification |
| `PROC` | Process control | Pipeline_logs, Workflow_status |

---

## Worker Naming

Workers follow a functional taxonomy:

| Category | Pattern | Examples |
|----------|---------|----------|
| Infrastructure | Purpose-based | `portfolio-ingestor`, `job-engine-workflow` |
| Orchestrators | `{domain}-orchestrator` | `news-orchestrator`, `trend-orchestrator` |
| Processors | `{type}-summarizer` | `8k-summarizer`, `macro-summarizer` |
| Builders | `{output}-builder` | `trend-builder`, `gen-builder` |

---

## Validation Checker Naming

All checker modules use kebab-case in `validation/lib/`:

```
sec-checker.js          # SEC EDGAR filing comparison
macro-checker.js        # BLS/FRED/UMich/Yahoo/Fed validation
sentiment-checker.js    # CBOE/AAII/COT validation
press-checker.js        # Press release parser health
policy-checker.js       # White House / FOMC page validation
news-checker.js         # Downloaded news article validation
ai-validator.js         # Shared AI quality classifier
```

---

## Code Patterns

### Pipeline Step Module

Every step in `src/steps/` exports a single async function that follows:

```javascript
export async function ingestXxx(config, logger, results) {
  const stepResult = {
    validation: null,
    data: null,
    actionRequired: [],
    hasWarnings: false
  };

  logger.startStep(N);

  // 1. Run scraper (if !config.skipIngestion)
  // 2. Run validation checker
  // 3. Load output JSON into stepResult.data

  logger.completeStep(N, count);
  return stepResult;
}
```

### Validation Checker Module

Each checker exports `checkAllXxx()` returning an array of results with consistent structure:

```javascript
{
  indicator|ticker|source: "name",
  checks: { url: bool, format: bool, data|text: bool, ai: bool },
  value|latest: "...",
  details: { urlError, formatError, dataError }
}
```

---

## Date Handling

- **Pipeline dates**: `calendar.todayISO()` from `validation/lib/calendar.js`
- **SEC lookback**: 2 days across all components (fetch.js, sec-checker.js, ingest-edgar.js)
- **Dashboard dates**: `new Date().toISOString().slice(0, 10)` (UTC)
- **Press filtering**: Today and yesterday via `normalizeDate()`

---

## AI Models Used

| Context | Model | Temperature |
|---------|-------|-------------|
| Press summarization | `gpt-4.1-mini` | default |
| News summarization | `gpt-4.1-mini` | default |
| White House summarization | `gpt-4.1-mini` | default |
| Hallucination checking | `gpt-4.1-mini` | 0.1 |
| Press quality check | `gpt-4.1-mini` | 0 |
| News/Policy AI validation | `o3-mini` | N/A (reasoning model) |

---

> [STRUCTURE](../STRUCTURE.md) · [Conventions](CONVENTIONS.md) · [Mistakes](MISTAKES.md) · [Diary](DIARY.md)
