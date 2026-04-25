# Narrative — Phase 2 Plan (post Sprints 0–7)

Two follow-up sprints to close the remaining gaps after the narrative plan's
main 8 sprints. These are scoped to clean up consistency issues and wire the
dashboard rich-data sections that were left as skeletons.

Both sprints are independent — can be run in either order or parallel.

---

## Sprint 8 — Legacy-workers SPDR alignment

**Goal:** five workers that predate the Sprint 2/3 narrative work still use a
coarse 6-sector map with pre-2018 sector assignments. Bring them to the same
SPDR/GICS 8-sector convention already used by `stock-factor-builder` and
`sector-factor-builder`, so `SIGNAL_01_Assessment`, `OPERATION_01_Signals`,
`SIGNAL_04_Attributions`, and `TICKER_TREND_long/short` output consistent
sector attributions.

### Problem (exact)

Each of the 5 workers defines its own `SECTOR_MAP`:

1. **Consumer-bucket collapse** — `Consumer: [PG, KO, HD]` groups Staples
   (PG, KO) and ConsDisc (HD) together. GICS has them in separate sectors.
2. **Pre-2018 GOOGL/META misclass** — `Technology: [..., GOOGL, META, NFLX,
   AMZN, TSLA]` pre-dates the SPDR reclass: GOOGL, META, NFLX → XLC
   (Communication); AMZN, TSLA → XLY (ConsDisc). Stays unchanged until
   we touch these workers.

### Canonical replacement (from `stock-factor-builder`)

```
Technology    (XLK): AAPL, MSFT, NVDA, INTC, AMD
ConsDisc      (XLY): AMZN, TSLA, HD
Communication (XLC): GOOGL, META, NFLX
Finance       (XLF): JPM, GS, BAC, MS, BRK.B
Energy        (XLE): XOM, CVX
Healthcare    (XLV): UNH, LLY, JNJ
Staples       (XLP): PG, KO
Industrial    (XLI): CAT, BA
```

### Tasks

- [ ] **assessment-engine** (`workers/assessment-engine/src/worker.js`)
  - Replace `SECTOR_MAP` constant.
  - Audit the "Macro alignment" factor's prompt reason-string — it cites
    sector names ("Healthcare sector not mentioned in macro action"). Make
    sure it uses canonical D1 names, not the old 6-sector labels.
  - Redeploy. Run `/compute-assessments`. Verify the new factors_json reason
    strings for HD mention ConsDisc, not Consumer.

- [ ] **operations-agent** (`workers/operations-agent/src/worker.js`)
  - Replace `SECTOR_MAP`.
  - `OPERATION_01_Signals` rows are keyed by sector — existing rows under
    "Consumer" become orphans. The supersede pattern handles this: on next
    run the new "Staples" and "ConsDisc" rows are written and the
    "Consumer" row can be left with `superseded_by = NULL` for history.
  - Redeploy. Run `/build-all`. Spot-check a Staples row and a ConsDisc row
    are both produced.

- [ ] **event-attribution-engine** (`workers/event-attribution-engine/src/worker.js`)
  - Replace `SECTOR_MAP`.
  - `SIGNAL_04_Attributions` classifies daily moves into macro / sector /
    company buckets. Historic rows under the old vocabulary stay as-is.
  - Redeploy. Verify next run's attributions cite the 8 canonical sectors.

- [ ] **ticker-trend-long** (`workers/ticker-trend-long/src/worker.js`)
  - Replace `SECTOR_MAP`.
  - `TICKER_TREND_long.thesis` and `TICKER_TREND_long.drivers` are LLM
    outputs — strings may reference old sector labels. The `ON CONFLICT(ticker)
    DO UPDATE` pattern overwrites on next run.
  - Redeploy. Run `/build-all`. Spot-check the HD thesis mentions
    Consumer Discretionary, not Consumer; the GOOGL thesis mentions
    Communication, not Technology.

- [ ] **ticker-trend-short** (`workers/ticker-trend-short/src/worker.js`)
  - Same treatment as ticker-trend-long.
  - Redeploy. Run `/build-all`.

- [ ] **Downstream verification**
  - Re-run `narrator-stock /build-all` via the dispatcher (`/cold-start` works).
    The 25 stock narratives read from TICKER_TREND_long/short as context; their
    sector references should now be consistent end-to-end.
  - Check `narrator-sector-landscape` still passes its anti-contamination
    guard — it already uses canonical sector names via `SECTOR_FACTORS_daily`,
    so no change expected.

### Deliverables

- 5 workers redeployed with canonical SECTOR_MAP
- One fresh run of each worker's `/build-all` or equivalent
- 25 stock narratives regenerated via dispatcher cold-start
- Spot-check report: HD → ConsDisc, GOOGL → Communication across downstream tables

### Quality gates

- [ ] `SELECT DISTINCT sector FROM STOCK_FACTORS_daily` still returns the 8
      canonical sectors (no regression).
- [ ] `SIGNAL_01_Assessment` for HD and GOOGL reason-strings use correct
      sector labels.
- [ ] `OPERATION_01_Signals` has fresh rows for Staples, ConsDisc,
      Communication (not just Consumer / Technology).
- [ ] Narrator-stock outputs for HD, GOOGL, META reference the correct
      sectors in `rec_long.stance`.

### Risks & gotchas

- **Prompt-string audit in assessment-engine**: the "Macro alignment" factor
  reason uses sector names in plain English. If the LLM prompt template hardcodes
  "Consumer" or a list of old sectors, must be updated in parallel.
- **ticker-trend-long schema oddity**: the `ON CONFLICT(ticker) DO UPDATE`
  pattern means no historical trail. Old thesis strings are lost on first
  run with new map — acceptable (they were wrong) but worth noting.
- **No tests exist for these workers** — verify manually via D1 inspection.

### Estimated time: 2–3 hours.

---

## Sprint 9 — Stock & sector profile rich-data UI wiring

**Goal:** every stock and sector entity profile renders live composition /
epsHistory / filings / peers / catalysts / news from D1, replacing the empty
arrays in the current skeletons and the hand-curated data in the 5 pre-Sprint-3
stock profiles (UNH, LLY, NVDA, MSFT, KO).

After this sprint: every section of every entity view is D1-sourced. No
hand-curated mock data anywhere in the portfolio funnel.

### Problem (exact)

- **20 new stock skeletons** (from Sprint 5 via `_makeStockSkeleton`): all
  rich-data fields are empty arrays (`composition: []`, `filings: []`, etc.).
  Only the narrative 3-block tabs have content.
- **5 existing stock profiles** (UNH, LLY, NVDA, MSFT, KO): `financials`,
  `epsHistory`, `filings`, `peers`, `catalysts`, `news` are hand-curated
  static data from early dashboard development. Narrative overlay works on
  top, but these underlying sections are not D1-sourced.
- **8 sector profiles** (Sprint 3): `composition`, `peers`, `news`,
  `catalysts` slots are empty arrays.

### Data sources (all in D1)

| UI section | Table(s) | Query shape |
|---|---|---|
| Stock `snapshot` cells | `FUND_01_Fundamentals` latest row | pe_ratio, forward_pe, market_cap, dma_50/200, beta, div_yield |
| Stock `financials` (rev/margin/eps/fcf chart) | `FUND_01_Fundamentals` (single row with TTM) | need quarterly history — gap; use current TTM as single point until quarterly backfill lands |
| Stock `epsHistory` (9-quarter bars) | `FUND_02_Earnings` last 9 rows by report_date | period, estimate, actual, surprise_pct |
| Stock `filings` cards | `ALPHA_01_Reports` latest 4–6 by date | type, date, summary; summaries already written by qk-report-summarizer |
| Stock `peers` table | `STOCK_FACTORS_daily` WHERE sector = (ticker's sector) | ticker, fwd_pe, eps_rev_4w, in-book flag |
| Stock `catalysts` | `FUND_02_Earnings` WHERE report_date > today, limit 4 | report_date, period |
| Stock `news` feed | `BETA_12_News_digest` WHERE ticker = ? AND date >= 7d ago | date, title, sentiment, magnitude |
| Sector `composition` | `STOCK_FACTORS_daily` WHERE sector = ? joined with `SIGNAL_01_Assessment` score | ticker, score, top 3 per sector |
| Sector `peers` (other sectors table) | `SECTOR_FACTORS_daily` latest date | sector, stance, fwd_pe_sector, regime_fit |
| Sector `news` feed | `BETA_12_News_digest` joined via `STOCK_FACTORS_daily.sector` | last 7d, filtered to sector constituents |
| Sector `catalysts` | `FUND_02_Earnings` WHERE ticker IN (sector constituents) AND report_date > today | upcoming earnings within sector |

### Tasks

- [ ] **Dashboard API endpoints** (`dashboard/server.js`)
  - `/api/stock-profile/:ticker` → bundles: fundamentals, epsHistory (9q),
    filings (6), peers (same-sector from STOCK_FACTORS_daily), catalysts
    (upcoming earnings), news (7d). One endpoint, one round-trip per stock.
  - `/api/sector-profile/:sector` → bundles: composition (top tickers),
    peers (other sectors), news (sector-tagged), catalysts (upcoming
    earnings for constituents). Sector factor cells are already rendered
    by `buildSectorSnapshot` from narrative; no duplicate here.
  - Both proxy through the existing `fetchFromWorker` pattern to ingestor
    `/query/...` endpoints, OR — if ingestor doesn't have these queries —
    add `/query/stock-profile/:ticker` and `/query/sector-profile/:sector`
    to `portfolio-ingestor`.

- [ ] **Frontend fetchers** (`dashboard/portfolio-funnel-mockup.js`)
  - `fetchStockProfile(ticker)` — session-cached per ticker.
  - `fetchSectorProfile(sector)` — session-cached per sector.
  - Both parallel to the existing `fetchStockNarrative` / `fetchSectorNarrative`.

- [ ] **Overlay in `openEntity`**
  - For `kind === 'stock'`: after the narrative overlay, also fetch
    profile data and merge into ENTITIES[entKey] — `epsHistory`,
    `filings`, `peers`, `catalysts`, `news`, `snap`, `snapshot` (snapshot
    already covered by narrative; consider which wins).
  - For `kind === 'sector'`: same, merging composition, peers, news,
    catalysts.

- [ ] **Strip the 5 existing stock profiles to skeletons**
  - Replace UNH, LLY, NVDA, MSFT, KO hand-curated `financials`,
    `epsHistory`, `filings`, `peers`, `catalysts`, `news` with `[]` /
    `{}` like the new 20 skeletons. All data comes from the profile
    fetch at open-time. No fallback divergence.

- [ ] **Precedence rules** (explicit to avoid drift)
  - `thesis` — narrative lede wins over any stub text.
  - `business` — narrative tabs (for stock) / 3-block (for sector) win
    over static business description. But keep the static `business`
    string on the entity object so it renders if narrative fails.
  - `snapshot` — narrative-sourced cells win for both stock and sector.
  - All other sections — profile fetch wins.

- [ ] **Render resilience**
  - Every section renders an empty-state placeholder ("No data
    available") instead of breaking when a field is empty. Already
    partially works via `.map(...).join('')` returning `""`; verify
    each section.

### Deliverables

- `/api/stock-profile/:ticker` + `/api/sector-profile/:sector` endpoints
- `fetchStockProfile()` + `fetchSectorProfile()` in the JS
- `openEntity` overlay for both kinds
- 5 existing stock profiles stripped to skeletons
- End-to-end verification: opening any of the 33 entities (25 stocks + 8 sectors) renders D1-sourced rich data

### Quality gates

- [ ] Every stock entity view renders `epsHistory` bars (9 quarters visible
      or explicit "no data" if backfill is partial).
- [ ] Every stock entity view renders at least one filing card (10-K/10-Q/8-K
      summary from ALPHA_01_Reports).
- [ ] Every stock entity view renders the same-sector peers table with ≥3 peers.
- [ ] Every sector entity view renders composition with ≥2 tickers per
      sector (except where sector has <2 constituents in the universe).
- [ ] `grep -r "hand-curated\|mock data" dashboard/portfolio-funnel-mockup.js`
      returns only the single commented `DATA` top-of-file block; nothing in
      ENTITIES.
- [ ] Opening a stock that has NO FUND_01 row / NO filings / NO news renders
      the entity view without JS errors — empty sections with placeholder text.

### Risks & gotchas

- **`FUND_01_Fundamentals` quarterly history missing**: the table has one
  row per ticker (latest snapshot). The 6-year `financials` chart in
  the existing UNH profile is fabricated. Two options:
  (a) chart only the current TTM point (degrade the chart to a single KPI),
  (b) backfill `FUND_01` historically (out of Sprint 9 scope — would be a
  separate sprint). Recommend (a) for Sprint 9.
- **`peers` in-book flag**: currently derived from whether the ticker is
  in the mock portfolio. Read from `DATA.weights` / `DATA.positions` or
  move to a real portfolio holdings table if one exists
  (`PORTFOLIO_01_Holdings` is in the schema).
- **News volume**: `BETA_12_News_digest` can have many items per ticker
  in a 7d window. Cap 5 per section to keep the UI readable.
- **Sector composition score**: `SIGNAL_01_Assessment.score` is per-ticker
  overall, not per-sector-within. Use it as-is; note in the UI caption.

### Estimated time: 8–12 hours.

---

## Sprint 10 — WH + FOMC data-fetcher fixes

**Goal:** the Whitehouse scraper and FOMC statement ingestion both feed
empty rows into D1 today. Neither is blocked by antibot / HTML changes —
the WH scraper has an over-strict date filter; the FOMC writer path
simply doesn't exist (scraping code written but never invoked in prod).
Close both gaps so `BETA_02_WH` and `MACRO_STATE_fomc` update on every
pipeline run.

### Diagnosis summary

Both verified live on 2026-04-22.

**Whitehouse (`whitehouse/index.js`):**

- ✅ `https://www.whitehouse.gov/news/` returns 200 OK, 260 kB HTML, no
  Cloudflare / captcha / bot wall.
- ✅ Selectors `li.wp-block-post` + `h2.wp-block-post-title` + `.wp-block-post-date time`
  still match — 10 posts parsed cleanly with titles, links, and
  `datetime` attributes.
- ❌ `const todays = all.filter(x => x.date === today)` (index.js:106)
  only accepts articles whose YYYY-MM-DD matches the scraper's "today"
  exactly. WH publishes ~2–3 posts/day, skips weekends, and uses `-04:00`
  timestamps — runs before noon UTC frequently see 0 matches.
- ❌ Result: `whitehouse/whitehouse_summary.json` last written
  2026-04-12, contains `{"WhiteHouse": []}`. DB's `BETA_02_WH` last
  ingested 2026-03-05. Every run since has produced 0 rows.

**FOMC (`MACRO_STATE_fomc`):**

- ✅ Scraping code exists in `macro/scraper.js`: `getFOMC()` (line 145,
  pulls `federalreserve.gov/feeds/press_monetary.xml`) + `getFOMCStatement()`
  (line 180, pulls statement HTML).
- ❌ Functions are exported but never called in production — lines 450–451
  are commented-out test invocations. Nothing writes FOMC data to
  `macro_summary.json` or POSTs to an ingestor endpoint.
- ❌ `portfolio-ingestor` has no `/ingest/fomc` or equivalent route; the
  existing `/ingest/macro` handler doesn't know about FOMC.
- Result: `MACRO_STATE_fomc` has 3 rows, all from the one-time
  `macro/bootstrap_macro_state.sql` seed (2025-12-10, 2026-01-28, 2026-03-18).
  Zero writes since migration.
- Flagged explicitly in `docs/narrative/data-inventory.md:34` and `:133` —
  *"reader exists, writer missing — backlog item."*

### Tasks

#### Part A — Whitehouse filter fix (~30 min)

- [ ] **Widen the date filter** (`whitehouse/index.js:106`)
  - Replace `const todays = all.filter(x => x.date === today)` with a
    rolling 3-day window: `all.filter(x => x.date >= date('now', '-3 days'))`.
  - The ingestor's `INSERT ... ON CONFLICT(id) DO UPDATE` handles
    duplicates — `id` is already hashed from `date|title`, so re-scraping
    the same article on consecutive days is a no-op.
  - Keep the `today` variable for logging clarity; the filter is the
    only behaviour change.

- [ ] **Verify selectors hold** (one-time)
  - Run the scraper locally: `node whitehouse/index.js`
  - Confirm `[DEBUG] Found post elements: 10` (or similar — whatever
    the page has that day) and that the `[DEBUG] Post i` output shows
    a mix of dates across the 3-day window.

- [ ] **Regenerate DB rows**
  - Run the full pipeline: `npm run pipeline`
  - `BETA_02_WH` should gain rows for every dated WH article in the
    last 3 days.

- [ ] **Verify narrator-regime picks up fresh WH**
  - Force rebuild: `curl "https://narrator-regime.gines-rodriguez-castro.workers.dev/build?force=1"`
  - Check the regime identification bullets now reference recent WH
    items (via `BETA_02_WH` join in `gather.js`).

#### Part B — FOMC fetcher wire-up (~2–3 h)

Two equally valid shapes; pick one before starting:

**Option 1 — Extend `macro/scraper.js` + ingestor route** (lower diff)

- [ ] In `macro/scraper.js`: import `getFOMC()` + `getFOMCStatement()`
  at top-level; in the main IIFE / export, include FOMC as a block in
  the output JSON. Schema: `{ FOMC: [{ meeting_date, title,
  decision_summary, statement_text, source_url }] }`.
- [ ] In `src/steps/ingest-macro.js`: include `macro_summary.json`'s
  FOMC block in the payload uploaded to the ingestor.
- [ ] In `workers/portfolio-ingestor/src/worker.js`: add a branch
  `if (which === "macro" && body.FOMC) { ... INSERT INTO MACRO_STATE_fomc ... }`.
  Use `shortHash(meeting_date + '|' + title)` as `id`. ON CONFLICT DO
  UPDATE for statement_text refreshes.

**Option 2 — Standalone `fomc-statement-fetcher` worker** (clean separation)

- [ ] New worker `workers/fomc-statement-fetcher/` that imports the
  logic from `macro/scraper.js` (copy the two functions — the script
  uses node-fetch, which works in Workers too via the global `fetch`).
- [ ] Routes: `GET /build` (scrapes + writes rows to D1 directly via
  the `DB` binding), `GET /status`.
- [ ] Cron `0 * * * *` (hourly — FOMC releases are infrequent, hourly
  is overkill but catches same-day updates).
- [ ] Add service binding in `narrator-dispatcher` so Sprint 7's
  dispatcher can invoke it on the `BETA_10_Daily_macro` trigger.

Pick Option 2 if we want FOMC to participate in the event-driven
orchestration (Sprint 7 dispatcher can then trigger fresh regime
narratives within 15 min of an FOMC statement going up). Pick Option 1
if we want the simplest diff.

**Recommendation: Option 2** — consistent with the post-Sprint-7
architecture where every upstream data source has its own worker.

- [ ] **Backfill from the existing `macro/bootstrap_macro_state.sql`**
  if D1 has dropped any historical FOMC rows. Run once, idempotent.

- [ ] **Verify narrator-regime picks up FOMC**
  - Force rebuild regime narrative.
  - Check identification bullets reference the most recent FOMC
    statement (via `gather.js:60` FOMC join).

### Deliverables

- `whitehouse/index.js` date filter widened + one clean pipeline run
  writing fresh `BETA_02_WH` rows
- `MACRO_STATE_fomc` fetcher deployed (Option 1 or Option 2) and writing
  every historical + new FOMC statement
- Regime narrative regenerated, identification bullets now reference
  fresh WH + FOMC context
- `docs/narrative/data-inventory.md:34` + `:133` "writer missing" flag
  removed

### Quality gates

- [ ] `SELECT MAX(date) FROM BETA_02_WH` returns today or yesterday
      (not 2026-03-05).
- [ ] `SELECT COUNT(*) FROM MACRO_STATE_fomc` > 3 (i.e. grew beyond the
      bootstrap seed); `MAX(meeting_date)` matches the most recent
      FOMC meeting per federalreserve.gov.
- [ ] Scraper runs end-to-end without antibot errors, selector failures,
      or parsing exceptions.
- [ ] Regime narrative `identification` block references at least one WH
      or FOMC item from the last 30d (rather than falling back to the
      "(no FOMC in window)" stub).

### Risks & gotchas

- **WH over-scraping**: a 3-day window captures 6–9 articles per run.
  The summarizer (`summarize()` in `index.js:63`) hits GPT-4.1-mini once
  per article. Cost: ~3x baseline. Still trivial (<$0.01/run) but worth
  noting.
- **FOMC statements are long** (~3–5 kB of plain text). `statement_text`
  column is TEXT so no schema issue, but the regime narrative gather
  truncates or doesn't — verify in `workers/narrator/regime/gather.js:60–68`.
- **Cloudflare Workers fetch vs node-fetch**: if going with Option 2
  (standalone worker), the RSS feed fetch may need a `User-Agent`
  header — Workers' global `fetch` sends a CF-style UA by default that
  some feeds 403. Add a browser UA to be safe.
- **XML parsing in Workers**: `macro/scraper.js` uses the `xml2js`
  npm package. Workers support it via bundling; the wrangler.jsonc
  compat_date needs `nodejs_compat` if xml2js uses Node built-ins.
  Easier alternative: parse the RSS with a small regex — the WSJ-style
  `<item><title>` extraction is 5 lines.

### Estimated time: 2.5–3.5 hours (A: 30 min, B: 2–3 h).

---

## Sprint 11 — Economic calendar (replace GPT-hallucinated `catalysts`)

**Goal:** every `dated_event` in every narrator signpost comes from a
real, verifiable source. Today the `catalysts[]` array inside
`BETA_10_Daily_macro.summary` is **produced by GPT** (see
`macro-intelligence-builder/src/worker.js:229`), which means the regime
/ sector / stock narratives are emitting signpost dates that may or may
not match the actual Federal Reserve / BLS / BEA release calendars.
Correctness bug, not just a gap.

### Diagnosis summary

- **Scaffold exists**: `workers/economic-calendar-fetcher/src/worker.js`
  is a stub with planning comments since Sprint 0. Never implemented.
- **Current fallback**: `macro-intelligence-builder` prompts GPT-5 to
  produce "FACTUAL and UNBIASED" 3–6 upcoming macro events with dates
  (worker.js:229–271). Stored in `BETA_10_Daily_macro.summary.catalysts`.
  Consumed by 5 narrator gatherers (`regime`, `sector`, `sector-landscape`,
  `stock-landscape`, `stock`).
- **Live-tested**: Finnhub's `/calendar/economic` endpoint works on the
  existing `FINNHUB_KEY`. For a 40-day forward window it returns 1,794
  events globally, 247 US, of which 21 high-impact + 59 medium. Rate
  limit 60/min — one daily fetch uses <2% of budget.

### Events to track (tiered)

**Tier-1 (required)** — hard signposts for the regime narrative:
- FOMC rate decision + statement (8/yr)
- FOMC minutes release (~3 weeks after each meeting, 8/yr)
- Chair press conferences (concurrent with rate decision)
- CPI / Core CPI (monthly, ~mid-month)
- PCE / Core PCE (monthly, end-of-month)
- Employment Situation / NFP (monthly, 1st Friday)
- GDP Advance / Second / Third (quarterly, 3 per quarter)

**Tier-2 (strong sector signals)**:
- PPI (monthly)
- Retail Sales (monthly)
- ISM Manufacturing / Services PMI (monthly)
- Initial Jobless Claims (weekly)
- Beige Book (8/yr)
- Consumer Confidence / Michigan Sentiment
- JOLTS, Durable Goods, Housing Starts

**Tier-3 (ignore)**: everything else Finnhub marks `impact='low'` — noise.

Ingest Tier-1 + Tier-2 only (≈80 US events per 45-day window).

### Source: Finnhub `/calendar/economic`

```
GET https://finnhub.io/api/v1/calendar/economic?from=YYYY-MM-DD&to=YYYY-MM-DD&token=$FINNHUB_KEY
```

Sample row:
```json
{
  "country": "US",
  "event": "Initial Jobless Claims",
  "time": "2026-04-23 12:30:00",
  "impact": "medium",
  "prev": 207,
  "estimate": null,
  "actual": null,
  "unit": ""
}
```

Fields relevant to us: `country`, `event`, `time`, `impact`, `prev`,
`estimate`, `unit`. `actual` is populated only after release; we don't
need it (narratives are forward-looking).

### Tasks

- [ ] **Migration `0032_add_macro_state_calendar.sql`**
  ```sql
  CREATE TABLE MACRO_STATE_calendar (
    id TEXT PRIMARY KEY,              -- hash(event_date|event_code|country)
    event_date TEXT NOT NULL,         -- ISO YYYY-MM-DD (UTC)
    event_time TEXT,                  -- UTC HH:MM:SS, null for date-only
    country TEXT NOT NULL,            -- 'US','EU',...
    event_code TEXT NOT NULL,         -- 'FOMC','CPI','PCE','NFP','GDP_ADV',...
    event_label TEXT NOT NULL,        -- raw Finnhub name
    impact TEXT,                      -- 'high' | 'medium' | 'low'
    consensus TEXT,                   -- Finnhub 'estimate' when non-null
    prior TEXT,                       -- Finnhub 'prev' when non-null
    unit TEXT,                        -- e.g. '%', 'K', '$B'
    source TEXT NOT NULL,             -- 'finnhub' for now
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_cal_date ON MACRO_STATE_calendar(event_date);
  CREATE INDEX idx_cal_country_impact ON MACRO_STATE_calendar(country, impact);
  ```

- [ ] **Implement `workers/economic-calendar-fetcher/`** (scaffold present)
  - Routes: `GET /build` (force a pull), `GET /status`.
  - `scheduled()` handler: cron `0 0 * * *` (daily 00:00 UTC).
  - Logic:
    1. Compute `from = today`, `to = today + 45d`.
    2. Fetch Finnhub `/calendar/economic` (use `env.FINNHUB_KEY` as secret).
    3. Filter to US + `impact IN ('high','medium')` (~80 events).
    4. Derive `event_code` via regex map (see below).
    5. Upsert each row via `INSERT ... ON CONFLICT(id) DO UPDATE SET
       consensus=?, prior=?, unit=?, impact=?, created_at=?` so
       Finnhub's `estimate` refresh closer to the release date flows
       through.
  - Handle empty responses gracefully (Finnhub occasionally returns 0
    for narrow windows on quiet days — not an error).
  - Add `FINNHUB_KEY` secret to the new worker (`npx wrangler secret put`).

- [ ] **Event-code derivation map**
  ```js
  // Map Finnhub's raw event names to our canonical short codes.
  const EVENT_CODE_MAP = [
    [/federal.?funds.?rate|fed.?rate.?decision|fomc rate/i, "FOMC"],
    [/fomc minutes/i,                                       "FOMC_MINS"],
    [/\bcpi\b.*\bcore\b|\bcore.?cpi\b/i,                    "CORE_CPI"],
    [/\bcpi\b/i,                                            "CPI"],
    [/\bcore.?pce\b|pce.*core/i,                            "CORE_PCE"],
    [/\bpce\b/i,                                            "PCE"],
    [/\bppi\b/i,                                            "PPI"],
    [/nonfarm|employment situation|nfp\b/i,                 "NFP"],
    [/\bgdp\b.*advance/i,                                   "GDP_ADV"],
    [/\bgdp\b.*second|\bgdp\b.*revised/i,                   "GDP_2ND"],
    [/\bgdp\b.*third|\bgdp\b.*final/i,                      "GDP_3RD"],
    [/\bgdp\b/i,                                            "GDP"],
    [/retail sales/i,                                       "RETAIL"],
    [/\bism\b.*manufacturing/i,                             "ISM_MFG"],
    [/\bism\b.*services/i,                                  "ISM_SVC"],
    [/initial jobless claims/i,                             "JOBLESS"],
    [/michigan|consumer sentiment/i,                        "MICH"],
    [/beige book/i,                                         "BEIGE"],
    [/jolts/i,                                              "JOLTS"],
    [/durable goods/i,                                      "DURABLE"],
    [/housing starts|building permits/i,                    "HOUSING"],
    // …etc. Unknown / uncovered → use uppercased first word as fallback.
  ];
  ```

- [ ] **Swap narrator reads** — replace `macroBlob.catalysts` with a
  D1 query in each gather.js:
  - `workers/narrator/regime/gather.js:228`
  - `workers/narrator/sector/gather.js:226`
  - `workers/narrator/sector-landscape/gather.js` (similar location)
  - `workers/narrator/stock-landscape/gather.js`
  - `workers/narrator/stock/gather.js` (if it reads calendar — double-check)

  New query (identical shape across narrators):
  ```sql
  SELECT event_date, event_time, event_code, event_label, impact,
         consensus, prior, unit
    FROM MACRO_STATE_calendar
    WHERE country = 'US'
      AND event_date >= date('now')
      AND event_date <= date('now', '+45 days')
      AND impact IN ('high','medium')
    ORDER BY event_date, event_time
    LIMIT 10
  ```

  Map to the existing prompt-facing shape:
  ```js
  calendar: rows.map((r) => ({
    event_date: r.event_date,
    event_code: r.event_code,
    event_label: r.event_label,
  }))
  ```

- [ ] **Retire GPT-generated catalysts** in
  `workers/macro-intelligence-builder/src/worker.js`:
  - Remove the `catalysts` field from the recommendation prompt's JSON
    schema (line 251 onwards).
  - Keep `macroBlob.catalysts` as an empty array for backwards-compat
    with any code that still reads it — or delete the key entirely if
    grep confirms no consumer outside narrators.
  - Prompt comment should be updated to reflect that the calendar is
    now sourced from `MACRO_STATE_calendar`, not generated.

- [ ] **Dispatcher wiring (Sprint 7 integration)**
  - Add a new trigger rule to `workers/narrator/dispatcher/src/worker.js`'s
    `/tick`: if `MACRO_STATE_calendar` has a new row inserted since the
    last tick → no automatic narrator rebuild needed (signposts update
    on next natural rebuild), but log a `calendar_refresh` tick event
    for visibility.
  - Optional: if a high-impact event is **≤ 48 hours away** and the
    regime narrative was last rebuilt > 48 hours ago, force regime
    rebuild so the signpost dates are fresh.

- [ ] **Cold-fill**
  - After deploy, hit `GET /build` once to seed the table.
  - Verify: `SELECT COUNT(*), MIN(event_date), MAX(event_date) FROM
    MACRO_STATE_calendar WHERE country='US'` → expect 70–90 rows
    spanning today → today+45.

- [ ] **Regenerate narratives**
  - Force rebuild regime + 8 sectors + 2 landscapes via dispatcher
    `/cold-start` (or targeted `/build?force=1` per entity).
  - Spot-check the new signposts cite dates that match Finnhub's actual
    release schedule (not the GPT-hallucinated previous dates).

### Deliverables

- `MACRO_STATE_calendar` table live in D1
- `economic-calendar-fetcher` worker deployed with daily cron
- Narrator gatherers read calendar from D1, not from GPT blob
- `macro-intelligence-builder` no longer emits `catalysts` (or emits `[]`)
- Regime + landscape narratives regenerated with real dated signposts

### Quality gates

- [ ] `SELECT COUNT(*) FROM MACRO_STATE_calendar WHERE country='US'` ≥ 60
      (expect 70–90 for a 45-day window).
- [ ] Every `event_code` populated (no NULLs — the fallback rule handles
      unmapped events).
- [ ] `grep "GPT-generated catalysts\|macroBlob.catalysts"` in
      `workers/narrator/*/gather.js` returns zero matches.
- [ ] Regime `recommendation.signposts[0].dated_event` matches a row in
      `MACRO_STATE_calendar` (byte-identical date string).
- [ ] Two consecutive daily fetches produce no duplicate rows
      (ON CONFLICT dedup works).

### Risks & gotchas

- **Finnhub free-tier race**: if two workers call `/calendar/economic`
  in the same minute (e.g. fetcher cron + a manual `/build` from me),
  the 60/min rate limit is fine but watch the daily budget if we add
  other Finnhub calls (already used by `stock-factor-builder` for
  short interest).
- **Finnhub delivers `time` in UTC** already — double-check by running
  the first build and eyeballing the FOMC May 6 row: should show
  `18:00:00` UTC (2pm ET release). If it's in ET, add a conversion.
- **Tier-2 noise**: Michigan Consumer Sentiment has two prints per
  month (preliminary + final). Both are Tier-2. Narrator prompts
  already handle multiple identical-code events via `ORDER BY
  event_date, event_time LIMIT 10`, so no dedup needed — just make
  sure the `event_code` derivation produces the same code for both.
- **Federal holidays** shift release dates — Finnhub accounts for this
  (dates are the actual scheduled release). No special handling needed.
- **FOMC minutes are Tier-1 but Finnhub flags them as `medium`** — the
  impact filter catches them since we include medium.
- **Upgrade path**: if Finnhub rate-limits us later, the fallback is
  to add a `federalreserve.gov` / `bls.gov` HTML scrape as a secondary
  source. Schema already has `source TEXT NOT NULL`.

### Estimated time: 2–3 hours.

---

## Sprint 12 — Probability curve (multi-horizon + attribution + calibration)

**Goal:** upgrade probability from a single daily scalar (`p_favorable /
neutral / unfavorable`) to a **richer explainable signal** that an
analyst can reason about: what it predicts, over what horizon, why it's
at this level, and how reliable the model has been historically.

This one is genuinely creative — probability matters more than almost
anything else in this project. A PM doesn't want "UNH is 60% favorable";
they want "UNH is 60% favorable over 21d; that 60% comes +18pp from
revisions, +6pp from momentum, −4pp from valuation; the model's 60%
calls have realized 57% historically; uncertainty band ±8pp."

### Diagnosis summary

- `probability-engine` is **live and running** — `workers/probability-engine/`.
  Pure-math Bayesian update: prior 0.30/0.40/0.30 + per-factor shifts of
  `|value × weight| × 0.02`, floor 0.05, normalise. Runs daily, writes
  to `SIGNAL_02_Probability`.
- `probability-curve-builder` is a **scaffold** (`workers/probability-curve-builder/src/worker.js`)
  — 77 lines of comments proposing empirical Bayesian posteriors from
  factor→outcome joint distributions.
- `SIGNAL_02_Probability`: 75 rows, 25 tickers, dates 2026-04-12 to
  2026-04-15. **Stale** — last update 7 days ago.
- Current heuristic weaknesses:
  - No horizon — what does "favorable" mean? 1d? 1 month? 3 months?
  - No calibration — the 60% has never been verified against realised
    outcomes. Could be systematically off.
  - No explainability — scalar output, no factor attribution.
  - No uncertainty — the number masks the model's own confidence.
- **Hard constraint**: `STOCK_FACTORS_daily` and `SIGNAL_01_Assessment`
  are **only 3 days deep**. Empirical calibration against assessment
  vectors is not possible. `PRICE_01_Daily` has 2 years — calibration
  against price-derived signals IS possible.

### Design choices (pick before implementing)

The creative decisions. Each has trade-offs.

**D1. Horizons.** What does "favorable" mean over what window?
Recommend three horizons stored together:
- **5d (tactical)** — favourable = stock outperforms sector by > +0.5σ of 60d return vol
- **21d (1-month)** — favourable = stock outperforms sector by > +1.0σ
- **63d (3-month)** — favourable = stock outperforms sector by > +1.5σ

Neutral = within ±1σ band; unfavourable = worse than −Xσ. Thresholds
tunable — document and log.

**D2. Probability of what?** Recommend **excess return vs sector ETF**,
not absolute. Absolute probability is dominated by market beta —
useless for stock selection. "UNH beats XLV over 21d" is the question
the PM actually cares about.

**D3. Factor ingestion vs price ingestion.** Two sources:
- **Factor-driven** (forward-looking): today's factor vector →
  Bayesian shift from prior. The probability-engine already does this;
  upgrade to include horizon dimensions.
- **Price-driven** (historical calibration): given today's momentum /
  relative-strength / volatility / sector-RS-ratio, what has the
  empirical `P(excess return > threshold over N days)` been over the
  last 2 years across all tickers? Use 2 years of `PRICE_01_Daily`.

Combine as a **mixture** with a user-chosen weight (start 50/50).
Eventually weight shifts as assessment history accumulates (more data
→ more weight on factor-driven).

**D4. Attribution.** For every output probability, decompose into
per-factor contributions. "Of the +10pp shift from prior (40% →
50% p_favorable), +6pp comes from revisions, +3pp from momentum,
+1pp from news sentiment." Stored as `attribution_json`.

**D5. Uncertainty band.** Standard error around the point estimate.
From the factor side: propagate the `trust` scores (1–5) from
factors_json. From the price side: bootstrap the empirical sample.
Output: `p_favorable_lo`, `p_favorable_hi` at 68% CI.

**D6. Calibration tracking.** Every day, also write a **realized
outcome** column for the day's probabilities **N days after they were
made**. When 2026-05-14 arrives, go back to 2026-04-23's probabilities,
check the actual 21d excess return, mark them as realized. Build up a
calibration curve over months.

### Tasks

- [ ] **Migration `0033_add_probability_curve.sql`**
  ```sql
  -- Replaces/extends SIGNAL_02_Probability. Keep the old table for now
  -- (probability-engine still writes to it); add this new table for the
  -- richer output. Gather.js in narrators switches to this table.
  CREATE TABLE SIGNAL_03_ProbabilityCurve (
    id TEXT PRIMARY KEY,                    -- hash(ticker|date|horizon_days)
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,                     -- assessment date
    horizon_days INTEGER NOT NULL,          -- 5, 21, or 63
    benchmark TEXT NOT NULL,                -- 'sector' | 'spy'  (default 'sector')
    threshold_sigma REAL NOT NULL,          -- the σ threshold used
    p_favorable REAL NOT NULL,
    p_neutral REAL NOT NULL,
    p_unfavorable REAL NOT NULL,
    p_favorable_lo REAL,                    -- 68% CI lower bound
    p_favorable_hi REAL,                    -- 68% CI upper bound
    attribution_json TEXT,                  -- [{factor, contribution_pp}]
    source_blend TEXT NOT NULL,             -- 'factor:50,price:50'
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_prob_ticker_date ON SIGNAL_03_ProbabilityCurve(ticker, date);
  CREATE INDEX idx_prob_date_horizon ON SIGNAL_03_ProbabilityCurve(date, horizon_days);

  -- Calibration tracking: when a probability's horizon window closes,
  -- mark the realised outcome for that row.
  CREATE TABLE SIGNAL_03_ProbabilityRealized (
    id TEXT PRIMARY KEY,                    -- same hash as the forecast row
    ticker TEXT NOT NULL,
    forecast_date TEXT NOT NULL,
    horizon_days INTEGER NOT NULL,
    realized_at TEXT NOT NULL,              -- when the window closed
    excess_return REAL NOT NULL,            -- stock − sector, horizon-scaled
    outcome TEXT NOT NULL,                  -- 'favorable' | 'neutral' | 'unfavorable'
    forecast_p_favorable REAL,
    FOREIGN KEY (id) REFERENCES SIGNAL_03_ProbabilityCurve(id)
  );
  CREATE INDEX idx_realized_date ON SIGNAL_03_ProbabilityRealized(forecast_date);
  ```

- [ ] **Implement `workers/probability-curve-builder/`** (scaffold exists).
  Core compute (pseudocode, per ticker per day):

  ```js
  // 1. FACTOR-DRIVEN component (works today, 3-day data depth OK).
  //    Reuse probability-engine's Bayesian shift, parameterised per horizon.
  //    Short horizon → heavier weight on news/momentum/revisions.
  //    Long horizon → heavier weight on valuation/fundamentals/analyst consensus.
  const factorP = computeFactorProbability(factorsJson, horizon);

  // 2. PRICE-DRIVEN component (uses 2y of PRICE_01_Daily).
  //    Find all historical (ticker, date) pairs where the factor vector
  //    "looked like" today's — using k-nearest neighbours over the 4 price-
  //    derived factors we already compute (mom_12_1, rs_vs_sector_3m, beta_1y,
  //    short_pct_float). For each neighbour, look up the realised N-day excess
  //    return vs sector ETF. Empirical distribution → p_favorable.
  const priceP = computePriceProbability({ ticker, horizon, neighbours: 50 });

  // 3. Blend.
  const blended = blend(factorP, priceP, { factor: 0.5, price: 0.5 });

  // 4. Attribution: per-factor contribution (Shapley-lite — each factor's
  //    marginal effect when shuffled in last).
  const attribution = shapleyAttribution(factorsJson, blended.p_favorable);

  // 5. Uncertainty: combine factor trust-weighted variance + price bootstrap SE.
  const { lo, hi } = computeCI(blended, factorP.trustVariance, priceP.bootstrapSE);

  return { p_favorable, p_neutral, p_unfavorable, lo, hi, attribution, blend };
  ```

  Run this 3× per ticker (horizons 5d / 21d / 63d), write 3 rows per
  ticker per day → 25 × 3 = 75 rows/day.

- [ ] **Implement calibration marker**
  New route `/realize`. Runs daily. Steps:
  - For every row in `SIGNAL_03_ProbabilityCurve` where
    `date + horizon_days <= today` AND no corresponding row in
    `SIGNAL_03_ProbabilityRealized`:
    1. Compute actual excess return over `PRICE_01_Daily` + sector ETF.
    2. Classify as favourable/neutral/unfavourable using same σ thresholds.
    3. Insert into `SIGNAL_03_ProbabilityRealized`.
  - This is what makes the calibration plot possible — it runs in the
    background accumulating ground truth.

- [ ] **Deprecate probability-engine gradually**
  - Keep running for now (dashboard uses it for the scalar display).
  - New probability-curve-builder writes richer data to SIGNAL_03.
  - Narrator gatherers migrate to prefer SIGNAL_03 when present, fall
    back to SIGNAL_02 when missing.
  - Once SIGNAL_03 is stable, stop scheduling probability-engine and
    drop SIGNAL_02 in a later cleanup.

- [ ] **Cron**
  - `probability-curve-builder /build-all`: daily `15 0 * * *` (after
    factors land — they run at 00:00 UTC in the pipeline).
  - `probability-curve-builder /realize`: daily `0 1 * * *`.

- [ ] **Narrator updates**
  - `workers/narrator/stock/gather.js` — read from SIGNAL_03 (all 3
    horizons). Prompt now has three probability inputs. Update
    `current_reading.js` to cite the 21d probability as the primary
    signal.
  - `workers/narrator/stock-landscape/gather.js` — use the 21d
    probability across the shortlist for ranking.

- [ ] **Dashboard deliverables** (the visible part of the sprint)

  **3.1 — Probability curve sparkline** on each stock row in the shortlist
  table. Three dots at t=5/21/63 days, p_favorable on the Y axis, with
  the CI band shaded. Replaces the current static "spark" mock array.

  **3.2 — Attribution bar chart** inside the stock entity view's Tactical
  tab. Horizontal bars showing each factor's contribution in percentage
  points. Clicking a bar opens the factor's own reason string from
  `factors_json`. Self-explaining PM tool.

  **3.3 — Calibration badge** on the stock entity hero strip. "Our 60%
  calls hit 57% historically (n=42)." Shows when
  `SIGNAL_03_ProbabilityRealized` has at least 30 same-ticker-or-sector
  realised rows. Below that: "n < 30 — calibration learning".

  **3.4 — Validation tab calibration curve**. Scatter: predicted p_favorable
  vs realised outcome rate, bucketed 10%/20%/…/90%. Perfect model → 45°
  line. Under- and over-confidence is visible immediately.

### Deliverables

- `SIGNAL_03_ProbabilityCurve` + `SIGNAL_03_ProbabilityRealized` tables
- `probability-curve-builder` worker deployed, daily cron, 75 rows/day
- Calibration `realize` pass running daily
- Narrator gatherers prefer SIGNAL_03 when populated
- 4 dashboard surfaces: sparkline, attribution bars, calibration badge,
  validation-tab calibration plot

### Quality gates

- [ ] Every ticker in the portfolio universe has 3 fresh rows per day
      in SIGNAL_03 (25 × 3 = 75/day).
- [ ] `p_favorable + p_neutral + p_unfavorable` sums to 1.0 ± 1e-6 for
      every row.
- [ ] `p_favorable_lo <= p_favorable <= p_favorable_hi` always.
- [ ] `attribution_json` contributions sum (in absolute value) ≈ total
      shift from prior.
- [ ] After 30 days of operation, `SIGNAL_03_ProbabilityRealized` has
      rows for every 5d forecast made 5+ days ago (same for 21d and 63d
      when those windows close).
- [ ] Dashboard calibration curve shows a downward or upward bend that
      the PM can interpret (not a random cloud).
- [ ] Stock entity view Tactical tab: attribution bars render, no
      JS errors, contributions sum visible as a total.

### Risks & gotchas

- **Cold-start empty calibration**. For the first 5 days, `SIGNAL_03_ProbabilityRealized`
  is empty. The calibration badge needs a "learning" state. Not a blocker.
- **Factor history depth = 3 days**. The factor-driven probabilities are
  valid from day 1; the price-driven component needs 63d of PRICE_01
  (we have 2y). Blend starts functional; factor weight increases as
  assessment history grows. Document in worker comments.
- **k-NN lookup cost**. For each of 75 daily rows, an in-memory k-NN
  over 2y × 25 tickers = ~12,600 candidates. Trivial for a Worker —
  single D1 read + JS computation ≤ 500ms per ticker.
- **Shapley attribution is expensive** (2^n where n = factors = 8 →
  256 coalitions). Fine at n=8; if we ever expand factor count, switch
  to "leave-one-out" attribution.
- **σ threshold choice is subjective**. Start with {+0.5σ, +1.0σ, +1.5σ}
  documented inline; log the thresholds per row in `threshold_sigma`
  column so they can be tuned later without invalidating old data.
- **Excess-return vs sector requires sector lookup**. Cross-check
  `STOCK_FACTORS_daily.sector` + SPDR ETF map (already in dispatcher).
  Use XLK for Tech, XLY for ConsDisc, etc.
- **Probability-engine decommission**: don't rip out in this sprint.
  Run in parallel for ≥30 days, compare SIGNAL_02 vs SIGNAL_03 stability,
  then retire in a cleanup sprint.

### Estimated time: 5–7 hours.

- ~2h worker compute (factor + price + blend + attribution + CI)
- ~1h schema + migration + deploy
- ~1h `/realize` pass + narrator gather.js updates
- ~2h dashboard visualisation (sparkline + attribution + calibration badge + plot)

---

## Combined acceptance

All five sprints complete when:

- Every entity (regime, 2 landscapes, 8 sectors, 25 stocks) renders
  narrative + rich data without JS errors.
- No hand-curated text in any `ENTITIES[...]` object.
- Downstream sector attributions in TICKER_TREND_*, SIGNAL_01_Assessment,
  OPERATION_01_Signals, SIGNAL_04_Attributions use canonical 8-sector
  SPDR names.
- Dashboard Validation tab's "Narrative Dispatcher" card and the stock/
  sector entity views all read from D1 — no stale mock data visible.
- `BETA_02_WH` and `MACRO_STATE_fomc` both update on every pipeline run;
  regime narrative references fresh WH + FOMC context.
- `MACRO_STATE_calendar` populated daily from Finnhub; every
  `signposts[].dated_event` cites a real Fed/BLS/BEA release date.
- `SIGNAL_03_ProbabilityCurve` populated with multi-horizon probabilities
  and factor attribution; dashboard shows the probability sparkline,
  attribution bars, calibration badge, and validation-tab calibration plot.

---

## Sprint 13 — Pipeline hygiene follow-ups

Three issues surfaced during Sprint 8 verification. Each is bounded and
unrelated to the others; any order.

### 13.1 — assessment-engine → ingestor write path

**Problem:** `workers/assessment-engine/src/worker.js` posts the 25 computed
assessments to `https://portfolio-ingestor.../ingest/assessments` via public
`fetch()`. The call fails silently: `res.ok` comes back false, no exception
is thrown, and the existing try/catch only logs on success or thrown error —
so nothing lands in `SIGNAL_01_Assessment` and nothing logs either. Last
successful ingest in D1 is **2026-04-15**. The `/compute-assessments`
endpoint still returns `{ok: true, tickers: 25}` because the return happens
before the fetch is evaluated for failure.

Likely cause: Cloudflare 1042 loop-detection on same-account worker→worker
public HTTPS. `workers/stock-factor-builder/src/worker.js:59-60` documents
this exact failure mode and works around it by writing directly through the
shared D1 binding.

**Tasks:**
- [ ] Rewrite the ingest block in `assessment-engine/src/worker.js` (lines
      ~391–415) to use `env.DB.prepare(...).run()` directly against
      `SIGNAL_01_Assessment`. Mirror `stock-factor-builder`'s pattern.
- [ ] Drop the `INGESTOR_URL` constant; it is the only consumer.
- [ ] At minimum, change the existing try/catch so that `!res.ok` also
      logs (status code + body) — defensive, so future regressions aren't
      silent.
- [ ] Redeploy, run `/compute-assessments`, verify rows land for today's
      date.

**Blocks:** Sprint 8 Gate-2 (HD/GOOGL Factor-8 reason-string verification
in D1). Also blocks the Factor-8 `sector_tilt` wiring from being visible in
`factors_json`, even though the code is already correct.

### 13.2 — narrator dispatcher cold-start exceeds request timeout

**Problem:** `/cold-start` on `narrator-dispatcher` fans out to 36 entities
(1 regime + 3 landscapes + 8 sectors + 25 stocks) in batches of 3. The
total wall time (12 serial GPT-5 batches × ~15–30s each) exceeds
Cloudflare's public-edge request timeout; the caller receives a 502 and
the worker is terminated mid-fanout. Sprint 8 run produced only ~5
entities before the cut-off.

**Tasks:**
- [ ] Either: increase fanout concurrency (batch=6?) and accept partial
      completion with a resume endpoint, OR split cold-start into
      `/cold-start/phase?phase=regime|landscapes|sectors|stocks[a-m|n-z]`
      and let the caller chain them.
- [ ] Alternative (simpler): keep `/cold-start` but have it return
      immediately after *enqueueing* to `NARRATIVE_02_Triggers`; let the
      scheduled `/tick` consume the queue naturally over the next few
      runs. This is actually closer to the event-driven philosophy the
      dispatcher was built for.
- [ ] Verify full cold-start runs to completion on next invocation.

### 13.3 — `OPERATION_01_Signals` Industrial write race

**Problem:** When `/build-all` and an ad-hoc `/build?sector=Industrial`
run near-simultaneously, both read the same `prevOpsRow` before either
writes, so both insert new rows with `superseded_by = NULL`. Sprint 8
left two active Industrial rows from this race.

**Tasks:**
- [ ] Clean up the orphan (whichever of the two Industrial rows is older
      — set `superseded_by` to the newer one's id).
- [ ] Make the insert-then-supersede pair inside
      `workers/operations-agent/src/worker.js:buildForSector` an atomic
      transaction (D1 supports batch statements), so concurrent writers
      can't both see a NULL `superseded_by` on the previous row.

### Estimated time

- 13.1: ~1h (simple rewrite, mirroring existing pattern)
- 13.2: ~1–2h (depending on which of the two options is chosen)
- 13.3: ~30min cleanup + ~1h atomic-batch rewrite

### Combined estimate: 20–29 hours.
