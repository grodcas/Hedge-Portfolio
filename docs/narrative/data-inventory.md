# Data inventory — narrative inputs (Sprint 0, task 3)

For each of the 5 narrative surfaces (regime, sector landscape, individual sector, stock landscape, individual stock), this inventory maps the narrative plan's required inputs to the actual D1 tables and writer workers that produce them, flagging gaps.

**Mindset carried over:** the narrative layer must interpret numbers, not just echo them. That means inputs must include not just *values* but also *context* (prior periods, 5y ranges, trajectories) so the LLM can say what the number *means* — not just what it is. Flagged below where context feeds are missing.

---

## Table-by-table status

Legend: ✅ exists in migrations · ⚠ exists but has issues · ❌ missing

| # | Table | Status | Writer worker | Last-known freshness | Key narrative columns |
|---|---|---|---|---|---|
| 1 | `BETA_10_Daily_macro` | ⚠ **no migration** | `macro-intelligence-builder` | Daily (~8h post-close; 4 GPT-5 calls in series) | `summary` (JSON with drivers[], narrative[], recommendation) |
| 2 | `BETA_12_News_digest` | ✅ (0008) | `news-funnel-orchestrator` | Daily | `summary`, `impact`, `sentiment`, `magnitude`, `category`, `ticker` |
| 3 | `SECTOR_FACTORS_daily` | ✅ (0023, 0029, 0030) | `sector-factor-builder` | Daily | `regime_fit`, `earn_momentum`, `valuation_sigma`, `rel_strength_13w`, `stance` |
| 4 | `STOCK_FACTORS_daily` | ✅ (0022) | `stock-factor-builder` | Daily | 9 factors + `piotroski_f`, `days_to_catalyst`, `short_pct_float` |
| 5 | `SIGNAL_01_Assessment` | ✅ (0012) | `assessment-engine` | Daily | `score`, `factors_json` (8 factors with `{name, value, reason}`), `explanation` |
| 6 | `SIGNAL_02_Probability` | ⚠ **skeleton only, no writer** | — | never | `p_favorable`, `p_neutral`, `p_unfavorable` |
| 7 | `SIGNAL_03_Consensus` | ✅ (0014) | `consensus-validator` | latest snapshot | `our_conclusion`, `dominant_narrative`, `strongest_counter` |
| 8 | `FUND_01_Fundamentals` | ✅ (0010, extended 0022) | `fetch-fundamentals` | Weekly (Alpha Vantage) | snapshot fields — data only |
| 9 | `FUND_02_Earnings` | ✅ (0011) | `finnhub-earnings-fetcher` | Event-driven on filing | `estimate`, `actual`, `surprise`, `report_date` |
| 10 | `FUND_03_Recommendations` | ✅ (0011) | `finnhub-recommendations-fetcher` | Weekly snapshots | analyst counts |
| 11 | `ALPHA_01_Reports` | ✅ (referenced; verify migration exists) | SEC parser + `qk-report-summarizer` / `form4-summarizer` / `8k-summarizer` | ~2d post-filing | `summary` (GPT-5 factual digest) |
| 12 | `ALPHA_02_Clusters` | ✅ (referenced; verify migration exists) | SEC parser | ~2d post-filing | `content`, `title`, `summary` |
| 13 | `ALPHA_03_Press` | ✅ (0015) | `press-release-fetcher` | Daily | `heading`, `summary`, `sentiment`, `magnitude` |
| 14 | `TICKER_TREND_long` | ✅ (0020) | `ticker-trend-long` | Event-driven on 10-K/10-Q/Form4 | `thesis`, `drivers[]`, `narrative[]`, `raw_blob` |
| 15 | `TICKER_TREND_short` | ✅ (0020) | `ticker-trend-short` | Trigger-gated (news/press/price/7d floor) | `thesis`, `drivers[]`, `narrative[]` |
| 16 | `SECTOR_TREND_long` | ✅ (0024) | `sector-trend-long` | Daily | `thesis`, `drivers[]`, `narrative[]` |
| 17 | `SECTOR_TREND_short` | ✅ (0024) | `sector-trend-short` | Trigger-gated | `thesis`, `drivers[]`, `narrative[]` |
| 18 | `MOVER_EXPLANATIONS_daily` | ✅ (0021) | `big-movers-why` | Daily top-5 per direction | `thesis`, `bullets[]` |
| 19 | `MACRO_STATE_indicators` | ✅ (0019) | (FRED/BLS fetcher — find) | periodic | raw indicator values |
| 20 | `MACRO_STATE_fomc` | ✅ (Sprint 10) | `fomc-statement-fetcher` | Hourly cron, scrapes federalreserve.gov RSS | `meeting_date`, `title`, `decision_summary`, `statement_text`, `source_url` |
| 21 | `MACRO_STATE_news` | ✅ (0019) | `macro-intelligence-builder` | Weekly | top macro story per week |
| 22 | `BETA_02_WH` (Whitehouse) | ✅ | `whitehouse/index.js` scraper → `src/steps/ingest-whitehouse.js` → `portfolio-ingestor` insert | Rolling 3-day window (fixed Sprint 10) | `date`, `title`, `summary` (JSON with embedded `link`) |
| 23 | Economic calendar (upcoming) | ❌ | — (scaffolded in Sprint 0: `workers/economic-calendar-fetcher/`) | never | — |
| 24 | `NARRATIVE_01_Content` | ❌ **to be created by this sprint** | narrator workers | — | the output table |

---

## Per-surface input mapping

### Surface 1 — Regime narrative (Sprint 1)

| Narrative plan requirement | Source table | Column(s) | Status | Gap |
|---|---|---|---|---|
| 12 macro indicators + values + 30d direction | `MACRO_STATE_indicators` | raw values | ✅ | — |
| Same, 5y context for interpretation | `MACRO_STATE_indicators` historical | — | ✅ via date query | requires range query helper |
| Regime label + stance | `BETA_10_Daily_macro.summary` | JSON blob | ⚠ | no migration, but table populated |
| FOMC minutes summary | `MACRO_STATE_fomc` | `statement_text`, `decision_summary`, `title`, `meeting_date` | ⚠ | **Reader already wired** in `macro-intelligence-builder` (worker.js:62–68); **writer missing** — no worker fetches `federalreserve.gov`. Table has been sitting empty since migration 0019. Table stays empty until a fetcher is added; gatherer handles empty gracefully |
| Whitehouse news last 7d (fiscal/policy/tariff) | `BETA_02_WH` | `date`, `title`, `summary` | ⚠ | **Full pipeline exists**: scraper at `whitehouse/index.js` → `src/steps/ingest-whitehouse.js` → `portfolio-ingestor` insert → `/query/whitehouse` endpoint. But `whitehouse_summary.json` is empty `[]` today — scraper runs but yields no articles (either scraper bug or too-aggressive date filter). Separate debug task — plumbing is not the blocker |
| Macro-relevant news last 7d | `BETA_12_News_digest` | where `category='macro'` or cross-sector | ✅ | — |
| Upcoming economic calendar | (no table yet) | — | ❌ | **Scaffolded in Sprint 0**: `workers/economic-calendar-fetcher/` stub created. Implementation deferred. Sprint 1 regime recommendation signposts fall back to hardcoded FOMC/CPI/NFP dates until fetcher implemented |
| Previous narrative | `NARRATIVE_01_Content` | `content_json` | ❌ (built this sprint) | — |

**Ship strategy for Sprint 1:** build against what's available today.
- Whitehouse: query `BETA_02_WH` normally — if empty that day, narrative gracefully drops Whitehouse-driven bullets. Debug the scraper as a separate task.
- FOMC: query `MACRO_STATE_fomc` normally — currently always empty; the regime narrative will lack FOMC-statement context until a fetcher is added. `macro-intelligence-builder` has graceful-empty handling to copy from (prompt falls back to "(no FOMC meetings in window)").
- Economic calendar: hardcoded date stubs for the next 1–2 FOMC/CPI/NFP dates inside the regime gatherer; swap for real data once `economic-calendar-fetcher` ships.

None of the three gaps block Sprint 1. Regime narrative ships with graceful degradation.

### Surface 2 — Sector landscape narrative (Sprint 2)

| Requirement | Source | Status | Gap |
|---|---|---|---|
| All sectors with 5 factors + stance | `SECTOR_FACTORS_daily` | ✅ | — |
| Top contributor ticker per sector | `SIGNAL_01_Assessment` + `STOCK_FACTORS_daily.sector` | ✅ | — |
| Macro regime label | `BETA_10_Daily_macro` | ⚠ | works if BETA_10 populated; migration to add |
| Sector-grouped news (7d) | `BETA_12_News_digest` joined by `sector` | ⚠ | `BETA_12` has no `sector` column — must join via `ticker → sector` lookup |
| Previous landscape narrative | `NARRATIVE_01_Content` | ❌ (built this sprint) | — |

**Noted:** add `sector` column to `BETA_12_News_digest` in a future migration (not blocking — can join via SECTOR_BUCKET in the gatherer).

### Surface 3 — Individual sector narrative (Sprint 3)

| Requirement | Source | Status | Gap |
|---|---|---|---|
| Sector's factors | `SECTOR_FACTORS_daily` | ✅ | — |
| Tickers in sector with composite + top 2 factors | `STOCK_FACTORS_daily.sector` + `SIGNAL_01_Assessment` | ✅ | — |
| Sector-specific news 7d | `BETA_12_News_digest` (ticker → sector map) | ✅ | — |
| Industry 10-K / 10-Q / 8-K summaries (30d) | `ALPHA_01_Reports.summary` joined by constituents | ✅ | verify ALPHA_01 migration exists |
| Press releases aggregated at sector (7d) | `ALPHA_03_Press` joined by constituents | ✅ | — |
| Macro regime label | `BETA_10_Daily_macro` | ⚠ | migration missing |
| `SECTOR_TREND_long` / `_short` existing narratives | `SECTOR_TREND_long`, `SECTOR_TREND_short` | ✅ | **strong input** — already-generated narrative bullets to feed the new narrator as prior context |
| Previous sector narrative | `NARRATIVE_01_Content` | ❌ (built this sprint) | — |

**Interesting:** the existing `SECTOR_TREND_long` / `_short` tables already contain GPT-5 generated `thesis` + `drivers[]` + `narrative[]`. Those become high-quality inputs to the new sector narrator (not replacements — the new narrator owns identification+recommendation, while `SECTOR_TREND_*` gives it trajectory context). **This was not obvious from the plan — worth flagging.**

### Surface 4 — Stock landscape narrative (Sprint 4)

| Requirement | Source | Status | Gap |
|---|---|---|---|
| Top N shortlist by composite | `SIGNAL_01_Assessment` ordered by `score` | ✅ | — |
| Each stock's top 3 factors | `SIGNAL_01_Assessment.factors_json` | ✅ | — |
| Each stock's sector | `STOCK_FACTORS_daily.sector` | ✅ | — |
| Probability | `SIGNAL_02_Probability` | ⚠ | no writer — probability curves are empty. **Blocker for Sprint 4 quality.** |
| Sector landscape top bullet | `NARRATIVE_01_Content WHERE entity_type='sector_landscape' AND field='identification'` | ❌ (built Sprint 2) | sequencing OK |
| Macro regime label | `BETA_10_Daily_macro` | ⚠ | — |

### Surface 5 — Individual stock narrative (Sprint 5)

| Requirement | Source | Status | Gap |
|---|---|---|---|
| 8 factors with values + reasons | `SIGNAL_01_Assessment.factors_json` | ✅ | — |
| Probability curve last 30d | `SIGNAL_02_Probability` | ⚠ | empty — same blocker as Sprint 4 |
| Fundamentals snapshot | `FUND_01_Fundamentals` | ✅ | — |
| Last 4 quarters | `FUND_02_Earnings` | ✅ | — |
| Analyst 90d trajectory | `FUND_03_Recommendations` | ✅ | needs range query |
| 10-K / 10-Q / 8-K / Form 4 summaries 30d | `ALPHA_01_Reports` | ✅ | — |
| Press releases 14d | `ALPHA_03_Press` | ✅ | — |
| News 7d | `BETA_12_News_digest` | ✅ | — |
| `TICKER_TREND_long` row | ✅ | — | feeds the long-term narrator |
| `TICKER_TREND_short` row | ✅ | — | feeds the tactical narrator |
| Sector narrative top bullet | `NARRATIVE_01_Content` | ❌ (built Sprint 3) | sequencing OK |
| Previous stock narrative | `NARRATIVE_01_Content` | ❌ (built this sprint) | — |

**Same observation as Sprint 3:** `TICKER_TREND_long` / `_short` already contain GPT-5 `thesis` + `drivers[]` + `narrative[]` per ticker. These are strong inputs for the new stock narrator — not to be discarded.

---

## Critical gaps requiring action before Sprint 1

1. **`BETA_10_Daily_macro` has no formal migration.** The macro-intelligence-builder writes to it via implicit CREATE, but migrations are the source of truth for schema. **Action:** write `0032_add_beta_10_daily_macro.sql` capturing current schema `(id, structure, summary, creation_date)`. Not blocking Sprint 1, but tech-debt to fix in Sprint 0.

2. **`ALPHA_01_Reports` and `ALPHA_02_Clusters` may not have migrations.** Referenced heavily but migration files not confirmed in the 0003–0030 sequence. **Action:** verify, and add migrations if missing. Blocking confidence in Sprint 3/5 inputs.

3. **`SIGNAL_02_Probability` has no writer.** Probability curves empty. **Scaffolded in Sprint 0**: `workers/probability-curve-builder/` stub exists. Implementation deferred to before Sprints 4/5 start. Narrative quality for stock landscape + individual stocks depends on this being populated.

4. ~~**`BETA_02_WH` (Whitehouse) pipeline exists but data is empty.**~~ **Resolved Sprint 10:** the scraper's strict today-only date filter was dropping almost every run. Widened to a rolling 3-day window in `whitehouse/index.js`; `BETA_02_WH` now accumulates rows on every run (ingestor's ON CONFLICT upsert makes re-scraping idempotent).

5. ~~**`MACRO_STATE_fomc` reader exists, writer missing.**~~ **Resolved Sprint 10:** new `fomc-statement-fetcher` worker (hourly cron) scrapes federalreserve.gov's `press_monetary.xml` RSS, filters to "Federal Reserve issues FOMC statement" items, fetches each statement body, and writes to `MACRO_STATE_fomc`. ID format aligned with the bootstrap seed (`sha256("FOMC|" + meeting_date).slice(0, 32)`) so re-scrapes overwrite seeded rows rather than duplicating.

6. **Economic calendar not sourced.** Scaffolded in Sprint 0: `workers/economic-calendar-fetcher/` stub exists. Implementation deferred. Sprint 1 regime `recommendation.signposts[]` that expect dated events fall back to hardcoded dates (next FOMC, next CPI, next NFP) until the fetcher is implemented. Not blocking.

7. **`BETA_12_News_digest` has no `sector` column.** Joined via ticker→sector map for now. **Action:** add column in a future migration; not blocking.

---

## What we already have that the plan underestimated

The following tables contain *existing narrative prose* that will be leveraged as inputs to the new narrator workers (not rewritten, not replaced, not duplicated):

- `TICKER_TREND_long` — baseline trend narrative per stock, `{thesis, drivers[], narrative[]}`
- `TICKER_TREND_short` — tactical overlay per stock, same shape
- `SECTOR_TREND_long` — baseline sector narrative, same shape
- `SECTOR_TREND_short` — tactical sector overlay, same shape
- `SIGNAL_03_Consensus` — per-ticker our-conclusion + counter-thesis (valuable for the *interpretation* field — "consensus says X, we say Y, here's why")
- `MOVER_EXPLANATIONS_daily` — one-sentence why-it-moved per top mover (good for tactical stock narrative triggers)

The new narrator workers should **consume** these as priors, not overwrite them. This keeps the cost low (existing data, no redundant calls) and strengthens the interpretation layer (the narrators can say "this matches/diverges from the prior thesis" because the prior thesis is right there in the input).

---

## Summary status by sprint

| Sprint | Ready to build? | Blockers |
|---|---|---|
| Sprint 1 (Regime) | ✅ yes, with 3 placeholders (Whitehouse, FOMC fetcher, econ calendar) | Not true blockers — can ship with graceful degradation |
| Sprint 2 (Sector landscape) | ✅ yes | — |
| Sprint 3 (Sectors ×11) | ✅ yes | ALPHA_01/02 migration verification, sector naming alignment |
| Sprint 4 (Stock landscape) | ⚠ works, but probability empty | `SIGNAL_02_Probability` writer needed for full narrative quality |
| Sprint 5 (Stocks ×25) | ⚠ same as Sprint 4 | Same — probability writer |
| Sprint 6 (Lede agent) | ✅ yes, depends on Sprints 1–5 | — |
| Sprint 7 (Event-driven orchestration) | ✅ yes | — |

**Bottom line:** Sprint 0 can proceed. Sprint 1 can ship. Sprint 4/5 have a real dependency on `SIGNAL_02_Probability` being populated — that writer should get on the backlog now so it's ready when we get to those sprints.
