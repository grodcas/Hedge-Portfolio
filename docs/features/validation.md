# Validation System

The validation system independently verifies every data source in the pipeline. It has two layers: **parser health checks** (are the scrapers working?) and **AI fact verification** (are the AI summaries truthful?).

---

## Parser Health Checks

Six checker modules in `validation/lib/`, each performing 3-4 tier checks on their respective data source.

### Checker Overview

| Checker | File | What It Validates | Check Tiers |
|---------|------|-------------------|-------------|
| SEC | `sec-checker.js` | EDGAR API vs local filings | API query → date filter → type comparison |
| Macro | `macro-checker.js` | BLS/FRED/UMich/Yahoo/Fed data | URL → format → data range |
| Sentiment | `sentiment-checker.js` | CBOE/AAII/COT data | URL/file → format → data present |
| Press | `press-checker.js` | Press scraper output | Discovery → content → freshness → AI quality |
| Policy | `policy-checker.js` | WH/FOMC pages | URL → format → text → AI quality |
| News | `news-checker.js` | Downloaded news HTML | File exists → text → quality → AI quality |

### Check Result Format

Every checker returns results with the same structure:

```javascript
{
  indicator|ticker|source: "name",
  checks: {
    url: true,       // Can reach the source
    format: true,    // Response has expected structure
    data: true,      // Values are present and in expected range
    ai: true         // AI classifies content as valid (optional)
  },
  value|latest: "...",
  details: {
    urlStatus: 200,
    urlError: null,
    formatError: null,
    dataError: null
  }
}
```

### SEC Comparison Logic

SEC validation has a unique comparison step:

1. `sec-checker.js` queries the SEC API for each of the 25 tickers (2-day lookback)
2. `sec-ingest-scanner.js` scans local `edgar_parsed_json/` and `edgar_raw_html/` directories
3. `compareWithIngested()` compares **unique filing types** (not counts):
   - SEC says: `"4, 8-K, 10-K"` → Ingestor has: `"4, 8-K, 10-K"` → **MATCH**
   - This means 10 Form 4s on SEC == 1 Form 4 ingested = still matches (by design)
   - Only a completely missing type triggers a mismatch

### AI Validation

Two AI models are used for quality checks:

| Module | Model | Purpose |
|--------|-------|---------|
| `ai-validator.js` | `o3-mini` | News and policy article quality classification |
| `press-checker.js` | `gpt-4.1-mini` | Press content quality (CLEAN vs GARBAGE) |

`ai-validator.js` has three modes:
- **`quickValidate()`** — Rule-based pre-filter (no API call): checks text length, garbage patterns, paragraph count, date presence
- **`validateArticleWithAI()`** — Sends first 1,500 chars to AI for binary classification
- **`hybridValidate()`** — Runs quick first, then AI only if quick passes

### Calendar Integration

`validation/lib/calendar.js` provides economic event calendar data to annotate validation results. Shows which macro indicators have expected releases today (CPI, Employment, FOMC, etc.).

---

## AI Fact Verification (Hallucination Detection)

**Module**: `validation/agents/hallucination-checker.js`
**Triggered by**: Pipeline step 9 (`src/steps/verify-facts.js`)
**Model**: `gpt-4.1-mini` (temperature 0.1)

### How It Works

```
Press Summary + Raw Source Content
         │
         ▼
   hallucination-checker.js
   "Compare SUMMARY against SOURCE CONTENT.
    Extract key claims, verify each one."
         │
         ▼
   { score: 0-100,
     verifiedFacts: [{fact, evidence}],
     issues: [{claim, problem}],
     analysis: "overall assessment" }
```

1. For each press article that has both `summary` and `rawContent`:
2. Sends both to gpt-4.1-mini with a fact-checking prompt
3. The AI extracts factual claims from the summary
4. Each claim is checked against the source content
5. Returns: verified facts with evidence quotes, any hallucinated claims with explanations, overall score

### Data Storage

Results are packed into a single JSON field for D1 storage (no schema migration needed):

```javascript
// Stored in GAMMA_01_Verification.issues column:
{
  problems: [{claim, problem}],        // Hallucinated claims
  verifiedFacts: [{fact, evidence}],   // Confirmed claims with source quotes
  analysis: "Overall assessment text"
}
```

The worker handles both old format (plain array) and new format (object) when reading.

### Coverage

Currently only **press summaries** are verified. This is because press is the only data source where the AI-generated summary and its raw source content are both stored together (`rawContent` in `AA_press_summary.json`).

---

## Validation Runner

**Module**: `validation/runner.js`
**Command**: `npm run validate`

A standalone runner that can execute all 6 checkers outside the pipeline. Useful for spot-checking data source health without running full ingestion.

```
runner.js
  ├── Step 1: SEC Edgar (sec-checker + sec-ingest-scanner)
  ├── Step 2: Macro (macro-checker)
  ├── Step 3: Sentiment (sentiment-checker)
  ├── Step 4: Press (press-checker)
  ├── Step 5: Policy (policy-checker)
  └── Step 6: News (news-checker, skipped by default)
```

---

## Dashboard Display

Validation results appear in two places on the dashboard:

### Validation Tab — AI Summary Verification (prominent)
- Critical issues banner (pulsing red) for detected hallucinations
- Stats bar: summaries checked, facts checked, passed/failed, accuracy %
- Expandable cards per ticker showing: score circle, analysis text, verified facts with evidence, any issues

### Validation Tab — Parser Health Checks (collapsible)
- SEC table: ticker, ingestor types, SEC check types, match status
- Macro table: indicator, URL/format/data checks, values
- Sentiment table: same check pattern
- Policy table: source, URL/format/text checks, latest title + date + snippet
- Press table: ticker, URL/format/text/AI checks, latest title

---

## Logger

**Module**: `validation/lib/logger.js`

Rich terminal UI with ANSI-based progress bars, colored status icons, and formatted tables. Also saves structured JSON logs for D1 upload.

Key methods:
- `logSECValidation()` — Ticker-level SEC comparison
- `logMacroValidation()` — Indicator-level macro results
- `logPressValidation()` — Press discovery/content/freshness
- `logNewsValidation()` — News HTML/text/AI results
- `printSECTable()` / `printMacroTable()` — Formatted ASCII tables
- `printFinalSummary()` — Per-section pass/fail box

---

[Back to STRUCTURE](../STRUCTURE.md)
