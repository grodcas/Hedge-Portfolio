# Validation System Specification

## Overview

This document defines the complete validation system for the HF Trading Journal. The system consists of three main components:

1. **Console Logging** - Real-time pipeline progress with detailed validation logs
2. **Validation Dashboard** - Web UI for daily/monthly validation with drill-down
3. **AI Processing Validation** - Fact extraction and source verification

---

## Implementation Status

### Completed (as of 2026-02-21)

#### Phase 1: Console Logging
- [x] ANSI-based logger with fixed header and scrolling logs (`validation/lib/logger.js`)
- [x] SEC Edgar checker comparing ingestor vs SEC API (`validation/lib/sec_checker.js`)
- [x] Macro indicators validation with URL/format/data checks (`validation/lib/macro_checker.js`)
- [x] Sentiment indicators validation (`validation/lib/sentiment_checker.js`)
- [x] Press release validation with AI check support (`validation/lib/press_checker.js`)
- [x] Policy/White House/FOMC validation (`validation/lib/policy_checker.js`)
- [x] News validation (`validation/lib/news_checker.js`)
- [x] AI validator using o3-mini for article verification (`validation/lib/ai_validator.js`)
- [x] Mock calendar for release dates (`validation/lib/calendar.js`)
- [x] Main validation runner with comprehensive reporting (`validation/runner.js`)

#### Phase 2: Dashboard Foundation
- [x] Express.js server on port 4200 (`dashboard/server.js`)
- [x] Dark-themed responsive UI (`dashboard/styles.css`)
- [x] Overview tab with health metrics and calendar events
- [x] Validation tab with SEC, Macro, Sentiment, Policy, Press tables
- [x] Monthly Check tab with URL opener and verification tracking
- [x] API endpoints for log data, macro, sentiment, news, press, whitehouse

#### Phase 2.5: Dashboard Redesign (NEW)
- [x] Redesigned Daily Output tab with visual type blocks (NEWS, PRESS, SEC, 10K, 8K, Form4)
- [x] Ticker cards showing ALPHA_05_Daily_news data with summary and important news
- [x] Modal popup for viewing 10-K/10-Q report summaries from ALPHA_01_REPORTS
- [x] Filter buttons to show All/SEC/Press/News items
- [x] Daily macro summary section showing BETA_10_Daily_macro data

#### Phase 2.6: MACRO Tab (NEW)
- [x] FOMC countdown with temperature bar indicator
- [x] Weekly macro trend summary from BETA_09_Trend
- [x] Recent macro events timeline
- [x] Visual badges for macro indicator types

#### Phase 2.7: PORTFOLIO Tab (NEW)
- [x] Ticker trend cards showing ALPHA_04_Trends summary
- [x] Earnings countdown with temperature bar (hot/warm/cool)
- [x] Sort by earnings date, ticker, or last update
- [x] Next earnings date display (10-K/10-Q)

### In Progress

#### Phase 3: Dashboard Validation Detail
- [ ] Drill-down UI for validation results
- [ ] Re-ingest buttons for failed items
- [ ] View Source links

#### Phase 4: AI Processing Validation
- [ ] Fact Extractor agent
- [ ] Source Verifier agent
- [ ] Validation pipeline for each summary type
- [ ] AI Processing dashboard section

### Not Started

#### Phase 5: Audit Trail & Worker Telemetry
- [ ] Add logging to all 15+ workers
- [ ] Create PROC_02_Worker_logs table
- [ ] Audit trail visualization
- [ ] Flow diagrams with colored status

---

## Part 1: Console Logging (INGESTION_PIPELINE)

### 1.1 Display Architecture

The console will use ANSI escape codes for cursor manipulation to achieve:
- **Fixed header**: Progress bar always visible at top of terminal
- **Scrolling logs**: Accumulate below, newest at bottom, scrollable history

```
┌─────────────────────────────────────────────────────────────────────────┐
│ INGESTION PIPELINE - 2026-02-17 08:30:00                   [ESC to quit]│
├─────────────────────────────────────────────────────────────────────────┤
│ [1/6] SEC Edgar        ████████████████████ DONE   7 filings           │
│ [2/6] Macro            ██████████░░░░░░░░░░ 50%    CPI, PPI...         │
│ [3/6] Sentiment        ░░░░░░░░░░░░░░░░░░░░ PENDING                    │
│ [4/6] Press Releases   ░░░░░░░░░░░░░░░░░░░░ PENDING                    │
│ [5/6] White House      ░░░░░░░░░░░░░░░░░░░░ PENDING                    │
│ [6/6] News             ░░░░░░░░░░░░░░░░░░░░ PENDING                    │
├─────────────────────────────────────────────────────────────────────────┤
│ LOGS:                                                                   │
└─────────────────────────────────────────────────────────────────────────┘
  08:30:01 [SEC] AAPL: ✓ No new filings
  08:30:02 [SEC] MSFT: ✓ No new filings
  08:30:03 [SEC] GOOGL: ✓ 1 new (8-K)
  08:30:04 [SEC] AMZN: ✓ No new filings
  08:30:05 [MACRO] CPI: ✓ url ✓ format ✓ data | 325.252 (+0.37%)
  08:30:06 [MACRO] PPI: ✓ url ✓ format ✓ data | 148.2 (+0.12%)
  ... (logs scroll, newest at bottom)
```

### 1.2 SEC Edgar Check

**Purpose**: Compare three sources to ensure no SEC filings were missed.

**Sources**:
1. **Calendar** - Expected filings based on known schedules (10-K/10-Q seasons)
2. **Ingestor** - What INGESTION_PIPELINE actually ingested
3. **SEC Comparator** - Quick independent script that queries SEC API directly

**Output Format** (one line per ticker):
```
SEC EDGAR VALIDATION:
┌──────┬────────┬──────────────────────────────────────────────────────────┐
│ CAL  │ TICKER │ INGESTOR          │ SEC_CHECK         │ MATCH │ NEW      │
├──────┼────────┼───────────────────┼───────────────────┼───────┼──────────┤
│ 10-Q │ AAPL   │ 10-Q              │ 10-Q              │   ✓   │ 10-Q     │
│      │ MSFT   │ -                 │ -                 │   ✓   │ -        │
│      │ GOOGL  │ 8-K               │ 8-K               │   ✓   │ 8-K      │
│      │ AMZN   │ -                 │ -                 │   ✓   │ -        │
│      │ NVDA   │ Form4             │ Form4, Form4      │   ✗   │ Form4 x2 │
│ 10-K │ TSLA   │ 10-K, Form4       │ 10-K, Form4       │   ✓   │ 10-K,F4  │
│      │ ...    │ ...               │ ...               │   ... │ ...      │
└──────┴────────┴───────────────────┴───────────────────┴───────┴──────────┘
Summary: 23/25 match | 2 discrepancies (NVDA, META)
```

**Column Definitions**:
- **CAL**: Calendar flag - shows expected filing type if calendar indicates one today (10-K, 10-Q, or blank)
- **TICKER**: Portfolio ticker symbol
- **INGESTOR**: What the pipeline ingested (comma-separated if multiple)
- **SEC_CHECK**: What the independent SEC checker found
- **MATCH**: ✓ if both columns identical, ✗ if discrepancy
- **NEW**: Summary of new filings detected

### 1.3 Macro Indicators Check

**Purpose**: Validate each macro indicator's parsing integrity.

**Checks per indicator**:
1. **URL**: Is the source URL returning valid HTML? (HTTP 200, valid HTML structure)
2. **FORMAT**: Has the HTML structure changed from expected? (key selectors still exist)
3. **DATA**: Does retrieved data make sense? (numeric, within expected range, not null)

**Output Format** (one line per indicator):
```
MACRO INDICATORS VALIDATION:
┌──────┬─────────────┬─────┬────────┬──────┬─────────────────────────────┐
│ CAL  │ INDICATOR   │ URL │ FORMAT │ DATA │ VALUE                       │
├──────┼─────────────┼─────┼────────┼──────┼─────────────────────────────┤
│  ●   │ CPI         │  ✓  │   ✓    │  ✓   │ 325.252 (+0.37% MoM)        │
│      │ CPI Core    │  ✓  │   ✓    │  ✓   │ 319.841 (+0.28% MoM)        │
│      │ PPI         │  ✓  │   ✓    │  ✓   │ 148.2 (+0.12% MoM)          │
│  ●   │ Employment  │  ✓  │   ✗    │  ✗   │ ERROR: selector not found   │
│      │ FOMC        │  ✓  │   ✓    │  ✓   │ Statement dated 2026-02-15  │
│      │ Bank Rsv    │  ✓  │   ✓    │  ✓   │ $3.42T                      │
│      │ Univ Mich   │  ✓  │   ✓    │  ✓   │ 78.2 (prev: 76.9)           │
└──────┴─────────────┴─────┴────────┴──────┴─────────────────────────────┘
Summary: 6/7 passed | 1 failed (Employment)

CAL Legend: ● = Calendar indicates release expected today
```

**Calendar Flag Logic**:
- Show ● only if economic calendar indicates this indicator has a release TODAY
- Confirms that a data change should have occurred
- If ● shown but DATA unchanged from yesterday → warning

### 1.4 Sentiment Indicators Check

**Same structure as Macro**:
```
SENTIMENT INDICATORS VALIDATION:
┌──────┬─────────────┬─────┬────────┬──────┬─────────────────────────────┐
│ CAL  │ INDICATOR   │ URL │ FORMAT │ DATA │ VALUE                       │
├──────┼─────────────┼─────┼────────┼──────┼─────────────────────────────┤
│      │ AAII        │  ✓  │   ✓    │  ✓   │ Bull:38% Neut:32% Bear:30%  │
│      │ Put/Call    │  ✓  │   ✓    │  ✓   │ Equity:0.62 Index:0.58      │
│  ●   │ COT ES      │  ✓  │   ✓    │  ✓   │ Net Long: +142K             │
│      │ COT NQ      │  ✓  │   ✓    │  ✓   │ Net Long: +89K              │
└──────┴─────────────┴─────┴────────┴──────┴─────────────────────────────┘
```

### 1.5 Press Releases Check

**Purpose**: Validate press release parsing for all tickers, every day.

**Checks**:
1. **URL**: Investor relations page returns valid HTML
2. **FORMAT**: HTML structure hasn't changed (press release selectors work)
3. **TEXT**: Parsed content is valid (has paragraphs, plain text, not random chars, not null, not extremely short)
4. **AI**: Cheap AI model confirms it's a real article (not bad parsing)

**Output Format** (one line per ticker):
```
PRESS RELEASES VALIDATION:
┌────────┬─────┬────────┬──────┬─────┬─────────────────────────────────────┐
│ TICKER │ URL │ FORMAT │ TEXT │ AI  │ LATEST                              │
├────────┼─────┼────────┼──────┼─────┼─────────────────────────────────────┤
│ AAPL   │  ✓  │   ✓    │  ✓   │  ✓  │ [NEW] "Q1 Earnings..." (2026-02-17) │
│ MSFT   │  ✓  │   ✓    │  ✓   │  ✓  │ "Azure Growth..." (2026-02-15)      │
│ GOOGL  │  ✓  │   ✗    │  -   │  -  │ FORMAT CHANGED - check selector     │
│ AMZN   │  ✓  │   ✓    │  ✓   │  ✓  │ "AWS Announces..." (2026-02-14)     │
│ NVDA   │  ✓  │   ✓    │  ✗   │  -  │ TEXT: null content                  │
│ ...    │ ... │  ...   │ ...  │ ... │ ...                                 │
└────────┴─────┴────────┴──────┴─────┴─────────────────────────────────────┘
Summary: 22/25 passed | 3 issues (GOOGL, NVDA, BA)

[NEW] = New press release detected today
```

**Key behaviors**:
- Runs for ALL 25 tickers every day, even if no new press release
- If no new PR today, shows last known PR with date
- AI check uses GPT-4o-mini with minimal prompt: "Is this a news article? Yes/No"

### 1.6 White House / FOMC Check

**Same pattern as Press Releases**:
```
WHITE HOUSE & FOMC VALIDATION:
┌──────┬──────────────┬─────┬────────┬──────┬─────┬────────────────────────┐
│ CAL  │ SOURCE       │ URL │ FORMAT │ TEXT │ AI  │ LATEST                 │
├──────┼──────────────┼─────┼────────┼──────┼─────┼────────────────────────┤
│      │ White House  │  ✓  │   ✓    │  ✓   │  ✓  │ [2] "Trade Policy..."  │
│  ●   │ FOMC Stmt    │  ✓  │   ✓    │  ✓   │  ✓  │ [NEW] "Feb Statement"  │
│      │ Fed Minutes  │  ✓  │   ✓    │  ✓   │  ✓  │ "Jan Minutes" (02-14)  │
└──────┴──────────────┴─────┴────────┴──────┴─────┴────────────────────────┘

CAL Legend: ● = FOMC meeting/release scheduled today per calendar
```

### 1.7 News Check

**Purpose**: Validate news parsing (no URL check since manually downloaded).

**Checks**:
1. **HTML**: File exists and contains valid HTML structure
2. **TEXT**: Extracted text is valid (paragraphs, not random chars, reasonable length)
3. **AI**: Cheap AI confirms it's a real news article

**Output Format**:
```
NEWS VALIDATION (Manually Downloaded):
┌───────────┬──────┬──────┬─────┬─────────────────────────────────────────┐
│ SOURCE    │ HTML │ TEXT │ AI  │ ARTICLES                                │
├───────────┼──────┼──────┼─────┼─────────────────────────────────────────┤
│ Bloomberg │  ✓   │  ✓   │ 5/5 │ 5 articles, tickers: AAPL,MSFT,NVDA,JPM │
│ WSJ       │  ✓   │  ✓   │ 4/4 │ 4 articles, tickers: GOOGL,AMZN,META    │
│ Reuters   │  ✓   │  ✗   │ 4/6 │ 6 articles, 2 FAILED AI check           │
└───────────┴──────┴──────┴─────┴─────────────────────────────────────────┘

Failed articles:
  - Reuters/article_003.html: AI says "Not a news article - navigation menu"
  - Reuters/article_005.html: AI says "Not a news article - paywall text"
```

### 1.8 Final Summary

At end of pipeline:
```
╔═══════════════════════════════════════════════════════════════════════════╗
║                         INGESTION COMPLETE                                ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  Duration: 4m 32s                                                         ║
║  Status: SUCCESS (2 warnings)                                             ║
╠───────────────────────────────────────────────────────────────────────────╣
║  VALIDATION SUMMARY:                                                      ║
║    SEC Edgar:      23/25 ✓  (2 discrepancies: NVDA, META)                 ║
║    Macro:           6/7  ✓  (1 failed: Employment)                        ║
║    Sentiment:       4/4  ✓                                                ║
║    Press Releases: 22/25 ✓  (3 issues: GOOGL, NVDA, BA)                   ║
║    WH/FOMC:         3/3  ✓                                                ║
║    News:           13/15 ✓  (2 failed AI check)                           ║
╠───────────────────────────────────────────────────────────────────────────╣
║  CALENDAR EVENTS TODAY:                                                   ║
║    ● CPI Release - CONFIRMED (data changed)                               ║
║    ● FOMC Statement - CONFIRMED (new statement)                           ║
║    ● AAPL 10-Q - CONFIRMED (filing ingested)                              ║
║    ● TSLA 10-K - CONFIRMED (filing ingested)                              ║
╠───────────────────────────────────────────────────────────────────────────╣
║  ACTION REQUIRED:                                                         ║
║    ⚠ NVDA: SEC shows 2 Form4, ingestor got 1 - investigate                ║
║    ⚠ Employment: BLS selector changed - update parser                     ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

---

## Part 2: Validation Dashboard

### 2.1 Dashboard Structure

```
/dashboard/
├── index.html              # Main dashboard
├── validation.html         # Validation tab (or section in index.html)
├── server.js               # Local server
├── api.js                  # D1 queries + validation runners
└── styles.css
```

**Tab Structure**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Daily Output]  [Validation ▼]  [Workers]  [Audit Trail]              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Validation Tab - Overview Section

**Top section**: Generic dev view (always visible)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ SYSTEM HEALTH - 2026-02-17                                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   INGESTION        PROCESSING       DATA FRESHNESS                      │
│   ┌─────────┐      ┌─────────┐      ┌─────────────────┐                 │
│   │  98.2%  │      │  100%   │      │ All indicators  │                 │
│   │ SUCCESS │      │ SUCCESS │      │ within 24h      │                 │
│   └─────────┘      └─────────┘      └─────────────────────┘             │
│                                                                         │
│   Last run: 08:47:03 | Duration: 4m32s | Next scheduled: Tomorrow 08:30 │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│   QUICK STATS                                                           │
│   SEC: 7 filings | Macro: 2 updated | News: 15 articles | Press: 12    │
│   Workers: 47 jobs | 47 success | 0 failed                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Validation Tab - Monthly Check Section

**Purpose**: Run full validation iteration, open all source URLs, manually verify.

**UI**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│ MONTHLY VALIDATION CHECK                          [▶ Run Full Check]    │
├─────────────────────────────────────────────────────────────────────────┤
│ When clicked, this will:                                                │
│   1. Query all macro indicator URLs and display current values          │
│   2. Query all sentiment URLs and display current values                │
│   3. Fetch latest FOMC, Press Releases, WH (title + first sentence)     │
│   4. Open all source URLs in browser tabs (for manual verification)     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ┌─ MACRO INDICATORS ──────────────────────────────────────────────────┐ │
│ │ CPI Headline    │ 325.252  │ 2026-02-17 │ [✓ Verified] [✗ Wrong]   │ │
│ │ CPI Core        │ 319.841  │ 2026-02-17 │ [✓ Verified] [✗ Wrong]   │ │
│ │ PPI             │ 148.2    │ 2026-02-14 │ [✓ Verified] [✗ Wrong]   │ │
│ │ Employment      │ +225K    │ 2026-02-07 │ [✓ Verified] [✗ Wrong]   │ │
│ │ ...             │ ...      │ ...        │ ...                       │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ┌─ FOMC ──────────────────────────────────────────────────────────────┐ │
│ │ Title: "Federal Reserve Issues FOMC Statement"                      │ │
│ │ First sentence: "The Federal Reserve decided to maintain..."        │ │
│ │ Date: 2026-02-15                                                    │ │
│ │ [✓ Verified] [✗ Wrong]                                              │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ┌─ PRESS RELEASES (by ticker) ────────────────────────────────────────┐ │
│ │ AAPL │ "Apple Reports Q1 Results" │ "Apple today announced..." │ ✓  │ │
│ │ MSFT │ "Microsoft Cloud Growth"   │ "Microsoft reported..."    │ ✓  │ │
│ │ ...  │ ...                        │ ...                        │    │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ┌─ WHITE HOUSE ───────────────────────────────────────────────────────┐ │
│ │ "President Announces Trade Policy" │ "Today the President..." │ ✓   │ │
│ │ "Infrastructure Investment"        │ "The administration..."  │ ✓   │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ OPENED TABS: 47 (close all when done verifying)                         │
│ VERIFICATION PROGRESS: 12/47 checked                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Workflow**:
1. Click "Run Full Check"
2. System fetches all data from ingestor, displays in table
3. System opens all source URLs in browser tabs
4. User goes through tabs one by one, comparing with displayed values
5. User clicks ✓ or ✗ for each item
6. At end, shows verification summary and logs discrepancies

### 2.4 Validation Tab - Daily Detail Section

**Purpose**: Same info as console but with drill-down detail.

**UI**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│ DAILY VALIDATION DETAIL - 2026-02-17                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ▼ SEC EDGAR (click to expand)                                           │
│ ┌───────────────────────────────────────────────────────────────────────┐
│ │ AAPL │ ✓ │ No filings today                                          │
│ │ MSFT │ ✓ │ No filings today                                          │
│ │ GOOGL│ ✓ │ 8-K ingested                                              │
│ │ NVDA │ ✗ │ DISCREPANCY (click for detail)                            │
│ │      │   │ ┌─────────────────────────────────────────────────────────┐│
│ │      │   │ │ Ingestor: Form4 (1)                                     ││
│ │      │   │ │ SEC Check: Form4 (2)                                    ││
│ │      │   │ │ Missing: Form4 filed at 16:32:00 (accession: 0001...)   ││
│ │      │   │ │ [View on SEC] [Re-ingest]                               ││
│ │      │   │ └─────────────────────────────────────────────────────────┘│
│ └───────────────────────────────────────────────────────────────────────┘
│                                                                         │
│ ▼ MACRO INDICATORS (click to expand)                                    │
│ ┌───────────────────────────────────────────────────────────────────────┐
│ │ CPI │ ✓ │ url ✓ │ format ✓ │ data ✓ │ 325.252                        │
│ │     │   │ ┌─────────────────────────────────────────────────────────┐│
│ │     │   │ │ URL Check: https://api.bls.gov/... → 200 OK             ││
│ │     │   │ │ Format Check: Selector "series.data" found              ││
│ │     │   │ │ Data Check: 325.252 (numeric, range 100-500) ✓          ││
│ │     │   │ │ Previous: 324.054 | Change: +0.37%                      ││
│ │     │   │ └─────────────────────────────────────────────────────────┘│
│ │ EMP │ ✗ │ url ✓ │ format ✗ │ data ✗ │ ERROR                          │
│ │     │   │ ┌─────────────────────────────────────────────────────────┐│
│ │     │   │ │ URL Check: https://api.bls.gov/... → 200 OK             ││
│ │     │   │ │ Format Check: Selector "series.data[0].value" NOT FOUND ││
│ │     │   │ │ Error: BLS changed API response structure               ││
│ │     │   │ │ Raw response: {"status":"REQUEST_FAILED"...}            ││
│ │     │   │ │ [View Source] [Update Parser]                           ││
│ │     │   │ └─────────────────────────────────────────────────────────┘│
│ └───────────────────────────────────────────────────────────────────────┘
│                                                                         │
│ ▼ PRESS RELEASES (click to expand) - similar drill-down structure       │
│ ▼ NEWS (click to expand) - similar drill-down structure                 │
│ ▼ WHITE HOUSE / FOMC (click to expand)                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: AI Processing Validation

### 3.1 Architecture

**Do NOT modify existing workers**. Instead, create parallel validation agents.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     AI PROCESSING VALIDATION                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   SOURCE DATA          EXISTING WORKER          VALIDATION AGENTS       │
│   ┌─────────┐          ┌─────────────┐          ┌─────────────────┐     │
│   │ Cluster │    →     │ qk-report-  │    →     │ FACT EXTRACTOR  │     │
│   │ Raw     │          │ summarizer  │          │ (extracts claims│     │
│   └─────────┘          └─────────────┘          │  from summary)  │     │
│                              │                  └────────┬────────┘     │
│                              │                           │              │
│                              ▼                           ▼              │
│                        ┌───────────┐            ┌─────────────────┐     │
│                        │  Summary  │     →      │ SOURCE VERIFIER │     │
│                        └───────────┘            │ (matches claims │     │
│                                                 │  to source text)│     │
│                                                 └────────┬────────┘     │
│                                                          │              │
│                                                          ▼              │
│                                                 ┌─────────────────┐     │
│                                                 │ VALIDATION      │     │
│                                                 │ REPORT          │     │
│                                                 └─────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Fact Extractor Agent

**Purpose**: Extract discrete factual claims from a summary.

**Input**: Any summary (report, trend, news, etc.)

**Output**: Array of fact objects
```json
{
  "summary_id": "report-aapl-10q-2026-02-17",
  "facts": [
    {
      "id": 1,
      "claim": "Q1 revenue was $123.9 billion",
      "type": "numeric",
      "entities": ["revenue", "$123.9B", "Q1"],
      "location": "paragraph 1, sentence 2"
    },
    {
      "id": 2,
      "claim": "iPhone sales grew 12% year-over-year",
      "type": "numeric",
      "entities": ["iPhone", "12%", "YoY growth"],
      "location": "paragraph 1, sentence 3"
    },
    {
      "id": 3,
      "claim": "Services revenue reached all-time high",
      "type": "qualitative",
      "entities": ["Services", "all-time high"],
      "location": "paragraph 2, sentence 1"
    }
  ]
}
```

**AI Prompt**:
```
Extract all factual claims from this summary. For each claim:
1. Quote the exact claim
2. Classify as "numeric" (contains numbers) or "qualitative" (no numbers)
3. List key entities mentioned
4. Note location in summary (paragraph, sentence)

Return JSON array. Only include verifiable facts, not opinions or analysis.
```

### 3.3 Source Verifier Agent

**Purpose**: Match extracted facts against source documents.

**Input**:
- Extracted facts (from Fact Extractor)
- Source documents (clusters, raw filings, news articles, etc.)

**Output**: Verification report
```json
{
  "summary_id": "report-aapl-10q-2026-02-17",
  "verification_results": [
    {
      "fact_id": 1,
      "claim": "Q1 revenue was $123.9 billion",
      "status": "VERIFIED",
      "confidence": 1.0,
      "source": {
        "document": "cluster-aapl-10q-item7-003",
        "location": "paragraph 4",
        "quote": "Total net revenue for the quarter was $123.9 billion..."
      }
    },
    {
      "fact_id": 2,
      "claim": "iPhone sales grew 12% year-over-year",
      "status": "VERIFIED",
      "confidence": 0.95,
      "source": {
        "document": "cluster-aapl-10q-item7-007",
        "location": "paragraph 2",
        "quote": "iPhone revenue increased 12 percent compared to the year-ago quarter..."
      }
    },
    {
      "fact_id": 3,
      "claim": "Services revenue reached all-time high",
      "status": "NOT_FOUND",
      "confidence": 0.0,
      "source": null,
      "note": "No source document mentions 'all-time high' for Services"
    }
  ],
  "summary_score": {
    "total_facts": 3,
    "verified": 2,
    "not_found": 1,
    "contradicted": 0,
    "verification_rate": 0.67
  }
}
```

### 3.4 Validation Targets

Apply this architecture to validate:

| Pipeline | Source | Output to Verify |
|----------|--------|------------------|
| **cluster → report** | `ALPHA_02_Clusters` (raw text) | `ALPHA_01_Reports.summary` |
| **clusters → clusterRaw** | Raw SEC HTML | `ALPHA_02_Clusters.summary` |
| **reports → trend** | 4 latest report summaries | `ALPHA_04_Trends.summary` |
| **news articles** | Raw news HTML | `BETA_01_News.summary` |
| **press releases** | Raw press HTML | `ALPHA_03_Press.summary` |
| **FOMC** | Fed Reserve HTML | `BETA_03_Macro` (FOMC entry) |
| **macro → trend** | Macro indicators + gen | `BETA_09_Trend.summary` |

### 3.5 Dashboard - AI Processing Section

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AI PROCESSING VALIDATION                                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ TODAY'S PROCESSING ACCURACY                                             │
│ ┌───────────────────────────────────────────────────────────────────────┐
│ │ TYPE              │ ITEMS │ AVG SCORE │ ISSUES │                      │
│ │ Report Summaries  │   7   │   94.2%   │   1    │ [View Details]       │
│ │ Cluster Summaries │  47   │   97.8%   │   2    │ [View Details]       │
│ │ Ticker Trends     │   2   │   91.5%   │   0    │ [View Details]       │
│ │ Daily News        │  25   │   96.1%   │   1    │ [View Details]       │
│ │ Press Releases    │  12   │   98.3%   │   0    │ [View Details]       │
│ │ Macro Trend       │   1   │   95.0%   │   0    │ [View Details]       │
│ └───────────────────────────────────────────────────────────────────────┘
│                                                                         │
│ ISSUES REQUIRING REVIEW:                                                │
│ ┌───────────────────────────────────────────────────────────────────────┐
│ │ ⚠ TSLA 10-Q Report: 1 claim not found in source                      │
│ │   Claim: "Cybertruck deliveries exceeded 50,000 units"                │
│ │   Status: NOT_FOUND - no source mentions this figure                  │
│ │   [View Summary] [View Source Clusters] [Mark as OK] [Flag Error]     │
│ │───────────────────────────────────────────────────────────────────────│
│ │ ⚠ AAPL Daily News: 1 claim contradicted                               │
│ │   Claim: "Apple announced $100B buyback"                              │
│ │   Source says: "$90 billion share repurchase program"                 │
│ │   [View Summary] [View Source] [Mark as OK] [Flag Error]              │
│ └───────────────────────────────────────────────────────────────────────┘
│                                                                         │
│ [▶ Run Full Validation] [Export Report]                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Worker Monitoring

### 4.1 Worker Status Table

```
┌─────────────────────────────────────────────────────────────────────────┐
│ WORKER EXECUTION - 2026-02-17                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ┌─────────────────────┬───────┬─────────┬────────┬──────────┬─────────┐ │
│ │ WORKER              │ RUNS  │ SUCCESS │ FAILED │ AVG TIME │ STATUS  │ │
│ ├─────────────────────┼───────┼─────────┼────────┼──────────┼─────────┤ │
│ │ news-orchestrator   │  25   │   25    │   0    │   0.8s   │   ✓     │ │
│ │ report-orchestrator │   7   │    7    │   0    │   1.2s   │   ✓     │ │
│ │ news-summarizer     │  25   │   25    │   0    │   3.4s   │   ✓     │ │
│ │ 8k-summarizer       │   2   │    2    │   0    │   4.1s   │   ✓     │ │
│ │ form4-summarizer    │   3   │    3    │   0    │   2.8s   │   ✓     │ │
│ │ qk-structure-builder│   2   │    2    │   0    │   8.2s   │   ✓     │ │
│ │ qk-cluster-summarizer│ 47   │   47    │   0    │   2.1s   │   ✓     │ │
│ │ qk-report-summarizer│   2   │    1    │   1    │  12.4s   │   ⚠     │ │
│ │ trend-builder       │   2   │    2    │   0    │  15.3s   │   ✓     │ │
│ │ beta-trend-builder  │   1   │    1    │   0    │   8.7s   │   ✓     │ │
│ │ daily-macro-summarizer│ 1   │    1    │   0    │   4.2s   │   ✓     │ │
│ │ gen-builder         │   1   │    1    │   0    │   5.1s   │   ✓     │ │
│ └─────────────────────┴───────┴─────────┴────────┴──────────┴─────────┘ │
│                                                                         │
│ FAILED JOBS:                                                            │
│ ┌───────────────────────────────────────────────────────────────────────┐
│ │ ✗ qk-report-summarizer | TSLA | 2026-02-17 09:32:14                  │
│ │   Error: OpenAI API timeout after 30000ms                            │
│ │   Job ID: job-qk-rep-tsla-123                                        │
│ │   [View Full Log] [Retry Job]                                        │
│ └───────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Worker Log Detail (on click)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ JOB DETAIL: job-qk-rep-tsla-123                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ Worker: qk-report-summarizer                                            │
│ Ticker: TSLA                                                            │
│ Started: 2026-02-17 09:32:00                                            │
│ Ended: 2026-02-17 09:32:14                                              │
│ Duration: 14.2s                                                         │
│ Status: FAILED                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ EXECUTION STEPS:                                                        │
│   [09:32:00] ✓ Fetched report metadata (10-K, accession: 000119...)    │
│   [09:32:01] ✓ Fetched 18 clusters from structure                       │
│   [09:32:02] ✓ Retrieved cluster summaries (18/18)                      │
│   [09:32:03] ✓ Built prompt (12,847 tokens)                             │
│   [09:32:04] → Calling OpenAI GPT-5.2...                                │
│   [09:32:14] ✗ OpenAI API timeout after 30000ms                         │
├─────────────────────────────────────────────────────────────────────────┤
│ ERROR DETAILS:                                                          │
│   Type: APITimeoutError                                                 │
│   Message: Request timed out after 30000ms                              │
│   Suggestion: Retry or increase timeout for large reports               │
├─────────────────────────────────────────────────────────────────────────┤
│ [Retry This Job] [View Input Data] [Copy Error Log]                     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Audit Trail Visualization

### 5.1 Data Flow Diagram

Visual representation of data journey with colored status indicators.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AUDIT TRAIL: TSLA 10-K (Filed 2026-02-17)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐       │
│   │   SEC   │ ───▶ │  HTML   │ ───▶ │ PARSED  │ ───▶ │CLUSTERS │       │
│   │  EDGAR  │      │DOWNLOAD │      │  JSON   │      │  (47)   │       │
│   └────┬────┘      └────┬────┘      └────┬────┘      └────┬────┘       │
│        │                │                │                │            │
│     08:14:22         08:14:23         08:14:25         08:14:26        │
│        ✓                ✓                ✓                ✓            │
│                                                                         │
│        │                                                  │            │
│        ▼                                                  ▼            │
│   ┌─────────┐                                       ┌─────────┐        │
│   │INGESTOR │ ─────────────────────────────────────▶│   D1    │        │
│   │         │                                       │DATABASE │        │
│   └────┬────┘                                       └────┬────┘        │
│        │                                                 │             │
│     08:14:28 ✓                                       STORED ✓          │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ PROCESSING PIPELINE:                                                    │
│                                                                         │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐       │
│   │STRUCTURE│ ───▶ │ CLUSTER │ ───▶ │ REPORT  │ ───▶ │  TREND  │       │
│   │ BUILDER │      │SUMMARIZE│      │SUMMARIZE│      │ BUILDER │       │
│   └────┬────┘      └────┬────┘      └────┬────┘      └────┬────┘       │
│        │                │                │                │            │
│     08:45:12         08:46:30         08:47:01         09:01:23        │
│     18 clusters      47/47 done        ✗ FAILED        SKIPPED        │
│        ✓                ✓              (timeout)                       │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ VALIDATION:                                                             │
│                                                                         │
│   SEC Check: ✓ Filing matches ingestor                                  │
│   Cluster Validation: ✓ 47/47 clusters have valid summaries (97.8%)    │
│   Report Validation: ⚠ PENDING (report summarizer failed)              │
│   Trend Validation: ⚠ PENDING (blocked by report)                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Color Legend

```
Flow Arrows:
  ───▶  Green:   Success, data flowed correctly
  ───▶  Yellow:  Warning, completed with issues
  ───▶  Red:     Failed, data did not flow
  ───▶  Gray:    Skipped, blocked by upstream failure

Status Badges:
  ✓     Green:   Completed successfully
  ⚠     Yellow:  Completed with warnings
  ✗     Red:     Failed
  ○     Gray:    Pending / Not started
  ◐     Blue:    In progress
```

---

## Implementation Order

### Phase 1: Console Logging (Week 1)
1. Create logging utility with ANSI cursor control
2. Implement progress bar component
3. Add SEC checker (compare ingestor vs SEC API)
4. Add Macro validation (URL, format, data checks)
5. Add Press/News validation (including AI check)
6. Add final summary report

### Phase 2: Dashboard Foundation (Week 2)
1. Create basic dashboard structure (HTML/CSS/JS)
2. Add API endpoints to portfolio-ingestor for dashboard data
3. Implement Daily Output view
4. Implement basic Validation tab with overview

### Phase 3: Dashboard Validation Detail (Week 3)
1. Add Daily Detail section with drill-down
2. Add Monthly Check section with URL opener
3. Implement verification checkboxes and tracking
4. Add Worker Status section

### Phase 4: AI Processing Validation (Week 4)
1. Create Fact Extractor agent
2. Create Source Verifier agent
3. Implement validation for each pipeline type
4. Add AI Processing section to dashboard

### Phase 5: Audit Trail & Polish (Week 5)
1. Add worker telemetry to all workers
2. Create PROC_02_Worker_logs table
3. Implement Audit Trail visualization
4. Add flow diagrams with colored status
5. Final polish and testing

---

## File Structure

```
/validation/
├── lib/
│   ├── logger.js              # Console logging utility (ANSI, progress bar)
│   ├── sec_checker.js         # SEC API comparison
│   ├── macro_checker.js       # Macro validation (URL, format, data)
│   ├── press_checker.js       # Press release validation
│   ├── news_checker.js        # News validation
│   ├── ai_validator.js        # AI article checker (real article or garbage)
│   ├── calendar.js            # Economic calendar integration
│   └── config.js              # URLs, selectors, thresholds
├── agents/
│   ├── fact_extractor.js      # Extract facts from summaries
│   └── source_verifier.js     # Match facts to sources
└── reports/
    └── (generated validation reports)

/dashboard/
├── index.html                 # Main dashboard
├── css/
│   └── styles.css
├── js/
│   ├── app.js                 # Main app logic
│   ├── api.js                 # API calls
│   ├── validation.js          # Validation tab logic
│   ├── workers.js             # Worker status logic
│   └── audit.js               # Audit trail visualization
├── server.js                  # Local dev server
└── components/
    ├── overview.js
    ├── monthly-check.js
    ├── daily-detail.js
    ├── ai-processing.js
    ├── worker-status.js
    └── audit-trail.js

/workers/*/
└── (add telemetry logging to each)
```

---

## Success Criteria

When complete, the system will provide:

1. **Confidence**: Know immediately if anything was missed in ingestion
2. **Visibility**: See all outputs in one place without touching Cloudflare
3. **Traceability**: Prove where every fact in a summary comes from
4. **Automation**: Most validation runs automatically with clear pass/fail
5. **Manual verification**: Easy workflow for monthly deep-dive checks
6. **Marketing value**: BTS view shows professional data quality practices
7. **Debugging**: When something fails, know exactly where and why

---

## Part 6: Redesigned Daily Output Tab

### 6.1 Overview

The Daily Output tab has been redesigned to provide a comprehensive view of daily market intelligence organized by data type and ticker.

### 6.2 Data Sources

| Component | Database Table | Description |
|-----------|---------------|-------------|
| Daily Macro Summary | `BETA_10_Daily_macro` | AI-synthesized summary of today's macro indicators |
| Ticker Daily News | `ALPHA_05_Daily_news` | Per-ticker summary with important news highlights |
| Report Summaries | `ALPHA_01_REPORTS` | 10-K/10-Q/8-K report summaries for modal display |

### 6.3 Visual Type Badges

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TYPE BADGES:                                                             │
│   NEWS   - Blue (#1f6feb)    - News article from Bloomberg/WSJ/Reuters  │
│   PRESS  - Purple (#8957e5)  - Company press release                    │
│   SEC    - Yellow (#d29922)  - Generic SEC filing                       │
│   10-K   - Red (#f85149)     - Annual report                            │
│   10-Q   - Red (#f85149)     - Quarterly report                         │
│   8-K    - Orange (#ff7b72)  - Current report                           │
│   Form 4 - Amber (#ffa657)   - Insider trading                          │
│   MACRO  - Green (#3fb950)   - Macro indicator update                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.4 Ticker Card Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  NVDA                                              [10-Q] [8-K] [NEWS]  │
├─────────────────────────────────────────────────────────────────────────┤
│  NVIDIA remains the AI infrastructure leader with continued strong      │
│  demand. Blackwell GPU production ramp is the key focus for Q2.        │
├─────────────────────────────────────────────────────────────────────────┤
│  TODAY'S IMPORTANT                                                       │
│  Microsoft announced expanded Azure partnership with NVIDIA for         │
│  next-gen AI training clusters.                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  PREVIOUS (2026-02-20)                                                   │
│  Q4 earnings beat with data center revenue up 200% YoY.                 │
├─────────────────────────────────────────────────────────────────────────┤
│  [View Report Summary]                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.5 Filter Functionality

Users can filter ticker cards by type:
- **All** - Show all tickers with any activity
- **SEC** - Only tickers with SEC filings today
- **Press** - Only tickers with press releases
- **News** - Only tickers mentioned in news articles

---

## Part 7: MACRO Tab

### 7.1 Overview

The MACRO tab provides a focused view of macro-economic trends and the FOMC meeting countdown.

### 7.2 Data Sources

| Component | Database Table | Description |
|-----------|---------------|-------------|
| FOMC Countdown | Calendar | Days until next FOMC meeting |
| Macro Trend | `BETA_09_Trend` | Weekly macro trend narrative |
| Recent Events | `BETA_03_Macro` + `BETA_04_Sentiment` | Timeline of recent releases |

### 7.3 FOMC Temperature Bar

```
┌─────────────────────────────────────────────────────────────────────────┐
│  NEXT FOMC MEETING                                                       │
│                                                                          │
│           Wednesday, March 18, 2026                                      │
│                                                                          │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  HOT ◄────────────────────────────────────────────► COOL                │
│                                                                          │
│                    25 days away                                          │
└─────────────────────────────────────────────────────────────────────────┘

Temperature Logic:
- 0-7 days: HOT (red) - Meeting imminent, high market sensitivity
- 8-21 days: WARM (yellow) - Approaching, increased attention
- 22+ days: COOL (green) - Distant, routine monitoring
```

### 7.4 Macro Trend Summary

Displays `BETA_09_Trend.summary` - a weekly AI-generated narrative covering:
- Inflation trends (CPI, PPI, PCE)
- Labor market conditions
- Fed policy outlook
- Market sentiment
- Near-term outlook

### 7.5 Recent Events Timeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [CPI]  CPI Headline                                        2026-02-21  │
│         325.2 (+0.3% MoM)                                               │
├─────────────────────────────────────────────────────────────────────────┤
│  [PPI]  PPI                                                 2026-02-20  │
│         148.3 (+0.1% MoM)                                               │
├─────────────────────────────────────────────────────────────────────────┤
│  [EMP]  Employment Situation                                2026-02-07  │
│         +225K jobs, unemployment 3.7%                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 8: PORTFOLIO Tab

### 8.1 Overview

The PORTFOLIO tab provides a view of individual ticker trends with earnings countdown indicators.

### 8.2 Data Sources

| Component | Database Table | Description |
|-----------|---------------|-------------|
| Ticker Trends | `ALPHA_04_Trends` | 1-year trend summary per ticker |
| Earnings Calendar | Calendar API | Next earnings date (10-K/10-Q) |

### 8.3 Portfolio Card Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  NVDA                                              10-Q - 2026-05-21    │
│                                                         89 days        │
│                                        ████████████████████░░░ │
├─────────────────────────────────────────────────────────────────────────┤
│  NVIDIA's data center revenue grew 200% YoY, driven by insatiable      │
│  demand for H100 and new Blackwell GPUs. Supply constraints are        │
│  easing but order backlog extends into late 2026. Gaming segment       │
│  showed modest 5% growth with RTX 50 series launch upcoming...         │
├─────────────────────────────────────────────────────────────────────────┤
│  Last updated: 2026-02-20                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Earnings Temperature Bar

```
Temperature Logic:
- 0-7 days: HOT (red text, marker at right) - Earnings imminent
- 8-21 days: WARM (yellow text, marker at center-right) - Approaching
- 22+ days: COOL (green text, marker at left) - Routine monitoring

Bar Display:
████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
GREEN ◄────────────────────────────────────────────► RED
        ▲
     Marker (white) shows position based on days until earnings
```

### 8.5 Sorting Options

- **Next Earnings** (default) - Tickers with nearest earnings first
- **Ticker** - Alphabetical by symbol
- **Last Update** - Most recently updated trends first

---

## Part 9: Data Caching for Dashboard

### 9.1 Local Cache Structure

Since the dashboard runs locally and D1 is in Cloudflare, data is cached in `/data/`:

```
/data/
├── daily_macro.json      # BETA_10_Daily_macro (latest)
├── daily_news.json       # ALPHA_05_Daily_news (all tickers)
├── macro_trend.json      # BETA_09_Trend (latest)
├── ticker_trends.json    # ALPHA_04_Trends (all tickers)
├── reports.json          # ALPHA_01_REPORTS (recent reports)
└── earnings_calendar.json # Earnings dates per ticker
```

### 9.2 Cache Update Strategy

**Option A: Manual Sync Script**
```bash
node scripts/sync-d1-to-local.js
```

**Option B: Worker Webhook**
Workers POST to a local endpoint after processing to update cache.

**Option C: Periodic Fetch**
Dashboard server fetches from Cloudflare API periodically.

---

## API Endpoints Reference

### Dashboard Server (localhost:4200)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dashboard/:date` | GET | All data for dashboard (combined) |
| `/api/dates` | GET | Available log dates |
| `/api/validation/:date` | GET | Validation results |
| `/api/macro/:date` | GET | Macro indicators |
| `/api/sentiment/:date` | GET | Sentiment indicators |
| `/api/news/:date` | GET | News articles |
| `/api/press/:date` | GET | Press releases |
| `/api/whitehouse/:date` | GET | White House statements |
| `/api/daily-macro/:date` | GET | BETA_10_Daily_macro |
| `/api/daily-news/:date` | GET | ALPHA_05_Daily_news |
| `/api/macro-trend/:date` | GET | BETA_09_Trend |
| `/api/ticker-trends` | GET | ALPHA_04_Trends |
| `/api/reports/:ticker` | GET | ALPHA_01_REPORTS for ticker |
| `/api/earnings-calendar` | GET | Earnings dates |
| `/api/fomc-calendar` | GET | FOMC meeting dates |
| `/api/run-validation` | POST | Trigger validation runner |
| `/api/open-urls` | POST | Open URLs in browser |
