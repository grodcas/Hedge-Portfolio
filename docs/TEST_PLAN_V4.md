> [STRUCTURE](STRUCTURE.md)

# Test Plan v4 — Investment Counseling System

**Last updated**: 2026-04-12
**Scope**: Validate every pipeline stage and dashboard tab after the Phase 1-9 rework.

This test plan covers the full system: data fetching, computation, interpretation, consensus validation, and dashboard rendering. Each test is independently runnable and verifies both data correctness AND the absence of AI hallucination.

---

## Test Environment

- All workers deployed to Cloudflare
- D1 database migrated to schema 0009-0014
- API secrets configured: `POLYGON_KEY`, `ALPHAVANTAGE_KEY`, `FINNHUB_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`
- Dashboard running locally on port 4200

---

## Pre-flight: Deployment

Before any test, deploy the new workers and run migrations:

```bash
# 1. Run all new migrations
cd workers/portfolio-ingestor
npx wrangler d1 migrations apply hedge-portfolio --remote

# 2. Deploy all 7 new workers
cd ../price-fetcher && npx wrangler deploy
cd ../fundamentals-fetcher && npx wrangler deploy
cd ../earnings-fetcher && npx wrangler deploy
cd ../macro-intelligence-builder && npx wrangler deploy
cd ../assessment-engine && npx wrangler deploy
cd ../probability-engine && npx wrangler deploy
cd ../consensus-validator && npx wrangler deploy

# 3. Redeploy the ingestor and job engine (updated code)
cd ../portfolio-ingestor && npx wrangler deploy
cd ../job-engine-workflow && npx wrangler deploy
```

Verify all 7 workers appear in the Cloudflare dashboard.

---

## Test Cases

### T1: Price Fetcher (Phase 1)

**What it verifies**: Polygon.io integration, rate limiting, ingestor write path, D1 storage

**Steps**:
1. Trigger: `curl -X POST https://price-fetcher.gines-rodriguez-castro.workers.dev/fetch-prices`
2. Wait ~7 minutes for rate-limited batches to complete
3. Query: `curl https://portfolio-ingestor.gines-rodriguez-castro.workers.dev/query/prices`

**Pass criteria**:
- Response contains at least 25 tickers + SPY + 6 sector ETFs (32 rows minimum)
- Every row has `open`, `high`, `low`, `close`, `volume` as numbers > 0
- `date` is the most recent trading day
- Running the worker twice produces no duplicates (deterministic IDs)
- BRK.B is present (BRK.B → BRK-B fallback works)

**Failure mode**: If Polygon rate limits, worker skips ticker but logs. Acceptable if <3 missing.

---

### T2: Fundamentals Fetcher (Phase 2)

**What it verifies**: Alpha Vantage OVERVIEW parsing, "None" → null conversion, raw_json audit trail

**Steps**:
1. Trigger via job engine: `POST /run {"action": "fundamentals"}`
2. Wait ~5 minutes
3. Query: `curl https://portfolio-ingestor.gines-rodriguez-castro.workers.dev/query/fundamentals`

**Pass criteria**:
- 25 rows returned
- `pe_ratio` is a number in [0, 500] or null (not "None" string)
- `market_cap > 0`
- `raw_json` column contains the full Alpha Vantage response (for audit)
- BRK-B was queried (confirm in `raw_json`)

**Note**: Alpha Vantage free tier is 25/day. Running this test uses ALL daily calls — do not rerun same day.

---

### T3: Earnings + Recommendations Fetcher (Phase 3)

**What it verifies**: Finnhub parallel fetching, two-endpoint pattern, recommendation aggregation

**Steps**:
1. Trigger: `curl -X POST https://earnings-fetcher.gines-rodriguez-castro.workers.dev/fetch-earnings`
2. Query earnings: `curl .../query/earnings`
3. Query recommendations: `curl .../query/recommendations`

**Pass criteria**:
- Each ticker has ≥1 quarter of earnings data in FUND_02
- `surprise_pct` is a number in a reasonable range (-50 to +50 typical)
- Each ticker has ≥1 recommendation row in FUND_03
- `strong_buy + buy + hold + sell + strong_sell > 0` for every row
- BRK-B mapping works

---

### T4: News Funnel End-to-End (Already deployed)

**What it verifies**: 3-stage pipeline (gather → filter → summarize → D1)

**Steps**:
1. Trigger: `POST /run {"action": "news_funnel"}`
2. Wait ~2 minutes for all stages
3. Query: `curl .../query/news-digest?date=<today>`

**Pass criteria**:
- `macro_headlines` has 5-10 entries
- `ticker_headlines` has entries for at least 10 tickers
- Each headline has `title`, `summary`, `sentiment`, `magnitude`
- URLs in underlying data are valid http(s) (run news-funnel-checker)

---

### T5: Macro Intelligence Builder (Phase 4b)

**What it verifies**: GPT-4o-mini JSON-mode output, schema validation, probability normalization

**Steps**:
1. Ensure BETA_03, BETA_04, BETA_11, BETA_12 have data
2. Trigger: service binding call from job engine, or direct `POST /build-macro-intelligence`
3. Query: `curl .../query/daily-macro`

**Pass criteria**:
- `summary` field parses as valid JSON
- JSON has keys: `regime`, `sp500_direction`, `what_happened`, `whats_next`, `portfolio_action`, `five_layers`
- `sp500_direction` probabilities sum to 1.0 (±0.01 tolerance)
- `regime` is one of: bullish / cautious_bullish / neutral / cautious_bearish / bearish
- `what_happened` and `whats_next` are non-empty arrays
- `five_layers` has 5 keys with score in [1, 5]
- **Critical**: verify no hallucinated events (cross-check against BETA_03 data)

**Hallucination check**: Read the `what_happened` bullets. Every fact should be traceable to the input data. If the model mentions "Anthropic", "GPT-5", or any event not in the input, the prompt needs tightening.

---

### T6: Assessment Engine (Phase 5)

**What it verifies**: 10-factor scoring math, AI explanation grounding, factor audit trail

**Steps**:
1. Ensure Phases 1-3 data is loaded (prices, fundamentals, earnings)
2. Trigger: `curl -X POST https://assessment-engine.gines-rodriguez-castro.workers.dev/compute-assessments`
3. Query: `curl .../query/assessments`

**Pass criteria**:
- 25 rows (one per ticker)
- Every row's `score` is in [-1.0, 1.0]
- `factors_json` parses to an array of 10 objects
- Each factor has `name`, `value` (in {-1, 0, 1}), `weight`, `trust`, `reason`
- `sources_json` lists the D1 tables used (no hallucinated sources)
- `explanation` is 1-2 sentences, does NOT contain any numbers not present in `factors_json` reasons
- **Critical hallucination check**: Manually inspect 3 ticker explanations. Confirm every number mentioned appears in the corresponding factor reasons.

**Math verification**:
- Pick a ticker with score = X
- Manually compute: `(sum of value*weight) / (sum of weight)` from factors_json
- Result should equal X (within rounding)

---

### T7: Probability Engine (Phase 6)

**What it verifies**: Bayesian update math, normalization, persistence

**Steps**:
1. Run assessment-engine first (T6)
2. Trigger: `curl -X POST https://probability-engine.gines-rodriguez-castro.workers.dev/update-probabilities`
3. Query: `curl .../query/probabilities`

**Pass criteria**:
- 25 rows
- For every row: `p_favorable + p_neutral + p_unfavorable = 1.000` (within 0.001)
- No probability is below 0.05 (floor enforced)
- Tickers with positive composite score have higher p_favorable than prior (0.30)
- Tickers with negative composite score have higher p_unfavorable than prior (0.30)

**Multi-day simulation** (manual):
- Delete today's SIGNAL_02 row for one ticker
- Run probability-engine → should use prior
- Verify p_favorable ≈ 0.30 + (positive factor shifts)
- Re-run tomorrow → should read today's row as yesterday's state, shift further

---

### T8: Consensus Validator (Phase 7)

**What it verifies**: Gemini integration, anti-confirmation-bias search, confidence assignment

**Steps**:
1. Run assessment-engine (T6) so SIGNAL_01 has data
2. Trigger: `curl -X POST https://consensus-validator.gines-rodriguez-castro.workers.dev/validate-consensus`
3. Query: `curl .../query/consensus`

**Pass criteria**:
- ~6 rows (top 5 tickers + macro)
- Every row has `confidence` in {HIGH, MEDIUM, LOW}
- `consensus_level` is a number in [0, 1]
- `dominant_narrative` is a non-empty sentence
- `strongest_counter` is non-empty (the validator found a counter-argument)
- `search_sources` is a non-empty array

**Critical anti-bias check**:
- Pick a row with bullish conclusion (positive score)
- Read the `dominant_narrative` — does it describe the GENERAL market view, or only bullish sources?
- The narrative should describe what MOST sources say, even if most disagree with us
- If the narrative only cites bull sources for a bull conclusion, the prompt has confirmation bias — must fix

**Flag test**: At least one target should have MEDIUM or LOW confidence (Gemini is unlikely to find perfect consensus for every signal). If all 6 are HIGH, the prompt is being too lenient.

---

### T9: Dashboard Daily Tab

**What it verifies**: Headline-first rendering, click-to-expand, filter buttons, release badges

**Steps**:
1. Start dashboard: `node dashboard/server.js`
2. Open http://localhost:4200 in browser
3. Click Daily tab
4. Select today's date from dropdown

**Pass criteria**:
- "Releases Today" shows badges for any SEC filings / press releases / macro data today
- "Upcoming Catalysts" shows countdown for FOMC, CPI, Employment, earnings within 30 days
- "Macro Headlines" shows 5-10 headlines with sentiment dots
- "Ticker Headlines" shows grouped by ticker
- **No walls of text** — every headline is one line
- Clicking a headline unfolds a 2-3 sentence summary
- Filter buttons (All/SEC/Press/News) correctly toggle visibility
- No JS console errors

---

### T10: Dashboard Macro Tab

**What it verifies**: Structured macro intelligence rendering, probability bars, 5-layer display

**Steps**:
1. Ensure macro-intelligence-builder has run (T5)
2. Click Macro tab

**Pass criteria**:
- Regime badge shows color-coded label (bullish/cautious_bullish/etc.)
- Probability bars (Up/Flat/Down) visually show percentages, widths sum to 100%
- "Why It Moved" is a bullet list, not a paragraph
- "What's Next" is a bullet list
- "Portfolio Action" shows Overweight / Underweight / Hedge sections
- 5-Layer Intelligence has 5 clickable rows with score bars (█ characters)
- FOMC countdown shows correct date and days remaining

---

### T11: Dashboard Portfolio Tab

**What it verifies**: Signal rendering, sector bar, consensus badges, expand interactions

**Steps**:
1. Ensure assessment-engine + consensus-validator have run (T6, T8)
2. Click Portfolio tab

**Pass criteria**:
- Sector Performance bar shows all 6 sectors + SPY with color-coded returns
- Buy Signals column shows tickers with score > 0.15, sorted descending
- Sell Signals column shows tickers with score < -0.15, sorted ascending
- Each signal card has score bar, consensus icon (✓/○/⚠), click to expand
- Expanding shows: explanation, price change, consensus narrative + counter, factor breakdown
- All-tickers table has 25 rows with score, vs-sector, driver, consensus badge
- Consensus LOW badges are red-highlighted

---

### T12: Dashboard Overview Tab

**What it verifies**: Performance snapshot, top movers, signal counts

**Steps**:
1. Click Overview tab (default on load)

**Pass criteria**:
- Portfolio Performance card shows today's date
- Top Gainers: 5 tickers with positive %
- Top Losers: 5 tickers with negative %
- S&P 500 return shown with green/red color
- Buy/Sell signal counts show actual numbers (not "--")
- Existing health cards still work (ingestion %, processing %, freshness)

---

### T13: Validation Suite

**What it verifies**: All 4 new checkers execute and flag issues correctly

**Steps**:
1. Run: `node validation/runner.js`
2. Wait for all steps

**Pass criteria**:
- Steps run: SEC, Macro, Sentiment, Press, Policy, News, News Funnel, Prices, Fundamentals, Earnings, Consensus
- Price checker reports correct count (≥32 rows)
- Fundamentals checker reports count with no out-of-range values
- Earnings checker reports both FUND_02 and FUND_03 counts
- Consensus checker reports LOW confidence items as warnings (not failures)
- `actionRequired` list includes any consensus disagreements with counter-arguments

---

### T14: Full daily_update End-to-End

**What it verifies**: Complete orchestration — data fetching → AI synthesis → scoring → consensus → dashboard

**Steps**:
1. Clear today's data (optional, for clean test):
   ```sql
   DELETE FROM PRICE_01_Daily WHERE date = '<today>';
   DELETE FROM SIGNAL_01_Assessment WHERE date = '<today>';
   -- etc
   ```
2. Trigger: `POST https://job-engine-workflow.../run {"action": "daily_update"}`
3. Monitor workflow: query `PROC_01_Job_queue` every 30s to track progress
4. Wait until all jobs show status='done' (expect 15-25 min total)

**Expected execution order** (LIFO — highest ID first):
1. **news-funnel-orchestrator** (direct binding, runs in parallel)
2. **price-fetcher** (highest ID)
3. **earnings-fetcher**
4. **macro-news-summarizer** (existing)
5. **beta-trend-orchestrator** (existing)
6. **daily-macro-summarizer** (existing)
7. **macro-intelligence-builder** (new)
8. **assessment-engine** (new, depends on prices+earnings)
9. **probability-engine** (new, depends on assessment)
10. **consensus-validator** (new, depends on assessment)

**Pass criteria**:
- All 10 jobs reach status='done' (or 'failed' with logged error)
- No jobs stuck in 'running' > 10 min
- Dashboard loads all 6 tabs without errors
- Each tab shows new data from today's run

**Failure modes & recovery**:
- If price-fetcher fails → assessment-engine falls back to last-known prices
- If Gemini rate-limits consensus-validator → partial results still written
- If macro-intelligence-builder AI returns invalid JSON → error logged, Macro tab shows previous day's data

---

## Hallucination Red Flags (Manual Checks)

After any AI-generated output, look for:

1. **Fabricated numbers**: Any specific number (%, $, count) that does NOT appear in the input data
2. **Fabricated events**: Mentions of specific company actions, announcements, or deals not in the source
3. **Fabricated companies**: Names of companies not in the 25-ticker portfolio
4. **Off-topic**: Political commentary, opinions, disclaimers, "I'm an AI" notes
5. **Stale dates**: References to events from wrong dates/years

If any of these appear, the worker's prompt needs tightening (more examples, stricter "output ONLY" rules, lower temperature).

---

## Small-Scale Test Recipe (3 tickers only)

For fast iteration during development, temporarily patch workers to use 3 tickers:

```javascript
const TICKERS = ["AAPL", "JPM", "XOM"]; // Tech, Finance, Energy — covers 3 sectors
```

Run Phases 1-7 against this subset. Every pipeline should still work end-to-end in ~3 minutes vs 25 min for full portfolio.

---

## What Success Looks Like

After full deployment and T14 passes:

1. **Data layer**: 25+ tickers have prices, fundamentals, earnings, analyst recs updated daily
2. **Computation layer**: 25 composite scores with 10 factors each, all math verifiable
3. **Interpretation layer**: 25 plain-language explanations, all grounded in factors
4. **Consensus layer**: Top 5 signals validated against market opinion via neutral + opposing search
5. **Dashboard**: Daily headlines, Macro predictions, Portfolio signals, Overview performance — all data-driven, no walls of text
6. **Validation**: 4 new checkers + consensus disagreements flagged in action-required list

This is the foundation of the investment counseling system. From here, the next evolutions are: historical backtesting of probability curves vs actual price moves, position management with cost-basis tracking, and eventual automated hedging suggestions.

---

> [STRUCTURE](STRUCTURE.md)
