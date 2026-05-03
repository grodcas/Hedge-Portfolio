# Dashboard AI Integration — Design Decisions

**Date**: 2026-04-27
**Companion to**: `dashboard/mockup/index.html` (v2), `PORTFOLIO_DASHBOARD_DESIGN.md`, `MOCKUP_ANALYSIS.md`
**Status**: design proof — every decision below corresponds to a concrete element in the v2 mockup.

This document explains *why* the v2 mockup looks the way it does. The previous mockup (v1) was a faithful analyst's terminal: numbers, indicators, news, calendar — all the inputs an analyst needs. The companion `MOCKUP_ANALYSIS.md` walked through everything an analyst still has to *do* on top of those inputs to make a decision: build the macro thesis, build sector theses, interpret the data, marry data to news, write the thesis with drivers and tripwires, write the journal notes, decide sizing, hedge.

The v2 mockup integrates AI synthesis into the dashboard so the user can *see the analysis*, not just the data — without removing the user's authority over the decision. This document is the rationale.

---

## 0. The single principle

> **Embed the synthesis the analyst always needs. Fold the explanations they sometimes need. Never produce numbers — only interpret numbers from deterministic sources, with sources cited.**

Every design decision in v2 is a downstream consequence of that one rule. The rest of this document is the rule applied surface by surface.

The user keeps three powers no AI ever takes:
1. **The lock.** Every thesis is a draft until the user locks it. AI updates only unlocked fields after a lock.
2. **The sizing decision.** The trade ledger only writes when the user accepts.
3. **The dismiss.** Every AI suggestion can be dismissed; AI will not re-suggest until a new material event.

---

## 1. Why this layout — the four cadences re-stated

The dashboard is built for four cadences (per `PORTFOLIO_DASHBOARD_DESIGN.md`):

- **Daily 5–10 min** — triage. Did anything change overnight that needs my attention today?
- **Weekly 30–60 min** — drift check. What's slipping in the maintenance queue?
- **Monthly 2–3 hr** — rebalance. Where is my book vs my macro and sector views, and how do I close the gap?
- **Quarterly half-day** — re-rate. Does every thesis still hold against the latest filings and earnings?

AI surfaces map onto cadences as follows:

| Cadence | Primary AI surface | What it delivers |
|---|---|---|
| Daily | **Today's Read** lede + per-name **Analyst Read** ledes | "Read this paragraph and you've done your morning." |
| Daily | **Foldable interpretations** beside data blocks | When something looks unusual, click for "what this means" without leaving the surface. |
| Weekly | **Drift / driver state** (auto-tabulated) + **AI-drafted notes** for review | The weekly Notes review is now half-done by the time you sit down. |
| Monthly | **Sector thesis surface** + **Macro thesis surface** + **sizing suggestions** | The rebalance plan is pre-composed; the user accepts/edits/dismisses. |
| Quarterly | **Thesis re-rating** (drivers re-evaluated against new earnings + filings) | AI proposes the re-rated thesis; the user re-locks. |

No surface in v2 is decorative. Every AI element has a cadence it serves.

---

## 2. Embed vs fold — the decision per surface

This is the most important design choice. Some AI text always shows; some hides until the user asks. The split is deliberate.

| Surface | Embed | Fold | Why |
|---|---|---|---|
| Top-of-Today **TODAY'S READ** lede | ✅ | | The "if you read nothing else" sentence. Click-gating defeats the purpose. |
| Top-of-Map **MAP READ** lede | ✅ | | Sets the lens for the regime + sector + cross-asset block below it. |
| Top-of-Convergence **CONVERGENCE READ** lede | ✅ | | Names what's firing and the overall pattern in 2 sentences. |
| Top-of-Hedges **HEDGE READ** lede | ✅ | | Headlines current beta-adjusted exposure and whether to act on hedging today. |
| Top-of-Macro slide-out lede | ✅ | | First thing the user sees when they open the surface. |
| Top-of-Sector slide-out lede | ✅ | | Same. |
| Top-of-Name slide-out **ANALYST READ** lede | ✅ | | The single highest-value AI surface in the whole dashboard — synthesizes data + news + position state into a decision-suggesting paragraph. Always-visible. |
| **Thesis statement** | ✅ | | The thesis IS the surface; it can't be foldable. AI-drafted means italic + indigo border; user-locked means normal + neutral. |
| **Drivers** with confirm/weaken counts | ✅ | | The drivers list is structurally part of the thesis. |
| **Tripwires** with current vs threshold | ✅ | | Same — structural. |
| Per-data-block **▸ reading** chip (Valuation / Fundamentals / Estimates / Peers) | | ✅ | The data is primary; the interpretation is a crutch. Always-visible doubles surface area and crowds the dense layout. |
| Per-news-row **why this matters** icon | | ✅ | One headline per row keeps the table scannable; the "why" is one click away. |
| **Drift summary** reading chip | | ✅ | The aggregate number + per-driver breakdown is enough most days; the chip explains when needed. |
| **AI draft notes** | partial | ✅ | The 1-line summary is embedded (header + draft date + summary); the full reasoning + citations + accept/edit/dismiss expand on click. |
| **Sizing suggestion** strip | ✅ | | This is an active recommendation that asks for a decision; foldable would make the user miss it. |

The principle in plain terms: **anything the user must read every visit is embedded. Anything the user might read on a particular visit is foldable.** Foldable items announce themselves with a small consistent indigo chip (`▸ reading` or `▸`) so the user can learn that "indigo means AI explanation lives here."

---

## 3. The visual language of AI

Three rules, applied everywhere:

1. **Indigo (#6366F1) is the AI color.** Never used for data signals (which use green/red for direction, blue/orange for z-scores, grayscale for magnitude). The analyst can scan the page and know instantly which content is AI-interpreted and which is raw data.
2. **Italic + soft lavender background = AI draft.** Removed (regular weight, white background, dark border) once the user locks it. The transition is the visual signal of "this is mine now."
3. **Every AI block carries provenance.** Lede cards show `refreshed 09:02 ET · 6m ago · 4 events since last read`. Reading chips show `Cited: <table>.<column> · <event id>`. Note drafts show `Cited: BETA_12_News_digest (2026-04-10)`. This is non-negotiable — the user always knows where the synthesis came from. No invisible reasoning.

Deliberate non-decisions:
- **No AI logos / glow / animation.** The visual treatment is quiet on purpose. The dashboard is for serious money decisions; AI is a tool, not a marketing surface.
- **No confidence percentages on AI output.** Confidence numbers are easily misread as authority. The ledes use hedged language ("most likely," "the configuration is X") and let the user form their own probability.
- **No "AI suggests TRADE" on the Book table.** Trade decisions live inside the Name panel (sizing suggestion strip) where context is fully present. Surfacing them on the table would invite reflexive clicking.

---

## 4. The new entity surfaces — Macro and Sector

In v1, only Names had a thesis surface. Macro showed indicators; Sector showed stance scores. This was the loudest gap exposed in `MOCKUP_ANALYSIS.md`: a 25-name long/short fund hedges constantly against macro and sector ETFs, and you cannot hedge what you have no thesis on.

v2 adds a **Macro slide-out** and a **Sector slide-out**, both parallel in shape to the Name slide-out:

| Section | Name | Macro | Sector |
|---|---|---|---|
| Header | ticker, sector, side, weight, drift, MTD, conviction, thesis | regime label, confidence, stance, tripwires fired, next signpost | sector ticker, stance, holdings vs target, 1m Δ, RRG quadrant |
| Lede | analyst read paragraph | macro read paragraph | sector read paragraph |
| Thesis card | statement → drivers → tripwires → conviction → sizing | statement → drivers → tripwires → signposts → positioning | statement → drivers → tripwires → implementation table → pair/hedge ideas |
| Notes | AI drafts + user notes | AI drafts + user notes | (planned, same pattern) |

**Why the parallel structure matters.** The user learns the workflow once and applies it three times. Open Name → see thesis → check drivers → check tripwires → read notes → decide. Open Macro → exact same cognitive flow. Open Sector → exact same cognitive flow. The dashboard teaches portfolio management by making three different scopes feel like the same kind of object.

**Trigger mechanics** (from the mockup):
- Macro slide-out opens from: the regime pill in the top nav, the regime label in the Map, or the "open thesis →" link in the Map's Regime panel header.
- Sector slide-out opens from: clicking any row in the Map's Sector grid.
- Both reuse the same backdrop and Esc-to-close affordance as the Name panel — consistent navigation.

**Why slide-outs and not full pages.** Same reason as Name: the user often wants to compare. Open Macro → check tripwires → close → open Sector → check implementation → back to Name. Slide-outs preserve the dashboard state behind them so the analyst doesn't lose their place.

---

## 5. The Hedge surface (also new)

`MOCKUP_ANALYSIS.md` flagged this gap explicitly. Net exposure was a number. Beta-adjusted exposure, pair structure, hedge cost, hedge effectiveness — all absent. The v1 dashboard treated 25 positions as 25 independent rows, ignoring the paired and hedged relationships among them.

The Hedge surface (between Convergence and Footer) addresses this:

- **KPI block** (left): four numbers — Net Exposure (Dollar), Net Exposure (Beta-Adjusted), Gross Exposure, Hedge Cover. The first time a user sees +50% dollar-net read as +63% beta-adjusted is the first time they understand their actual risk.
- **Hedge table** (right): every active macro / sector / pair hedge with kind, position, notional, cost, days-to-expiry, and a one-line "why it's on" rationale.
- **HEDGE READ lede** (top): synthesizes the posture in one paragraph and explicitly says whether to act today.

This surface is foundational for a long/short book. Putting it below Convergence keeps the daily attention flow (Today → Book → Map → Convergence) intact, but adds the structural risk view that the monthly and quarterly cadences need.

---

## 6. The Thesis card upgrade — AI-drafted, user-locked, versioned

The single biggest change inside the Name panel. v1 had a static Thesis card with a hand-written statement and four drivers. v2 makes the thesis a **persistent artifact with two states**:

**State 1 — AI Draft (italic, soft lavender background, indigo left-border, "AI DRAFT" tag):**
- AI generates the statement from the data interpretation + news synthesis + recent material events.
- The user sees what the AI thinks and decides whether to commit.
- Three controls: **🔒 Lock** (commits the version), **✎ Edit** (inline editor), **↻ Regenerate** (asks AI to redraft from latest data).

**State 2 — User-Locked (normal weight, white background, dark border, "USER · LOCKED" tag):**
- The user has committed this version. Versioned (v3, v4...) with the lock date.
- AI continues to update *adjacent* unlocked fields (drivers' confirm/weaken counts, tripwire status) but **will not overwrite the locked statement** without explicit "Compare to AI draft" + accept.
- This is the user's discipline anchor: you can't drift away from a thesis you wrote unless you consciously choose to.

**Why this design respects the reliability principle:**
- Every AI thesis cites its sources at the moment it was drafted (`drafted from 4 events since 2026-04-15`).
- Locking is a deliberate user act — not a default behavior — so the user is always conscious of what they own.
- The version history is auditable. "Why did I lock v3 instead of v2?" stays answerable.

The Macro slide-out demonstrates the locked state (the analyst has owned that thesis for two weeks). The Name slide-out demonstrates the draft state. Both are in the mockup and are toggle-able with the Lock button (try it on NVDA).

---

## 7. The AI Draft Notes — the journal half-written

From `MOCKUP_ANALYSIS.md`: the analyst writes timestamped journal notes to track what changed, what they investigated, what they decided. This is the single most labor-intensive habit and the first one that breaks when the analyst is busy. v2 has the AI pre-write the draft notes; the user only has to read and accept.

**Mechanics** (visible in the NVDA Name panel):
- A new "AI DRAFT NOTES (3)" section sits above the user's permanent Notes.
- Each draft is collapsed by default — a one-line summary is visible (`Inventory rose to DIO 96d; MD&A added cautious language; third independent confirmation.`).
- Clicking expands the draft to show the full reasoning + cited sources + three buttons: **Accept** (promotes to permanent note), **Edit** (open inline), **Dismiss** (AI won't re-draft until new event).

**Why this is the highest-leverage AI surface for a working analyst:**
- The Notes log is the *memory* of the thesis. Without it, every quarterly review starts from scratch.
- Drafts are generated from the same news pipeline + driver tagging that already powers the dashboard. Marginal cost is near zero; marginal value to the analyst is enormous.
- The user controls accept/edit/dismiss, so the permanent Notes log is always the user's voice. AI does the typing; the user does the choosing.

A dismissed note is sticky — AI won't re-draft the same material until something new happens. This prevents the "endless suggestion stream" failure mode that kills most AI assistants.

---

## 8. The Sizing Suggestion strip — AI proposes, user disposes

Below the existing Sizing Info row in the Thesis card, a new indigo-bordered block:

```
AI SUGGESTS  Trim to 5.5%   −0.7pp from current 6.2%
Take rally profit, restore discipline near locked target (5.0%),
de-risk into 18d-out earnings. Fair-value gap +5.3% above midpoint
argues against adding; conviction trend slipping from peak argues
against staying max-size.
[Accept] [Edit] [Dismiss]
```

**The decision architecture:**
- The user's **target weight is locked** by the user (with a date stamp). AI does not change it.
- The AI suggests an **operating action** based on current state: trim, hold, add, or wait.
- The rationale is **one paragraph**, citing the inputs it weighed.
- Accept → queues a trade in the ledger (the user still confirms order details).
- Edit → user changes the suggested action inline before accepting.
- Dismiss → AI removes the suggestion until the next material event.

**Why this is safe.** AI never executes. AI never sets the target. AI never changes the locked thesis. AI only suggests an *operation* against the user's owned position. The discipline of the locked target + locked thesis means the AI's suggestions are always grounded in the user's own framework.

---

## 9. The Lede — the most carefully designed AI element

The Lede card sits at the top of every entity surface (Today, Map, Convergence, Hedges, Name, Macro, Sector). It is the "if you read nothing else" paragraph.

**The shape of a good Lede** (using NVDA's as the canonical example):
1. **State the position** — "Position is over target at 6.2% (vs 5.0%) after the +12.3% QTD rally; conviction holds at +72 but is slipping from the +84 February peak."
2. **State what's intact** — "The thesis remains structurally intact — DC growth confirming +4 events, GM expanding —"
3. **State what's softening** — "but two adjacent watch-items are softening: DIO rose to 96d (from 78d) and MD&A added cautious-on-inventory language for the first time."
4. **Suggest the operating action with rationale** — "With earnings 18d out and Blackwell ramp the next material data point, the suggested move is trim 0.7pp toward 5.5% to bank rally profit and reset risk into the binary."
5. **Anchor in valuation** — "Fair value $890 mid (range $720–$1,040); current $948 = +5.3% above midpoint."

That's five clauses, all numerical citations, all action-oriented. The Lede is the dashboard's headline. **Every word earns its place.**

**Cadence: ledes refresh on material event** (news mag ≥ 0.5, factor breach, daily macro tick) — not every minute. The freshness timestamp tells the user when the read was last computed and how many events have happened since. This is the trust contract: "AI is not constantly babbling; it has read the same data you would read and its read is from 6 minutes ago."

---

## 10. The "why this matters" icons on news rows

The smallest AI element, and one of the most important. Every news row in the Name panel now carries a small `?` icon. Hover or click to see a 1-sentence interpretation.

Examples (from NVDA's news panel in the mockup):
- *"Q1 datacenter rev guide above whisper, +5%"* → `?` reveals: *"Specialists trade on the buy-side whisper number, not consensus. +5% above whisper = the most bullish signal possible short of full pre-announcement."*
- *"Hyperscaler capex pause speculation"* → `?` reveals: *"Single-source rumor that moves stock 5% intraday and gets corrected within 48h. The Apr 22 guide above whisper is the corrective response."*

**Why this is high-value:**
- The news headline alone tells you the *what*. The icon tells you the *why-this-matters-for-this-thesis*.
- The interpretation is per-headline + per-thesis — a "hyperscaler pause" rumor matters differently for NVDA than for AMD.
- The footprint is tiny: a 14px circle. The user can ignore the entire row of icons and the table reads exactly as before.

This is the foldable principle taken to its smallest unit: the data is primary, the interpretation is one click away, and the click is contextual.

---

## 11. What stayed exactly the same — and why

The v1 Book table is untouched. The Map structure (regime card / sector grid / cross-asset) is preserved. The Convergence cards keep their existing signal grid. The Name panel's Valuation, Fundamentals, Estimates, News, Peer, and Context cards keep their identical layout — only the AI chips were appended.

This was deliberate. The dashboard's core competence is **dense, scannable, professional data display**. Disrupting that to make room for AI would have cost more than it added. The AI layer is *additive* — it sits beside, beneath, or above the data, never replacing it. A hypothetical user with AI fully disabled would see a v1-equivalent dashboard, slightly enriched with locked-thesis indicators on the Book.

This also is the **graceful degradation** answer: when AI ledes are stale, the data is still authoritative. When the news pipeline is slow, the Lede shows `refreshed 6h ago` instead of `6m ago`, and the user knows to weight it appropriately. Nothing on the page becomes unreadable when the AI half is silent.

---

## 12. The user's learning path — how this builds expertise

The user told us they're not (yet) a professional analyst. The dashboard's job is to give them awareness *and to teach* portfolio management without taking the operating decision away. The AI layer accelerates the learning curve in three ways:

**Day 1 — read everything.** The user opens the dashboard, reads the Today's Read lede, opens NVDA, reads the Analyst Read lede, opens every foldable chip in the Name panel. The dashboard is teaching them what an analyst pays attention to: *the Lede shows them which 4–5 facts matter, the chips show them how those facts get interpreted, the thesis card shows them how interpretations roll up to a decision.*

**Week 4 — trust the lede, sample the chips.** The user has read enough Ledes to start trusting their pattern. They glance at the lede, scroll past the data confidently, and only open the chip when something surprises them. This is faster reading at higher comprehension — the "I read 50 research notes a day" muscle.

**Month 3 — own the theses.** The user has been editing AI-drafted theses long enough to start writing them from scratch. They lock more often, edit more confidently, dismiss drafts that miss the point. The AI has become an editor of their thinking, not a substitute for it. **At this point the user has become the analyst the dashboard was designed to serve — through the dashboard itself.**

This is the only metric that matters for the AI layer: *does the user become a better analyst over time?* If yes, the design works. If they become dependent on AI to think, it failed. The mechanics that protect against dependency:
- AI never produces numbers (so the user can't outsource fact-finding).
- The user must lock theses (so the user owns the framework).
- The user must accept sizing suggestions (so the user owns trades).
- Foldable chips force a small click (so the user makes a conscious choice to seek interpretation).
- Source citations on every AI output (so the user can always verify).

---

## 13. The trust contract, summarized

| Claim | Mechanism |
|---|---|
| AI never produces numbers | All numerical content sourced from D1 tables (FRED/BLS/AV/Polygon/Finnhub/SEC); interpretations cite the source row/event. |
| AI never executes trades | Sizing suggestion → user clicks Accept → trade ledger receives entry → user confirms order. Three layers between AI and execution. |
| AI never overwrites user-locked content | Lock state is sticky. AI updates only adjacent unlocked fields. Compare-to-draft is opt-in. |
| AI synthesis is always current OR labeled stale | Freshness timestamp on every Lede. `refreshed 6m ago` is good; `refreshed 6h ago` warns the user. |
| AI suggestions are dismissable | Every Accept/Edit/Dismiss button is present. Dismissed = sticky until new event. |
| AI does not hide its uncertainty | Ledes use hedged English ("most likely," "the configuration suggests"). No false-precision percentages. |

---

## 14. What's deliberately not in v2

A short list of things that look like obvious additions but are deliberately absent:

- **A "Chat with your portfolio" interface.** Conversational AI here would invite vague questions and unreliable answers. The dashboard's strength is structured surfaces; we kept it that way.
- **AI-generated price predictions.** Predicting tomorrow's price erodes the user's discipline. The dashboard suggests *operating actions* against existing positions, never *price targets*.
- **Auto-trade or auto-rebalance.** The user is a person making real money decisions. The AI never crosses the line into execution.
- **Watchlist (26th–50th names) coverage.** Identified in `MOCKUP_ANALYSIS.md` as a real gap, but adding it would have ballooned the v2 mockup beyond a focused "AI integration" demo. Leaving for the next iteration.
- **A separate "Analyst" tab.** The whole point of integration is that AI lives *next to* the data it interprets, not in a separate place the user has to navigate to.
- **Density reduction.** The dashboard stays as dense as it was — the AI elements are tucked in with care, not given the space they would on a marketing page. An analyst's screen earns its floor space with information.

---

## 15. Concrete v2 → real-system mapping

For the eventual implementation, each AI surface in the mockup maps to a worker:

| Mockup element | Worker / table to build |
|---|---|
| TODAY'S READ lede | New `lede-builder-today` worker; runs on every news cycle (~15min); reads `BETA_12_News_digest`, `BETA_10_Daily_macro`, `POSITION_01_Daily`, `STOCK_FACTORS_daily` |
| MAP / CONVERGENCE / HEDGE READ ledes | Same `lede-builder` family with different scope inputs |
| Per-name ANALYST READ lede | Per-ticker variant; runs on material event (news mag ≥ 0.5 or driver tag change) |
| Macro thesis (statement, drivers, tripwires, signposts) | New `THESIS_macro` table + builder; reads `MACRO_STATE_*` + `BETA_10_Daily_macro` |
| Sector thesis (per sector) | New `THESIS_sector` table + builder; reads `SECTOR_FACTORS_daily`, `SECTOR_TREND_long/short` |
| Per-name thesis (statement, drivers, tripwires) | New `THESIS_name` table; rebuilds drivers/tripwires status deterministically; AI drafts statement only |
| AI Draft Notes | New `THESIS_NOTES_drafts` table; one row per (entity, event_id); status ∈ {draft, accepted, dismissed} |
| Sizing Suggestion | New `SIZING_suggestions` table; one row per (ticker, version); inputs include conviction, FV gap, hedge cost |
| `Cited:` provenance | Every AI worker writes a `cited_sources` JSON column linking to row IDs / event IDs |
| Reading chips | One short paragraph per (entity, data_block); cached and refreshed per material event |
| "Why this matters" news icons | Per (event_id, ticker, thesis_id); generated by news-funnel-filter as a per-headline interpretation field |

The pattern: **drivers/tripwires/sizing-state are deterministic SQL**, **interpretations are LLM**, **everything has an explicit cite**.

---

## 16. Writing principles for AI readings — the prompt-design contract

These are the rules every AI-generated reading must follow. They came out of iterating the NVDA Name panel: the first drafts repeated numbers and offered Wall Street metaphors instead of conclusions. The rules below are what stops that from happening at scale, and they are the contract the production prompts must enforce.

### 16.1 What each reading must DO

Each reading has a single job. Confusing the jobs is what produces empty paragraphs.

- **Analyst Read (lede).** Stitch fundamentals, valuation, thesis status, and the recommendation into a single synthesis. Explains *why what's happening is happening* and what the user should do. Two short paragraphs maximum. Plain prose, no boxed AI chrome — this is the synthesis layer, not a special AI artifact.
- **Thesis statement.** Plain prose describing the multi-quarter view of the company: what must remain true for the position to make sense. No version-control UI cluttering it (the meta line carries that information).
- **Recommendation.** A single concrete action with the reasoning for it. Plain text, not branded as "AI suggests" — the recommendation is a recommendation, regardless of who drafted it.
- **Notes.** A timestamped log of material events with sources cited. Plain expanded prose, no foldables, no draft/accept/dismiss buttons. AI generates them; the user can edit any of them inline.
- **Per-section reading (Valuation, Fundamentals, Estimates, Aggregate Drift, Peer Comps).** Foldable, indigo-tagged, opt-in. Each one delivers a *conclusion* drawn from the data above it — never a recap of that data. Each cites its sources at the bottom and cross-references adjacent sections where the same indicator shows up.

### 16.2 The reading-by-reading contract

| Reading              | Job (one sentence)                                                                 | Must end on                                              |
|----------------------|------------------------------------------------------------------------------------|----------------------------------------------------------|
| Fundamentals reading | Land on a *company verdict* — peaking / accelerating / harvesting / transitioning / declining — and explain *why* using the trends. | A clear verdict label.                                   |
| Valuation reading    | Use the fundamentals to explain *what the market is pricing in* and whether that's realistic. Identify the indicator that's the early-warning. | The bull-case multiple, the bear-case multiple, the watch-multiple. |
| Estimates reading    | Where is the revisions tape relative to the cycle? Which estimate is the structural-top tell? | The early-warning estimate to watch.                     |
| Aggregate Drift      | Why the headline number misleads (or doesn't), and how it connects upward to the thesis and downward to the recommendation. | Whether the thesis tag (DRIFT / WEAK / BROKEN) is correct. |
| Peer Comps           | Where this name sits in the *cohort*, not just versus one peer. Identify the credible challenger and the gap-closure early-warning. | The leading-indicator metric to watch versus the most credible challenger. |
| Analyst Read (lede)  | Stitch the above into one synthesis: phase the company is in, why, what the market expects, what to do. | A concrete recommendation.                              |

### 16.3 What every reading must NOT do

- **Do not list the values that are already in the table or chart above.** The table is two inches away. Repeating "P/E z +0.4, EV/EBITDA z +0.3" is dead weight. Reference the indicator *by name* and what it *says*, not the value.
- **Do not state facts as if they were conclusions.** "P/E is rich at 38x, P/B is rich at 18x, EV/Sales is rich at 18x" is a list. "The market is paying a heavy premium on book value but not on earnings, which means it expects ROIC to compress less than peers — that's where the bear case lives" is a conclusion.
- **Do not use Wall Street metaphors that would confuse a reader without a CFA.** "Fortress balance sheet earning 5x its cost of capital" is jargon and grammatically loose (balance sheets don't earn — businesses do). Say it plainly: "every dollar reinvested earns roughly six times what it costs to fund."
- **Do not generate an essay where there's nothing to say.** If indicators are quiet, write one sentence. The notification surface (Today tab) intentionally has *no* lede for exactly this reason.
- **Do not claim causality between news and price moves.** That's the Tape's job, and the Tape leaves the link to the user. Readings can describe drivers and risks; they cannot say "the stock went down because of [story]."
- **Do not invent sources.** Every claim cites the cluster/table/document it comes from. If the source doesn't exist in the pipeline, the claim doesn't appear in the reading.

### 16.4 Style

- **Bold the conceptual verbs and turning words**, not the numbers. The numbers are in the chart; the words "harvest phase", "intact", "early-warning", "the bear case lives" are the load-bearing parts of the sentence.
- **Italicize words that mean "the opposite of what the surface says."** *Operationally* past peak. Margins are *expanding*. Returns are being *paid for*. These are the words a fast reader uses to anchor.
- **One conclusion per sentence.** Stack short clauses, not long ones with three subordinate phrases.
- **Plain English over jargon.** "Pricing power" is fine. "Dispersion 0.18" with no gloss is not.
- **Reference the indicator** ("PEG sits cheap") not the value ("PEG is 1.2x vs 1.4x mean, z −0.6"). The user can see the value; the reading is for what it *means*.
- **Cross-reference adjacent sections** when the same indicator appears in two cards. ("the fundamentals card calls this out as expanding"; "Valuation's PEG cheap reading is the same picture from a price angle.") This stitches the panel together instead of producing six unrelated paragraphs.

### 16.5 The visual contract — what gets the indigo treatment

- **Indigo (boxed, foldable):** per-section *readings*. They are explicitly the AI's interpretation of a specific block of data — the user knows they are opting in.
- **Plain text:** the lede, thesis statement, recommendation, and notes. These are content the user owns; the visual rhythm should match the rest of the dashboard, not flag them as AI artifacts.
- **Why the split:** indigo everywhere makes the dashboard feel "AI-coated" — a layer applied on top. Indigo only at the *interpretation* points keeps the dashboard feeling like a tool the user runs, with AI quietly augmenting the parts where interpretation lives.

### 16.6 Implications for the production prompts

When this becomes a real system, the prompts that generate each reading should:
1. Receive the full data context for the section (table rows, time series, source documents).
2. Receive a strict template specifying the job, the forbidden behaviors, and the cross-references to make.
3. Output a single synthesis paragraph plus a sources line — no preamble, no apology, no recap.
4. Be evaluated on whether they end on a *conclusion*, not a list. A simple regex on the last sentence ("does it contain a verdict word — *peaking, accelerating, intact, watch, expensive, cheap, justified*?") catches a surprising fraction of the failure modes.
5. Be re-run only when a material event fires (news mag ≥ 0.5, factor breach, earnings print). Not on every page load.

The principle: deterministic data assembly → constrained-job prompt → conclusion-style output → cited sources. Anything else — open-ended summarization, regenerate-on-load, no-template prompts — produces the dead-weight prose this section was written to prevent.

---

## 17. The closing principle

The v1 mockup made the analyst's *terminal* visible. The v2 mockup makes the analyst's *thinking* visible — without taking the analyst's role.

The user opens the dashboard and sees:
- The numbers (as before).
- A paragraph explaining what the numbers mean and what to do (plain text, cited).
- A thesis they can edit (plain prose, versioned).
- A notes log they didn't have to type (plain expanded entries, cited).
- Per-section readings they can fold open when they want the conclusion (indigo, opt-in).

The user closes the dashboard with:
- A clearer read on macro and sector than they had at open.
- A more current thesis on every name they touched.
- A trade decision (or no-trade decision) they understand the reasoning for.
- A journal entry they didn't have to type.

That is the difference between a dashboard that displays data and a dashboard that participates in the work. The v2 design participates carefully, transparently, and reversibly. The user remains the analyst. AI becomes the apprentice that does the rote work and earns trust over time.

---

*End of design rationale.*
