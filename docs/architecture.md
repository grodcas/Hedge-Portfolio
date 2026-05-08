# Hedge-Portfolio Architecture

This document is the canonical mental model for how the system is organized
and the bug patterns that have proven costly. Read this before adding a
fetcher, agent, or ingest endpoint.

## Two horizontal layers

```
┌──────────────────────────────────────────────────────────────────┐
│  AI processing — agents read D1, write structured JSON back to   │
│  TICKER_TREND_long / SECTOR_TREND_long / BETA_10_Daily_macro     │
│  Reference: workers/_shared/agent-validators.js (post-LLM        │
│  sign-checks, direction-vs-text, vs_what consistency)            │
├──────────────────────────────────────────────────────────────────┤
│  Data parsing — vendors → portfolio-ingestor /ingest/* → D1      │
│  Vendors: AlphaVantage, Polygon, Finnhub, Yahoo, BLS, FRED, SEC  │
│  Reference: src/steps/fetch-fundamentals.js (canonical pattern   │
│  for SEC-EDGAR-gated smart-fetch with date-snap)                 │
└──────────────────────────────────────────────────────────────────┘
```

## Four workflows

Each workflow threads through both layers:

| Workflow | Data parsing inputs | AI agents (in order) | Writes to |
|---|---|---|---|
| **Macro** | macro-state-fetcher · economic-calendar-fetcher · fomc-statement-fetcher · sentiment-state-fetcher · yfinance-cross-asset-fetcher | macro-news-drift · macro-thesis · macro-notes · macro-positioning · macro-signposts · macro-read · macro-fomc-summary | BETA_10_Daily_macro |
| **Sector** (per sector) | sector-factor-builder | macro-sector-news-drift · macro-sector-thesis · macro-sector-notes · macro-sector-implementation · macro-sector-hedges · macro-sector-read | SECTOR_TREND_long |
| **Ticker** (per ticker) | price-fetcher · earnings-fetcher · consensus-fetcher · stock-factor-builder · src/steps/fetch-fundamentals.js | ticker-fundamentals · ticker-valuation · ticker-estimates · ticker-peers · ticker-context · ticker-news-drift · ticker-thesis · ticker-notes · ticker-recommendation · ticker-read · ticker-earnings-summary | TICKER_TREND_long |
| **Tape** | price-fetcher · news-funnel-orchestrator | big-movers-why · tape-annotation-agent | MOVER_EXPLANATIONS_daily |

## The orchestrator

`workers/agent-orchestrator/src/worker.js` runs nightly at `0 22 * * 1-5`
(weekdays, UTC). Per-agent gates check whether upstream inputs are newer than
the last write — only then does the agent fire. Daily mathematical refreshes
(STOCK_FACTORS_daily etc.) do NOT trigger LLM calls; only structural changes
do (new 10-Q filed, fundamentals delta crossed a threshold, news drift
verdict flipped). Steady-state load: ~10-25 LLM calls/weekday.

## Bug patterns the codebase has paid for — don't repeat

### 1. Vendor-mismatch / fiscal-date orphans

**Symptom**: A field is NULL forever for some tickers, with no error.

**Mechanism**: Two vendors write to the same table on different keys. Polygon
wrote FUND_01_Quarterly with each ticker's actual fiscal-quarter end (AAPL
ends 2026-03-28). Alpha Vantage's CASH_FLOW endpoint reports on calendar
quarter-ends (2026-03-31). Without reconciliation, AV creates a *second* row
per quarter — one Polygon row with cfo, one AV row with capex — and the
FCF math (cfo - capex) returns NULL for both.

**Defense**: When a fetcher writes to a table seeded by another vendor, snap
incoming dates to the closest existing key within ±15 days. Reference
implementation: `src/steps/fetch-fundamentals.js` `snapDate()` helper.

### 2. UPSERT silently overwrites with NULL

**Symptom**: Yesterday's good value is gone today; nothing logged.

**Mechanism**: An UPSERT clause `field = excluded.field` replaces the row's
existing value with whatever the new payload provides — including NULL on a
transient vendor failure. The row looks freshly-updated but is actually
empty.

**Defense**: Every UPSERT field that can come back NULL from the source
must be wrapped in `COALESCE(excluded.field, field)`. Reference: the
`/ingest/fundamentals` UPSERT in `workers/portfolio-ingestor/src/worker.js`.

### 3. Hardcoded NULL placeholders with phantom fallback

**Symptom**: A field is NULL across the entire table, comment says "filled
elsewhere", but the elsewhere is never built.

**Mechanism**: Author writes `capex: null  // AV fallback handles this` in
the Polygon path; the AV fallback is never written; nobody notices until a
downstream consumer surfaces the gap.

**Defense**: If a field can't be filled by the current path, raise an error
or skip the row entirely. Don't write NULL with a TODO. If a fallback is
genuinely future work, file a tracking issue and reference its ID in the
comment.

### 4. Loose AI-agent prose contradicting structural fields

**Symptom**: Agent ships JSON like `{"verdict": "intact", "score": -2}` —
the verdict and the number disagree. Or a tripwire's prose says "above
threshold" while the value is below.

**Mechanism**: Validator checks the JSON shape but not cross-field
consistency. The LLM produces internally inconsistent output and ships.

**Defense**: After `callLLM`, validate cross-field consistency. Direction
words in prose must match the sign of the structural value. Verdict enums
must match the rule documented in the prompt RULES section. Reference:
`workers/_shared/agent-validators.js` for shared helpers.

### 5. Silent default to "all clear" on missing input

**Symptom**: Dashboard shows verdict="intact" / regime="cautious_bullish"
but the upstream input is empty (first-run, no data, agent hasn't fired).

**Mechanism**: `const driftVerdict = drift?.verdict || "intact"` — null
short-circuits to a green-light default. Users believe there's signal where
there's only absence.

**Defense**: Default to `"unknown"` and have the prose explicitly flag the
absence. Reference: ticker-thesis-agent + macro-thesis-agent post-cleanup.

### 6. Free-form numeric prose without source attribution

**Symptom**: Agent writes "gross margin compressed 380bps to 18.53%" while
the actual MCR improved 90bps (UNH bug).

**Mechanism**: Agent's prose contains numbers it invented or misremembered;
no validator checks they exist in the input snapshot.

**Defense**: Every numeric claim must come with structural fields:
`from_value`, `to_value`, `source` per delta. Validator asserts the sign
of `to_value - from_value` matches the claimed `direction`. Reference:
`workers/ticker-fundamentals-agent/src/worker.js` post-UNH fix.

## Adding a new fetcher

1. Decide the canonical key for the table you write. If another vendor
   already writes there, snap your dates to the existing keys.
2. Wrap every UPSERT field in `COALESCE(excluded.X, X)` unless you've
   explicitly decided this field should overwrite (rare — usually just
   `created_at`).
3. If a vendor doesn't expose a field you need, raise — don't write NULL.
4. Add a `/query/X` endpoint for every `/ingest/X` you create. Orphan
   tables (write-only) silently rot.
5. Test: run the fetcher twice in a row. Should be idempotent — second
   run writes 0 net changes.

## Adding a new agent

1. Output schema: every numeric claim is a structural field with a
   `_value` / `_source` companion. Free-form prose is for *interpretation*,
   not data transport.
2. Post-LLM validator must include:
   - Enum membership for every verdict / classification field
   - Sign-check or direction-vs-text consistency for any pair of related
     fields
   - Subset membership for any list of cited IDs (must be subset of the
     input allowlist passed in the prompt)
3. When upstream input is empty, the agent must return verdict="unknown"
   with prose stating the absence — never default silently to "intact".
4. Re-fire epsilon: only when a structurally-relevant input changed.
   Daily mathematical updates do NOT count (they fire daily; would burn
   LLM budget). Reference: agent-orchestrator gates.

## Local pipeline vs Cloudflare cron

Two execution paths:

- **Cloudflare side** (workers): run on cron. Daily at 00:00-22:00 UTC
  staggered. Triggered by wrangler.jsonc `triggers.crons`.
- **Local pipeline** (`src/pipeline.js`): run from the user's laptop nightly
  via `npm run pipeline`. Hosts AlphaVantage fetches because Cloudflare's
  shared egress IP is rate-limited by AV. Includes `fetch-fundamentals.js`
  which orchestrates SEC-EDGAR-gated smart-fetch.

The `job-engine-workflow` worker on Cloudflare side does NOT call AV — it
expects the local pipeline to have written FUND_01_* before `daily_update`
fires. Don't move AV calls into Cloudflare.

## End-to-end smoke test

```bash
# 1. Ingestion layer healthy
curl -s "https://hedge-server.gines-rodriguez-castro.workers.dev/api/book-grid" | jq '.rows | length'   # → 24
curl -s "https://hedge-server.gines-rodriguez-castro.workers.dev/api/sector-strip" | jq '.sectors | length'   # → 11
curl -s "https://hedge-server.gines-rodriguez-castro.workers.dev/api/macro-state-latest" | jq '.indicators | length'   # → 30+
curl -s "https://hedge-server.gines-rodriguez-castro.workers.dev/api/tape-window?days=14" | jq '.news_count, .move_count'   # → 60, ≥1

# 2. AI layer healthy (every ticker has thesis updated within 24h)
curl -s "https://hedge-server.gines-rodriguez-castro.workers.dev/api/ticker-thesis?ticker=NVDA" | jq '.updated_at'

# 3. Quality 8q sparkline (after AV-reset force-all run)
curl -s "https://hedge-server.gines-rodriguez-castro.workers.dev/api/fundamental-trends?tickers=NVDA,AAPL,XOM,JPM" | jq '.trends[].fcf | length'   # all should be ≥6

# 4. Dashboard renders cleanly
open https://hedge-server.gines-rodriguez-castro.workers.dev/   # zero — beyond known-pending columns; no console errors
```
