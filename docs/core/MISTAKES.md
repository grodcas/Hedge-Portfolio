> [STRUCTURE](../STRUCTURE.md) · [Conventions](CONVENTIONS.md) · [Mistakes](MISTAKES.md) · [Diary](DIARY.md)

# Mistakes Log

Solved bugs and lessons learned. Each entry documents the problem, root cause, and the general principle to prevent recurrence.

---

## Form 4 Filename Collisions

**Date**: 2026-02-28
**Severity**: High
**Status**: Solved

### Problem
Multiple Form 4 filings for the same ticker on the same date produced identical filenames (`AAPL_4_2026-02-28.html`), causing files to overwrite each other. The pipeline reported fewer Form 4s than actually existed.

### Root Cause
The filename pattern `TICKER_TYPE_DATE.html` does not have enough uniqueness when multiple filings of the same type are filed on the same date. Form 4 insider transactions commonly have 3-5 filings per day per ticker.

### Solution
Added accession number suffix to filenames: `TICKER_TYPE_DATE_ACCESSION.html`. The accession number is globally unique per SEC filing. Updated `edgar/fetch.js`, `sec-ingest-scanner.js`, and all parsers.

### Lesson Learned
When designing file naming schemes for external data, always include the source system's unique identifier (accession number, article ID, etc.) — not just domain-level attributes like date and type.

---

## SEC Date Range Mismatch

**Date**: 2026-02-28
**Severity**: High
**Status**: Solved

### Problem
The SEC validation tab showed false mismatches: "AAPL has 8-K in SEC but not in ingestor." The filings existed locally but the comparison said they didn't match.

### Root Cause
Three components used different lookback windows:
- `edgar/fetch.js` used a 2-day lookback
- `sec-checker.js` used a 7-day lookback (querying more filings from SEC than were ever downloaded)
- `ingest-edgar.js` used `todayISO()` (today only)

The checker was comparing a 7-day window from SEC against a 2-day window from the local filesystem.

### Solution
Aligned all three components to use 2-day lookback. Changed the SEC comparison to use **unique filing types** (not counts) so that `10 Form 4s on SEC == 1 Form 4 ingested` still matches.

### Lesson Learned
When comparing data across components, ensure all components agree on the query window. Define the window once in config and reference it everywhere.

---

## AI Verification Score Double-Division

**Date**: 2026-02-28
**Severity**: Medium
**Status**: Solved

### Problem
The Validation tab showed scores like `0%` or `1%` for items that should have been `100%`. The hallucination checker was reporting perfect scores but the dashboard displayed them as near-zero.

### Root Cause
The hallucination checker stores scores as **0-100** integers (e.g., `score: 100`). The dashboard's `app.js` divided by 100 to get a rate (correct: `verificationRate = score / 100 = 1.0`). But the display code then called `Math.round(verificationRate * 100)` which is correct, while an older code path was dividing by 100 again, producing `0.01` instead of `1.0`.

### Solution
Standardized: `verify-facts.js` stores score as 0-100 integer. `app.js` converts to 0-1 rate exactly once (`score / 100`). Display multiplies back to percentage exactly once (`rate * 100`).

### Lesson Learned
Define the canonical unit for any metric (percentage, rate, raw count) at the storage layer and document it. Convert at display time only, and only once.

---

## Press Scraper Using eval() for JSON Parsing

**Date**: 2026-02-25
**Severity**: Medium
**Status**: Known (not yet fixed)

### Problem
`press/index.js` line 98 uses `eval("(" + out + ")")` to parse child process stdout instead of `JSON.parse()`. This could execute arbitrary code if a child process produces unexpected output.

### Root Cause
Early development shortcut — `eval()` is more permissive than `JSON.parse()` and handles edge cases like trailing commas or unquoted keys.

### Solution
Should be replaced with `JSON.parse(out)` and the child process scripts fixed to produce strict JSON. Not yet done because the current scrapers are fragile and a change could introduce regressions.

### Lesson Learned
Never use `eval()` to parse data. Use `JSON.parse()` with explicit error handling and fix upstream producers to output valid JSON.

---

## Daily News Tab Not Filtering by Date

**Date**: 2026-02-26
**Severity**: Medium
**Status**: Solved

### Problem
The Daily tab showed ticker cards from all dates instead of filtering to the selected date. The "today" filter showed everything.

### Root Cause
The `updateDailyOutput()` function was checking `data.date === today` but the `dailyNews` data from D1 didn't always include a `date` field, or the date format didn't match (`toISOString()` vs stored format).

### Solution
Fixed date comparison to handle multiple date formats and added fallback logic that constructs ticker cards from `press` and `news` data when `dailyNews` is empty.

### Lesson Learned
Always normalize date formats at the storage layer. When comparing dates across systems, use a single canonical format (ISO 8601: `YYYY-MM-DD`).

---

## FOMC/Fed Data Extraction Returning Generic Titles

**Date**: 2026-02-26
**Severity**: Low
**Status**: Solved

### Problem
The Validation tab's Policy table showed "FOMC Statement" and "FOMC Minutes" as the "Latest" column — which is just the page title, not proof the data is current.

### Solution
Updated `policy-checker.js` to follow links from the FOMC index pages to the actual statement/minutes documents and extract the first paragraph as a `snippet`. The dashboard now shows: title + date + first sentence of actual content.

### Lesson Learned
For validation displays, always show something from the **actual content** — not just metadata. A title proving the page exists is not the same as content proving the data is fresh.

---

> [STRUCTURE](../STRUCTURE.md) · [Conventions](CONVENTIONS.md) · [Mistakes](MISTAKES.md) · [Diary](DIARY.md)
