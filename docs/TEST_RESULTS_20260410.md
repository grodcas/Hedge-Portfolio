> [STRUCTURE](STRUCTURE.md) · [Test Checklist](TEST_CHECKLIST.md)

# Test Results — 2026-04-10

**Environment**: macOS (Darwin 24.6.0), Node.js v25.9.0 (freshly installed)
**Missing**: `.env` file (no OPENAI_API_KEY, BLS_KEY, FRED_KEY available)

---

## Blocking Issue: Hardcoded Windows Paths

**~20 files have hardcoded `C:\AI_agent\HF\...` paths.** The project was developed on Windows and has never run on macOS. This blocks most local scripts.

Affected files:
- `edgar/fetch.js` — `C:/AI_agent/HF/edgar/edgar_raw_html`
- `edgar/edgar_clustered_json/AA_ingestor.js` — `C:/AI_agent/HF/edgar/edgar_clustered_json`
- `edgar/edgar_clustered_json/AA_clustered_report.js` — same
- `sentiment/index.js` — `C:\AI_agent\HF\sentiment\AAII.mhtml`
- `news/index.js` — `C:/AI_agent/HF` (hardcoded __dirname)
- `validation/runner.js` — `C:\AI_agent\HF\logs`
- `validation/lib/press-checker.js` — `C:\AI_agent\HF\press\AA_press_releases_today.json`
- `validation/lib/sec-ingest-scanner.js` — `C:\AI_agent\HF\edgar\...`
- `validation/lib/calendar.js` — `C:\AI_agent\HF\macro_calendar_2025.json`
- `validation/lib/logger.js` — `C:\AI_agent\HF\logs`
- `validation/config.js` — AAII, Bloomberg, WSJ, Reuters paths

**Fix**: Replace all hardcoded paths with `BASE_DIR` from `src/lib/config.js` (which already computes the correct path dynamically).

---

## Blocking Issue: No .env File

No API keys available. Blocks: BLS CPI/PPI/Employment (1.1-1.3), FRED (1.4-1.5), White House summarization, validation runner, fact verification.

**Fix**: Create `.env` with `OPENAI_API_KEY`, `BLS_KEY`, `FRED_KEY`.

---

## Results Summary

| # | Component | Result | Notes |
|---|-----------|:---:|-------|
| **1.1** | BLS CPI | [-] | Needs BLS_KEY |
| **1.2** | BLS PPI | [-] | Needs BLS_KEY |
| **1.3** | BLS Employment | [-] | Needs BLS_KEY |
| **1.4** | FRED Bank Reserves | [-] | Needs FRED_KEY |
| **1.5** | FRED Interest Rates | [-] | Needs FRED_KEY |
| **1.6** | Yahoo VIX Term Structure | [x] | PASS — VIX=19.23, VIX3M=21.86, VIX9D=16.36, gamma=POSITIVE |
| **1.7** | UMich Consumer Sentiment | [x] | PASS — Latest 47.6 (Apr), Previous 53.3 (Mar) |
| **1.8** | UMich Inflation Expectations | [x] | PASS — 1Y=4.8%, 5Y=3.4% (Apr) |
| **1.9** | Fed FOMC Statement | [x] | PASS — "Federal Reserve issues FOMC statement" (2026-03-18) |
| **1.10** | CBOE Skew | [!] | FAIL — HTTP 403 (CBOE blocked access) |
| **2.1** | Sentiment full run | [!] | FAIL — hardcoded Windows path for AAII.mhtml |
| **3.1** | White House scraper | [!] | FAIL — needs OPENAI_API_KEY (crashes at import) |
| **5.1-5.24** | Press feed discovery (all 24) | [!] | FAIL — Feeds output JS objects, not valid JSON. Raw data IS produced (AAPL tested: valid articles with dates). Problem is `eval()` parsing in orchestrator, not the scraper itself. |
| **6.x** | Press article extraction | [-] | Not tested — depends on feed URLs from step 5 |
| **7.1** | Press full orchestrator | [-] | Not tested — depends on OPENAI_API_KEY for summary.js |
| **8.1** | SEC API access | [x] | PASS — AAPL CIK 0000320193 returns filings data |
| **8.2** | SEC Edgar fetch | [!] | FAIL — hardcoded Windows path `C:/AI_agent/HF/edgar/edgar_raw_html` |
| **9.1** | Worker alive | [x] | PASS — HTTP 200 |
| **9.2** | /query/macro | [x] | PASS — 11KB, Bank Reserves dated 2026-03-04 |
| **9.3** | /query/sentiment | [x] | PASS — 10KB, AAII dated 2026-11-19 (date looks wrong) |
| **9.4** | /query/press | [x] | PASS — 110KB, 25 tickers |
| **9.5** | /query/whitehouse | [x] | PASS — 24KB, 20 items |
| **9.6** | /query/news | [x] | PASS — 26KB, AI-Search news |
| **9.7** | /query/daily-macro | [x] | PASS — 4KB, dated 2026-03-06 |
| **9.8** | /query/macro-trend | [x] | PASS — 4KB, dated 2026-03-02 |
| **9.9** | /query/macro-news | [x] | PASS — 4KB, dated 2026-04-09 |
| **9.10** | /query/ticker-trends | [x] | PASS — 33KB, multiple tickers |
| **9.11** | /query/daily-news | [x] | PASS — 27KB, META dated 2026-04-06 |
| **9.12** | /query/reports?ticker=AAPL | [x] | PASS — 925B, 10-Q from 2026-01-30 (summary: null) |
| **9.13** | /query/pipeline-validation | [x] | PASS — 65B (empty, no run today) |
| **9.14** | /query/verification | [x] | PASS — 34B (empty, no run today) |
| **9.15** | /query/workflow-status | [x] | PASS — last completed 2026-03-11 |
| **10.1** | Job engine daily_macro | [x] | PASS — `{"ok":true,"workflowId":"run-1775856536124"}` |
| **10.3** | Job engine daily_news (AAPL) | [!] | FAIL — timeout >10s (likely waiting for AI web search) |
| **11.1** | Dashboard server starts | [x] | PASS — "Listening on port 4200" |
| **11.3** | Dashboard /api/dates | [x] | PASS — returns dates with data |
| **11.4** | Dashboard /api/dashboard | [x] | PASS — 217KB full dashboard data |
| **12.1** | Validation runner | [!] | FAIL — ai-validator.js initializes OpenAI at import, crashes without key |
| **13.1** | Fact verification | [-] | Blocked — needs OPENAI_API_KEY + fresh press data |

---

## Score

| Category | Pass | Fail | Blocked | Total |
|----------|:---:|:---:|:---:|:---:|
| Macro APIs (no-key) | 4 | 1 | 5 | 10 |
| Sentiment | 0 | 1 | 0 | 1 |
| White House | 0 | 1 | 0 | 1 |
| Press Feeds | 0 | 24 | 0 | 24 |
| Press Articles | 0 | 0 | 24 | 24 |
| SEC Edgar | 1 | 1 | 0 | 2 |
| Worker Endpoints | 14 | 0 | 0 | 14 |
| Job Engine | 1 | 1 | 0 | 2 |
| Dashboard | 3 | 0 | 0 | 3 |
| Validation | 0 | 1 | 0 | 1 |
| Fact Verification | 0 | 0 | 1 | 1 |
| **TOTAL** | **23** | **30** | **30** | **83** |

---

## Fix List (Priority Order)

### P0 — Must fix before anything else runs

1. **Replace all hardcoded Windows paths with dynamic `BASE_DIR`** (~20 files)
   - `src/lib/config.js` already exports `BASE_DIR` — use it everywhere
   - This single fix unblocks: sentiment, SEC edgar, validation, news, press-checker

2. **Create `.env` file with API keys**
   - `OPENAI_API_KEY` — unblocks: whitehouse, validation, fact verification, press summary
   - `BLS_KEY` — unblocks: CPI, PPI, Employment
   - `FRED_KEY` — unblocks: Bank Reserves, Interest Rates

3. **Fix OpenAI initialization in ai-validator.js**
   - OpenAI client created at import time — crashes the entire validation runner even if AI is disabled
   - Should lazy-initialize only when `config.useAI === true`

### P1 — Fix broken scrapers

4. **Fix CBOE Skew scraper** — getting HTTP 403 (CBOE likely added bot protection)
5. **Fix press feed output format** — feeds output JS objects, not JSON. Either:
   - (a) Fix feeds to output valid JSON, OR
   - (b) Replace `eval()` in index.js with a safer parser
6. **Fix PG press article scraper** — returns 0 chars (CSS selectors outdated)
7. **Add TSLA press scraper** — missing entirely

### P2 — Data quality issues

8. **AAII sentiment date** — D1 shows "2026-11-19" which is in the future, likely a date parsing bug
9. **AAPL report summary is null** — 10-Q from 2026-01-30 has no summary (report summarization chain may not have completed)
10. **Data staleness** — most D1 data is from March 2026 (~5 weeks old). System hasn't run since March 11.

---

> [STRUCTURE](STRUCTURE.md) · [Test Checklist](TEST_CHECKLIST.md)
