# Hedge Portfolio · v2 Pipeline Draft

Diagrams + tables for the data + processing pipeline that would be required to power the v2 dashboard mockup (`dashboard/mockup/index.html`). This is a proposal — no schema, worker boundaries, or prompts are committed yet. The single most important difference from v1 is that **news flows directly into conclusions** for macro, sector, and per-name readings.

## Diagram conventions

| Tag prefix | Shape                   | Layer                | Meaning                                          |
|------------|-------------------------|----------------------|--------------------------------------------------|
| `R<n>`     | rounded `(…)`           | source               | external data source or static config            |
| `C<n>`     | rectangle `[…]`         | code module          | ingestion / fetcher / orchestrator               |
| `T<n>`     | cylinder `[(…)]`        | D1 table             | persisted state — `★` marks **new** in v2         |
| `A<n>`     | hexagon `{{…}}`         | LLM agent            | prompt-based step                                |
| `A<n>`     | subroutine `[[…]]`      | deterministic agent  | SQL / numeric / rule-based step                  |
| `E<n>`     | subroutine `[[…]]`      | engine reuse         | call into a cross-cutting engine (Part 2)        |
| `D<n>`     | parallelogram `[/…/]`   | dashboard field      | rendered element on the v2 mockup                |

Tag numbering resets per cluster.

---

# Part 1 · System overview

```mermaid
flowchart TD
    EXT(External APIs · IR pages · RSS feeds<br/>SEC · BLS · FRED · Finnhub · Polygon · AV<br/>Yahoo · CFTC · CBOE · AAII · Fed):::src

    INGEST[Ingestion layer · v1 unchanged<br/>10-step Node pipeline + cron workers]:::code

    DBraw[(D1 raw + factor tables<br/>v1 schema preserved)]:::db

    subgraph V2enrich [v2 enrichment layer · NEW]
        ENG_A[[Engine A · Theme-tag<br/>news + moves with controlled vocab]]:::agentLLM
        ENG_B[[Engine B · News-driver mapper<br/>news to thesis driver per name]]:::agentLLM
        ENG_C[[Engine C · Multi-source corroborator<br/>cross-source N-source rule]]:::agentDet
        ENG_D[[Engine D · Reading-generation contract<br/>shared prompt + cite-list builder]]:::agentLLM
    end

    DBenr[(D1 enriched tables · ★<br/>NEWS_TAGS · DRIVERS_EVENTS · SOURCE_AGREEMENT)]:::db

    subgraph V2synth [v2 synthesis layer · NEW]
        TR_REGIME[[Regime-state classifier<br/>deterministic + LLM lede]]:::agentDet
        TR_THESIS[[Thesis drafter · macro / sector / name]]:::agentLLM
        TR_REC[[Recommendation generator<br/>per name with reasoning]]:::agentLLM
        TR_LEDE[[Analyst Read synthesizer<br/>cross-section · per panel]]:::agentLLM
        TR_NOTE[[Notes log generator]]:::agentLLM
    end

    DBnar[(D1 narrative tables · ★<br/>NARR_LEDE · NARR_THESIS · NARR_NOTES · NARR_READING)]:::db

    DASH[/Dashboard v2<br/>Today · Map · Book · Convergence · Hedges<br/>Name · Macro · Sector · Tape/]:::ui

    EXT --> INGEST --> DBraw

    DBraw --> ENG_A
    DBraw --> ENG_B
    ENG_A --> DBenr
    ENG_B --> DBenr
    DBenr --> ENG_C
    DBraw --> ENG_C
    ENG_C --> DBenr

    DBraw --> TR_REGIME
    DBenr --> TR_THESIS
    DBraw --> TR_THESIS
    DBenr --> TR_REC
    DBraw --> TR_REC
    TR_THESIS --> TR_LEDE
    TR_REC --> TR_LEDE
    DBenr --> ENG_D
    ENG_D --> TR_THESIS
    ENG_D --> TR_REC
    ENG_D --> TR_LEDE
    ENG_D --> TR_NOTE
    DBenr --> TR_NOTE

    TR_REGIME --> DBnar
    TR_THESIS --> DBnar
    TR_REC --> DBnar
    TR_LEDE --> DBnar
    TR_NOTE --> DBnar

    DBnar --> DASH
    DBenr --> DASH
    DBraw --> DASH

    classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef code fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
    classDef db fill:#fff8e1,stroke:#f57c00,color:#e65100
    classDef agentLLM fill:#fce4ec,stroke:#c2185b,color:#880e4f
    classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121
    classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

| Layer            | v1 today                                        | v2 adds                                                                        |
|------------------|-------------------------------------------------|--------------------------------------------------------------------------------|
| Ingestion        | 10-step Node + cron workers                      | unchanged                                                                       |
| Raw + factor     | ~40 D1 tables                                    | unchanged                                                                       |
| Enrichment       | Per-name news funnel · macro-intel summary       | Theme-tag · News-driver mapper · Multi-source corroborator                     |
| Synthesis        | Per-entity narrator (3-stage)                    | Reading-engine contract · Thesis drafter · Recommendation · Notes · Read       |
| Narrative tables | `NARRATIVE_01_Content`                           | `NARR_LEDE` · `NARR_THESIS` · `NARR_NOTES` · `NARR_READING` (5 reading types)   |

---

# Part 2 · Cross-cutting engines

## Engine A · Theme-tag · news + moves with controlled vocabulary

Foundation for the Tape and for theme-aware readings. Every news item and every >2σ move gets tagged from a small fixed vocabulary so colors stay scannable.

```mermaid
flowchart TD
    R1(NEWS_RAW · v1<br/>SEC · AV · trade-press · IR pages):::src
    R2(PRICE_01_Daily · v1<br/>portfolio + cross-asset bars):::src
    R3(THEMES_VOCAB · ★<br/>controlled list · ~20 active themes):::src

    C1[news-tag-worker · ★<br/>polls NEWS_RAW · 15min tick]:::code
    C2[move-detector · ★<br/>flags moves greater than 2 sigma vs trailing vol]:::code

    A1{{tag-news<br/>LLM · constrained-vocab output}}:::agentLLM
    A2[[move-theme-matcher<br/>scores news-move adjacency<br/>tier 1 deterministic · tier 2 LLM]]:::agentDet
    A3[[unexplained-flagger<br/>moves with no tier-1 OR tier-2 match]]:::agentDet

    T1[(NEWS_TAGS · ★<br/>news_id · themes · tickers · mag · src)]:::db
    T2[(MOVES_TAGS · ★<br/>ticker · date · move · themes · status)]:::db

    E_DASH[/Tape news column<br/>Tape moves column<br/>Tape unexplained sub-column/]:::ui

    R1 --> C1 --> A1
    R3 --> A1
    A1 --> T1

    R2 --> C2 --> T2
    T1 --> A2
    T2 --> A2
    A2 --> T2
    T2 --> A3
    A3 --> T2

    T1 --> E_DASH
    T2 --> E_DASH

    classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef code fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
    classDef db fill:#fff8e1,stroke:#f57c00,color:#e65100
    classDef agentLLM fill:#fce4ec,stroke:#c2185b,color:#880e4f
    classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121
    classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

| Tag | Notes                                                                                           |
|-----|-------------------------------------------------------------------------------------------------|
| R3  | Hand-curated, ~20 themes max, versioned. Examples: `tariffs`, `oil`, `ai-capex`, `rates`, `china`, `earnings`, `ev-transition`, `geopolitics`. |
| A1  | LLM tag step. Output: `{ themes, tickers, mag, dir }`. Constrained vocabulary — themes outside R3 are rejected. |
| A2  | Tier 1 (deterministic): for each move, find news in prior 14d touching same ticker with mag > 0.3. Tier 2 (LLM): if Tier 1 finds nothing, propose a likely theme. |
| A3  | A move is **unexplained** when no Tier-1 OR Tier-2 match exists. Surfaced, not hidden.            |
| T1  | The foundation table for the Tape and for all news-aware readings.                                |
| T2  | One row per >2σ move. Status: `tagged-tier-1` / `tagged-tier-2` / `unexplained`.                  |

| Inputs                    | Processing                                | Outputs (mockup fields)                            |
|---------------------------|-------------------------------------------|----------------------------------------------------|
| News raw text             | LLM tag (constrained vocab)               | `NEWS_TAGS` rows                                   |
| Price daily bars + vol    | Move detector                             | `MOVES_TAGS` rows                                  |
| Theme vocabulary          | Tier 1 + Tier 2 matcher                   | Tape news + moves columns                          |
|                           | Unexplained flagger                       | Tape unexplained sub-column                        |

---

## Engine B · News-driver mapper · news → thesis driver per name

Makes claims like *"DC growth confirming +4 events"* or *"third independent inventory signal"* into deterministic counts rather than LLM imagination.

```mermaid
flowchart TD
    R1(NARR_THESIS · ★<br/>per name · 3-5 drivers + tripwires<br/>locked or AI-drafted):::src
    R2(NEWS_TAGS · from Engine A):::src
    R3(FILING_DIFF_LATEST · ★<br/>10-K and 10-Q risk factor + MDA diffs):::src
    R4(EARNINGS_CALL_TONE · ★<br/>call transcript NLP):::src

    A1{{driver-mapper<br/>LLM · for each event ·<br/>decide CONFIRM/WEAKEN/INVALIDATE per driver}}:::agentLLM
    A2[[driver-counts-aggregator<br/>30d window · per driver · per status]]:::agentDet
    A3[[thesis-tag-classifier<br/>state machine · INTACT/DRIFT/WEAK/BROKEN]]:::agentDet

    T1[(DRIVERS_EVENTS · ★<br/>name · event_id · driver_id · status · mag)]:::db
    T2[(DRIVERS_AGG · ★<br/>name · driver_id · 30d counts)]:::db

    D1[/Drivers list<br/>CONFIRM x4 · WEAKEN x2 etc/]:::ui
    D2[/Aggregate drift number<br/>−0.4 etc/]:::ui
    D3[/Thesis tag<br/>INTACT · DRIFT · WEAK · BROKEN/]:::ui

    R1 --> A1
    R2 --> A1
    R3 --> A1
    R4 --> A1
    A1 --> T1
    T1 --> A2 --> T2
    T2 --> A3
    R1 --> A3

    T2 --> D1
    T2 --> D2
    A3 --> D3

    classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef db fill:#fff8e1,stroke:#f57c00,color:#e65100
    classDef agentLLM fill:#fce4ec,stroke:#c2185b,color:#880e4f
    classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121
    classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

| Tag | Notes                                                                                       |
|-----|---------------------------------------------------------------------------------------------|
| A1  | Inputs: locked driver list of the name + the news/filing/call event. Output: `{ driver_id, status, mag, evidence_quote }`. Items not mapping to any driver are dropped. |
| A2  | Deterministic 30-day rolling aggregator. Produces the `CONFIRM ×4 / WEAKEN ×2` counts.       |
| A3  | Rule-based state machine. Any INVALIDATE → `BROKEN`; WEAKEN with no offsetting CONFIRMS → `WEAK`; ≥ 2 drivers softening → `DRIFT`; else `INTACT`. |
| T1  | One row per (name, event, driver). Stores the evidence quote so the dashboard can show *why* a count moved. |

---

## Engine C · Multi-source corroborator · the N-source rule

A note that says "third independent signal" is only honest if the system actually checks across sources. Pure-deterministic guard against fabrication.

```mermaid
flowchart TD
    R1(DRIVERS_EVENTS · from Engine B):::src
    R2(FUND_01_Fundamentals · v1<br/>indicator series · DIO · GM · etc):::src
    R3(FILING_DIFF_LATEST · ★):::src
    R4(EARNINGS_CALL_TONE · ★):::src
    R5(MOVES_TAGS · from Engine A):::src

    A1[[topic-clusterer<br/>group events touching same topic<br/>same driver_id OR same theme + name]]:::agentDet
    A2[[source-canonicalizer<br/>collapse NVDA-10Q + NVDA-MDA = 1 source]]:::agentDet
    A3[[corroboration-scorer<br/>N unique source-types in 30d<br/>flag at N greater or equal 3]]:::agentDet

    T1[(SOURCE_AGREEMENT · ★<br/>topic_id · source_count · sources · last_event)]:::db

    D1[/Notes prose · third independent X/]:::ui
    D2[/Driver row badge<br/>WEAKEN x2 warn for inventory/]:::ui

    R1 --> A1
    R2 --> A1
    R3 --> A1
    R4 --> A1
    R5 --> A1
    A1 --> A2 --> A3 --> T1

    T1 --> D1
    T1 --> D2

    classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef db fill:#fff8e1,stroke:#f57c00,color:#e65100
    classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121
    classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

| Tag | Notes                                                                                                  |
|-----|--------------------------------------------------------------------------------------------------------|
| A1  | Joins items across `DRIVERS_EVENTS`, `FUND_01`, `FILING_DIFF_LATEST`, `EARNINGS_CALL_TONE`, `MOVES_TAGS`. |
| A2  | Filings + their MDA passages = one source; trade press from the same outlet across days = one source. Prevents N-count over-counting tightly correlated reports. |
| A3  | Counts unique canonical sources per topic over 30d. Topics with N ≥ 3 are eligible for "multi-source" claims in readings. |

The corroboration is computed *before* the synthesis layer. Synthesis prompts are *given* the topic + source list and only write prose around it.

---

## Engine D · Reading-generation contract · shared prompt + cite-list builder

Every "reading" in the v2 mockup (per-section + Analyst Read lede) is produced by this engine. Contract enforces the writing principles in `DASHBOARD_AI_INTEGRATION.md` Section 16.

```mermaid
flowchart TD
    R1(Reading template · ★<br/>per reading type:<br/>job · forbidden behaviors · cite-list shape):::src
    R2(Section data · ★<br/>structured input for the section<br/>val table · fund series · etc):::src
    R3(Cross-section pointers · ★<br/>links to adjacent readings<br/>val · fund · thesis):::src
    R4(SOURCE_AGREEMENT · from Engine C):::src

    A1[[cite-list-builder<br/>assemble all sources for this scope<br/>tables · indicator series · events · filings]]:::agentDet
    A2[[freshness-checker<br/>is any input stale beyond reading-type SLA]]:::agentDet

    A3{{reading-LLM<br/>job-constrained prompt<br/>conclusion-style output<br/>cite-line at footer}}:::agentLLM

    A4[[output-validator<br/>regex on last sentence:<br/>does it carry a verdict word]]:::agentDet

    T1[(NARR_READING · ★<br/>entity · section · text · sources · ts)]:::db

    D1[/Foldable reading<br/>indigo chip body/]:::ui

    R1 --> A3
    R2 --> A1
    R3 --> A3
    R4 --> A1
    A1 --> A3
    A2 -.gate.-> A3
    A3 --> A4
    A4 --> T1
    T1 --> D1

    classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef db fill:#fff8e1,stroke:#f57c00,color:#e65100
    classDef agentLLM fill:#fce4ec,stroke:#c2185b,color:#880e4f
    classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121
    classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

Reading template fields per reading type:

| Template field          | Example for Fundamentals reading                                                              |
|-------------------------|-----------------------------------------------------------------------------------------------|
| **Job**                 | Land on a company verdict — peaking / accelerating / harvesting / transitioning / declining   |
| **Must end on**         | A verdict label                                                                                |
| **Forbidden**           | Listing comma-separated values · Wall Street metaphors · uncited claims                       |
| **Required cross-refs** | Thesis driver-N · Valuation reading                                                            |
| **Cite-list shape**     | 20q series IDs + composite scores + cross-references                                          |
| **Output validator**    | Last sentence must contain one of: *peaking, accelerating, harvesting, intact, watch, etc.*   |

---

# Part 3 · Surface clusters

## Cluster 1 · Today notification surface

Notification only — no AI essay. Every tile is a deterministic count or list; clicking opens the Tape pre-filtered.

```mermaid
flowchart TD
    R1(MACRO_STATE_calendar · v1):::src
    R2(MACRO_STATE_indicators · v1<br/>todays prints):::src
    R3(POSITION_01_Daily · v1):::src
    R4(NEWS_TAGS · from Engine A):::src
    R5(MOVES_TAGS · from Engine A):::src
    R6(REGIME_STATE · from Cluster 3):::src
    R7(PRICE_01_Daily · SPY):::src

    A1[[attention-scorer<br/>per name · 0 to 100<br/>thesis x val x catalyst x drift]]:::agentDet
    A2[[catalyst-window-filter<br/>events less or equal 14d on held names]]:::agentDet
    A3[[news-drift-counter<br/>24h · CONFIRM / WEAKEN / INVALIDATE on held names]]:::agentDet
    A4[[tripwire-state<br/>0 of 4 fired · or which]]:::agentDet
    A5[[spy-overnight<br/>last close to next open delta]]:::agentDet

    D1[/Today header<br/>regime · tripwires · SPY o/n · counts/]:::ui
    D2[/ATTENTION tile<br/>top-3 names + reason + att/]:::ui
    D3[/CATALYSTS tile<br/>5 events less or equal 14d/]:::ui
    D4[/MACRO TODAY tile<br/>scheduled prints today/]:::ui
    D5[/NEWS DRIFT tile<br/>24h aggregate counts/]:::ui
    D6[/Open Tape link<br/>+ per-tile mini tape link/]:::ui

    R3 --> A1
    R4 --> A1
    R1 --> A2
    R3 --> A2
    R4 --> A3
    R5 --> A3
    R6 --> A4
    R7 --> A5

    R6 --> D1
    A4 --> D1
    A5 --> D1
    A1 --> D2
    A2 --> D3
    R2 --> D4
    A3 --> D5
    R4 -.scope.-> D6
    R5 -.scope.-> D6

    classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121
    classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

| Inputs                                            | Processing                                  | Outputs                                |
|---------------------------------------------------|---------------------------------------------|----------------------------------------|
| Position book · thesis · val z · drift             | Attention scorer                            | ATTENTION tile rows                    |
| Calendar · held tickers                            | Catalyst window filter                      | CATALYSTS tile rows                    |
| Macro release schedule for today                   | Direct fetch                                | MACRO TODAY tile rows                  |
| Tagged news + moves over 24h on held names         | News-drift counter                          | NEWS DRIFT counts                      |
| Regime + tripwires + SPY o/n                       | Tripwire monitor · SPY o/n calc             | Today header state strip               |
| Theme + ticker scope per tile                      | (passthrough)                               | Per-tile + global Tape links           |

The only AI involvement is upstream (Engine A's tagging). The Today surface itself is deterministic and re-renders on every page load.

---

## Cluster 2 · Tape slide-out

Pure presentation of Engine A output, with filter chips on top. **No causal AI text in this surface.**

```mermaid
flowchart TD
    R1(NEWS_TAGS · from Engine A):::src
    R2(MOVES_TAGS · from Engine A):::src
    R3(POSITION_01_Daily · v1<br/>held-tickers set):::src
    R4(THEMES_VOCAB · ★):::src

    A1[[tape-filter-resolver<br/>scope: all · held · theme · ticker · sector]]:::agentDet
    A2[[news-renderer<br/>14d window · sort by mag desc]]:::agentDet
    A3[[moves-renderer<br/>14d window · sort by date desc]]:::agentDet
    A4[[unexplained-renderer<br/>moves with status unexplained]]:::agentDet

    D1[/Filter chip bar<br/>All · Held · 6 themes/]:::ui
    D2[/News column<br/>date · theme tags · headline · src · tickers/]:::ui
    D3[/Moves column<br/>date · theme tags · ticker desc · magnitude/]:::ui
    D4[/Unexplained sub-column<br/>flagged for investigation/]:::ui
    D5[/Trust contract footer/]:::ui

    R4 --> D1
    R1 --> A1
    R2 --> A1
    R3 --> A1
    A1 --> A2 --> D2
    A1 --> A3 --> D3
    A1 --> A4 --> D4

    classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121
    classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

| Inputs                       | Processing                       | Outputs                                       |
|------------------------------|----------------------------------|-----------------------------------------------|
| Tagged news + moves (14d)     | Filter resolver · scope-aware     | News + Moves columns                          |
| Held-tickers set              | Held-only sub-filter              |                                                |
| Theme vocabulary              | Filter chip rendering             | Filter chip bar                                |
| Move status (unexplained)     | Unexplained renderer              | Unexplained moves sub-column                   |

---

## Cluster 3 · Map · regime state badge + sector + cross-asset

Big shift from v1: the MAP READ essay is gone; in its place a single-line **regime state badge** with all-deterministic state. Per-panel readings stay (foldable, Engine D).

```mermaid
flowchart TD
    R1(MACRO_STATE_indicators · v1):::src
    R2(SECTOR_FACTORS_daily · v1):::src
    R3(POSITION_01_Daily · v1):::src
    R4(PRICE_01_Daily · cross-asset · v1):::src
    R5(REGIME_VOCAB · ★<br/>label set · tripwire thresholds):::src

    A1[[regime-classifier<br/>deterministic + 1 LLM call for label-confidence]]:::agentDet
    A2[[tripwire-monitor<br/>4 thresholds · 0 of 4 fired status]]:::agentDet
    A3[[sector-composite-scorer<br/>Fit + Earn + Val + RS + Beat<br/>v1 logic carried forward]]:::agentDet
    A4[[holdings-vs-target<br/>per-sector · drift in pp]]:::agentDet
    A5[[rrg-quadrant<br/>JdK ratio x momentum]]:::agentDet
    A6[[cross-asset-snapshot<br/>VIX · OAS · yields · FX · commodities]]:::agentDet

    E_D1[[Engine D · regime reading]]:::agentLLM
    E_D2[[Engine D · sector reading]]:::agentLLM
    E_D3[[Engine D · cross-asset reading]]:::agentLLM

    T1[(REGIME_STATE · ★<br/>label · conf · tripwires_fired · audit_flag)]:::db

    D1[/Regime state badge<br/>label · conf · tripwires · audit-warn/]:::ui
    D2[/Regime card<br/>indicators · 12m history · reading/]:::ui
    D3[/Sector stance table<br/>11 rows · audit-flag · reading/]:::ui
    D4[/Cross-asset panel<br/>16 metrics · RRG · reading/]:::ui

    R1 --> A1
    R5 --> A1
    R1 --> A2
    R5 --> A2
    R2 --> A3
    R3 --> A4
    R2 --> A5
    R4 --> A6

    A1 --> T1
    A2 --> T1

    T1 --> D1
    T1 --> D2
    A1 --> E_D1 --> D2
    A3 --> D3
    A4 --> D3
    A3 --> E_D2 --> D3
    A6 --> D4
    A5 --> D4
    A6 --> E_D3 --> D4

    classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef db fill:#fff8e1,stroke:#f57c00,color:#e65100
    classDef agentLLM fill:#fce4ec,stroke:#c2185b,color:#880e4f
    classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121
    classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

| Inputs                          | Processing                                          | Outputs                                          |
|---------------------------------|-----------------------------------------------------|--------------------------------------------------|
| 12 macro indicators · vocab      | Regime classifier · tripwire monitor                 | Regime state badge · Regime card                 |
| Sector factors · book            | Composite scorer · holdings-vs-target                | Sector stance table · audit-flag                 |
| Cross-asset prices               | Snapshot · RRG quadrant                              | Cross-asset panel · RRG note                     |
| Engine D                         | Per-panel reading generation                         | 3 foldable readings                              |

---

## Cluster 4 · Convergence

8-signal alignment per name. Action verb when ≥ 3 align same direction.

```mermaid
flowchart TD
    R1(NARR_THESIS · ★<br/>thesis tag per name):::src
    R2(VALUATION_FACTORS · v1<br/>z-scores per multiple):::src
    R3(SECTOR_FACTORS_daily · v1):::src
    R4(MACRO_STATE_calendar · v1):::src
    R5(EPS_REVISIONS · v1):::src
    R6(NEWS_TAGS · from Engine A):::src
    R7(PRICE_01_Daily · v1):::src
    R8(POSITION_01_Daily · v1):::src

    A1[[8-signal-aligner<br/>thesis · val · sector · catalyst<br/>estimates · news drift · momentum · drift]]:::agentDet
    A2[[action-generator<br/>ADD or TRIM verb + magnitude<br/>+ risk note]]:::agentDet
    E_D1[[Engine D · convergence reading]]:::agentLLM

    D1[/Convergence card<br/>8 signals · suggested action · risk note/]:::ui
    D2[/Foldable reading per card/]:::ui
    D3[/Watchlist of names approaching convergence/]:::ui

    R1 --> A1
    R2 --> A1
    R3 --> A1
    R4 --> A1
    R5 --> A1
    R6 --> A1
    R7 --> A1
    R8 --> A1
    A1 --> A2 --> D1
    A1 --> E_D1 --> D2
    A1 --> D3

    classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef agentLLM fill:#fce4ec,stroke:#c2185b,color:#880e4f
    classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121
    classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

| Inputs                                            | Processing                            | Outputs                                  |
|---------------------------------------------------|---------------------------------------|------------------------------------------|
| 8 signal sources                                   | Aligner · firing-count                | Card signal list                          |
| Aligner output                                     | Action generator                       | Verb · magnitude · risk note              |
| Engine D                                           | Convergence reading                    | Foldable per-card reading                 |
| Aligner output (≥ 2 of 8)                          | Watchlist filter                       | Approaching-convergence footer            |

---

## Cluster 5 · Hedges

Position aggregation + beta-adjusted exposure. Light surface.

```mermaid
flowchart TD
    R1(POSITION_01_Daily · v1):::src
    R2(BETAS_LATEST · v1):::src
    R3(HEDGE_LEDGER · ★<br/>active hedges · macro · sector · pair):::src

    A1[[exposure-calculator<br/>long · short · gross · net dollar]]:::agentDet
    A2[[beta-adjusted-exposure<br/>net · weighted by beta]]:::agentDet
    A3[[hedge-cover-pct<br/>hedge notional divided by book gross]]:::agentDet

    E_D1[[Engine D · hedge reading]]:::agentLLM

    D1[/4 KPIs<br/>net dollar · net beta-adj · gross · hedge cover/]:::ui
    D2[/Hedge ledger table<br/>kind · position · notional · cost · days · why-on/]:::ui
    D3[/Foldable reading/]:::ui

    R1 --> A1
    R1 --> A2
    R2 --> A2
    R3 --> A3
    A1 --> D1
    A2 --> D1
    A3 --> D1
    R3 --> D2
    A1 --> E_D1
    A2 --> E_D1
    R3 --> E_D1
    E_D1 --> D3

    classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef agentLLM fill:#fce4ec,stroke:#c2185b,color:#880e4f
    classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121
    classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

---

## Cluster 6 · Name slide-out

The biggest surface — and where the news-into-conclusions wiring matters most. Lede + 5 per-section readings + thesis + recommendation + notes.

```mermaid
flowchart TD
    R1(POSITION_01_Daily · v1):::src
    R2(VALUATION_FACTORS · v1):::src
    R3(FUND_01_Fundamentals · v1):::src
    R4(EPS_REVISIONS + RATINGS · v1):::src
    R5(PEER_COMPS · v1):::src
    R6(SECTOR_FACTORS · v1):::src
    R7(REGIME_STATE · from Cluster 3):::src
    R8(NEWS_TAGS · from Engine A):::src
    R9(DRIVERS_EVENTS · from Engine B):::src
    R10(DRIVERS_AGG · from Engine B):::src
    R11(SOURCE_AGREEMENT · from Engine C):::src
    R12(FILING_DIFF_LATEST · ★):::src
    R13(EARNINGS_CALL_TONE · ★):::src

    E_D_VAL[[Engine D · Valuation reading]]:::agentLLM
    E_D_FUN[[Engine D · Fundamentals reading]]:::agentLLM
    E_D_EST[[Engine D · Estimates reading]]:::agentLLM
    E_D_DRI[[Engine D · Aggregate Drift reading]]:::agentLLM
    E_D_PER[[Engine D · Peer Comps reading]]:::agentLLM

    A1{{Thesis drafter<br/>multi-source · per name<br/>drivers + tripwires + statement}}:::agentLLM
    A2{{Recommendation generator<br/>action + magnitude + reasoning}}:::agentLLM
    A3{{Notes generator<br/>per material event + locked thesis}}:::agentLLM
    A4{{Analyst Read synthesizer<br/>cross-section · 2 paragraphs}}:::agentLLM

    T1[(NARR_THESIS · ★<br/>per name · v · locked · drivers · tripwires)]:::db
    T2[(NARR_REC · ★<br/>per name · action · magnitude · prose)]:::db
    T3[(NARR_NOTES · ★<br/>per name · event · timestamp · sources · body)]:::db
    T4[(NARR_LEDE · ★<br/>per name · 2-paragraph synthesis)]:::db
    T5[(NARR_READING · ★<br/>per name x section · text · sources)]:::db

    D1[/Analyst Read · plain prose lede/]:::ui
    D2[/Thesis statement · plain prose/]:::ui
    D3[/Drivers · 4 with confirm or weaken counts/]:::ui
    D4[/Tripwires · 4 with thresholds + status/]:::ui
    D5[/Recommendation · action + reasoning/]:::ui
    D6[/Notes · plain log with sources/]:::ui
    D7[/5 foldable readings · indigo chips/]:::ui

    R2 --> E_D_VAL --> T5
    R3 --> E_D_VAL
    R3 --> E_D_FUN --> T5
    R4 --> E_D_EST --> T5
    R5 --> E_D_PER --> T5
    R6 --> E_D_PER
    R8 --> E_D_DRI --> T5
    R10 --> E_D_DRI
    R12 --> E_D_DRI

    R10 --> A1
    R3 --> A1
    R12 --> A1
    R13 --> A1
    A1 --> T1
    R10 --> D3
    T1 --> D3
    T1 --> D4
    T1 --> D2

    T1 --> A2
    R2 --> A2
    R1 --> A2
    R7 --> A2
    A2 --> T2 --> D5

    R8 --> A3
    R11 --> A3
    R12 --> A3
    R13 --> A3
    R3 --> A3
    A3 --> T3 --> D6

    T5 --> A4
    T1 --> A4
    T2 --> A4
    A4 --> T4 --> D1

    T5 --> D7

    classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef db fill:#fff8e1,stroke:#f57c00,color:#e65100
    classDef agentLLM fill:#fce4ec,stroke:#c2185b,color:#880e4f
    classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121
    classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

| Output (mockup field)            | Inputs                                                                          | Processing                          |
|----------------------------------|---------------------------------------------------------------------------------|-------------------------------------|
| Analyst Read (plain lede)         | All per-section readings · thesis · recommendation                               | A4 cross-section synthesizer         |
| Thesis statement (plain)          | Driver counts · filing diffs · call tone · fundamentals                           | A1 Thesis drafter                    |
| Drivers (CONFIRM ×N etc.)         | `DRIVERS_AGG` (deterministic counts)                                             | Engine B counts                      |
| Tripwires (status)                | Driver thresholds (locked) · current values                                       | Deterministic threshold check         |
| Recommendation                    | Thesis · valuation · position vs target · regime fit                              | A2 Recommendation generator          |
| Notes (plain log)                 | Tagged events · multi-source agreement · filing/call deltas                       | A3 Notes generator                   |
| Valuation reading                 | 12 multiples + DCF + cross-refs to Fundamentals + Peer Comps                      | Engine D (Valuation template)         |
| Fundamentals reading              | 20q series + composite scores + cross-ref to Thesis driver-N                       | Engine D (Fundamentals template)       |
| Estimates reading                 | Consensus + revisions + 8q surprise + PT dispersion                                | Engine D (Estimates template)          |
| Aggregate Drift reading           | Tagged events + driver counts + cross-refs to Thesis + Fundamentals                | Engine D (Drift template)             |
| Peer Comps reading                | Peer rows + sector median + book pair-hedge context                                | Engine D (Peer template)              |

**News dependency:** 4 of the 7 AI outputs above (Thesis, Notes, Aggregate Drift reading, Analyst Read) collapse to nothing if news is not wired into Engine B.

---

## Cluster 7 · Macro slide-out

Macro thesis + drivers + tripwires + signposts + positioning + notes, with the same plain-format treatment as the Name panel. Tape strip on top is filtered to macro themes.

```mermaid
flowchart TD
    R1(MACRO_STATE_indicators · v1):::src
    R2(MACRO_STATE_calendar · v1):::src
    R3(MACRO_STATE_fomc · v1):::src
    R4(REGIME_STATE · from Cluster 3):::src
    R5(NEWS_TAGS · macro themes · from Engine A):::src
    R6(THEMES_VOCAB · macro subset):::src
    R7(POSITION_01_Daily · v1):::src

    A1{{Macro thesis drafter<br/>indicators + FOMC + news themes<br/>drivers + tripwires + statement}}:::agentLLM
    A2[[macro-tripwire-monitor<br/>4 thresholds · current state]]:::agentDet
    A3[[signpost-builder<br/>30d forward calendar with thresholds]]:::agentDet
    A4{{Macro recommendation<br/>net stance · style tilt · hedge sizing}}:::agentLLM

    E_TAPE[[Tape strip · filtered to macro themes]]:::agentDet
    E_D[[Engine D · Macro Read]]:::agentLLM
    A5{{Notes generator · macro events}}:::agentLLM

    T1[(NARR_THESIS · macro entity)]:::db
    T2[(NARR_NOTES · macro entity)]:::db
    T3[(NARR_LEDE · macro entity)]:::db

    D1[/Tape strip/]:::ui
    D2[/Macro Analyst Read · plain prose/]:::ui
    D3[/Macro Thesis · plain prose + meta/]:::ui
    D4[/Drivers + Tripwires/]:::ui
    D5[/Signposts · next 30d/]:::ui
    D6[/Positioning implication/]:::ui
    D7[/Notes · plain log/]:::ui

    R5 --> E_TAPE --> D1
    R6 --> D1

    R1 --> A1
    R3 --> A1
    R5 --> A1
    R4 --> A1
    A1 --> T1 --> D3
    T1 --> D4
    R1 --> A2
    A2 --> D4

    R2 --> A3
    R1 --> A3
    A3 --> D5

    R7 --> A4
    R4 --> A4
    A1 --> A4
    A4 --> D6

    R5 --> A5
    R1 --> A5
    A5 --> T2 --> D7

    T1 --> E_D
    A4 --> E_D
    R5 --> E_D
    E_D --> T3 --> D2

    classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef db fill:#fff8e1,stroke:#f57c00,color:#e65100
    classDef agentLLM fill:#fce4ec,stroke:#c2185b,color:#880e4f
    classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121
    classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

| Output (mockup field)            | Inputs                                                          | Processing                  |
|----------------------------------|------------------------------------------------------------------|-----------------------------|
| Tape strip                        | News + moves filtered to macro themes                             | Engine A passthrough         |
| Macro Analyst Read                | Thesis · positioning · macro news drift                            | Engine D (Macro Read)        |
| Macro Thesis                      | Indicators · FOMC · regime state · macro-themed news               | A1 Macro thesis drafter      |
| Drivers + Tripwires               | Threshold table + current values                                   | A2 deterministic monitor     |
| Signposts (next 30d)              | Forward calendar + indicator thresholds                             | A3 signpost builder           |
| Positioning implication           | Thesis + position book + hedge ledger                               | A4 Macro recommendation      |
| Notes (plain log)                 | Macro-themed news + indicator prints                                | A5 Notes generator            |

**News dependency:** macro thesis claims like *"stagflation-light flavor strengthening"* or *"HY OAS tightened — single largest piece of evidence the regime is not the front-edge of a recession"* are interpretations of indicator series in light of macro news. Without `NEWS_TAGS` filtered to macro themes, the thesis drafter has no way to surface "FOMC speakers more hawkish" or "tariff escalation" as inputs.

---

## Cluster 8 · Sector slide-out

Same structural treatment as macro, per sector. Drivers/tripwires are sector-specific (Energy: WTI, OPEC discipline, US rig count, EM demand). Implementation table maps thesis → per-name actions.

```mermaid
flowchart TD
    R1(SECTOR_FACTORS_daily · v1):::src
    R2(MACRO_STATE_indicators · v1<br/>relevant subset):::src
    R3(NEWS_TAGS · sector + theme · from Engine A):::src
    R4(POSITION_01_Daily · v1):::src
    R5(THEMES_VOCAB · sector subset):::src
    R6(NARR_THESIS · per-name · from Cluster 6):::src
    R7(REGIME_STATE · from Cluster 3):::src

    A1{{Sector thesis drafter<br/>composite + sector news + commodity macro inputs<br/>drivers + tripwires}}:::agentLLM
    A2[[sector-tripwire-monitor]]:::agentDet
    A3[[implementation-table<br/>per name · current · target · drift · action]]:::agentDet
    A4[[pair-hedge-suggester<br/>internal pairs from sector universe]]:::agentDet

    E_TAPE[[Tape strip · filtered to sector + theme]]:::agentDet
    E_D[[Engine D · Sector Read]]:::agentLLM
    A5{{Notes generator · sector events}}:::agentLLM

    T1[(NARR_THESIS · sector entity)]:::db
    T2[(NARR_NOTES · sector entity)]:::db
    T3[(NARR_LEDE · sector entity)]:::db

    D1[/Tape strip · sector-filtered/]:::ui
    D2[/Sector Analyst Read · plain prose/]:::ui
    D3[/Sector Thesis · plain prose + meta/]:::ui
    D4[/Drivers + Tripwires/]:::ui
    D5[/Implementation table<br/>3-5 names · action per name/]:::ui
    D6[/Pair or hedge ideas/]:::ui

    R3 --> E_TAPE --> D1
    R5 --> D1

    R1 --> A1
    R2 --> A1
    R3 --> A1
    R7 --> A1
    A1 --> T1
    T1 --> D3
    T1 --> D4
    R1 --> A2 --> D4

    R4 --> A3
    R6 --> A3
    A1 --> A3
    A3 --> D5

    R4 --> A4
    R1 --> A4
    A4 --> D6

    R3 --> A5
    R1 --> A5
    A5 --> T2

    T1 --> E_D
    R3 --> E_D
    A3 --> E_D
    E_D --> T3 --> D2

    classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    classDef db fill:#fff8e1,stroke:#f57c00,color:#e65100
    classDef agentLLM fill:#fce4ec,stroke:#c2185b,color:#880e4f
    classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121
    classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

| Output (mockup field)             | Inputs                                                       | Processing                     |
|-----------------------------------|--------------------------------------------------------------|--------------------------------|
| Tape strip · sector-filtered       | Sector tickers + sector themes                                | Engine A passthrough            |
| Sector Analyst Read                | Thesis · implementation · per-name convergence cross-ref       | Engine D (Sector Read)          |
| Sector Thesis                      | Sector composite · macro relevant subset · sector-themed news  | A1 Sector thesis drafter        |
| Drivers + Tripwires                | Per-sector thresholds + current values                          | A2 deterministic monitor        |
| Implementation table               | Per-name positions + per-name thesis state                       | A3 deterministic table builder    |
| Pair / hedge ideas                 | Sector universe + book composition                               | A4 deterministic suggester       |

**News dependency:** the Energy sector thesis claim that *"OPEC+ discipline + capital-return-focused US shale management together support a higher floor under WTI than consensus models"* requires news — OPEC+ outcomes are filings, US shale capex discipline is news + earnings calls, EM stockpiling is news. Without sector-themed news in `NEWS_TAGS`, the thesis collapses to "WTI is at $78".

---

# Part 4 · Pipeline tree summary

```mermaid
flowchart LR
    subgraph external [External]
      EXT(News feeds<br/>Filings · IR<br/>FRED / BLS<br/>Polygon / AV)
    end

    subgraph v1 [v1 raw + factor · unchanged]
      RAW[(NEWS_RAW · PRICE · MACRO<br/>POSITION · VALUATION<br/>FUND · EPS_REVISIONS<br/>SECTOR_FACTORS)]
    end

    subgraph engines [v2 cross-cutting engines]
      EA[Engine A<br/>Theme-tag]
      EB[Engine B<br/>News-driver mapper]
      EC[Engine C<br/>Multi-source corroborator]
      ED[Engine D<br/>Reading-generation]
    end

    subgraph enrich [v2 enriched tables]
      ENR[(NEWS_TAGS<br/>MOVES_TAGS<br/>DRIVERS_EVENTS<br/>DRIVERS_AGG<br/>SOURCE_AGREEMENT<br/>FILING_DIFF_LATEST<br/>EARNINGS_CALL_TONE)]
    end

    subgraph synth [v2 synthesis]
      THES[Thesis drafter<br/>name · macro · sector]
      REC[Recommendation gen]
      NOTE[Notes gen]
      LEDE[Analyst Read synth]
      REGIME[Regime classifier]
    end

    subgraph narr [v2 narrative tables]
      NAR[(NARR_THESIS<br/>NARR_REC<br/>NARR_NOTES<br/>NARR_LEDE<br/>NARR_READING<br/>REGIME_STATE)]
    end

    subgraph dash [v2 dashboard surfaces]
      direction TB
      S1[Today]
      S2[Tape]
      S3[Map]
      S4[Convergence]
      S5[Hedges]
      S6[Name]
      S7[Macro]
      S8[Sector]
      S9[Book]
    end

    EXT --> RAW
    RAW --> EA --> ENR
    RAW --> EB --> ENR
    RAW --> EC
    ENR --> EC --> ENR

    RAW --> THES
    ENR --> THES
    ENR --> REC
    RAW --> REC
    ENR --> NOTE
    ENR --> ED
    ED --> THES
    ED --> REC
    ED --> NOTE
    ED --> LEDE
    THES --> LEDE
    REC --> LEDE
    RAW --> REGIME

    THES --> NAR
    REC --> NAR
    NOTE --> NAR
    LEDE --> NAR
    REGIME --> NAR
    ED --> NAR

    NAR --> dash
    ENR --> dash
    RAW --> dash

    style external fill:#e3f2fd
    style v1 fill:#fff8e1
    style engines fill:#fce4ec
    style enrich fill:#fff8e1
    style synth fill:#fce4ec
    style narr fill:#fff8e1
    style dash fill:#f3e5f5
```
