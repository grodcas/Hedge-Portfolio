> [INDEX](../INDEX.md) · [Ticker Pipeline](TICKER_PIPELINE.md) · [Dashboard AI Integration](DASHBOARD_AI_INTEGRATION.md)

# Macro · Sector slide-out · per-agent pipeline

**Last updated**: 2026-05-03
**Status**: Active — current design for the v2 Map slide-outs

The Map surface itself (regime anchor + cross-asset grid + sector strip) is **fully numerical** — no AI runs there. All AI work happens inside the two slide-outs that open from the Map: the Macro thesis panel (opens from the regime anchor) and the Sector thesis panel (opens from a sector row).

This doc specifies every text field in those two slide-outs in the same form as [TICKER_PIPELINE](TICKER_PIPELINE.md): per-agent inputs, structured fields, DAG order. Inputs that don't shift the verdict are noise.

The Tape annotation agent is unchanged from TICKER_PIPELINE — both slide-outs open into the Tape view via a header-only strip, with no dedicated tape text.

---

## What runs where

| Surface | AI? |
|---|---|
| Map · Macro strip (regime anchor + cross-asset tiles) | No. Regime label is a deterministic classifier on macro state; cross-asset values are market data. |
| Map · Sector strip (per-sector returns / breadth / RS / sparkline / top mover) | No. All deterministic from market data. |
| Macro slide-out | Yes — 7 agents (below). |
| Sector slide-out | Yes — 7 agents (below). |
| Tape strip inside either slide-out | No new agent. The strip is just a scoped link into the Tape view; the per-move sentence is the Tape annotation agent already in TICKER_PIPELINE. |

---

## Numbers requiring AI

Same as Ticker pipeline: only the **per-topic driver classifier** inside News drift. Everything else — regime label, cross-asset values, sector returns, breadth, RS — is deterministic.

---

## Shared infrastructure (already specified elsewhere)

| Piece | Lives in |
|---|---|
| Topic feed pipeline + persistence counter | [TICKER_PIPELINE · Upstream: the topic feed](TICKER_PIPELINE.md#upstream-the-topic-feed-shared-infrastructure) |
| Tape annotation agent | [TICKER_PIPELINE · agent #11](TICKER_PIPELINE.md) |
| Structural-narrative search pattern (Gemini-with-search, cached) | [TICKER_PIPELINE · agent #7 Thesis](TICKER_PIPELINE.md) |
| N-source corroborator (deterministic) | [TICKER_PIPELINE · agent #8 Notes](TICKER_PIPELINE.md) |

The Macro and Sector pipelines reuse all four. Topic feed runs at three scopes now: per-ticker, per-sector, and **per-macro-theme** (rates, Fed, fiscal, inflation, geopolitics, claims/CPI/employment).

---

# Macro slide-out

> **Data layer dependency**: the **macro indicator panel** referenced below is the union of (a) the cross-asset prices already on the Macro strip and (b) the economic data releases (CPI, PPI, PCE, GDP, NFP, unemployment, claims, JOLTS, ISM, IP, retail sales, housing starts, sentiment, Fed funds, balance sheet) the upstream pipeline already parses. **TODO (data layer)**: recheck which parsed releases are not yet persisted to the database — agents below cannot consume series that aren't stored. Panel itself is unchanged.

## Fields covered

1. Read (lede)
2. Thesis (prose)
3. Drivers (structured byproduct of Thesis)
4. Tripwires (structured byproduct of Thesis)
5. Positioning (asset-class / sector tilt — analogous to Recommendation)
6. Signposts (forward-looking calendar of events to watch)
7. Notes (corroborated bullets)
8. News drift (foldable reading)
9. **FOMC summary (foldable, refreshes per meeting)** — keypoints from the latest FOMC outcome

## DAG order

```
Layer 0  raw: regime label (classifier output) + cross-asset state + macro topic feed (no AI)
   │
Layer 1  Macro News drift
         (consumes macro topic feed + previous macro drivers + tripwires)
   │
Layer 2  Macro Thesis
         (consumes regime label + cross-asset state + News drift verdict
          + structural-narrative search + previous thesis)
         emits: prose + drivers + tripwires + version
   │
Layer 3  Notes        Positioning        Signposts
         (all consume thesis structured outputs)
   │
Layer 4  Read (lede)
         (stitches thesis + positioning + signposts + news-drift verdicts)
```

## Per-agent contract

### M1. Macro News drift

| Field | Value |
|---|---|
| **Job** | Map each macro topic to one of the macro drivers (or none) with a sign, write a paragraph, land on a verdict (regime intact / drifting / breaking). |
| **Raw inputs** | 14d **macro topic feed** (rates, Fed, fiscal, inflation, geopolitics, claims/CPI/employment scopes) + previous macro drivers + previous macro tripwires. |
| **AI step** | Per-topic classifier (which driver, sign, did it fire a tripwire) + paragraph synthesis. `days_active` is fed in so persistent topics weight higher. |
| **Outputs** | Paragraph + verdict. |
| **Structured fields emitted** | `driver_drift: {driver_name → score in -2..+2}`, `tripwires_fired: [tripwire_id]`, `topic_persistence: {topic_id → days_active}`. |

### M2. Macro Thesis (the keystone)

| Field | Value |
|---|---|
| **Job** | Maintain "the macro story right now and whether it is intact." Re-runs only on signal change. |
| **Inputs** | Regime label + confidence (deterministic classifier output) · cross-asset state (the deterministic snapshot from the Macro strip) · **macro indicator panel** (every series in the dashboard's macro panel: CPI / PPI / PCE / GDP / NFP / unemployment / initial claims / JOLTS / ISM Mfg / ISM Svc / IP / retail sales / housing starts / UMich / AAII / Fed funds / balance sheet, each with current value + 1m delta + Z vs trend) · Macro News drift verdict + structured drift signs · structural-narrative search ("current bull/bear macro narrative", cached weeks-stale) · previous thesis version. |
| **Why the indicator panel directly** | The regime label compresses these series into a single classification. The Thesis writer needs the raw values too — otherwise it can't say "core CPI cooled to 2.9%, the third miss in four months" or "claims at 232k still below the 270k tripwire by 38k." Without raw values, the prose is generic. |
| **Why structural search** | Concepts like "soft landing", "Fed pause priced", "extended late-cycle plateau" are interpretive frames that live in sell-side notes / Fed-speak / macro reports — not in headlines. Without it, the thesis sees indicators but misses the framing the market is using. |
| **AI step** | One GPT-5 call + one Gemini-search call (cached). |
| **Outputs** | Prose paragraph. |
| **Structured fields emitted** | `drivers: [3–5 named macro drivers, e.g. "soft-landing inflation glide", "Fed pause priced", "credit not pricing recession"]`, `tripwires: [3–5 measurable conditions, e.g. "HY OAS > 500bps", "10y-2y un-inverts AND claims > 270k", "DXY > 110"]`, `version`, `last_updated`. |
| **Re-run trigger** | Regime label changed, News drift verdict flipped, a tripwire flag fired, **or any panel indicator crossed its Z = ±1.5 band**. Otherwise, prior version stands. |

### M3. Notes (macro)

| Field | Value |
|---|---|
| **Job** | Thin, corroborated bullet list of items that touch a macro driver or tripwire. |
| **Raw inputs** | Macro topic feed + Fed-speak transcripts + central-bank releases + key macro filings (BLS, BEA releases). |
| **Other inputs** | Thesis drivers + tripwires (used as relevance filter). |
| **Deterministic step** | N-source corroborator. Topic feed already aggregates sources. |
| **AI step** | Per-topic / per-release one-line claim extraction + driver/tripwire tagging. |
| **Outputs** | Bullets sorted by driver/tripwire relevance, with source list. |

### M4. Positioning

| Field | Value |
|---|---|
| **Job** | Translate the macro thesis into asset-class / sector tilt — "OW Energy + Quality, UW long-duration tech, neutral credit, hold cash buffer". This is the macro analogue of Ticker's Recommendation. |
| **Inputs** | Thesis drivers + per-driver drift signs (from News drift) + tripwire flags + **macro indicator panel (raw values + deltas, same panel that feeds Thesis)** + current book composition (sector weights vs neutral) + book risk caps. |
| **Why the indicator panel directly** | A fresh hot CPI print or a claims spike should change the tilt magnitude *before* the Thesis re-runs. Without raw values, Positioning lags the Thesis by one update cycle on every fresh print. |
| **Why this set** | Drivers + drift signs answer **is the macro thesis intact or weakening**. Tripwires + indicator panel answer **how close to a regime break, and what just changed**. Book composition + risk caps bound where and how much. |
| **What it does NOT consume** | Cross-asset numerical text (drivers carry it), full News drift paragraph (only structured signs). |
| **AI step** | One small GPT call. |
| **Outputs** | Stance per asset class / sector tilt + magnitude per tilt + window. |

### M5. Signposts

| Field | Value |
|---|---|
| **Job** | Forward-looking list of upcoming events that could confirm or break the thesis. One sentence per event. |
| **Inputs** | Macro calendar (CPI, NFP, FOMC, OPEC, central-bank meetings, fiscal deadlines — all deterministic) · thesis drivers · tripwires. |
| **AI step** | Filter calendar to events that touch a driver or tripwire (deterministic), then one small GPT call to write one sentence per event ("CPI on May 14 — fires tripwire #2 if core monthly > 0.4%"). |
| **Outputs** | Ordered list of events with date + one-sentence "what to watch for" per event. |

### M7. FOMC summary (foldable, refreshes per meeting)

| Field | Value |
|---|---|
| **Job** | Bullet summary of the most recent FOMC meeting outcome. Default closed; one click expands the keypoints. Independent of the per-refresh agents — runs once per ~6 weeks and stays cached. |
| **Raw inputs** | FOMC statement · statement-vs-prior diff (deterministic) · dot plot · Summary of Economic Projections (SEP) · Fed Chair press conference transcript · prior meeting's summary for delta context. |
| **Other inputs** | Macro thesis drivers + tripwires (used to *flag* which bullets touch a driver — same principle as Earnings summary). |
| **AI step** | One small GPT call per FOMC meeting. **Cached until next FOMC meeting** — does not re-run on news. |
| **Outputs** | Bullet list, each tagged: policy decision (hold / cut / hike), rate-path / dot-plot shifts vs prior, SEP changes (growth, unemployment, inflation projections), statement language changes vs prior (deterministic diff highlighted), Powell Q&A highlights, dissents. Each bullet cites its source. |
| **Re-run trigger** | New FOMC meeting parsed. Otherwise prior version stands until next meeting (~6 weeks). |
| **Position in DAG** | Independent of the per-refresh agents. Runs at meeting cadence. |

### M6. Read (lede macro) — runs last

| Field | Value |
|---|---|
| **Job** | Stitch the slide-out into one paragraph at the top. Least-risky agent. |
| **Inputs** | Thesis prose + Positioning stance + Signposts top entry + the **1-line verdict from News drift**. Not the full texts of any of these. |
| **AI step** | One small GPT call. |
| **Outputs** | One paragraph. |

---

# Sector slide-out

## Fields covered

1. Read (lede)
2. Thesis (prose)
3. Drivers (structured byproduct of Thesis)
4. Tripwires (structured byproduct of Thesis)
5. Implementation (which names, what weight, sector-specific concrete plan — analogous to Recommendation, but bridges into the Book)
6. Hedge ideas (paired-short / put-overlay / lower-beta sister candidates)
7. Notes (corroborated bullets)
8. News drift (foldable reading)

## DAG order

```
Layer 0  raw: sector numerics (RS, breadth, sector valuation z, sector earnings momentum,
              regime fit) + sector topic feed (no AI)
   │
Layer 1  Sector News drift
         (consumes sector topic feed + previous sector drivers + tripwires)
   │
Layer 2  Sector Thesis
         (consumes sector numerics + News drift verdict
          + structural-narrative search (sector-scoped) + regime fit + previous thesis)
         emits: prose + drivers + tripwires + version
   │
Layer 3  Notes      Implementation      Hedge ideas
         (all consume thesis structured outputs;
          Implementation + Hedge ideas also pull book composition + per-name signals)
   │
Layer 4  Read (lede)
```

## Per-agent contract

### S1. Sector News drift

| Field | Value |
|---|---|
| **Job** | Map each sector-topic to a sector driver (or none) with a sign, write a paragraph, land on a verdict (intact / drifting / breaking). |
| **Raw inputs** | 14d **sector topic feed** (already per-sector scope from the upstream pipeline) + previous sector drivers + tripwires. |
| **AI step** | Per-topic classifier + paragraph synthesis, with `days_active` weighting. |
| **Outputs** | Paragraph + verdict. |
| **Structured fields emitted** | `driver_drift`, `tripwires_fired`, `topic_persistence`. |

### S2. Sector Thesis (the keystone)

| Field | Value |
|---|---|
| **Job** | Maintain "the load-bearing story for this sector right now and whether it is intact." |
| **Inputs** | Sector numerics: sector-ETF RS-3m, breadth (% above 50d), sector valuation z-score, sector aggregate earnings-revision momentum · regime fit (how this sector typically performs in the current regime, deterministic from regime classifier) · **sector-specific raw releases** (e.g. for Energy: rig count + EIA crude/gas inventory + DUC count + WTI; for Real Estate: housing starts + new home sales + 30y mortgage + REIT spreads; for Healthcare: drug-approval calendar + Medicaid spend + clinical-trial pipeline; for Industrials: freight rates + ATA truck tonnage + capex orders) — each with current value + 1m delta + Z vs trend · Sector News drift verdict + structured drift signs · structural-narrative search scoped to this sector ("current bull/bear narrative for energy") · previous sector thesis version. |
| **Why sector-specific releases directly** | Same logic as Macro Thesis: aggregate sector ETF momentum/breadth tells you the price action, but raw sector releases (an EIA inventory build, a rig-count drop) are the *cause*. Without them the prose can describe price moves but can't ground them in the sector-domain signal that's actually moving the thesis. |
| **AI step** | One GPT-5 call + one Gemini-search call (cached). |
| **Outputs** | Prose paragraph. |
| **Structured fields emitted** | `drivers: [3–5 sector-specific drivers, e.g. "OPEC+ discipline holding", "WTI floor at $70", "capital discipline post-2014 bust"]`, `tripwires: [3–5 measurable, e.g. "WTI < $65 for 2 weeks", "rig count > 700"]`, `version`. |
| **Re-run trigger** | Sector News drift verdict flipped, regime label flipped, sector valuation z crossed ±1.5, **a sector-specific release crossed its Z = ±1.5 band**, or a tripwire flag fired. |

### S3. Notes (sector)

| Field | Value |
|---|---|
| **Job** | Corroborated bullets for items that touch a sector driver or tripwire. |
| **Raw inputs** | Sector topic feed + sector-aggregate filings + central-source releases (e.g. EIA reports for Energy, BLS for Healthcare wages). |
| **Other inputs** | Sector thesis drivers + tripwires (relevance filter). |
| **AI step** | Per-topic / per-release one-line claim extraction. |
| **Outputs** | Bullets sorted by relevance with source list. |

### S4. Implementation

| Field | Value |
|---|---|
| **Job** | Translate the sector thesis into a concrete name-level plan inside the book — "OW XOM toward 5%, hold CVX at 4%, avoid OXY (thesis weakening)". This is where the sector view bridges into the Book. |
| **Inputs** | Sector thesis drivers + driver-drift signs + tripwire flags + **sector-specific raw releases (same panel that feeds Sector Thesis)** + **current book holdings in this sector (names + weights vs target)** + **per-name convergence signals from the Ticker pipeline** (so it knows which name is the cleanest expression today) + book risk caps. |
| **Why raw releases directly** | A fresh EIA inventory build or a rig-count surprise should change the sequencing or sizing of name-level actions *before* the Sector Thesis re-runs, same logic as Macro Positioning vs the macro panel. |
| **Why this set** | Drivers + drift + raw releases = is the sector view intact and what just changed. Book holdings = what's already on. Per-name convergence = which name to act on first. Risk caps bound magnitude. |
| **What it does NOT consume** | Sector valuation text or full News drift paragraph (carried via thesis structured outputs). |
| **AI step** | One small GPT call. |
| **Outputs** | Per-name action list within the sector + magnitude per action + note on sequencing. |

### S5. Hedge ideas

| Field | Value |
|---|---|
| **Job** | Concrete hedge candidates if the sector thesis breaks — paired short within the sector, sector-ETF puts, or rotating into a lower-beta sister sector. |
| **Inputs** | Sector thesis (long bias) + sector tripwires + intra-sector peer table (so it can pick the structural laggard for a paired short) + correlated-asset list (sector ETF, options chain availability) + book existing hedges. |
| **AI step** | One small GPT call. |
| **Outputs** | 1–3 hedge ideas, each with: instrument, rationale tied to a tripwire, approximate sizing relative to long exposure. |

### S6. Read (lede sector) — runs last

| Field | Value |
|---|---|
| **Job** | Stitch the sector slide-out into one paragraph. |
| **Inputs** | Sector thesis prose + Implementation top action + Hedge top idea + 1-line News drift verdict. Not the full texts. |
| **AI step** | One small GPT call. |
| **Outputs** | One paragraph. |

---

## Cross-pipeline data flow

```
Topic feed (per macro-theme) ─→ Macro News drift ─→ Macro Thesis ─→ Macro Notes / Positioning / Signposts ─→ Macro Read
                                                          │
                                                          ▼
                                  regime label, drivers, tripwires available to Sector pipeline as inputs
                                                          │
Topic feed (per sector) ───────→ Sector News drift ──→ Sector Thesis ──→ Sector Notes / Implementation / Hedge ideas ─→ Sector Read
                                                          │
                                                          ▼
                                  sector drivers, tripwires available to Ticker pipeline (Context reading)
                                                          │
Topic feed (per ticker) ───────→ Ticker News drift ──→ Ticker Thesis ──→ Ticker Notes / Recommendation / etc. ─→ Ticker Read
```

The lineage runs Macro → Sector → Ticker. Each level inherits drivers and tripwires from the level above as **structured inputs** (not text), keeping context bounded and the layers coherent.

---

## Total agent count across surfaces

| Surface | Agents |
|---|---|
| Ticker (Name) | 11 (10 per-refresh + 1 per-quarter Earnings summary) |
| Today | 0 (composition only) |
| Tape | 1 (Tape annotation, reused everywhere) |
| Macro slide-out | 7 (6 per-refresh + 1 per-meeting FOMC summary) |
| Sector slide-out | 6 (News drift, Thesis, Notes, Implementation, Hedge ideas, Read) |
| **Total** | **25 agents**, every one with a single job. Two of them (Earnings, FOMC) run on event cadence, not refresh cadence — cached between events. |

Plus deterministic infrastructure: topic-feed pipeline, persistence counter, regime classifier, N-source corroborator, calendar lookups.

---

> [INDEX](../INDEX.md) · [Ticker Pipeline](TICKER_PIPELINE.md) · [Dashboard AI Integration](DASHBOARD_AI_INTEGRATION.md)
