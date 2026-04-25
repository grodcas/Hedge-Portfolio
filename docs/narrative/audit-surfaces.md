# Audit — Narrative surfaces (Sprint 0, task 1)

Field-by-field inventory of every narrative text element currently rendered on the dashboard, with a verdict (REPLACE / KEEP / KILL) per the narrative build plan.

**Scope:** narrative = human-authored or AI-authored prose, bulleted analysis, verdicts, ledes, thesis, drivers, risks. Tables, metrics, charts, raw data, and news feeds (which are structured data, not analyst prose) are out of scope here and tracked in `data-inventory.md`.

**Sources of truth:**
- `dashboard/portfolio-funnel-mockup.html` — DOM structure
- `dashboard/portfolio-funnel-mockup.js` — `ENTITIES{}`, `DATA{}`, renderers
- `dashboard/server.js` — `/api/narrative` endpoint to add (Sprint 1)

**Mindset carried from feedback:** every narrative field must carry *identification + interpretation + recommendation*. Where the current field blends these (e.g., `thesis`), the replacement will split them into the 3-block structure (`current_reading` / `identification` / `recommendation`) with interpretation baked into the identification bullets.

---

## Entity shape reference (from ENTITIES{} in portfolio-funnel-mockup.js)

Three entity kinds. Columns below indicate whether each field is **narrative** (prose/bullets) or **data** (structured values). The narrative build only touches narrative fields; data fields will be wired from D1 in Sprints 3 and 5.

| Field                | indicator (Regime) | sector:*                  | stock:*                   | Classification |
|----------------------|--------------------|---------------------------|---------------------------|----------------|
| `thesis`             | yes                | yes                       | yes                       | narrative      |
| `business`           | "what it measures" | sector definition         | company description       | narrative (short) |
| `drivers[]`          | structural drivers | structural + cyclical     | —                         | narrative      |
| `risks[]`            | risk vectors       | risk vectors              | risk bullets              | narrative      |
| `catalysts[]`        | —                  | upcoming events           | upcoming events           | narrative      |
| `snapshot[]`         | current reading    | key metrics               | key metrics               | data           |
| `trajectory[]`       | regime path        | —                         | —                         | data           |
| `composition[]`      | —                  | tickers in sector         | —                         | data           |
| `peersTable`         | —                  | peer sectors              | peer stocks               | data           |
| `epsHistory[]`       | —                  | —                         | 9Q beat/miss bars         | data           |
| `financials{}`       | —                  | —                         | 6yr revenue/margin/eps/fcf | data           |
| `filings[]`          | —                  | —                         | SEC docs (`lede` narrative, `bullets` mixed) | mixed |
| `news[]`             | —                  | —                         | raw news                  | data           |
| `trendNews[]`        | —                  | curated sector news       | curated stock news        | data (labels) + narrative summaries |
| `trendPeriod`        | —                  | window label              | window label              | data           |
| `recentRelease`      | link to release    | —                         | —                         | data           |

---

## SURFACE 1 — Layer 1 (Portfolio main card)

Location: `portfolio-funnel-mockup.html:1508–1546`, `portfolio-funnel-mockup.js:628–684`

| # | Field | DOM / JS selector | Source today | Verdict | Replacement |
|---|-------|-------------------|--------------|---------|-------------|
| 1.1 | Verdict headline | `#layer1 .layer-verdict` | Hardcoded HTML; JS can overwrite via `verdictEl.innerHTML` | **KEEP** | Remains a short tag derived from regime label + stance (deterministic, not LLM) |
| 1.2 | Lede paragraph | `#layer1 .layer-lede` | Hardcoded HTML | **REPLACE** | GPT-4o-mini lede from `NARRATIVE_01_Content WHERE entity_type='regime' AND field='lede'` (Sprint 1 + 6) |
| 1.3 | Signal panel text | `.layer-body` step text (kind:'Regime') | D1 `/query/macro-trend` → `DATA.regimeText` | **KEEP** | Already D1-driven; stable |
| 1.4 | Style tilts labels | `DATA.regime.styleTilts[]` (name, direction, bp) | D1 `/query/sector-factors` | **KEEP** | Deterministic factor output |
| 1.5 | Gauge / confidence | `DATA.regime.confidence` | D1 | **KEEP** | Data-derived |
| 1.6 | Layer-meta footer | `#layer1 .layer-meta span` | Hardcoded HTML | **KEEP (wire to data)** | Point to live `regime.since`, `regime.stableDays` — no LLM |

---

## SURFACE 2 — Layer 2 (Portfolio sector card)

Location: `portfolio-funnel-mockup.html:1549–1594`, `portfolio-funnel-mockup.js:300–425`

| # | Field | DOM / JS selector | Source today | Verdict | Replacement |
|---|-------|-------------------|--------------|---------|-------------|
| 2.1 | Verdict headline | `#layer2 .layer-verdict` | Hardcoded HTML | **KEEP (wire to data)** | Deterministic from OW/UW counts |
| 2.2 | Lede paragraph | `#layer2 .layer-lede` | Hardcoded HTML | **REPLACE** | GPT-4o-mini lede for `entity_type='sector_landscape'` (Sprint 2 + 6) |
| 2.3 | Sector table text | `#sectorTableBody` rows (stance cells) | D1 `/query/sector-factors` | **KEEP** | Data-derived |
| 2.4 | RRG title + legend | `.rrg-title`, `.rrg-legend span` | Hardcoded HTML | **KEEP** | Static labels |
| 2.5 | Allocation bar title | `.allocation-bar-title` | Hardcoded HTML | **KEEP** | Static label |
| 2.6 | Layer-meta footer | `#layer2 .layer-meta` | Hardcoded HTML | **KEEP (wire to data)** | Top OW / Top UW computed |
| 2.7 | Footer link text | `#layer2 .open-analysis` | Hardcoded "Open Healthcare deep-dive" | **REPLACE** | "Open full sector analysis" → routes to `landscape:sector` entity (Sprint 2) |

---

## SURFACE 3 — Layer 3 (Portfolio stock card)

Location: `portfolio-funnel-mockup.html:1597–1626`, `portfolio-funnel-mockup.js:520–650`

| # | Field | DOM / JS selector | Source today | Verdict | Replacement |
|---|-------|-------------------|--------------|---------|-------------|
| 3.1 | Verdict headline | `#layer3 .layer-verdict` | Hardcoded HTML | **KEEP (wire to data)** | Top pick + avg conviction computed |
| 3.2 | Lede paragraph | `#layer3 .layer-lede` | Hardcoded HTML | **REPLACE** | GPT-4o-mini lede for `entity_type='stock_landscape'` (Sprint 4 + 6) |
| 3.3 | Stock group labels | `#stockGroups .stock-group-label` | `DATA.stocks[]` (sector-grouped) | **KEEP** | Data-derived |
| 3.4 | Scatter title + caption | `.scatter-title`, `.scatter-caption` | Hardcoded HTML | **KEEP** | Static labels |
| 3.5 | Layer-meta footer | `#layer3 .layer-meta` | Hardcoded HTML | **KEEP (wire to data)** | Avg conviction + catalyst count computed |
| 3.6 | Footer link text | `#layer3 .open-analysis` | Hardcoded "Open UNH deep-dive" | **REPLACE** | "Open full stock analysis" → routes to `landscape:stock` entity (Sprint 4) |

---

## SURFACE 4 — Regime entity deep-dive

Location: `portfolio-funnel-mockup.js:1647–1685` — `ENTITIES['indicator:Regime']`

| # | Field | JS path | Source today | Verdict | Replacement |
|---|-------|---------|--------------|---------|-------------|
| 4.1 | `thesis` | `ENTITIES['indicator:Regime'].thesis` | Hardcoded prose | **KILL** | Replaced by `current_reading` + `identification` + `recommendation` rows from `NARRATIVE_01_Content` (Sprint 1) |
| 4.2 | `business` ("What this indicator measures") | `.business` | Hardcoded definition | **KILL** | Subsumed by `current_reading` (3-line factual paragraph); definition lives in design docs, not on the dashboard |
| 4.3 | "The regime label is the single most important input" stub | embedded in thesis | Hardcoded | **KILL** | Same as 4.1 |
| 4.4 | `drivers[]` | `.drivers` | Hardcoded bullets | **KILL** | Subsumed by `identification.bullets[]` (each carries number + event + **interpretation** + source) |
| 4.5 | `risks[]` | `.risks` | Hardcoded bullets | **KILL** | Subsumed by `recommendation.signposts[]` (trigger + threshold + dated event + action) |
| 4.6 | `snapshot[]` (key metrics) | `.snapshot` | Hardcoded array | **KEEP (wire to data)** | Read from `BETA_10_Daily_macro` + `MACRO_STATE_indicators` |
| 4.7 | `trajectory[]` (history chart) | `.trajectory` | Hardcoded array | **KEEP (wire to data)** | Read from historical regime rows |
| 4.8 | `recentRelease` | `.recentRelease` | Hardcoded link | **KEEP (wire to data)** | Link to latest FOMC/CPI summary from `ALPHA_01_Reports` or `MACRO_STATE_fomc` |

**New blocks added (Sprint 1):**
- `current_reading` — 3 factual lines (deterministic template, no LLM)
- `identification` — 3–5 bullets: `{headline, number, event, interpretation, source}`
- `recommendation` — `{stance, signposts[]}`

---

## SURFACE 5 — Sector entity deep-dive (example: Healthcare)

Location: `portfolio-funnel-mockup.js:1365–1441` — `ENTITIES['sector:Healthcare']`

Applies to all 11 sector entities (once the sector mismatch is resolved — see `sector-decision.md`). Sprint 3 builds 7 missing sector profiles + refactors the 4 existing ones to remove hardcoded mock prose.

| # | Field | JS path | Source today | Verdict | Replacement |
|---|-------|---------|--------------|---------|-------------|
| 5.1 | `thesis` | `.thesis` | Hardcoded prose | **KILL** | 3-block narrative (Sprint 3) |
| 5.2 | `business` (sector definition) | `.business` | Hardcoded | **KEEP** (short definition — write once, refreshed manually per sector) |
| 5.3 | `drivers[]` | `.drivers` | Hardcoded bullets | **KILL** | Subsumed by `identification` |
| 5.4 | `risks[]` | `.risks` | Hardcoded bullets | **KILL** | Subsumed by `recommendation.signposts` |
| 5.5 | `snapshot[]` key metrics | `.snapshot` | Hardcoded | **KEEP (wire to data)** | `SECTOR_FACTORS_daily` |
| 5.6 | `composition[]` | `.composition` | Hardcoded | **KEEP (wire to data)** | `STOCK_FACTORS_daily` filtered by sector + `SIGNAL_01_Assessment` scores |
| 5.7 | `catalysts[]` | `.catalysts` | Hardcoded | **KEEP (wire to data)** | `FUND_02_Earnings` upcoming + press events |
| 5.8 | `peersTable` | `.peersTable` | Hardcoded | **KEEP (wire to data)** | Sector-vs-sector comparison from `SECTOR_FACTORS_daily` |
| 5.9 | `trendNews[]` | `.trendNews` | Hardcoded | **KEEP (wire to data)** | `BETA_12_News_digest` filtered by sector |
| 5.10 | `trendPeriod` | `.trendPeriod` | Hardcoded | **KEEP (compute)** | Regime window since `regime.since` |

**New blocks added (Sprint 3):**
- `current_reading` / `identification` / `recommendation` per sector — vocabulary: *What's moving this sector* / *How to trade it*

---

## SURFACE 6 — Stock entity deep-dive (example: UNH)

Location: `portfolio-funnel-mockup.js:876–980` — `ENTITIES['stock:UNH']`

Applies to all 25 stock entities. Sprint 5 builds 20 missing + refactors the 5 existing to remove hardcoded mock prose.

| # | Field | JS path | Source today | Verdict | Replacement |
|---|-------|---------|--------------|---------|-------------|
| 6.1 | `thesis` | `.thesis` | Hardcoded | **KILL** | Two tabs: long-term + tactical, each with 3-block narrative (Sprint 5) |
| 6.2 | `business` (company description) | `.business` | Hardcoded | **KEEP** (one-shot GPT-5 per ticker, cached indefinitely) |
| 6.3 | `risks[]` | `.risks` | Hardcoded | **KILL** | Subsumed by `recommendation.signposts` |
| 6.4 | `snapshot[]` | `.snapshot` | Hardcoded | **KEEP (wire to data)** | `FUND_01_Fundamentals` |
| 6.5 | `epsHistory[]` | `.epsHistory` | Hardcoded | **KEEP (wire to data)** | `FUND_02_Earnings` |
| 6.6 | `financials{}` 6yr | `.financials` | Hardcoded | **KEEP (wire to data)** | `FUND_01_Fundamentals` annual rollups |
| 6.7 | `filings[].lede` | `.filings[].lede` | Hardcoded prose | **KEEP** (already AI-generated via `qk-report-summarizer` / `form4-summarizer` / `8k-summarizer` → stored in `ALPHA_01_Reports.summary`) |
| 6.8 | `filings[].bullets[]` | `.filings[].bullets` | Hardcoded | **KEEP (wire to data)** | `ALPHA_02_Clusters` |
| 6.9 | `catalysts[]` | `.catalysts` | Hardcoded | **KEEP (wire to data)** | Upcoming `FUND_02_Earnings` + press events |
| 6.10 | `peersTable` | `.peersTable` | Hardcoded | **KEEP (wire to data)** | Same-sector stocks from `STOCK_FACTORS_daily` + `FUND_01_Fundamentals` |
| 6.11 | `news[]` | `.news` | Hardcoded | **KEEP (wire to data)** | `BETA_12_News_digest` filtered by ticker |
| 6.12 | `trendNews[]` | `.trendNews` | Hardcoded | **KEEP (wire to data)** | Curated subset of `BETA_12_News_digest` |
| 6.13 | `trendPeriod` | `.trendPeriod` | Hardcoded label | **KEEP (compute)** | Window-since label |

**New blocks added (Sprint 5) — two tabs inside the narrative block:**
- **Long-term view**: `current_reading_long` + `ident_long` + `rec_long`
- **Tactical (1–2 wk)**: `current_reading_short` + `ident_short` + `rec_short`

---

## SURFACE 7 — Macro tab hero

Location: `portfolio-funnel-mockup.html:1688–1708`

| # | Field | DOM selector | Source today | Verdict | Replacement |
|---|-------|--------------|--------------|---------|-------------|
| 7.1 | Big verdict | `.macro-big-verdict` | Hardcoded HTML | **KEEP (wire to data)** | Same regime label as Layer 1 |
| 7.2 | Big lede | `.macro-big-lede` | Hardcoded HTML | **REPLACE** | **Same row** as Surface 1.2 — pulls `NARRATIVE_01_Content WHERE entity_type='regime' AND field='lede'`. Byte-identical to Layer 1 lede. No second LLM call. |
| 7.3 | Meta grid labels | `.macro-meta-row .k` | Hardcoded | **KEEP** | Static labels |
| 7.4 | Meta grid values | `.macro-meta-row .v` | Hardcoded → `DATA.regime` | **KEEP (wire to data)** | Regime data |
| 7.5 | History chart title | `.feedback-title` | Hardcoded | **KEEP** | Static label |

---

## Consolidated kill list (what goes away in the 3-block replacement)

| Surface | Field | What replaces it |
|---|---|---|
| Regime entity | `thesis`, `business`, `drivers[]`, `risks[]` | `current_reading` + `identification` bullets + `recommendation` stance/signposts |
| Sector entity (×11) | `thesis`, `drivers[]`, `risks[]` | Same 3-block structure, sector-level |
| Stock entity (×25) | `thesis`, `risks[]` | Two tabs: long-term + tactical, each 3-block |
| Layer 1 card | lede paragraph | Generated lede (`field='lede'`) |
| Layer 2 card | lede paragraph + footer link text | Generated landscape lede + repointed link |
| Layer 3 card | lede paragraph + footer link text | Generated landscape lede + repointed link |
| Macro hero | big lede | Same lede row as regime entity |

---

## Consolidated keep list (data-wired fields — touched in Sprints 3 & 5, not by narrator workers)

All `snapshot`, `epsHistory`, `financials`, `composition`, `peersTable`, `news`, `catalysts`, `trendNews`, chart data, verdicts (short tags), meta footers. These migrate from hardcoded JS to D1 queries as part of the full-profile builds, but their content stays structured — no LLM prose.

---

## Interpretation contract (carried into every prompt)

Per user clarification: narrative fields are not just *what moved* + *what to do*. The **interpretation** of the number — what it actually means in context — must be visible in the output. Concretely:

1. Every `identification.bullets[i]` carries `interpretation` as a mandatory field, not a paraphrase of `number`. Example: `number: "Core CPI 3.2%"` + `event: "April print, in-line"` + `interpretation: "Sticky shelter + services inflation means the Fed's reaction function is loosening, not tightening — different from a supply-shock CPI print."` — the interpretation tells the reader what the 3.2% *means* relative to other scenarios.
2. Every `recommendation.stance` carries an explicit edge-vs-consensus clause — that's interpretation, not just positioning.
3. Dashboard rendering must give `interpretation` equal visual weight to `number` and `event`. No truncation, no collapsing it into a parenthetical.
4. Prompt-review checklist: read the output bullet-by-bullet and ask "does this show the model thinking about what the number *means*, or just echoing it?" If only echoing, the prompt is wrong — iterate.

---

## Open threads

- **Layer 4 & 5** are untouched by this audit (future sprints per Appendix B).
- **Report ledes** inside `filings[]` are already AI-generated by the summarizer workers — they sit outside the new NARRATIVE_01_Content table for now. Sprint 7 may consolidate them later; for Sprints 1–6 they're treated as "existing, KEEP".
- **Entity data wiring** (all the KEEP-but-wire-to-data rows) is tracked as part of Sprints 3 and 5 "full profile" work — not a separate sprint, not done by narrator workers.
