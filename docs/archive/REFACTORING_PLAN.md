# HF Repository Refactoring Plan

**Created:** 2026-02-25
**Version:** v1.0.0 baseline
**Status:** Planning Phase

---

## Executive Summary

This document outlines the complete refactoring plan for the HF (Hedge Fund Intelligence) repository. The goal is to transform a working but organically-grown codebase into a clean, professional, maintainable system while preserving all functional components.

### Guiding Principles

1. **Don't touch working parsers** - Individual scrapers (press, edgar, macro, sentiment, news) work correctly and are difficult to tune. Leave their internals alone.
2. **Preserve the LIFO job queue design** - The nested orchestrator pattern with LIFO execution is intentional and well-designed for dependency resolution.
3. **Separate validation from summarization** - Use existing fact-checking agents (fact_extractor + source_verifier) for traceability, not inline in summarizers.
4. **Keep audit lightweight** - Log relevant verification data, not excessive noise (no tokens/cost/duration tracking).
5. **Use git mv for renames** - Preserve file history for traceability.

---

## Table of Contents

1. [Phase 1: Delete Cruft](#phase-1-delete-cruft)
2. [Phase 2: Reorganize Press Scrapers](#phase-2-reorganize-press-scrapers)
3. [Phase 3: Clean Up Other Scrapers](#phase-3-clean-up-other-scrapers)
4. [Phase 4: Modularize Pipeline](#phase-4-modularize-pipeline)
5. [Phase 5: Unify Validation](#phase-5-unify-validation)
6. [Phase 6: Integrate Fact-Checking Agents](#phase-6-integrate-fact-checking-agents)
7. [Phase 7: Standardize Worker Naming](#phase-7-standardize-worker-naming)
8. [Phase 8: Documentation](#phase-8-documentation)

---

## Current State Assessment

### What Works Well
- Individual parsers (press, edgar, macro, sentiment, news, whitehouse)
- Worker architecture with LIFO job queue for nested dependencies
- Validation agents (fact_extractor, source_verifier, content_validator)
- Dashboard structure
- Cloudflare Workers deployment

### What Needs Improvement
- **Pipeline chaos:** 3 overlapping orchestrator files (INGESTOR.js, INGESTOR_PIPELINE.js, INGESTOR_PIPELINE_V2.js)
- **File sprawl:** Debug files in production, duplicate versions (_2 suffixes), abandoned stubs
- **Naming inconsistency:** AA_ prefix, _2/_3 suffixes, mixed case, unclear purpose
- **God files:** 471-line pipeline doing 8 different workflows inline
- **Scattered validation:** Health checks duplicated in scrapers AND validation/lib/
- **No traceability:** AI summaries not validated against sources in production
- **Ghost workers:** job-engine references non-existent workers

---

## Phase 1: Delete Cruft

**Risk:** Low
**Impact:** Clean root directory, remove confusion

### 1.1 Root Directory Cleanup

| File | Reason | Action |
|------|--------|--------|
| `INGESTOR.js` | 52 lines, only 3 lines of actual code, abandoned | DELETE |
| `INGESTOR_PIPELINE.js` | Superseded by INGESTOR_PIPELINE_V2.js | DELETE |
| `cat_debug.html` | 976KB debug dump | DELETE or .gitignore |
| `nul` | Windows artifact | DELETE |

### 1.2 Press Directory Cleanup

| File | Reason | Action |
|------|--------|--------|
| `press/cat_debug.html` | Duplicate debug file (976KB) | DELETE |
| `press/debug_bac.html` | Debug HTML (241KB) | DELETE |
| `press/debug_googl.html` | Debug HTML (68KB) | DELETE |
| `press/debug_gs.html` | Debug HTML (413KB) | DELETE |
| `press/debug_intc.html` | Debug HTML (133KB) | DELETE |
| `press/debug_pg.html` | Debug HTML (256KB) | DELETE |
| `press/debug_scraper.js` | Debug script in production | DELETE |

### 1.3 Edgar Directory Cleanup

| File | Reason | Action |
|------|--------|--------|
| `edgar/AA_EDGAR.js` | 2-line stub, never used | DELETE |
| `edgar/AA_EDGAR_LONG_TERM.js` | One-time backfill utility, not needed for production | DELETE |
| `edgar/edgar_dispatch_ALL_debug.js` | Debug variant | DELETE |

### 1.4 Add to .gitignore

```gitignore
# Debug artifacts
**/debug_*.html
**/cat_debug.html
*_debug.js
nul

# Logs (keep structure, ignore content)
logs/*.json
!logs/.gitkeep
```

### Files Deleted: ~15
### Space Recovered: ~3MB

---

## Phase 2: Reorganize Press Scrapers

**Risk:** Low
**Impact:** Clear two-stage architecture, easier navigation

### Current Structure (Confusing)
```
press/
├── AAPL.js       # Stage 1: News feed scraper
├── AAPL_2.js     # Stage 2: Article text scraper
├── AMD.js
├── AMD_2.js
├── ... (50 files total)
├── AA_press_releases_today.js  # Orchestrator
├── AA_press_summary.js
└── AA_read_files.js
```

### Proposed Structure (Clear)
```
press/
├── feeds/                    # Stage 1: News feed scrapers (25 files)
│   ├── AAPL.js              # Fetches news feed, identifies new articles
│   ├── AMD.js
│   ├── AMZN.js
│   └── ... (25 total, one per ticker)
│
├── articles/                 # Stage 2: Article text scrapers (25 files)
│   ├── AAPL.js              # Extracts full text from article URL
│   ├── AMD.js
│   ├── AMZN.js
│   └── ... (25 total, one per ticker)
│
├── index.js                  # Main orchestrator (renamed from AA_press_releases_today.js)
├── summary.js                # Summary generator (renamed from AA_press_summary.js)
├── utils.js                  # Shared utilities (renamed from AA_read_files.js)
│
└── output/                   # Output location
    └── summary.json          # Generated summary
```

### Migration Commands
```bash
# Create directories
mkdir -p press/feeds press/articles press/output

# Move Stage 1 scrapers (feed scrapers)
git mv press/AAPL.js press/feeds/AAPL.js
git mv press/AMD.js press/feeds/AMD.js
# ... (repeat for all 25 tickers)

# Move Stage 2 scrapers (article scrapers)
git mv press/AAPL_2.js press/articles/AAPL.js
git mv press/AMD_2.js press/articles/AMD.js
# ... (repeat for all 25 tickers)

# Rename orchestrator files
git mv press/AA_press_releases_today.js press/index.js
git mv press/AA_press_summary.js press/summary.js
git mv press/AA_read_files.js press/utils.js

# Move output
git mv press/AA_press_summary.json press/output/summary.json
```

### Update Imports
After moving files, update imports in:
- `press/index.js` (the orchestrator)
- `INGESTOR_PIPELINE_V2.js` (now imports from `press/index.js`)

---

## Phase 3: Clean Up Other Scrapers

**Risk:** Low
**Impact:** Consistent structure across all data sources

### 3.1 Edgar Cleanup

| Current | New | Notes |
|---------|-----|-------|
| `AA_EDGAR_SHORT_TERM.js` | `fetch.js` | Main SEC fetcher |
| `cluster_K_Q.js` | `cluster-10k.js` | 10-K/10-Q parser |
| `cluster_8K.js` | `cluster-8k.js` | 8-K parser |
| `cluster_4.js` | `cluster-form4.js` | Form 4 parser |
| `edgar_dispatch.js` | `dispatch.js` | Dispatcher |
| `edgar_dispatch_ALL.js` | DELETE | Redundant |

### 3.2 Whitehouse Cleanup

| Current | New | Notes |
|---------|-----|-------|
| `WHparser.js` | Keep or merge | Evaluate which is used |
| `WHparser2.js` | Merge into WHparser.js | If different functionality |

**Action:** Read both files, determine which is used, keep only one.

### 3.3 Sentiment Cleanup

| Current | New | Notes |
|---------|-----|-------|
| `AAII_local.js` | Evaluate | Local MHTML parser |
| `AAII_sent.js` | Evaluate | Puppeteer scraper |

**Action:** Determine which is actually called by `sentiment_summary.js`, keep only that one.

### 3.4 News Cleanup

| Current | New | Notes |
|---------|-----|-------|
| `CNBC.js` | Evaluate | |
| `CNBC2.js` | Evaluate | |

**Action:** Determine which is used, keep only one.

---

## Phase 4: Modularize Pipeline

**Risk:** Medium
**Impact:** Single clear entry point, testable modules

### Current State
`INGESTOR_PIPELINE_V2.js` (471 lines) does everything:
- Lines 97-139: Press ingestion + validation
- Lines 141-170: Whitehouse ingestion + validation
- Lines 173-212: News ingestion + validation
- Lines 215-262: SEC Edgar ingestion + validation
- Lines 265-305: Macro ingestion + validation
- Lines 308-336: Sentiment ingestion + validation
- Lines 339-386: Upload to workers
- Lines 389-438: Final validation summary

### Proposed Structure
```
src/
├── pipeline.js              # Main entry point (~80 lines)
│
├── steps/                   # Individual pipeline steps
│   ├── ingest-press.js      # Press release ingestion
│   ├── ingest-whitehouse.js # Policy/FOMC ingestion
│   ├── ingest-news.js       # News article ingestion
│   ├── ingest-edgar.js      # SEC filing ingestion
│   ├── ingest-macro.js      # Economic indicators ingestion
│   ├── ingest-sentiment.js  # Market sentiment ingestion
│   ├── upload.js            # Upload to Cloudflare workers
│   └── summarize.js         # Final validation summary
│
└── lib/                     # Shared utilities
    ├── logger.js            # Console + file logging
    ├── config.js            # Centralized configuration
    └── http.js              # HTTP client wrapper
```

### New pipeline.js (Conceptual)
```javascript
import { ingestPress } from './steps/ingest-press.js';
import { ingestWhitehouse } from './steps/ingest-whitehouse.js';
import { ingestNews } from './steps/ingest-news.js';
import { ingestEdgar } from './steps/ingest-edgar.js';
import { ingestMacro } from './steps/ingest-macro.js';
import { ingestSentiment } from './steps/ingest-sentiment.js';
import { upload } from './steps/upload.js';
import { summarize } from './steps/summarize.js';

async function run(options = {}) {
  const results = {};

  // Data collection
  results.press = await ingestPress();
  results.whitehouse = await ingestWhitehouse();
  results.news = await ingestNews();
  results.edgar = await ingestEdgar();
  results.macro = await ingestMacro();
  results.sentiment = await ingestSentiment();

  // Upload to workers
  await upload(results);

  // Validation summary
  await summarize(results);

  return results;
}

export { run };
```

### Each step module follows pattern:
```javascript
// steps/ingest-press.js
import { runScraper } from '../scrapers/press/index.js';
import { validatePress } from '../validation/lib/press-checker.js';

export async function ingestPress() {
  const data = await runScraper();
  const validation = await validatePress(data);
  return { data, validation };
}
```

---

## Phase 5: Unify Validation

**Risk:** Medium
**Impact:** Single source of truth for validation

### Current Problem
Validation happens in TWO places:
1. **Inline in scrapers:** Health checks during data collection
2. **Post-hoc in validation/lib/:** Complete re-validation after collection

### Solution
Remove inline validation from scrapers. They should ONLY scrape.
Run ALL validation as a separate step using `validation/lib/*.js`.

### Validation Directory (Already Well-Organized)
```
validation/
├── runner.js              # Main validation entry point
├── config.js              # URLs, CIKs, thresholds
├── lib/
│   ├── sec-checker.js     # SEC EDGAR validation
│   ├── macro-checker.js   # Macro indicators validation
│   ├── sentiment-checker.js
│   ├── press-checker.js
│   ├── news-checker.js
│   └── policy-checker.js
└── agents/                # AI fact-checking (see Phase 6)
    ├── fact_extractor.js
    ├── source_verifier.js
    ├── content_validator.js
    └── index.js
```

### Changes Required
1. Remove health check compilation from `press/AA_press_releases_today.js`
2. Remove inline validation from `sentiment_summary.js`
3. Remove inline validation from `macro_summary.js`
4. All validation flows through `validation/runner.js`

---

## Phase 6: Integrate Fact-Checking Agents

**Risk:** Medium
**Impact:** AI summary traceability in production

### Current State
The fact-checking agents exist and work:
- `fact_extractor.js` - Extracts verifiable claims from summaries
- `source_verifier.js` - Verifies claims against source documents
- `content_validator.js` - Orchestrates both

**Problem:** Not integrated into production workflow or stored in database.

### Proposed Integration

#### 6.1 New Database Table: PROC_04_Fact_verification
```sql
CREATE TABLE PROC_04_Fact_verification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary_id VARCHAR NOT NULL,           -- FK to the summary being verified
  summary_table VARCHAR NOT NULL,        -- Which table (ALPHA_01, ALPHA_02, etc.)
  fact_claim TEXT NOT NULL,              -- The extracted factual claim
  source_id VARCHAR,                     -- ID of source document
  source_location VARCHAR,               -- "line:123,char:456" or similar
  status VARCHAR NOT NULL,               -- VERIFIED | PARTIALLY_VERIFIED | NOT_FOUND | CONTRADICTED
  source_quote TEXT,                     -- Exact quote from source (if found)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for lookups
CREATE INDEX idx_fact_summary ON PROC_04_Fact_verification(summary_id, summary_table);
```

#### 6.2 Verification Output Format
For each AI-generated summary, store key facts with traceability:

```json
{
  "summary_id": "AAPL-10K-2025-10-31",
  "summary_table": "ALPHA_01_Reports",
  "facts": [
    {
      "claim": "Revenue increased 8.5% year-over-year",
      "source_id": "cluster_item7_3",
      "source_location": "line:47,char:1203",
      "status": "VERIFIED",
      "source_quote": "Total net sales increased 8.5% compared to the prior year"
    },
    {
      "claim": "Services segment grew to $24.2B",
      "source_id": "cluster_item7_5",
      "source_location": "line:112,char:3456",
      "status": "VERIFIED",
      "source_quote": "Services net sales were $24.2 billion"
    },
    {
      "claim": "China revenue declined 3%",
      "source_id": null,
      "source_location": null,
      "status": "NOT_FOUND",
      "source_quote": null
    }
  ],
  "verification_score": 0.67,
  "verified_at": "2026-02-25T14:30:00Z"
}
```

#### 6.3 Integration Points

**Option A: Post-Processing Validation (Recommended)**
- After workers generate summaries, run fact-checking as separate step
- Doesn't slow down summarization
- Can run on schedule (e.g., once per day for new summaries)

**Option B: Inline Validation**
- Add fact-checking after each summarizer
- Slows down processing
- Immediate traceability

**Recommendation:** Option A - Keep summarizers focused on summarization.

#### 6.4 New Worker: fact-checker
```javascript
// workers/fact-checker/src/index.js
// Runs fact-checking on today's summaries and stores results

export default {
  async fetch(request, env) {
    // 1. Query ALPHA_01_Reports for summaries created today
    // 2. For each summary, get source clusters from ALPHA_02_Clusters
    // 3. Run fact_extractor on summary
    // 4. Run source_verifier against clusters
    // 5. Store results in PROC_04_Fact_verification
    // 6. Return verification report
  }
};
```

#### 6.5 Dashboard Integration
Add verification status to dashboard:
- Show verification score per summary (e.g., "✓ 85% verified")
- Highlight NOT_FOUND or CONTRADICTED facts
- Link to source quotes

---

## Phase 7: Standardize Worker Naming

**Risk:** Medium (requires redeployment)
**Impact:** Clear taxonomy, easier maintenance

### Current Naming Issues
- Inconsistent prefixes: `beta-`, `qk-`, no prefix
- Unclear distinction: "summarizer" vs "processor" vs "builder"
- Ghost references: job-engine mentions `beta-macro-processor` (doesn't exist)

### Proposed Naming Convention

| Type | Pattern | Purpose |
|------|---------|---------|
| **Orchestrators** | `{domain}-orchestrator` | Enqueue jobs, manage dependencies |
| **Processors** | `{domain}-processor` | Transform/synthesize data |
| **Builders** | `{domain}-builder` | Create structures/trends |

### Rename Map

| Current Name | New Name | Notes |
|--------------|----------|-------|
| `job-engine-workflow` | `job-orchestrator` | Main job queue |
| `portfolio-ingestor` | `data-ingestor` | Data hub |
| `report-orchestrator` | Keep | Already correct |
| `trend-orchestrator` | Keep | Already correct |
| `news-orchestrator` | Keep | Already correct |
| `gen-orchestrator` | `macro-gen-orchestrator` | Clarify domain |
| `beta-trend-orchestrator` | `macro-trend-orchestrator` | Remove "beta-" |
| `qk-cluster-summarizer` | `cluster-processor` | Clearer name |
| `qk-structure-builder` | `structure-builder` | Remove "qk-" |
| `qk-report-summarizer` | `report-processor` | Clearer name |
| `8k-summarizer` | `8k-processor` | Consistent |
| `form4-summarizer` | `form4-processor` | Consistent |
| `trend-builder` | Keep | Already correct |
| `news-summarizer` | `news-processor` | Consistent |
| `macro-summarizer` | `macro-processor` | Consistent |
| `sentiment-summarizer` | `sentiment-processor` | Consistent |
| `gen-builder` | `gen-processor` | It processes, not builds |
| `beta-trend-builder` | `macro-trend-builder` | Remove "beta-" |
| `macro-news-summarizer` | `macro-news-processor` | Consistent |
| `daily-macro-summarizer` | `daily-processor` | Consistent |
| `from48-summarizer` | DELETE or integrate | Legacy, different schema |
| `job-cron` | DELETE or fix bindings | Incomplete implementation |

### Worker Directory Reorganization
```
workers/
├── orchestrators/
│   ├── job/                    # Main job queue
│   ├── report/                 # SEC report routing
│   ├── trend/                  # Trend job queuing
│   ├── news/                   # News job queuing
│   ├── macro-gen/              # Macro synthesis queuing
│   └── macro-trend/            # Macro trend queuing
│
├── processors/
│   ├── cluster/                # SEC cluster processing
│   ├── report/                 # Report synthesis
│   ├── 8k/                     # 8-K processing
│   ├── form4/                  # Form 4 processing
│   ├── news/                   # Daily news processing
│   ├── macro/                  # Macro indicator processing
│   ├── sentiment/              # Sentiment processing
│   ├── gen/                    # Gen synthesis
│   ├── macro-news/             # Macro news processing
│   └── daily/                  # Daily consolidation
│
├── builders/
│   ├── structure/              # Report structure builder
│   ├── trend/                  # Ticker trend builder
│   └── macro-trend/            # Macro trend builder
│
├── ingestor/                   # Data ingestor
│
└── fact-checker/               # NEW: Fact verification
```

---

## Phase 8: Documentation

**Risk:** Low
**Impact:** Knowledge preservation, onboarding

### New Documentation Files

#### 8.1 docs/ARCHITECTURE.md
- System overview diagram
- Data flow from sources to dashboard
- Component responsibilities

#### 8.2 docs/WORKER_TAXONOMY.md
- Complete worker list with responsibilities
- Input/output tables for each worker
- Dependency graph

#### 8.3 docs/DATABASE_SCHEMA.md
- All tables with column definitions
- Relationships between tables
- Index definitions

#### 8.4 docs/PIPELINE.md
- Step-by-step pipeline execution
- Configuration options
- Troubleshooting guide

#### 8.5 Move Existing Docs
```bash
git mv KEY_COMMANDS.txt docs/KEY_COMMANDS.md
git mv CALENDAR.js docs/CALENDAR.md  # Convert to documentation
git mv VALIDATION_SYSTEM_SPEC.md docs/VALIDATION_SPEC.md
```

---

## Final Directory Structure

```
HF/
├── src/                          # Main pipeline code
│   ├── pipeline.js               # Single entry point
│   ├── steps/                    # Pipeline steps (8 modules)
│   │   ├── ingest-press.js
│   │   ├── ingest-whitehouse.js
│   │   ├── ingest-news.js
│   │   ├── ingest-edgar.js
│   │   ├── ingest-macro.js
│   │   ├── ingest-sentiment.js
│   │   ├── upload.js
│   │   └── summarize.js
│   └── lib/                      # Shared utilities
│       ├── logger.js
│       ├── config.js
│       └── http.js
│
├── press/                        # Press release scrapers
│   ├── feeds/                    # Stage 1 (25 files)
│   ├── articles/                 # Stage 2 (25 files)
│   ├── index.js
│   ├── summary.js
│   └── output/
│
├── edgar/                        # SEC filing scrapers
│   ├── fetch.js
│   ├── cluster-10k.js
│   ├── cluster-8k.js
│   ├── cluster-form4.js
│   ├── dispatch.js
│   ├── edgar_raw_html/
│   ├── edgar_parsed_json/
│   └── edgar_clustered_json/
│
├── macro/                        # Economic indicators
│   ├── index.js                  # (macro_summary.js renamed)
│   └── scraper.js                # (macro_scrap.js renamed)
│
├── sentiment/                    # Market sentiment
│   ├── index.js                  # (sentiment_summary.js renamed)
│   └── AAII.js                   # (keep working version)
│
├── news/                         # News sources
│   ├── index.js                  # (news_summary.js renamed)
│   ├── bloomberg/
│   ├── wsj/
│   └── reuters/
│
├── whitehouse/                   # Policy/FOMC
│   ├── index.js
│   └── parser.js                 # (WHparser.js renamed)
│
├── validation/                   # Validation system
│   ├── runner.js
│   ├── config.js
│   ├── lib/
│   │   ├── sec-checker.js
│   │   ├── macro-checker.js
│   │   ├── sentiment-checker.js
│   │   ├── press-checker.js
│   │   ├── news-checker.js
│   │   └── policy-checker.js
│   └── agents/
│       ├── fact_extractor.js
│       ├── source_verifier.js
│       ├── content_validator.js
│       └── index.js
│
├── workers/                      # Cloudflare workers (reorganized)
│   ├── orchestrators/
│   ├── processors/
│   ├── builders/
│   ├── ingestor/
│   └── fact-checker/             # NEW
│
├── dashboard/                    # Web dashboard
│   ├── server.js
│   ├── index.html
│   ├── app.js
│   └── styles.css
│
├── data/                         # Output data (JSON cache)
│   ├── daily_macro.json
│   ├── daily_news.json
│   ├── macro_trend.json
│   └── ticker_trends.json
│
├── logs/                         # Validation logs
│   └── .gitkeep
│
├── docs/                         # Documentation
│   ├── ARCHITECTURE.md
│   ├── WORKER_TAXONOMY.md
│   ├── DATABASE_SCHEMA.md
│   ├── PIPELINE.md
│   ├── KEY_COMMANDS.md
│   ├── CALENDAR.md
│   └── VALIDATION_SPEC.md
│
├── package.json
├── .env
└── .gitignore
```

---

## Implementation Order

| Phase | Description | Risk | Dependencies |
|-------|-------------|------|--------------|
| 1 | Delete cruft | Low | None |
| 2 | Reorganize press/ | Low | Phase 1 |
| 3 | Clean up other scrapers | Low | Phase 1 |
| 4 | Modularize pipeline | Medium | Phases 2-3 |
| 5 | Unify validation | Medium | Phase 4 |
| 6 | Integrate fact-checking | Medium | Phase 5 |
| 7 | Standardize worker naming | Medium | Phase 6 |
| 8 | Documentation | Low | All phases |

---

## Rollback Plan

Each phase should be committed separately with clear commit messages:
```
git commit -m "Phase 1: Delete debug artifacts and deprecated files"
git commit -m "Phase 2: Reorganize press/ into feeds/ and articles/"
git commit -m "Phase 3: Clean up edgar, whitehouse, sentiment, news"
git commit -m "Phase 4: Modularize pipeline into src/steps/"
git commit -m "Phase 5: Unify validation system"
git commit -m "Phase 6: Integrate fact-checking agents with PROC_04"
git commit -m "Phase 7: Standardize worker naming"
git commit -m "Phase 8: Add documentation"
```

If any phase breaks functionality, revert with:
```bash
git revert <commit-hash>
```

---

## Success Criteria

After refactoring:
- [ ] Single entry point: `npm run pipeline` or `node src/pipeline.js`
- [ ] Clear two-stage press scraper architecture (feeds/ + articles/)
- [ ] No debug files in production directories
- [ ] No duplicate implementations (WHparser2, CNBC2, AAII_local, etc.)
- [ ] Validation runs as separate step, not inline in scrapers
- [ ] Fact verification results stored in PROC_04_Fact_verification
- [ ] Worker names follow consistent taxonomy
- [ ] All documentation in /docs

---

## Notes

- **LIFO job queue:** Intentional design for nested dependency resolution. Do not change.
- **Parser internals:** Do not modify individual scraper logic (AAPL.js, macro_scrap.js, etc.)
- **Worker redeployment:** Phase 7 requires Cloudflare wrangler redeploys

---

*Document maintained by: Development Team*
*Last updated: 2026-02-25*
