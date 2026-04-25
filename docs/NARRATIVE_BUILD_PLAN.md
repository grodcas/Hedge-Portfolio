# Narrative Build Plan

A step-by-step plan to wire the narrative layer across the dashboard. Built from the design conversation: two-flow narrative (identification + recommendation), news-led with indicators-as-lens, short GPT calls per field, no mixing sectors or fields, comparative views at Layer 2 / Layer 3 and per-entity detail views.

---

## 0. Resolved decisions (locked — do not revisit)

| # | Decision | Impact |
|---|---|---|
| 1 | **Storage: new `NARRATIVE_01_Content` table** keyed by (entity_type, entity_id, date, field) | Clean history + audit; Sprint 0 writes migration `0031_add_narrative_table.sql` |
| 2 | **Gemini fact-check: ON** | Sprint 1 includes the Gemini agent; reused across all surfaces |
| 3 | **Refresh: event-driven, not cron** | Sprint 7 rewritten around event triggers (new filing / earnings / price move / factor shift / macro release) with a weekly safety-net rebuild |
| 4 | **Every entity gets a full profile (not a stub)** | Sprints 3 & 5 build complete profiles for every missing sector/stock — copy the UNH/Healthcare template, wire from existing D1 data. Time goes up accordingly. |
| 5 | **Macro tab shares the regime narrative** | Macro hero lede + any future macro detail view pulls from the same `NARRATIVE_01_Content` rows as Regime. No duplicate writing. |
| 6 | **Stock narrative split into long-term + tactical** | Two identification calls + two recommendation calls per stock (matches existing `TICKER_TREND_long` / `_short`). Displayed as two tabs inside the stock entity's narrative block. |
| 7 | **Lede via GPT-4o-mini — input is the full detail-view content** | Mini reads the 3-block narrative + key metrics and writes the 3–4 line summary. One call per card. Deterministic fallback only on API failure. |

---

## Architectural principles (apply to every sprint)

1. **One GPT call per narrative field.** Identification and Recommendation are always separate calls. Never combined.
2. **One call per entity.** Regime is one pair of calls. Each sector is its own pair. Each stock is its own pair. No mixing.
3. **Structured JSON input only.** The prompt receives a JSON block of numbers + news summaries + prior narrative. The LLM can only echo what's in the block.
4. **Numeric validation post-call.** Every number in the output must appear in the input. If not, reject and retry once, then fall back to the previous narrative.
5. **Stability rule.** If the numerical state hasn't moved enough since the last narrative (threshold per surface), reuse the previous text, bump `last_confirmed_at`, skip the LLM call. This is what makes confirmation bars honest and lowers cost.
6. **Citation-mandatory.** Every bullet carries `{source_table, source_id}`. No source → bullet dropped.
7. **Adapt vocabulary per surface.** "Identification" / "Recommendation" are structural names only. UI labels adapt:
   - Regime: *What's driving the regime* / *How to position*
   - Sector landscape: *What separates the sectors* / *Rotation stance*
   - Individual sector: *What's moving this sector* / *How to trade it*
   - Stock landscape: *What separates the shortlist* / *Ranked picks*
   - Individual stock: *What's driving the score* / *Trade thesis*
8. **Bullets over prose.** Identification and Recommendation render as bulleted lists. Summaries on main cards are short prose (3–4 lines).
9. **Fail silently.** Missing data → bullet dropped. Missing field → render "Unavailable — last updated {date}". Never fake content.

---

## Sprint 0 — Audit & Foundations

**Goal:** know exactly what to change, define storage, stub scaffolding. No narratives written yet.

### Tasks

- [ ] **Dashboard audit** — document every narrative field currently rendered and mark each as REPLACE / KEEP / KILL.
  - Layer 1 (Portfolio): verdict headline, lede paragraph, signal panel, style tilts, gauge, layer-meta footer
  - Layer 2 (Portfolio): verdict headline, lede paragraph, sector table, RRG, allocation bar, footer link
  - Layer 3 (Portfolio): verdict headline, lede paragraph, stock groups, scatter, footer link
  - Regime entity: thesis, structural drivers, risk vectors, definition, key metrics (kill the first four — replace with 3-block narrative; keep metrics)
  - Sector entities: thesis, key metrics, peers, news, drivers, risks (kill thesis + drivers + risks; keep metrics, peers, news; add 3-block narrative)
  - Stock entities: thesis, snapshot, financials, filings, catalysts, peers, risks, news (kill thesis + risks; keep everything else; add 3-block narrative)
  - Macro hero: verdict, lede, meta grid, history chart (replace lede with regime identification summary; keep chart + meta)
  - Output: `docs/narrative/audit-surfaces.md`

- [ ] **Entity coverage audit.** Already run — confirmed missing entity views:
  - **Stocks with entity views (5/25):** UNH, LLY, NVDA, MSFT, KO
  - **Stocks missing (20/25):** AAPL, GOOGL, AMZN, META, TSLA, BRK.B, JPM, GS, BAC, XOM, CVX, JNJ, PG, HD, CAT, BA, INTC, AMD, NFLX, MS
  - **Sectors with entity views (4):** Healthcare, Technology, Staples, Financials
  - **Sectors missing:** Energy, Industrials, Utilities, Real Estate, Materials, Comm Svcs, Discretionary (Consumer Discretionary)
  - **Indicators with entity views (4/12):** Regime, Core CPI YoY, 10Y Yield, GDP Nowcast
  - **Indicators missing (8):** 2Y Yield, Curve (2s10s), Fed Path, HY Spread, DXY, Brent Oil, Gold, VIX, AAII Bull %
  - Output: `docs/narrative/audit-entities.md`

- [ ] **Backend vs. display sector mismatch.** Backend uses 8 sectors (Technology, ConsDisc, Communication, Finance, Energy, Healthcare, Staples, Industrial); mockup displays 11 (adds Utilities, Real Estate, Materials, splits Comm Svcs). Decide: expand backend to 11, or collapse mockup to 8? Blocks sector narrative work. Resolve in Sprint 0.

- [ ] **Data-source inventory per narrative.** For each of the 5 surfaces, confirm which D1 tables feed it and whether they're current. Fill the matrix in `docs/narrative/data-inventory.md`.

- [ ] **Narrative storage design** (pending Q1 decision):

  Option A — new table (recommended):

  ```sql
  CREATE TABLE NARRATIVE_01_Content (
    id TEXT PRIMARY KEY,              -- hash(entity_type|entity_id|date|field)
    entity_type TEXT NOT NULL,        -- 'regime' | 'sector_landscape' | 'sector' | 'stock_landscape' | 'stock'
    entity_id TEXT,                   -- NULL for regime/landscapes; 'Healthcare' / 'UNH' otherwise
    date TEXT NOT NULL,
    field TEXT NOT NULL,              -- 'current_reading' | 'identification' | 'recommendation' | 'lede'
    content_json TEXT NOT NULL,       -- { headline, bullets[], stance, signposts[], etc. }
    sources_json TEXT,                -- [{table, id}]
    model TEXT,                       -- 'gpt-5' | 'gpt-4o-mini' | 'deterministic'
    input_hash TEXT,                  -- SHA of input JSON, for stability check
    created_at TEXT NOT NULL,
    last_confirmed_at TEXT NOT NULL,
    superseded_by TEXT                -- id of newer row that replaced this
  );
  CREATE INDEX idx_narrative_entity ON NARRATIVE_01_Content(entity_type, entity_id, date);
  ```

  Option B — columns on existing tables (`TICKER_TREND_*`, `SECTOR_FACTORS_daily`, etc.). Simpler but scatters narrative across 5+ tables; harder to audit.

- [ ] **Migration:** `workers/portfolio-ingestor/migrations/0031_add_narrative_table.sql`

- [ ] **Narrator worker scaffold:** `workers/narrator/` with subfolders `regime/`, `sector-landscape/`, `sector/`, `stock-landscape/`, `stock/`. Each a separate Cloudflare worker so they can be scheduled and debugged independently.

### Deliverables

- `docs/narrative/audit-surfaces.md`
- `docs/narrative/audit-entities.md`
- `docs/narrative/data-inventory.md`
- Migration file applied
- Empty worker folders ready

### Quality gates

- All three audit docs filled in with concrete tables
- Sector-mismatch decision made and documented
- Migration runs cleanly against D1
- Gap list is complete: we know exactly what's missing

**Estimated time:** 3–4 hours (mostly reading and listing — no code yet).

---

## Sprint 1 — Regime narrative (+ Macro tab reuse)

**Goal:** one full end-to-end narrative pipeline. Proves the pattern. Everything else copies this.

### Tasks

- [ ] **Build data-gatherer** (`workers/narrator/regime/gather.js`):
  - Reads the 12 macro indicators + 30d direction from `BETA_10_Daily_macro` / FRED tables
  - Reads latest FOMC minutes summary from `qk-report-summarizer` output
  - Reads Whitehouse news last 7d (filtered for fiscal/policy/tariff relevance)
  - Reads macro-relevant news from `BETA_12_News_digest` (cross-sector or sector=macro)
  - Reads upcoming economic calendar (next 7d releases)
  - Reads previous narrative from `NARRATIVE_01_Content WHERE entity_type='regime' ORDER BY date DESC LIMIT 1`
  - Computes `input_hash` on the numerical part
  - Returns a single JSON block ready for the prompts

- [ ] **Stability check** (`workers/narrator/regime/stability.js`):
  - Compare `input_hash` with previous
  - Compare key indicators (CPI, GDP, yields, credit spreads) — if none crossed a threshold, return `STABLE` → skip LLM calls, reuse previous narrative, bump `last_confirmed_at`
  - Thresholds: CPI ±0.2pp, GDP ±0.3pp, 10Y ±15bp, HY ±20bp, VIX ±3

- [ ] **Gemini fact-check agent** (`workers/narrator/shared/gemini-facts.js`), if Q2 resolved yes:
  - Takes `[{claim, date}]` list — e.g. "March FOMC minutes dropped 'patient' language"
  - Returns `[{claim, verified: bool, source_url}]`
  - Uses narrow dated questions only. Rejects causal queries.

- [ ] **Current-reading composer** (deterministic, no LLM):
  - Input: the 12 indicators with values + 30d direction + 5y context
  - Output: 3-line factual paragraph. Pure template fill.
  - Example: *"GDP nowcast +1.4% (decelerating 6m). Core CPI 3.2% (sticky 8m). Fed pricing 1 cut by July. HY spreads 318bp (+13bp/3w). VIX 16.4."*

- [ ] **Identification GPT-5 call** (`workers/narrator/regime/identification.js`):
  - Input: the JSON block from gatherer
  - Prompt: *"For each driver of the current regime, state [NUMBER] + [EVENT] + [INTERPRETATION]. 3–5 bullets, ranked by impact. Each must carry all three — drop the bullet otherwise. Do not invent numbers. Cite the source table per bullet."*
  - Output schema:
    ```json
    {
      "bullets": [
        {
          "headline": "Fed's reaction function is loosening",
          "number": "Core CPI 3.2% (Apr 15, in-line)",
          "event": "March FOMC minutes dropped 'patient' / 'extended hold'",
          "interpretation": "Growth-duration re-rating underway",
          "source": { "table": "BETA_10_Daily_macro", "id": "..." }
        }
      ],
      "missing_factors": ["Japan carry-unwind risk not in input"]
    }
    ```

- [ ] **Recommendation GPT-5 call** (`workers/narrator/regime/recommendation.js`):
  - Input: identification output + portfolio positioning + economic calendar
  - Prompt: *"Given the regime, produce: (a) stance sentence — net exposure, tilts, conviction, and our edge vs. consensus. (b) 3–5 signposts — each carries trigger, threshold, dated event, specific action."*
  - Output schema:
    ```json
    {
      "stance": "Net long 62%, OW defensives. Conviction 0.81. Consensus prices soft-landing; we are 15bp tighter on credit.",
      "signposts": [
        {
          "trigger": "May 2 FOMC hawkish lean",
          "threshold": "Any mention of delayed cuts",
          "dated_event": "2026-05-02",
          "action": "Trim duration-ballast −5%"
        }
      ]
    }
    ```

- [ ] **Lede composer** — GPT-4o-mini:
  - Input: the full 3-block narrative (current_reading + identification + recommendation) for this entity, as it will render in the detail view
  - Prompt: *"Summarize the analyst note below in 3–4 lines for a busy reader. Lead with the single most important number. One sentence of diagnosis. One sentence of stance. End with the next dated test. Max 45 words. No new numbers — only what's in the note."*
  - Output: plain-text lede
  - Deterministic fallback used only on API failure: `{key_metric}. {identification.bullets[0].headline}. {recommendation.stance}. Next test: {signposts[0].dated_event}.`

- [ ] **Writer** (`workers/narrator/regime/write.js`):
  - Inserts 4 rows into `NARRATIVE_01_Content`: `{field: current_reading}`, `{field: identification}`, `{field: recommendation}`, `{field: lede}`
  - Marks prior rows `superseded_by`

- [ ] **Orchestrator entry point:** `GET /build` runs gather → stability check → (compose current_reading) → identification → recommendation → lede → write. Returns status JSON.

- [ ] **Dashboard wiring** (`dashboard/portfolio-funnel-mockup.js` + `server.js`):
  - New endpoint: `GET /api/narrative?entity_type=regime&entity_id=` returns latest 4 rows joined
  - Wire Layer 1 card: replace current lede with new lede
  - Wire Regime entity deep-dive: render current_reading + identification (bullets) + recommendation (stance + signposts); kill `thesis`, `structuralDrivers`, `riskVectors`, and the "What this indicator measures" + "The regime label is the single most important input" stubs
  - Wire Macro tab hero: reuse the regime narrative for `macro-big-lede`
  - Keep: signal panel, style tilts, gauge, history chart, scenarios

### Deliverables

- `workers/narrator/regime/` complete and deployed
- Migration 0031 in place
- Dashboard renders the 3-block regime narrative
- Macro tab hero shares it
- Test script: `scripts/test-regime-narrative.js` that invokes gather → calls GPT-5 → validates schema → prints result

### Quality gates

- [ ] Numeric validation passes — no hallucinated numbers
- [ ] Stability rule demonstrably triggers (test by running twice; second run skips LLM)
- [ ] Regime entity view loads with the 3 blocks visible
- [ ] Layer 1 card lede is ≤ 4 lines and reads clean
- [ ] Macro hero uses the same narrative (no duplicate call)
- [ ] Gemini fact-check either works or is stubbed with a clean interface

**Estimated time:** 8–10 hours.

---

## Sprint 2 — Sector landscape (comparative) narrative

**Goal:** Layer 2 main card + new comparative sector view. Narrative talks about *all sectors* together, not one.

### Tasks

- [ ] **Data-gatherer** (`workers/narrator/sector-landscape/gather.js`):
  - All sectors from `SECTOR_FACTORS_daily` with `{regime_fit, earn_momentum, valuation_sigma, rel_strength_13w, stance}`
  - Top contributor ticker per sector (by composite score from `SIGNAL_01_Assessment`)
  - Macro regime label + identification bullet #1
  - Aggregated sector news (`BETA_12_News_digest` grouped by sector, 7d)
  - Previous landscape narrative

- [ ] **Stability check.** Threshold: no sector's regime_fit moved >0.2; no stance change. Then reuse.

- [ ] **Current reading** (deterministic):
  - 3-line template: *"{N} sectors assessed. OW: {OW list with regime_fit avg}. UW: {UW list with regime_fit avg}. Widest spread: {OW[0] - UW[-1]}."*

- [ ] **Identification GPT-5 call:**
  - Prompt: *"Compare the {N} sectors by their factor profile. Produce 3–5 bullets identifying what separates the top-ranked from the bottom-ranked. Each bullet ties factor values to an interpretation. Do NOT deep-dive any single sector — this is comparative only."*

- [ ] **Recommendation GPT-5 call:**
  - Prompt: *"Produce: (a) rotation stance — which sectors to add, which to cut, and why. (b) 3–5 signposts that would change the sector ranking. Triggers must be dated events or factor thresholds."*

- [ ] **Lede composer** (deterministic or GPT-4o-mini).

- [ ] **Writer** — 4 rows to `NARRATIVE_01_Content` with `entity_type='sector_landscape'`.

- [ ] **Dashboard wiring:**
  - Layer 2 card lede → new comparative summary
  - Change footer link from "Open Healthcare deep-dive" to "Open full sector analysis" → routes to new `landscape:sector` entity view (or reuse entity view infrastructure with a new kind)
  - Keep: sector table, RRG, allocation bar — these already are comparative
  - Clicking individual sector name in table continues to open that sector's entity view (Sprint 3)

### Deliverables

- `workers/narrator/sector-landscape/`
- New entity view `landscape:sector` in dashboard
- Layer 2 card rewired

### Quality gates

- [ ] Narrative is genuinely comparative — mentions 3+ sectors by name
- [ ] Does not deep-dive any single sector (caught by grep — if a single sector is named >2x, flag)
- [ ] Layer 2 card lede tied to the same narrative

**Estimated time:** 5–6 hours.

---

## Sprint 3 — Individual sector narratives + full profiles (×11)

**Goal:** every sector has the complete `ENTITIES['sector:X']` template (full profile, not a stub) filled from D1 data, plus the 3-block narrative inside it.

### Tasks

- [ ] **Resolve the sector-count mismatch** (flagged Sprint 0). Either expand backend to 11 sectors or collapse mockup to 8. Must be done before this sprint.

- [ ] **Build 7 missing sector full profiles.** Template to copy: `ENTITIES['sector:Healthcare']` in `portfolio-funnel-mockup.js`. Each full profile includes:
  - `summary` (hero text — auto-generated from snapshot + top contributors)
  - `business` (sector description — static text per sector, written once)
  - `snapshot` cells (P/E, earnings momentum, regime fit, etc. — from `SECTOR_FACTORS_daily`)
  - `keyMetrics` table
  - `composition` (top tickers in sector — from `STOCK_FACTORS_daily` + `SIGNAL_01_Assessment` composite scores)
  - `peers` table (sector vs. other sectors from `SECTOR_FACTORS_daily`)
  - `news` feed (from `BETA_12_News_digest` filtered by sector, 7d)
  - `catalysts` (upcoming earnings in sector, from `FUND_02_Earnings`)
  - `upLevel` breadcrumb
  - Narrative section (populated next)

  Missing sectors: **Energy, Industrials, Utilities, Real Estate, Materials, Comm Svcs, Discretionary**. Each takes ~1–1.5h given the template exists.

- [ ] **Refactor existing 4 sector profiles** (Healthcare, Technology, Staples, Financials) to use the same templated-from-data sources as the new 7 — no hand-curated mock data left. Kill their hardcoded `thesis`, `drivers`, `risks`.

- [ ] **Data-gatherer per sector** (`workers/narrator/sector/gather.js`, takes `?sector=Healthcare`):
  - Sector's own numerical factors
  - All tickers in this sector with composite scores + top 2 factors each
  - Sector-specific news from `BETA_12_News_digest` (7d)
  - Industry SEC filings — latest 10-K / 10-Q / 8-K summaries from sector constituents (30d)
  - Press releases aggregated at sector level (7d)
  - Macro regime label (context only)
  - Previous sector narrative

- [ ] **Stability check.** Per-sector: no factor moved >0.2, no top 3 tickers changed, no new 10-K / 8-K with high magnitude. Then reuse.

- [ ] **Current reading** (deterministic).

- [ ] **Identification GPT-5 call per sector.** 11 calls per build cycle.

- [ ] **Recommendation GPT-5 call per sector.** 11 calls.

- [ ] **Lede composer per sector.**

- [ ] **Writer** — 4 rows × 11 sectors = 44 rows per cycle.

- [ ] **Dashboard wiring:** each sector entity view renders the 3 blocks at the top. Kill existing thesis + drivers + risks for these 11 sectors. Keep: key metrics, peer comparison (where present), news.

- [ ] **Orchestrator:** one HTTP endpoint `GET /build?sector=Healthcare` plus `GET /build-all` that fans out to 11 parallel calls. Batched 3 at a time to avoid rate limits.

### Deliverables

- 11 sector narratives in D1
- 7 new sector full-profile entity views
- 4 existing sector profiles refactored (no hand-curated mock data)
- All 11 render the 3-block narrative inside the full profile

### Quality gates

- [ ] Every sector full-profile renders without errors
- [ ] Every sector has all 3 narrative blocks populated
- [ ] Numeric validation passes for all 11
- [ ] No sector narrative mentions another sector's tickers (catch by validation)
- [ ] No `DATA.ENTITIES['sector:X']` contains hand-curated mock text — everything sourced from D1

**Estimated time:** 16–20 hours. (11 profiles × 1.5h + narratives + wiring.)

---

## Sprint 4 — Stock landscape (comparative) narrative

**Goal:** Layer 3 main card + new comparative stock view. Same pattern as Sprint 2.

### Tasks

- [ ] **Data-gatherer** (`workers/narrator/stock-landscape/gather.js`):
  - Shortlist: top N stocks from `SIGNAL_01_Assessment` by composite score (probably N=10–15)
  - Each stock's top 3 factors with values
  - Each stock's sector
  - Each stock's composite score + probability
  - Sector landscape narrative (top identification bullet, for context)
  - Macro regime label
  - Previous landscape narrative

- [ ] **Stability check.** Shortlist unchanged AND no score moved >0.15 AND no probability crossed 0.1.

- [ ] **Current reading** (deterministic).

- [ ] **Identification GPT-5 call:**
  - Prompt: *"Compare the {N} shortlist stocks. What pattern separates the top-ranked from the rest? Which stocks are new to the list, which dropped off? Produce 3–5 comparative bullets."*

- [ ] **Recommendation GPT-5 call:**
  - Prompt: *"Produce: (a) top 3 picks with conviction tier and why each is preferred over peers in the same sector. (b) 3–5 signposts that would rotate the ranking."*

- [ ] **Lede composer.**

- [ ] **Writer** — `entity_type='stock_landscape'`.

- [ ] **Dashboard wiring:**
  - Layer 3 card lede → new comparative summary
  - Change footer link from "Open UNH deep-dive" to "Open full stock analysis" → new `landscape:stock` entity
  - Keep: stock groups, scatter
  - Clicking individual stock in any table still opens that stock's entity view (Sprint 5)

### Deliverables

- `workers/narrator/stock-landscape/`
- New entity view `landscape:stock`
- Layer 3 card rewired

### Quality gates

- [ ] Narrative mentions 5+ stocks by name
- [ ] Comparative, not single-stock deep-dive

**Estimated time:** 4–5 hours.

---

## Sprint 5 — Individual stock narratives + full profiles (×25)

**Goal:** every stock has the complete `ENTITIES['stock:X']` template (full profile like UNH) filled from D1 data, plus the long-term + tactical 3-block narrative inside it.

### Tasks

- [ ] **Build 20 missing stock full profiles.** Template to copy: `ENTITIES['stock:UNH']` in `portfolio-funnel-mockup.js`. Each full profile includes:
  - `summary` (hero text — auto-generated from snapshot + top factors)
  - `business` (company description — one-shot GPT-5 generation per ticker, cached indefinitely; refreshed manually)
  - `snapshot` cells (market cap, P/E, key financial KPIs — from `FUND_01_Fundamentals`)
  - `epsHistory` (9-quarter EPS beat/miss bars — from `FUND_02_Earnings`)
  - `financials` charts (revenue + margin — from `FUND_01`)
  - `filings` cards with ledes (latest 10-K, 10-Q, 8-K, Form 4 — from `ALPHA_01_Reports` with summaries already written by `qk-report-summarizer`, `form4-summarizer`, `8k-summarizer`)
  - `catalysts` (upcoming events — next earnings from `FUND_02`, plus any scheduled filings or ex-div dates)
  - `peers` table (same-sector stocks comparison — from `STOCK_FACTORS_daily` + `FUND_01`)
  - `news` feed (`BETA_12_News_digest` filtered by ticker, 7d)
  - `upLevel` breadcrumb (e.g., "Why AAPL is on the list: Tech UW (Layer 2)")
  - Narrative section (populated next)

  Missing stocks: **AAPL, GOOGL, AMZN, META, TSLA, BRK.B, JPM, GS, BAC, XOM, CVX, JNJ, PG, HD, CAT, BA, INTC, AMD, NFLX, MS**. Each takes ~1h given the template + data wiring already exists.

- [ ] **Refactor existing 5 stock profiles** (UNH, LLY, NVDA, MSFT, KO) to use the same templated-from-data sources — remove hardcoded mock data, wire to D1. Kill their hardcoded `thesis` and `risks`.

- [ ] **Data-gatherer per stock** (`workers/narrator/stock/gather.js`, takes `?ticker=UNH`):
  - All 8 factors from `SIGNAL_01_Assessment` with values + reasons
  - Probability curve last 30d from `SIGNAL_02_Probability`
  - Fundamentals snapshot from `FUND_01` (P/E, DMA50, etc.)
  - Last 4 quarters from `FUND_02_Earnings`
  - Analyst 90d trajectory from `FUND_03_Recommendations`
  - Latest 10-K / 10-Q / 8-K / Form 4 summaries from `ALPHA_01_Reports` (30d)
  - Press releases last 14d from `ALPHA_03_Press`
  - News last 7d from `BETA_12_News_digest`
  - Long-term trend row from `TICKER_TREND_long`
  - Short-term trend row from `TICKER_TREND_short`
  - Sector narrative top identification bullet (context)
  - Previous stock narrative

- [ ] **Stability check.** No factor flipped sign, composite score moved <0.25, no new earnings / 8-K / Form 4 in window.

- [ ] **Current reading** (deterministic). Includes composite score + probability.

- [ ] **Identification GPT-5 calls per stock — TWO calls:**
  - Long-term identification (inputs: fundamentals, 4-quarter earnings sequence, analyst 90d trajectory, 10-K/10-Q summaries, composite score, sector context)
  - Tactical identification (inputs: momentum, relative strength, 7d news, recent press, days to catalyst, probability last 7d)
  - 50 total per full build.

- [ ] **Recommendation GPT-5 calls per stock — TWO calls:**
  - Long-term recommendation (position rationale, conviction, what breaks the long thesis)
  - Tactical recommendation (entry/trim trigger, 1–2wk stance, what flips the tactical read)
  - 50 total per full build.

- [ ] **Lede composer per stock** — one GPT-4o-mini call that reads the full detail view and produces the shortlist-row / hover summary.

- [ ] **Writer** — 6 rows per stock (`current_reading`, `ident_long`, `ident_short`, `rec_long`, `rec_short`, `lede`) × 25 = 150 rows per full cycle. Event-driven: most runs touch 1–3 stocks.

- [ ] **Dashboard wiring:** each stock entity view renders two tabs inside the narrative block — "Long-term view" and "Tactical (1–2 wk)" — each showing its own current_reading + identification + recommendation. Keep: snapshot, EPS bars, filings cards, catalysts, peers, news.

- [ ] **Orchestrator:** `GET /build?ticker=UNH` + `GET /build-all`. Batched 5 at a time. In production, called by the event dispatcher (Sprint 7), not scheduled.

### Deliverables

- 25 stock narratives in D1 (150 rows)
- 20 new stock full-profile entity views
- 5 existing stock profiles refactored to source from D1
- Long-term + tactical tabs rendering correctly

### Quality gates

- [ ] Every stock full-profile renders without errors
- [ ] Every stock has both tabs populated with all 3 blocks
- [ ] Numeric validation passes for all
- [ ] No stock narrative cites a factor not in its input
- [ ] No hand-curated mock text left in `ENTITIES['stock:*']`

**Estimated time:** 28–32 hours. (20 profiles × 1h + narratives + wiring + refactor.)

---

## Sprint 6 — Lede generation (GPT-4o-mini, reads detail view)

**Goal:** every main-card lede + hover summary is generated by a single GPT-4o-mini call that reads the full detail view. No duplication; the lede is always an abbreviation of the actual analysis.

### Tasks

- [ ] **Build the lede agent** (`workers/narrator/lede/`). One worker, called once per entity whenever any of that entity's narrative fields change.
  - Input: the full `NARRATIVE_01_Content` rows for that entity (current_reading + identification + recommendation), plus the top 3 key metrics from the detail view
  - Prompt: *"You are writing the 3–4 line opening summary of an analyst's daily note. Lead with the single most telling number. One sentence of diagnosis (from identification). One sentence of stance (from recommendation). End with the next dated test or trigger. Max 45 words. Do not introduce any number that is not in the note. No preamble, no adjectives, no hedging."*
  - Output: plain-text lede, stored in `NARRATIVE_01_Content` with `field='lede'`
  - Deterministic fallback if API call fails — see Sprint 1 pattern

- [ ] **Consistency rule.** When both Regime entity and Macro tab hero render, they pull the same `lede` row — no second call, no drift.

- [ ] **Trigger.** The lede agent fires automatically whenever a `superseded_by` is written on any identification/recommendation row for that entity. Implemented in Sprint 7's event dispatcher.

- [ ] **Wiring.** Every main-card `lede` DOM element reads from `NARRATIVE_01_Content WHERE field='lede' AND entity_type=... AND entity_id=...` via the `/api/narrative` endpoint.

### Deliverables

- Lede worker deployed
- Every surface has a fresh AI-generated lede
- Regime ≡ Macro hero (single source)

### Quality gates

- [ ] Lede ≤ 45 words on every surface
- [ ] Lede contains at least one number, and that number appears in the detail view
- [ ] Lede ends with a forward-looking clause ("next test: …")
- [ ] Regime lede and Macro hero lede byte-identical

**Estimated time:** 4 hours.

---

## Sprint 7 — Event-driven orchestration

**Goal:** narratives refresh when something *happens*, not on a clock. Low cost, always-current.

### Event triggers → which narratives rebuild

| Event | Detected by | Rebuilds |
|---|---|---|
| New 10-K / 10-Q / 8-K summarized | `ALPHA_01_Reports` insert | That stock's narrative (long + tactical) |
| New Form 4 summarized | Same, type='4' | That stock's narrative |
| New press release (magnitude ≥ 0.5) | `ALPHA_03_Press` insert | That stock's narrative + its sector if sentiment extreme |
| Earnings release | `FUND_02_Earnings` row with today's `report_date` | That stock's narrative + sector landscape |
| News item (magnitude ≥ 0.7) | `BETA_12_News_digest` insert | That stock's narrative |
| FOMC minutes / CPI / payrolls released | `BETA_10_Daily_macro` significant change | Regime narrative |
| Whitehouse news (magnitude ≥ 0.6) | Whitehouse worker output | Regime narrative |
| Sector factor shift (`regime_fit` moved > 0.2) | `SECTOR_FACTORS_daily` diff | That sector narrative + sector landscape |
| Composite score shift (> 0.25) | `SIGNAL_01_Assessment` diff | That stock's narrative |
| Stock crosses in/out of shortlist | Rank change in `SIGNAL_01_Assessment` | Stock landscape narrative |
| Price move (> 5% single day OR > 2.5σ) | `PRICE_01_Daily` diff | That stock's narrative |

### Tasks

- [ ] **Event dispatcher** (`workers/narrator/dispatcher/`): a worker that runs every 15 min. For each trigger table, reads rows inserted since last tick, maps to entities, dedupes, and fans out HTTP calls to the appropriate narrator workers. Only fires the subset of narrators needed.

- [ ] **Trigger log** (`NARRATIVE_02_Triggers` table): every fire is logged with {timestamp, source_event, entity_type, entity_id, narrator_called, succeeded}. Viewable on Validation tab.

- [ ] **Safety-net rebuild.** If an entity has had no event-driven rebuild in **7 days**, the dispatcher forces a refresh. Ensures nothing decays silently.

- [ ] **Cold-start rebuild.** On first deploy, the dispatcher fans out one call per entity to seed every narrative row. Serial batching to avoid rate limits.

- [ ] **Stability gate runs first.** Each narrator checks the stability rule before calling GPT. If the event fired but the inputs haven't moved enough, narrator returns early with "confirmed_only" — bumps `last_confirmed_at`, no LLM cost. This is the second layer of cost control.

- [ ] **Freshness surface.** `DATA.feeds` extended with one row per narrative surface. Dashboard Validation tab shows {last_event, last_rebuild, stability_confirmed_count, last_lede}.

- [ ] **Failure fallback.** On GPT failure after one retry, dashboard keeps showing the previous narrative with a subtle "updated {date}" chip. Never "Unavailable" after cold-start.

- [ ] **Cost & rejection logging.** Every call logs `{surface, entity_id, input_tokens, output_tokens, model, duration_ms, accepted}`. Validation tab aggregates daily.

### Deliverables

- Dispatcher worker deployed, running every 15 min
- Event triggers wired across all source tables
- Safety-net and cold-start logic verified
- Validation tab shows trigger log + cost + rejection count

### Quality gates

- [ ] Inserting a new 8-K for UNH triggers a UNH narrative rebuild within 15 min (end-to-end test)
- [ ] A FOMC minutes update triggers regime rebuild and no individual-stock rebuild unless scores moved
- [ ] Stability gate demonstrably skips LLM calls when inputs are identical
- [ ] 7-day safety-net confirmed to fire on a test entity left untouched
- [ ] Cost per day is visible and under a clear ceiling

**Estimated time:** 8–10 hours.

---

## Total

≈ **78–92 hours** end-to-end (up from the earlier estimate because Q4 = full profiles, not stubs):

| Sprint | Scope | Hours |
|---|---|---|
| 0 | Audit + storage design | 3–4 |
| 1 | Regime narrative + Macro reuse + Gemini fact-check | 8–10 |
| 2 | Sector landscape (comparative) | 5–6 |
| 3 | 11 sector full profiles + narratives | 16–20 |
| 4 | Stock landscape (comparative) | 4–5 |
| 5 | 25 stock full profiles + narratives (long + tactical) | 28–32 |
| 6 | GPT-4o-mini lede agent | 4 |
| 7 | Event-driven orchestration | 8–10 |

**Parallelization:** after Sprint 0, Sprint 1 is the critical path (proves the pattern). Sprints 2+3 can run in parallel once 1 is done. Same for 4+5. Sprint 6 depends on at least one narrative existing. Sprint 7 is last.

---

## Appendix A — Prompt templates

### A.1 Identification prompt (regime)

```
You are a senior macro analyst. Using ONLY the data provided below, produce 3–5 bullets identifying the drivers of the current regime.

Each bullet MUST contain:
  - headline: one sharp sentence
  - number: a specific numeric value from the data
  - event: a specific dated event (FOMC minutes, CPI print, policy announcement)
  - interpretation: the forward-looking implication
  - source: the table + id the number came from

If you cannot fill all 5 fields for a bullet, drop the bullet. Do NOT paraphrase numbers that aren't in the data.

Also return `missing_factors`: a list of factors you think matter but are not in the input.

DATA:
<json block: indicators, events, previous narrative>

OUTPUT JSON SCHEMA:
{ "bullets": [{ headline, number, event, interpretation, source }], "missing_factors": [] }
```

### A.2 Recommendation prompt (regime)

```
You are a senior portfolio manager. Given the identification below and the current book, produce:

1. stance: one sentence with: net exposure, key tilts, conviction [0–1], and our edge vs. consensus (what the market is pricing vs. what we think).

2. signposts: 3–5 forward-looking triggers. Each MUST contain:
  - trigger: the observable event
  - threshold: the specific level that matters
  - dated_event: when (ISO date or "next CPI print")
  - action: what we do if triggered

Use ONLY the data provided. Dated events must come from the calendar input.

DATA:
<identification output + book positioning + economic calendar>

OUTPUT JSON:
{ "stance": "...", "signposts": [{ trigger, threshold, dated_event, action }] }
```

### A.3 Variants

Sector landscape, individual sector, stock landscape, individual stock: same two-call pattern, same schemas, prompt language adapted to vocabulary. Kept short, single-responsibility. See `workers/narrator/*/identification.js` and `recommendation.js` for the exact strings.

---

## Appendix B — Dashboard kill list (to apply across sprints)

| Surface | Field | Action |
|---|---|---|
| Layer 1 card | verdict headline | KEEP |
| Layer 1 card | lede paragraph | REPLACE with new lede (Sprint 1) |
| Layer 1 card | signal panel | KEEP |
| Layer 1 card | style tilts | KEEP |
| Layer 1 card | gauge | KEEP |
| Regime entity | thesis paragraph | KILL — replaced by 3 blocks |
| Regime entity | "what this indicator measures" | KILL |
| Regime entity | "the regime label is the single most important input" | KILL |
| Regime entity | structural drivers | KILL — subsumed by Identification |
| Regime entity | risk vectors | KILL — subsumed by Recommendation signposts |
| Regime entity | key metrics | KEEP |
| Regime entity | history chart | KEEP |
| Regime entity | scenarios table | KEEP |
| Macro hero | big verdict | KEEP |
| Macro hero | big lede | REPLACE with regime lede (shared source) |
| Macro hero | history chart | KEEP |
| Layer 2 card | verdict | KEEP |
| Layer 2 card | lede | REPLACE with new landscape lede (Sprint 2) |
| Layer 2 card | sector table | KEEP |
| Layer 2 card | RRG | KEEP |
| Layer 2 card | footer link | REPOINT to `landscape:sector` |
| Sector entity | thesis | KILL |
| Sector entity | structural drivers (if any) | KILL |
| Sector entity | risk vectors | KILL |
| Sector entity | key metrics | KEEP |
| Sector entity | peer comparison | KEEP |
| Sector entity | news | KEEP |
| Layer 3 card | verdict | KEEP |
| Layer 3 card | lede | REPLACE (Sprint 4) |
| Layer 3 card | stock groups | KEEP |
| Layer 3 card | scatter | KEEP |
| Layer 3 card | footer link | REPOINT to `landscape:stock` |
| Stock entity | thesis | KILL |
| Stock entity | risks | KILL |
| Stock entity | snapshot | KEEP |
| Stock entity | EPS bars | KEEP |
| Stock entity | filings cards | KEEP |
| Stock entity | catalysts | KEEP |
| Stock entity | peers | KEEP |
| Stock entity | news | KEEP |
| Layer 4 | (untouched — future sprint) | — |
| Layer 5 | (untouched — future sprint) | — |

---

## Appendix C — Starting point for tomorrow

All 7 decisions are locked (section 0). Sprint 0 is the first thing to run — no code yet, just:

1. Fill `docs/narrative/audit-surfaces.md` (HTML field-by-field replace/keep/kill list)
2. Fill `docs/narrative/data-inventory.md` (which D1 tables feed which narrative inputs — confirm freshness for each)
3. Resolve the 8-vs-11 sector mismatch (blocker for Sprint 3)
4. Write + apply migration `0031_add_narrative_table.sql`
5. Scaffold empty worker folders

Once those 5 tasks are ticked, Sprint 1 can begin.
