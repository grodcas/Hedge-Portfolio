> [INDEX](../INDEX.md) · [V2 Pipeline Draft](V2_PIPELINE_DRAFT.md) · [Dashboard AI Integration](DASHBOARD_AI_INTEGRATION.md)

# Name · Today · Tape · per-agent pipeline

**Last updated**: 2026-05-03
**Status**: Active — current design for three v2 surfaces

This doc specifies how every text field in the **Name** slide-out, the **Today** notification surface, and the **Tape** slide-out is generated: which raw inputs feed it, which single-job agent writes it, what structured fields it emits, and where in the DAG it runs.

The principle: every input must change the output. Inputs that don't shift the verdict are noise — and AI degrades when fed noise.

The three surfaces share infrastructure:
- **Today** is a composition surface — zero new agents, all reads from upstream.
- **Ticker (Name)** is the generation surface — ten agents, defined in detail below.
- **Tape** uses the topic feed directly + one annotation agent for big-move sentences. The same annotation agent is reused by Today's Attention card.

---

## Today section (composition only — no new agents)

Today never generates anything new. Each block is a query against an upstream output:

| Block | Source |
|---|---|
| Catalysts | Earnings / event calendar API. Deterministic. |
| Macro Today | Macro calendar (FOMC, CPI, NFP, etc.). Deterministic. |
| News drift 24h | Filter News drift's structured `driver_drift` output to the last 24h, group by ticker, surface items where a driver moved with a meaningful sign. No AI, no new agent. |
| Attention (the one-line "why" beside a big mover) | Tape annotation agent (see Tape section). |

That's the whole surface.

---

## Tape section

The Tape slide-out has two columns and one small agent.

| Block | How it's filled |
|---|---|
| **News column (per sector)** | The top-N topics from the per-sector topic feed (see "Upstream: the topic feed" below), sorted by score and `days_active`. No new AI — the topic feed is already the output of an upstream pipeline. |
| **Moves column (per sector)** | Deterministic top moves by Z-score over the chosen window. No AI. |
| **Tape annotation** | One small AI sentence next to a qualifying big move ("possibly tied to TSMC capex topic — 3rd day active"), never causal. Defined as agent #11 below. |

---

## Ticker (Name) section

The Name slide-out renders eleven AI-generated text blocks:

1. Read (lede paragraph at the top)
2. Thesis (prose)
3. Recommendation (action block)
4. Notes (corroborated bullets)
5. Valuation reading (foldable)
6. Fundamentals reading (foldable)
7. Estimates reading (foldable)
8. News drift reading (foldable)
9. Peer comps reading (foldable)
10. Context reading (macro/sector for this ticker, foldable)
11. **Earnings summary (foldable, refreshes per quarter)** — keypoints from the latest earnings event

Plus the agent that lives outside the Name panel but is reused by Tape and Today:

12. Tape annotation (one-sentence likely-driver caveat next to a >Z move)

Per-agent contracts are below.

---

## Numbers requiring AI

The Ticker tab is overwhelmingly deterministic. The only place an AI step touches a number is the **per-topic driver classifier** inside the News drift reading (which driver does this topic touch, and in which sign). The aggregation across topics is arithmetic.

Everything else — z-scores, deltas, peer columns, recommendation Δ-weight, drift counts — is computed from market data, not produced by an LLM.

---

## Upstream: the topic feed (shared infrastructure)

Several agents below consume "news." That is shorthand for the **topic feed** produced by the existing upstream pipeline — not raw headlines. The pipeline is:

1. **Scan headlines** for a sector / ticker via Google News API.
2. **Cluster** repeating headlines into topics (deterministic).
3. **Score relevance** by mention count, source diversity, and recency.
4. **Ask Gemini** for details on the top-N controlled set of topics. That detail call returns a short summary + a date.
5. **Persistence counter** (new): on each run, join today's topic set against yesterday's. If a topic matches an existing one, increment its `days_active` counter and update `last_seen`. If new, set `first_seen = today`, `days_active = 1`. Output schema per topic:

```
topic_id, summary, date_first_seen, date_last_seen, days_active,
sources[], mention_count, score
```

This persistence counter is the only thing new on top of what already runs — important because relevant topics typically last several days, and the counter is what lets downstream agents say "this is the third day inventory build is the dominant driver topic" without doing a separate search.

The topic feed exists at two scopes: **per-ticker** (filtered to that ticker's themes) and **per-sector** (broader). Both feed the agents below.

---

## DAG order

```
Layer 0  raw data + 14d news pool (no AI)
   │
Layer 1  five domain readings, in parallel
         · Valuation · Fundamentals · Estimates · Peer comps · Context
         (each consumes raw + previous thesis driver list)
   │
Layer 1b News drift reading
         (consumes 14d news + previous thesis drivers + tripwires)
   │
Layer 2  Thesis
         (consumes Fundamentals reading + News drift reading
          + structural-narrative search + previous thesis)
         emits: prose, driver list, tripwire list
   │
Layer 3a Notes              Layer 3b Recommendation
         (consume thesis structured outputs)
   │
Layer 4  Read (lede)
         (stitches verdicts of all readings + thesis + recommendation)
```

The "previous thesis driver list" lets layer 1 stay coherent without circularity. Drivers are sticky — they only update when the Thesis re-runs.

---

## Per-agent contract

### 1. Valuation reading

| Field | Value |
|---|---|
| **Job** | One paragraph that reads the valuation snapshot in light of the story, lands on a verdict (cheap / fair / rich, against what). |
| **Raw inputs** | P/E, EV/EBITDA, P/B, P/S, FCF yield, PEG + 5y / 10y z-scores. All from market data. |
| **Other inputs** | Previous thesis driver list (so "rich" is read against the actual story, not in a vacuum). |
| **AI step** | One small GPT call. |
| **Outputs** | Paragraph + 1-line verdict. |
| **Structured fields emitted** | `verdict: cheap | fair | rich`, `vs_what: own_history | sector | growth_profile`. |

### 2. Fundamentals reading

| Field | Value |
|---|---|
| **Job** | One paragraph on whether the operating story is expanding, holding, or contracting on the drivers that matter. |
| **Raw inputs** | Revenue growth, OPM, ROIC, FCF margin, inventory days, leverage + YoY/QoQ deltas. |
| **Other inputs** | Previous thesis driver list. |
| **AI step** | One small GPT call. |
| **Outputs** | Paragraph + 1-line verdict. |
| **Structured fields emitted** | `verdict: expanding | holding | contracting`, `top_3_deltas: [{metric, value, direction}]`. |

### 3. Estimates reading

| Field | Value |
|---|---|
| **Job** | One paragraph on whether sell-side revisions confirm or fade the thesis, and where the structural fade year sits. |
| **Raw inputs** | Consensus EPS / rev for FY, FY+1, FY+2 + revision trend (30 / 60 / 90d) + surprise history + dispersion. |
| **Other inputs** | Previous thesis driver list. |
| **AI step** | One small GPT call. |
| **Outputs** | Paragraph + 1-line verdict. |
| **Structured fields emitted** | `verdict: revisions_up | flat | revisions_down`, `fade_year: FY+N`. |

### 4. Peer comps reading

| Field | Value |
|---|---|
| **Job** | One paragraph placing the ticker against peers and the sector median; verdict on whether the relative premium is earned or stretched. |
| **Raw inputs** | Peer table (4–6 names) with rev growth, OPM, EV/EBITDA, RS-3m + ticker row + sector median row. |
| **Other inputs** | None. Peers analysis is self-contained. |
| **AI step** | One small GPT call. |
| **Outputs** | Paragraph + 1-line verdict. |
| **Structured fields emitted** | `relative_position: outlier | middle | laggard`, `premium_status: earned | stretched | none`. |

### 5. News drift reading

| Field | Value |
|---|---|
| **Job** | Map each topic to one of the thesis drivers (or none) with a sign, write a paragraph, land on a verdict (intact / drifting / breaking). |
| **Raw inputs** | 14-day **topic feed** for this ticker (see "Upstream: the topic feed" above). Each topic carries summary, date, `days_active`, sources, score. |
| **Other inputs** | Previous thesis driver list, previous thesis tripwire list. |
| **AI step** | Per-topic classifier (which driver, sign, did it fire a tripwire) + paragraph synthesis. The `days_active` counter is fed in so the agent can weight persistent topics higher. |
| **Outputs** | Paragraph + verdict. |
| **Structured fields emitted** | `driver_drift: {driver_name → score in -2..+2}`, `tripwires_fired: [tripwire_id]`, `topic_persistence: {topic_id → days_active}`. |

### 6. Context reading (macro / sector for this ticker)

| Field | Value |
|---|---|
| **Job** | One short paragraph on whether the regime + sector tape + macro events are tailwind / neutral / headwind for the thesis right now. |
| **Raw inputs** | Regime state badge, sector tape strip, macro calendar — filtered to this ticker's drivers. |
| **Other inputs** | Previous thesis driver list (for the macro-event filter). |
| **AI step** | One small GPT call. |
| **Outputs** | Short paragraph + 1-line verdict. |
| **Structured fields emitted** | `verdict: tailwind | neutral | headwind`. |

### 7. Thesis (the keystone)

| Field | Value |
|---|---|
| **Job** | Maintain "the load-bearing story right now and whether it is intact." Re-runs only on signal change, otherwise the prior version stands. |
| **Inputs** | Fundamentals reading verdict + the 3–4 raw deltas it relied on; News drift verdict + structured drift signs; **structural-narrative search (Gemini-with-search, cached, weeks-stale OK)**; previous thesis version. |
| **Why structural search** | Drivers like the datacenter capex cycle, GLP-1 adoption, defense supercycle live in industry reports / sell-side notes / transcripts — not in daily headlines. Without this, the thesis only sees what's *new*, never what *the story actually is*. Output of search feeds prose only, never numbers, always cited. |
| **AI step** | One GPT-5 call + one Gemini-search call (cached). |
| **Outputs** | Prose paragraph. |
| **Structured fields emitted** | `drivers: [3–5 named load-bearing drivers]`, `tripwires: [3–5 conditions that would break the thesis, each with a measurable threshold]`, `version`, `last_updated`. |
| **Re-run trigger** | Fundamentals verdict flipped, News drift verdict flipped, or a tripwire flag fired in News drift. Otherwise, do not re-run. |

### 8. Notes

| Field | Value |
|---|---|
| **Job** | Keep a thin, corroborated bullet list of items that touch a driver or tripwire. Not a news firehose. |
| **Raw inputs** | 14-day **topic feed** for this ticker, filings (10-Q / 10-K MD&A snippets), transcript snippets. |
| **Other inputs** | Thesis drivers, thesis tripwires (used as a relevance filter — drop everything that doesn't touch one). |
| **Deterministic step (no AI)** | The N-source corroborator. Keep only topics / items with ≥N independent sources; attach all source IDs. The topic feed already aggregates sources, so most of the corroboration is done upstream. |
| **AI step** | Per-topic / per-filing one-line claim extraction + driver/tripwire tagging. |
| **Outputs** | Bullets sorted by driver/tripwire relevance, each with source list. |

### 9. Recommendation

| Field | Value |
|---|---|
| **Job** | Turn the thesis into a concrete action ("trim 25% pre-print"), with Δ-weight and a window. |
| **Inputs** | Thesis drivers + per-driver drift signs (from News drift's structured output) + tripwire flags + nearest catalyst date + valuation z-score + position size + book risk caps. |
| **Why this set** | Drivers + drift signs answer **is the thesis confirming or weakening**. Tripwires answer **are we near a break**. Catalyst answers **timing pressure**. Valuation z + size + risk answer **how much room to act**. Anything beyond these inputs is bulk that will degrade the call. |
| **What it does NOT consume** | Fundamentals reading text (drivers carry it), peer comps text, context text, full news drift paragraph (only the structured signs). |
| **AI step** | One small GPT call. |
| **Outputs** | Action sentence + Δ-weight + window. |

### 10. Read (lede)

| Field | Value |
|---|---|
| **Job** | Stitch the page into one paragraph at the top. The least-risky agent, runs last. |
| **Inputs** | Thesis prose + recommendation action + the **1-line verdict from each reading** (six verdicts). Not the full reading texts. |
| **AI step** | One small GPT call. |
| **Outputs** | One paragraph. |

### 11. Earnings summary (foldable, refreshes per quarter)

| Field | Value |
|---|---|
| **Job** | Bullet summary of the most recent earnings event for this ticker. Default closed; one click expands the keypoints. Independent of the per-refresh agents — runs once per quarter and stays cached. |
| **Raw inputs** | Earnings call transcript (prepared remarks + Q&A) · earnings press release · 10-Q / 10-K MD&A snippet · earnings deck/slides · prior-period guidance for delta context. |
| **Other inputs** | Thesis drivers + tripwires (used to *flag* which bullets touch a driver — not to filter; a complete summary is the point). |
| **AI step** | One small GPT call per earnings event. **Cached until next earnings event** — does not re-run on news, only when a new earnings result is parsed. |
| **Outputs** | Bullet list, each tagged to an angle: revenue beat/miss vs whisper, guidance change, segment performance, margin commentary, capex / opex plans, capital return (buybacks, dividend), risks called out by management. Each bullet cites its source (transcript / release / MD&A). |
| **Re-run trigger** | New earnings event parsed. Otherwise prior version stands until next quarter. |
| **Position in DAG** | Independent of the per-refresh agents. Runs at quarter cadence, in parallel. |

### Tape annotation (separate, lives outside the Name panel)

| Field | Value |
|---|---|
| **Job** | One cautious sentence next to a big move ("possibly tied to TSMC capex topic — 3rd day active"), never causal. |
| **Inputs** | The move (% and Z-score, deterministic) + the **topic feed** for that ticker over the relevant window (default 14d), with `days_active` per topic so the agent can prefer persistent topics over one-day blips. |
| **AI step** | One small GPT call per qualifying move. The candidate topics are pre-filtered deterministically to those whose date is on or before the move and whose theme overlaps the ticker. |
| **Outputs** | One sentence, plus a citation to the topic_id it referenced. |

---

## Data flow summary

```
RAW NUMBERS ─┐
            ├─→ Valuation reading ───┐
            ├─→ Fundamentals reading ┤
            ├─→ Estimates reading    ┤
            ├─→ Peer comps reading   ┤
            └─→ Context reading ─────┤
                                     │ verdicts (1-line each)
14d TOPIC FEED ─→ News drift ────────┤   + structured driver_drift
(headlines→cluster→     │            │   + tripwires_fired
 Gemini-detail+         │            │   + topic_persistence
 days_active counter)   │            │
                  │                  │
                  ▼                  │
        STRUCTURAL SEARCH (cached) ──┤
                  │                  │
                  ▼                  │
              THESIS ────────────────┤   + drivers + tripwires
                  │                  │
                  ├─→ Notes          │
                  ├─→ Recommendation │
                  └──────────────────┴─→ READ (lede)
```

---

## Why this is smaller than the original v2 draft

The earlier V2_PIPELINE_DRAFT introduced engines and clusters at a level of abstraction this work does not need yet. The pipeline that actually has to run on the page is the one above — ten focused agents, clear handoffs, structured fields, no input bloat.

The "engines" idea (theme-tag, news-driver mapper, multi-source corroborator, reading contract) is folded back into where it belongs: theme tagging is part of News drift; the corroborator is a deterministic step inside Notes; the reading contract is documented in DASHBOARD_AI_INTEGRATION §16.

---

> [INDEX](../INDEX.md) · [V2 Pipeline Draft](V2_PIPELINE_DRAFT.md) · [Dashboard AI Integration](DASHBOARD_AI_INTEGRATION.md)
