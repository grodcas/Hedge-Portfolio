> [STRUCTURE](../STRUCTURE.md) · [Pipeline](pipeline.md) · [Data Sources](data-sources.md) · [Validation](validation.md) · [Worker & D1](worker-d1.md) · [Dashboard](dashboard.md)

# Dashboard

**Server**: `dashboard/server.js` (Express, port 4200)
**Frontend**: `dashboard/app.js` + `index.html` + `styles.css`
**Command**: `npm run dashboard`
**Data source**: D1 database only — no local file fallback

The dashboard is a vanilla JavaScript single-page application with 6 tabs. It reads all data from the Cloudflare Worker's `/query/*` endpoints via the Express server proxy.

---

## Architecture

```
Browser (localhost:4200)
    │
    ▼
Express Server (dashboard/server.js)
    │  Proxies /api/* routes to Cloudflare Worker
    │  Also serves static files (HTML, CSS, JS)
    ▼
Cloudflare Worker (GET /query/*)
    │
    ▼
D1 Database (HEDGE_DB)
```

### Why an Express Proxy?

The dashboard could call the Worker directly, but the Express server:
- Provides a single origin (no CORS issues in development)
- Aggregates multiple `/query/*` calls into `/api/dashboard/:date` (8 parallel fetches)
- Serves static files
- Hosts the AI content validation endpoints

---

## Tabs

### 1. Overview

| Component | Data Source | What It Shows |
|-----------|------------|---------------|
| Ingestion Health | `validation.summary.sections['SEC Edgar']` | Pass/fail percentage of SEC filing match |
| Processing Health | Hardcoded | Always shows 100% |
| Data Freshness | `dashboardData.date` | Selected date |
| Today's Stats | `validation.summary.steps` | Counts: SEC filings, macro updates, news articles, press releases |
| Calendar Events | `summary.calendarEvents` | Expected macro releases (CPI, Employment, etc.) |
| Action Required | `summary.actionRequired` | Up to 5 items needing attention |

### 2. Daily

| Component | Data Source | What It Shows |
|-----------|------------|---------------|
| Daily Macro Summary | `dashboardData.dailyMacro` | AI-generated narrative of macro conditions |
| Portfolio Daily News | `dashboardData.dailyNews` + fallback to `press` and `news` | Ticker cards with type badges, summary text, "View Report" buttons |

Filter buttons: **All** / **SEC** / **Press** / **News** — filter ticker cards by data type.

### 3. Macro

| Component | Data Source | What It Shows |
|-----------|------------|---------------|
| FOMC Countdown | `dashboardData.calendar.nextFOMC` | Next meeting date, days remaining, temperature bar |
| Weekly Macro Trend | `dashboardData.macroTrend` (BETA_09) | AI-generated weekly trend narrative |
| Recent Macro Events | `macro.Macro` + `sentiment.Sentiment` | Timeline of up to 10 recent events, sorted by date |

FOMC dates are hardcoded (2026 schedule) with a fallback function.

### 4. Portfolio

| Component | Data Source | What It Shows |
|-----------|------------|---------------|
| Ticker Trend Cards | `dashboardData.tickerTrends` (ALPHA_04) | Per-ticker: summary, earnings countdown, last update |
| Sort Options | User selection | Sort by: Next Earnings / Ticker / Last Update |

### 5. Validation

Two sections:

**AI Summary Verification** (prominent, top):
- Critical issues banner — pulsing red border for detected hallucinations
- Stats bar: summaries checked, facts checked, passed, failed, accuracy %
- Expandable cards per item with score circle (green/yellow/red) and fact details

**Parser Health Checks** (collapsible `<details>`):
- SEC table: ticker, ingestor vs SEC filing types, match status
- Macro table: indicator, URL/format/data checks, values
- Sentiment table: same pattern
- Policy table: source, checks, latest title + date + content snippet
- Press table: ticker, checks, latest title

### 6. Monthly Check

Manual verification workflow for spot-checking data accuracy:
- "Run Full Check" button — triggers server-side validation
- "Open All URLs" button — opens macro data source URLs in browser
- Tables for macro indicators, press releases (25 tickers), FOMC/policy
- Each row has verify/wrong buttons with visual progress tracking

---

## Data Flow

### Loading Sequence

```
1. DOMContentLoaded
   ├── initTabs()              # Attach tab click handlers
   ├── loadDates()             # GET /api/dates → populate dropdown
   ├── loadData(currentDate)   # GET /api/dashboard/:date → dashboardData
   ├── initModal()             # Setup report modal
   ├── startWorkflowPolling()  # Begin 30s polling
   └── initVerificationSection()
```

### `loadData(date)` Flow

```
GET /api/dashboard/:date
    │
    ▼
dashboardData = response    (global state)
    │
    ├── updateOverview()
    ├── updateValidation()
    ├── updateDailyOutput()
    ├── updateMacroTab()
    ├── updatePortfolioTab()
    ├── updateMonthlyCheck()
    └── updateVerificationFromD1()
```

### Auto-Refresh

- Every 30 seconds, `checkWorkflowStatus()` fetches `GET /query/workflow-status` directly from the Worker
- If a new `completed_at` timestamp is detected (different from `lastWorkflowCompletion`):
  1. Updates `lastWorkflowCompletion`
  2. Calls `loadData(currentDate)` to refresh all data
  3. Shows a green "Data updated!" toast notification (auto-fades after 3s)

---

## Server API Endpoints

### Proxy Endpoints (D1 data)

| Route | Worker Endpoint | Purpose |
|-------|----------------|---------|
| `GET /api/dashboard/:date` | Multiple `/query/*` in parallel | All dashboard data for a date |
| `GET /api/dates` | `/query/pipeline-validation` | Available dates |
| `GET /api/validation/:date` | `/query/pipeline-validation` | Validation details |
| `GET /api/macro/:date` | `/query/macro` | Macro readings |
| `GET /api/sentiment/:date` | `/query/sentiment` | Sentiment data |
| `GET /api/news/:date` | `/query/news` | News articles |
| `GET /api/press/:date` | `/query/press` | Press releases |
| `GET /api/whitehouse/:date` | `/query/whitehouse` | White House items |
| `GET /api/daily-macro/:date` | `/query/daily-macro` | Daily macro summary |
| `GET /api/daily-news/:date` | `/query/daily-news` | Daily news |
| `GET /api/macro-trend/:date` | `/query/macro-trend` | Weekly macro trend |
| `GET /api/ticker-trends` | `/query/ticker-trends` | All ticker trends |
| `GET /api/reports/:ticker` | `/query/reports` | SEC reports for ticker |
| `GET /api/earnings-calendar` | `/query/earnings-calendar` | Estimated earnings dates |
| `GET /api/fomc-calendar` | Static | Hardcoded 2026 FOMC dates |

### Action Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/run-validation` | POST | Trigger server-side validation runner |
| `/api/open-urls` | POST | Open URLs in browser (max 10) |
| `/api/content-validation/validate` | POST | Send summary for AI verification |
| `/api/content-validation/results` | GET | Fetch latest verification from D1 |
| `/api/content-validation/save` | POST | Upload verification results to D1 |

---

## Global State

```javascript
let currentDate = "2026-03-01";       // Selected date (ISO string)
let dashboardData = null;              // Full response from /api/dashboard/:date
let lastWorkflowCompletion = null;     // Timestamp for detecting new pipeline runs
let validationResults = [];            // Transformed AI verification results
```

All rendering is imperative DOM manipulation — no framework, no virtual DOM.

---

## Styling

- Dark theme with CSS custom properties (`--bg-primary`, `--accent-green`, etc.)
- Responsive grid layouts at 3 breakpoints (1200px, 1024px, 768px)
- Score circles: green (>=90%), yellow (70-89%), red (<70%)
- Temperature bars: gradient from green to red for FOMC/earnings countdown

---

> [STRUCTURE](../STRUCTURE.md) · [Pipeline](pipeline.md) · [Data Sources](data-sources.md) · [Validation](validation.md) · [Worker & D1](worker-d1.md) · [Dashboard](dashboard.md)
