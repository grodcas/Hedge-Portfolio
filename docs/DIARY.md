# Development Diary

Chronological log of changes. Append-only — never edit past entries.

---

### 2026-01-12

- First commit. Initial project structure with press release scrapers and macro data collectors.

### 2026-01-17

- Built first pipeline orchestrator to run all data collection in sequence.
- Fixed macro ingestion to store raw data instead of pre-summarized output.

### 2026-01-18

- Modified press release scrapers for additional tickers.
- Started news ingestion work (Bloomberg/WSJ/Reuters HTML parsing) — TBC.

### 2026-02-06

- First working ingestion pipeline — data flows from scrapers through to Cloudflare D1.
- Improved pipeline structure with better error handling.

### 2026-02-08

- Added fully automated workflow system via Cloudflare Workers.
- Documented key commands for triggering workflows (`docs/KEY_COMMANDS.md`).
- Modified daily macro summarizer and daily news summarizer workers.
- Fixed async/await patterns in several worker files.

### 2026-02-09

- Reduced login verbosity in worker scripts.
- Fixed miscellaneous bugs across the pipeline.

### 2026-02-16

- Fixed alpha trend builder not triggering on 10-K/10-Q filings. The trend builder was only watching for 8-K and Form 4, missing the most important annual/quarterly reports.

### 2026-02-24

- Fixed all validation issues: press scrapers (updated CSS selectors for GS, BAC, PG, INTC, GOOGL), macro checker, sentiment checker.

### 2026-02-25 — Major Refactoring (Phases 1-8)

- **Phase 1**: Deleted debug artifacts and deprecated files from project root.
- **Phase 2**: Reorganized `press/` directory into `feeds/` (per-ticker feed scrapers) and `articles/` (per-ticker article extractors).
- **Phase 3**: Cleaned up edgar, whitehouse, sentiment, news, macro module naming. Renamed files from `AA_EDGAR_SHORT_TERM.js` style to `fetch.js` style.
- **Phase 4**: Modularized monolithic pipeline into `src/steps/` with one file per step.
- **Phase 5**: Unified validation system — standardized checker naming to kebab-case.
- **Phase 6**: Integrated fact-checking agents. Added `hallucination-checker.js` and `verify-facts.js` pipeline step.
- **Phase 7**: Documented worker taxonomy and naming conventions.
- **Phase 8**: Created initial documentation suite (`docs/ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `KEY_COMMANDS.md`, `PIPELINE.md`, `WORKER_TAXONOMY.md`).
- Added workflow trigger and dashboard sync step to pipeline.
- Redesigned Validation tab with prominent AI fact verification section (hallucination detection banner, expandable cards, score circles).

### 2026-02-26

- Fixed AI verification to use simple hallucination checker comparing summaries against the same source content used for summarization (not fresh fetches).
- Fixed Daily News tab filtering — ticker cards now properly filter by selected date.
- Fixed FOMC/Fed data extraction to show actual content snippets instead of generic page titles.

### 2026-02-28

- Fixed SEC validation: changed comparison to use unique filing types instead of individual counts. `10 Form 4s on SEC == 1 Form 4 ingested` now matches correctly.
- Fixed SEC date range mismatch: aligned all 3 components (fetch.js, sec-checker.js, ingest-edgar.js) to use 2-day lookback.
- Fixed verification dashboard display: corrected score format from double-divided to single-divided. Score stored as 0-100, displayed as percentage once.

### 2026-03-01

- Updated hallucination checker to return `verifiedFacts` array with evidence, not just issues. Verification cards now show what was actually validated.
- Updated FOMC/Fed validation to fetch first paragraph from actual statement/minutes pages as proof of freshness.
- Increased ticker card height in Daily tab from 220px to 300px for better readability (6 visible lines).
- **Documentation overhaul**: Created TRADEBOT-style documentation structure with STRUCTURE.md hub, feature docs, conventions, mistakes log, diary, and guidelines.

---

[Back to STRUCTURE](STRUCTURE.md)
