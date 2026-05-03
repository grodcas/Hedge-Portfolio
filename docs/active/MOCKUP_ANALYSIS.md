# Mockup Analysis — A Traditional Analyst's Walkthrough

**Date of analysis**: 2026-04-26 (the mockup's "today")
**Companion to**: `PORTFOLIO_DASHBOARD_DESIGN.md`, `dashboard/mockup/index.html`
**Audience**: the dashboard team — to see, in concrete form, the work the analyst still has to do *on top of* what the dashboard delivers.

This document is the missing half of the design doc. The design doc explains *what the dashboard shows and why it shows it that way*. This document is the **opposite-end transcript**: a working analyst sits at this dashboard, walks it the way they would on a Monday morning, and writes down everything that has to happen between *seeing the data* and *placing a trade*. The gap between those two is where the analyst earns their salary today, and where the system's next evolution must land.

The persona: I am a sole analyst running a 25-name long/short equity book at a small fund. Mandate is to beat SPY on return *and* volatility, holding weeks to quarters. I report to no PM other than myself. The dashboard is my primary terminal; everything below is the work I do with it open.

---

## 0. Mandate, method, and the surfaces this dashboard doesn't have

The dashboard delivers: **numbers, indicators, news, factor stacks, and the relevant calendar**. It does this very well. The surfaces it does *not* deliver, and which I therefore have to construct in my own head every morning, are:

1. **Macro thesis with named drivers and tripwires.** The Map shows the regime label and 12 indicators. It does not say *what I think the regime means for risk-taking, what would change my mind, and what I'm watching for in the next 30 days*. A 25-name book that holds for weeks to quarters is exposed to macro drift; without a macro thesis to pin it to, I can't size positions or hedge intelligently.

2. **Per-sector thesis with named drivers and tripwires.** Same problem at the sector level. The Map gives me an OW/EW/UW stance and a stance composite. It does not say *why I think Energy is OW, what specifically would invalidate that, what pair-trades or hedges express it best*. I hold 8.4% of my book in 3 Energy names — I owe each of those a sector context.

3. **Data interpretation — "what does this mean about the company?"** The Name panel gives me twelve valuation multiples, twenty quarters of fundamentals, eight quarters of estimates and surprises, six derivative metrics, three composite scores. These are *facts*. The interpretive step — "what kind of company does this mean we are looking at, what is its current state, what would make it surprising or unsurprising for it to keep doing what it is doing" — is not on the page. The thesis is what I build on top of the interpretation.

4. **Narrative connecting data to news.** The Name panel shows the news tagged to thesis drivers — useful. But the harder synthesis is the other direction: *the data tells me X is happening; the news tells me why X is happening; therefore my forward expectation is Y*. The dashboard supports this synthesis; it does not perform it.

5. **Hedge construction.** Net exposure is shown. Gross exposure is shown. Beta-adjusted exposure is not. Pair-trade construction tools are not. Cost-of-hedge and decay analysis are not. I know I am a 25-name long/short book; I do not know from this dashboard what my macro hedge should be tomorrow.

The rest of this document walks through each of those gaps in the order an analyst would hit them.

---

## 1. Reading the macro backdrop

I open the dashboard. Before I touch the Book, I orient.

### Top nav reads
- Regime pill: **Late-cycle 72%**.
- SPY o/n: **+0.3%**.
- Date: **Tue 26 Apr 2026**.

In one second I know: regime is mature, market is up small overnight, no surprise risk to brace for. I move down.

### Map → Regime card
- Headline: **Late-cycle expansion**, confidence 72%, 4 of 6 indicators consistent.
- Consistent (4): 10Y−2Y inverted −0.18, CPI sticky 3.4% > target, Unemp 4.1% (+0.3 from low), HY OAS 358bps.
- Watch (4): initial claims 4w avg ↑, real yields ↓, breakevens ↑ (+0.04 1m), ISM proxy 49.8 (just below 50).
- 12-month history: regime steadily transitioned mid → late.

### Map → Cross-asset
- VIX 16.4 (−0.8), VVIX 92.1 — vol is calm, term-structure not stressed.
- IG OAS 102bps (−12 1m), HY OAS 358bps (−15 1m) — credit is *tightening*. Risk-on signal.
- 10Y 4.18% (+0.04 1w), 2Y 4.36%, 10−2 −0.18 — curve still inverted, modestly steepening at the long end.
- Real 5Y 1.92% (−0.06 1m), 5Y BE 2.41% (+0.04 1m) — reals down + breakevens up = market is pricing easier real-rate path with stickier inflation. That combination is *risk-on for nominal assets*, *risk-off for duration*.
- DXY 102.3 (+0.4 1m) — dollar firming.
- WTI $78.20 (+3.1% 1m), Copper $3.95 (+1.2%), Gold $2,341 — commodities firm, growth not collapsing.
- NAAIM 68 — neutral, not euphoric.

### My read (this is the work)
The dashboard tells me the labels; my job is to translate them into a positioning view.

**Three things I notice that the dashboard cannot say for me:**

1. **The "late-cycle" label and the cross-asset are mildly contradictory.** Real classic late-cycle has widening credit spreads, falling commodity prices, rising vol, and a steepening curve as the Fed has finished hiking. Here I see *tightening* spreads, *firming* commodities, *low* vol, and the curve is *still inverted but stable*. This isn't the late-cycle of 2007 or 2000 — this looks more like an extended late-cycle plateau. The market is not pricing recession in the next 6 months; it's pricing a continued soft-landing.
2. **The watch indicators are the bear-case start.** Initial claims rising + ISM under 50 + real yields drifting down = the first whisper of demand softening. None are confirmed yet. They become important on the third weekly print, not the first.
3. **Dollar firming + reals falling + breakevens up = a stagflation-light flavor.** Not severe, but enough to bias me toward inflation-beneficiaries (Energy, Materials at the right price) and away from long-duration disappointment-prone names (high-multiple software, REITs, Utilities at high multiples).

### My macro read, in trader's English
> *We are in an extended late-cycle plateau, not the front edge of a recession. Soft landing remains base case (~55%), shallow recession in the next 6m (~25%), no-landing reacceleration (~15%), recession by year-end (~5%). Risk-on factors (credit, commodities) are still favorable; the watch indicators are early bear flags worth tracking weekly but not yet acting on. Stagflation-light flavor argues for Energy + quality cyclicals over duration-sensitive growth.*

This paragraph **does not exist anywhere on the dashboard**. I write it on a sticky note next to my monitor and re-read it every morning. It is the lens through which every per-name decision below gets refracted.

---

## 2. Building a macro thesis (the dashboard doesn't do this)

This is the surface that's missing. Below is what it should look like, built by hand from what the Map gives me.

### Macro thesis (analyst-constructed)

**Statement:** The late-cycle plateau is extending. Credit and commodity strength deny the recession-now case; rising claims and softening ISM deny the no-landing reacceleration case. The base case is a 6–9 month muddle-through with sticky inflation, real rates drifting lower, and the Fed unable to cut decisively before September. Risk assets get to keep their multiples but lose their tailwind.

**Drivers (4 named, each measurable):**

| Driver | Confirms thesis when... | Currently |
|---|---|---|
| Credit spreads stable to tightening | HY OAS < 425bps, IG OAS < 130bps | HY 358 ✓, IG 102 ✓ |
| Real yields contained | DGS10−T10YIE between 1.5% and 2.2% | 1.92% ✓ |
| Labor softening but not breaking | Initial claims 4w avg between 200k and 260k | rising into range, ✓ for now |
| Commodity strength persists | WTI $70–$95, Copper > $3.80 | $78, $3.95 ✓ |

**Tripwires (4, each invalidates the soft-landing base case):**

| Tripwire | Crosses when... | What it would mean |
|---|---|---|
| HY OAS > 475bps | persistent for 2 weeks | credit market sniffs default cycle — derisk |
| Initial claims 4w avg > 260k | persistent for 3 weeks | labor cracking, recession risk jumps to 50%+ |
| ISM Manufacturing < 47 for 2 prints | break and confirm | manufacturing recession spreads to services |
| 10Y > 5.0% with reals > 2.5% | breaks and stays | financial conditions tighten too far, multiple compression |

**Signposts (next 30 days):**
- May 03 — FOMC rate decision + dot plot. Hawkish surprise = duration trade hit; dovish surprise = risk-on bid.
- Apr 28 / May 02 — Initial claims weekly. The third consecutive print > 230k starts the bear-flag.
- May 06 — Next CPI. Sticky core > 3.5% would punish growth multiples again.
- Earnings season for held names (XOM Apr 29, AAPL Apr 28, GOOG May 07) — stock-specific but also macro-flavored.

**Positioning implication:**
- Stay net long ~50% (where I am).
- OW Energy, OW high-quality Tech (NVDA, MSFT), OW Financials (curve-positive).
- UW pure-duration (REITs, Utilities), UW lower-quality Discretionary.
- Hedge: small SPX put-spread or VIX call overlay sized to ~10% of book on May 02 if claims confirm the rising trend; otherwise let the macro be expressed through stock selection.

This is not on the dashboard. It must be on the dashboard. That's note #1 in my wishlist.

---

## 3. Reading the sector landscape

Now I move to the sector grid in the Map.

| Sector | Stance | Holdings | View |
|---|---|---|---|
| XLE Energy | +0.51 | 8.4% (3 names) | OW, undersized vs my view |
| XLK Tech | +0.42 | 14.1% (3 names) | OW, around right size |
| XLF Financials | +0.35 | 8.1% (2 names) | OW, possibly add |
| XLC Comms | +0.22 | 10.9% (3 names) | EW-OW, fine |
| XLP Staples | +0.21 | 5.5% (2 names) | EW, fine |
| XLV Healthcare | +0.18 | 12.0% (4 names) | EW, slightly over-held |
| XLU Utilities | +0.15 | 0% | absent — intentional, late-cycle UW for me |
| XLI Industrials | +0.12 | 6.3% (3 names) | EW, fine |
| XLB Materials | +0.04 | 1.5% (1 name) | EW |
| XLY Cons. Disc. | −0.08 | 7.7% (3 names) | UW per dashboard, but I hold 7.7% — review |
| XLRE Real Est. | −0.12 | 1.5% (1 name) | UW, sized appropriately |

### Two things the dashboard surfaces well
- **Holdings vs stance.** XLE shows me the dashboard's strongest sector bid (+0.51), and I'm only at 8.4% across 3 names. That's the rebalance compass working: I should be over-target in Energy. Either size up the existing 3 names, or add a fourth.
- **The audit flag.** The yellow callout reminds me 30% of stance comes from a hand-tuned regime-affinity matrix. I treat the *direction* of stance as load-bearing, not the *magnitude*. +0.51 Energy ≠ "energy is twice as good as healthcare"; it just means "energy ranks high, and the ranking is robust under several reweightings."

### Three things the dashboard doesn't surface
- **Why the stance is what it is.** The audit flag tells me the matrix is hand-tuned — but it doesn't tell me *which input is moving the score this week*. If Energy was +0.51 a month ago and is +0.59 now, did valuation get cheaper or did rel-strength move? I have to click through to know.
- **Cross-sector pair logic.** If I'm OW XLE and UW XLY, that's a coherent late-cycle pair. The dashboard doesn't say so. It treats each sector as independent.
- **Sector-level thesis.** Same gap as macro. There is no "XLE thesis" page where I can write *why* I'm OW Energy, what would change my view, what news should re-trigger a re-read. The Map gives me the score; I have to write the rationale myself.

---

## 4. Building per-sector theses (the dashboard doesn't do this either)

I keep these short — one paragraph thesis + driver table + tripwires. They live in my notebook today; the user-facing case for putting them in the dashboard is overwhelming.

### XLE Energy (held 8.4%, target ~11%)

**Statement:** Late-cycle inflation, structurally underinvested capacity, OPEC+ discipline, and capital-return-focused US shale management together support a higher *floor* under WTI than consensus models. Demand from EM (China stockpiling), military rebuilds, and a slower-than-expected EV transition keep demand intact for 4–5 years. The asymmetric upside is supply discipline holding through one demand wobble; the downside is OPEC fracture or hard recession.

**Drivers:**
| Driver | Confirms when... | Now |
|---|---|---|
| WTI > $75 sustained | weekly close > $75 for 4 weeks | $78.20, holding ✓ |
| OPEC+ cuts honored | quota compliance > 90% | latest meeting extended cuts ✓ |
| US rig count flat-to-down | weekly rigs flat ±5% | flat (capital discipline) ✓ |
| EM demand sustained | China crude imports y/y > 0% | mixed — china softening |

**Tripwires:**
- WTI < $60 sustained (oversupply realized) → INVALIDATE.
- One major OPEC member breaks discipline (Saudi or UAE) → WEAKEN materially.
- Global recession with > −2% GDP → INVALIDATE (demand destruction).

**Implementation:** XOM (3.8%, target 5.0%), CVX (3.0%, target 3.0%), OXY (1.6%, target 2.0%). Add ~1.6pp to reach target weight. No paired-short overlay — outright long.

### XLK Technology (held 14.1%, target ~14%)

**Statement:** Late-cycle plateau supports quality growth + AI capex cycle is in early innings. Hyperscaler capex sustained through 2027 is the cleanest secular tailwind in the market; *but* multiple compression risk if rates re-accelerate or if AI capex monetization disappoints. I hold the cleanest beneficiaries (NVDA, MSFT) and one short on the loser (INTC).

**Drivers:**
| Driver | Confirms when... | Now |
|---|---|---|
| Hyperscaler capex y/y > 20% | top-3 quarterly capex y/y | +28% ✓ |
| Software ARR growth > 15% sector-wide | quarterly | sustained ✓ |
| Real 5Y yield < 2.0% | weekly | 1.92% ✓, on the line |
| AI demand monetization visible | hyperscaler revenue from AI services | early but visible ✓ |

**Tripwires:**
- Real 5Y > 2.5% sustained → multiple compression, trim.
- One major hyperscaler announces capex pullback → WEAKEN.
- NVDA next-Q DC growth < 30% q/q → INVALIDATE the AI-secular leg.

**Implementation:** NVDA (6.2%, drift over target 5.0%), MSFT (5.8%, target 6.0%), INTC short (2.1%, target 2.0%). Net long Tech via the long pair, INTC short hedges quality risk. Consider trimming NVDA back to 5.5% to take some profit and de-risk into Blackwell ramp.

### XLY Cons. Discretionary (held 7.7%, dashboard says UW −0.08)

**Statement:** I disagree, narrowly. The stance composite is dragged down by Tesla and Home Depot weakness. AMZN (4.2%) is doing fine; the Tesla short (2.0%) is correctly captured as bearish. Overall I'm fine sized 7.7% with composition skewed: long AMZN, short TSLA & HD. Net effective exposure to discretionary as a category is closer to 0%.

**Reading note:** when the dashboard says "UW" but my actual book is *paired* within the sector, the stance composite isn't a clean buy/sell signal. This is a place where the dashboard would benefit from showing **net beta-adjusted sector exposure**, not just gross holdings %.

### Other sectors

- XLF (8.1%, stance +0.35): JPM + BRKB. Curve-positive, capital-return strong, OW. Could add ~1pp by sizing JPM up to 5.0% target.
- XLV (12.0%, stance +0.18): JNJ, UNH, LLY, PFE-short. JNJ is in the trim queue (see §5.4). LLY is the sector's strongest single name but expensive.
- XLI (6.3%): GE, CAT, BA-short. Modest exposure; BA short is the binary risk.
- XLU (0%): no view, no holdings — fine.
- XLRE (1.5%): AMT only. UW correct in late-cycle.

These mini-theses take me ~30 min per sector once a quarter, and a 5-min refresh weekly when the news is quiet. They are the missing layer that makes per-name sizing decisions defensible.

---

## 5. Per-name deep work — the analyst's primary task

Now we get to the heart of the work. The Map and the macro thesis tell me *what flavor of book to build*; the per-name work tells me *how to build it*. Most of the analyst's day is here.

### 5.1 The order of operations (every name)

This is the workflow I run for every name. The mockup's Name panel is well-organized for it.

1. **Identity quick-read.** Header strip — sector, side, weight vs target, drift, MTD, conviction, thesis status. Sets context in 5 seconds.
2. **Data interpretation.** Read Valuation stack + Fundamentals 20q + Estimates + Peers. Translate the numbers into a paragraph: *what kind of company is this right now, what is its current operational state, how does it stack against history and peers.* This is the step the dashboard does not do.
3. **News interpretation.** Read News panel + 10-K diff + MD&A delta + earnings call delta. Translate the qualitative stream into: *what changed in the last 30–90 days and why, how does each event touch a thesis driver.* The dashboard does the tagging; I do the synthesis.
4. **Marry data + news → thesis.** With both interpretations in hand, write the forward thesis: *given current state plus recent events, here is what I expect over the next 1–3 quarters and why.*
5. **Drivers + tripwires + fair value.** Extract the 3–5 things that *must be true* for the thesis. Write the numerical thresholds that would invalidate it. Set a fair-value range using DCF and reverse-DCF.
6. **Notes (journal).** Write 1–4 timestamped notes: what I observed today, what changed vs last review, what I'm watching.
7. **Sizing decision.** Combine conviction + fair-value gap + hedge cost + portfolio constraint → target weight. Set the floor/ceiling for monthly rebalance.
8. **Hedge / pair / risk wrapper.** Decide how this position is hedged: outright, paired against a peer short, or layered under sector or SPX hedge.
9. **Convergence check.** Look at the Convergence card if firing. Do ≥3 of the 8 signals align with my view? If yes, act now. If not, wait.

Below I run this workflow on NVDA in full, then condensed versions on XOM, JNJ, INTC.

---

### 5.2 Worked example: NVDA in full

**Step 1 — Identity quick-read** (Name panel header)
- Sector TEC, side LONG, weight **6.2%** vs target **5.0%** (drift +1.2pp), MTD +4.1%, QTD +12.3%, Conviction +72, Thesis **DRIFT** ⚠, Att **81/100**.
- The drift up + DRIFT thesis tag + Att 81 is the signal: this is the most-needs-attention name in the book this morning, and I am over my target weight on it.

**Step 2 — Data interpretation** (Valuation + Fundamentals + Estimates + Peers)

*Valuation stack.* Twelve multiples, all summarized:
- Forward P/E 34.2x (z +0.4 vs own 5y, peer 28.5, percentile 78). Modestly rich.
- EV/EBITDA 29.8x (z +0.3, peer 24.2, percentile 82). Modestly rich.
- PEG 1.2x (z −0.6, peer 1.5, percentile 22). **Cheap on growth-adjusted basis.**
- P/B 18.4x (z +1.3, peer 11.8, percentile 91). **Significantly rich on book.**
- FCF yield 2.1% (z −0.7, peer 3.2%, percentile 18). Rich on cash flow yield.
- DCF mid $890 (range $720–$1040), current $948 → **+6.5% above DCF mid, inside DCF range**.
- Reverse DCF: implied NTM growth 28%, terminal 22%, WACC 10.5%.

*The interpretation:* The shape of the valuation premium is unusual. Earnings multiples (P/E, EV/EBITDA) are only modestly rich vs own history (z ≈ +0.4). PEG is actually **cheap** because growth is enormous. But the *book* multiple is at the 91st percentile — that's the market saying "we can't value this on book; we have to value it on what the next $1 of capex is going to earn." That's an *embedded extrapolation* of incremental ROIC. If the market were wrong about how productive incremental capital is, P/B would fall first while P/E held — exactly the configuration a Hopper-to-Blackwell stumble would produce. So the book multiple is the early-warning indicator I should watch.

The reverse-DCF implies 28% NTM growth and 22% terminal growth — terminal growth of 22% is *not realistic for any business in steady state*. What the market is pricing is a 5–7 year hyper-growth phase before fade. My DCF mid of $890 with WACC 10.5% likely uses a more conservative fade. The current price *is* inside the analyst range ($720–$1040), but the market is pricing the upper end.

*Fundamentals 20Q.*
- Revenue TTM $130.8b (+89% YoY), 3y CAGR +52%.
- Operating margin 67.4% (+1.8pp/q), 8q range 52% → 67% — steady expansion, no quarterly dips.
- FCF TTM $28.1b (+100% YoY), FCF margin 21%, OCF/NI 1.04 (clean cash conversion).
- R&D 11.8% of revenue (down from 13.2%) — *decelerating reinvestment intensity*.
- Gross margin 75.1% (up from 73.5%) — pricing power confirmed.
- DSO 52d (stable) — collections fine.
- **DIO 96d (up from 78d) ⚠** — inventory days *rising* while revenue is rising.
- Net debt/EBITDA −0.4x (net cash). Share count −1.1% over 8q (modest buyback).
- Piotroski 8/9, Altman Z 12.4 (safe), Beneish M −2.8 (no manipulation flag), ROIC 64% (peer median 22%).

*The interpretation:* This is one of the cleanest financial profiles in public equities. 75% gross margin + 67% operating margin + 21% FCF margin + 64% ROIC at $130b revenue scale puts NVDA in a cohort of fewer than ten companies globally. The combination of *expanding* margins *while* tripling revenue is unusual — most companies trade margin for growth or grow margins by cutting costs at maturity. NVDA is doing both, which is the signature of pricing power in a category with no equal-product competitor.

But two yellow flags inside this perfection:

1. **R&D % of revenue is decelerating (13.2 → 11.8%).** That's not because absolute R&D is falling (it's not); it's because revenue is growing faster than R&D. From a pure cash-flow standpoint, it's beautiful. From a moat-durability standpoint, this is the configuration where competitors fund their own R&D on NVDA's TAM — AMD, custom ASICs from hyperscalers, Chinese alternatives. The competitive moat thins as they catch up while NVDA harvests.
2. **DIO 96d (up from 78d), arrow rising.** Inventory days rising while revenue is also rising means one of three things: (a) channel stuffing, (b) supply outpacing demand, (c) a transition gap (Hopper → Blackwell stockpile). Given the public Blackwell ramp, (c) is the most likely. But (a) is the bear case nobody wants to consider. This is the single most important number to watch on the next earnings call.

*Estimates.*
- Q1 2026 4.18 (range 3.92–4.45), revisions +12 / 0 in 4w. Implied YoY +94%.
- Q2 4.62, revisions +10/−1, +71%.
- FY26 19.84, revisions +14/0, +56%.
- FY27 24.10, revisions +9/−2, +21%.
- Surprise history: 8 consecutive beats, magnitudes +18, +21, +12, +10, +15, +9, +11, +6%. SUE z +1.6.

*The interpretation:* Estimates are still being revised up, but the *magnitude of beats is decelerating* (18 → 6%). That's normal as estimates catch up to reality, not a problem in itself, but it tells me the easy beats are over. From here, NVDA prints in line or beats by single digits. The +12/0 revisions for Q1 are very strong — sell-side is still chasing.

The FY27 estimate of $24.10 with implied YoY +21% is the *fade year* the market is starting to price in. If FY27 estimates start coming down in the next 60 days, that's the structural top in revisions and a signal to trim.

*Peers.*
- NVDA: 29.8x EV/EBITDA, 67.4% op margin, +89% rev YoY, +12% RS-3m, conv +72.
- AMD: 18.2x, 24.1%, +28%, −4%.
- AVGO: 16.5x, 55.2%, +18%, +2%, +35.
- INTC: 11.0x, 7.8%, +1%, −12%.
- QCOM: 13.8x, 28.4%, +9%, +1%.
- Sector median: 16.5x, 28.0%, +18%, 18.0%.

*The interpretation:* The 80% EV/EBITDA premium to AMD has to be *earned* by the +60pp revenue-growth gap and +43pp margin gap. On those metrics, the premium is *cheap relative to what NVDA delivers*. The risk is the gap closing — if AMD's MI accelerator gains share, the premium compresses fast. But the gap closing requires AMD producing comparable performance with a comparable software stack (CUDA), which is a 2–3 year project. Today, the premium is justified.

**Step 3 — News interpretation**

I read each headline and decide how it speaks to the thesis I'm about to build.

| Date | Source | Event | Read |
|---|---|---|---|
| 04-22 | PRESS | Q1 DC guide above whisper +5% | **The most important event of the month.** Sell-side whisper is what specialists are pricing; +5% above whisper is a meaningful beat-the-buyside signal. Confirms DC growth driver, reinforces revisions trajectory. |
| 04-19 | NEWS | Hyperscaler capex pause speculation (Reuters) | The kind of headline that moves the stock 5% intraday and gets corrected in 48h. The 04-22 guide above whisper is the *response* to this — if hyperscalers were pulling capex, the DC guide wouldn't lead. So this headline is noise; weak signal at most. |
| 04-15 | 8-K | Saudi sovereign deal $2b multi-year | Sovereign deals are sticky and high-margin (custom configurations, premium pricing). $2b is small in revenue terms but signals geopolitical demand-pull beyond hyperscalers. Quietly bullish. |
| 04-10 | NEWS | Inventory build at Asian supplier | This is the same DIO story the fundamentals show. The trade press confirming what the balance sheet already revealed = the bear narrative gaining external coverage. Watch for the next print. |
| 04-04 | PRESS | Blackwell volume ramp on plan | Material — Blackwell is the next 18 months of growth. "On plan" is the floor; we'd want "ahead of plan" by Q3. |
| 03-28 | NEWS | CEO at GTC: $2T TAM by 2030 | Vision-setting at investor day. Not actionable, but the anchor for forward guidance. |
| 03-21 | NEWS | Rival accelerator launch | Unspecified rival — likely AMD MI400 or Tenstorrent. Margin pressure if it gains share, but no near-term traction. |

*Drift summary 30d:* −0.4 net, decomposing to **DC +1.4, GM +0.4, HS −0.5, Inv −0.7**.

*The interpretation:* The aggregate −0.4 is misleading. Two strong drivers (DC, GM) are confirming; two weaker drivers (HS, Inv) are weakening. The story is *the core thesis is intact, two adjacent watch-items are softening*. That is exactly what "DRIFT" should mean — and the dashboard correctly tagged the thesis status as DRIFT, not WEAK or BROKEN.

*10-K Risk Factor diff:* China export controls (NEW), talent retention (NEW), customer concentration language strengthened (top-3 41% vs 36% PY).

*The interpretation:* China export controls being added to the 10-K is significant — management is now explicitly disclosing a material new risk. This was rumored for two quarters; now it's in the legal disclosure. Magnitude: meaningful but knowable, not existential. Customer concentration creeping (41% vs 36%) is the risk that grows with success — losing one of the top-3 hyperscaler accounts would be catastrophic. The mitigant is that the top-3 *can't* easily switch (CUDA lock-in).

*MD&A tone delta:* "cautious on near-term inventory **(new language)**" + "positive on Blackwell ramp **(sustained)**" + "capex outlook unchanged."

*The interpretation:* This is the hard signal. Management never adds caution to the MD&A unless they expect to need it as a defense later. The "cautious on near-term inventory" *is the inventory number telling on itself in writing*. The MD&A wouldn't have been changed by accident. Combined with DIO rising and the trade-press headline, three independent confirmations of the same inventory story. Not yet thesis-breaking, but the watch-item is real.

*Earnings call delta:* GM language firmer (+), Q&A pushback moderate (no defensive flag), forward guidance "cautious-confident."

*The interpretation:* Cautious-confident on guidance is the management telling sell-side "we will beat but don't extrapolate." The set-up is: beat-and-guide-conservatively, which is the optimal positioning into a Blackwell ramp.

**Step 4 — Marry data + news → thesis**

Pulling it together: NVDA is in the operationally strongest period of its history (data interpretation), the news flow is ~80% confirming (news interpretation), and the soft spots in the news (inventory, hyperscaler capex anxiety) are the exact things the data already showed (DIO rising, R&D pace decelerating). The story holds; the call is *how much* to own and at what risk wrap.

**Thesis (my words, not the model's):**
> Datacenter compute demand is in a 4–5 year secular acceleration phase driven by hyperscaler buildout and a long tail of sovereign + enterprise demand. NVDA is the irreplaceable single-vendor platform for that demand for the next 24 months minimum, locked in by CUDA. The Blackwell ramp drives both unit volume and ASP through 2026. Margins expand from operating leverage *and* mix shift to higher-priced data-center products. The two adjacent risks (inventory normalization between Hopper and Blackwell, gradual rival hardware traction) are real but contained. Multiple is rich on book and FCF yield but *cheap* on PEG — the market is paying for incremental ROIC, not for current earnings, which is the right framing for a hyper-growth platform.

**Drivers (4):**
| Driver | Confirms | Tripwire |
|---|---|---|
| DC revenue growth > 30% q/q | Q1 guide above whisper ✓ | < 30% q/q on any quarter → INVALIDATE |
| Gross margin > 70% | 75.1%, expanding ✓ | < 65% any quarter → WEAKEN materially |
| Hyperscaler capex sustained | top-3 capex +28% YoY ✓ | flat YoY for 2 consecutive quarters → INVALIDATE |
| Inventory days < 90d | currently **96, rising** ⚠ | > 120d → WEAKEN; > 150d → INVALIDATE |

**Fair value range (mine, reconciling DCF + reverse-DCF + analyst PT):**
- DCF mid $890. Bull DCF (one notch higher growth fade) $1,040. Bear DCF (faster fade) $720.
- Analyst median PT $940 (low $720, high $1,100); my fair-value range $750–$1,050, midpoint $900.
- Current $948 = +5.3% over my midpoint, inside range.
- Implication: not enough upside to add aggressively, not enough downside to trim aggressively. **Hold around target weight, do not chase.**

**Step 5 — Notes I would write today (timestamped journal)**

> 2026-04-26 — Reviewed Q1 datacenter guide (Apr 22 press), inventory rising to DIO 96d (vs 78d 8q ago), MD&A added "cautious on near-term inventory" — first time. Inventory story is real but explainable by Hopper→Blackwell transition. Watching DIO and R&D% on the next print. Conviction holds at +72. Position is +1.2pp over target weight after recent rally; will trim 0.7pp toward 5.5% to take profit and de-risk into Blackwell ramp announcement window. No change to fair-value range.

> 2026-04-26 — China export controls now in 10-K as material disclosed risk (new). Knowable, modeled in DCF base case. Not adjusting.

**Step 6 — Sizing decision**
- Current 6.2%, target 5.0%, drift +1.2pp from rally.
- Conviction +72 (well above neutral), but trending down from peak +84 in Feb.
- Fair value gap: current $948 vs my midpoint $900 = +5.3% above. Modestly rich.
- Action: **trim 0.7pp to 5.5%.** Justification: take the rally profit, restore discipline, re-rate after Blackwell-ramp data point. Keep the position significantly overweight vs equal-weight (4%) because the structural thesis is intact — but pull back from the upside-chase that the dashboard's thesis-DRIFT tag is flagging.

**Step 7 — Hedge / pair / risk wrapper**
- NVDA's beta to SPY is ~1.5; its beta to XLK is ~1.7. The portfolio's natural Tech tilt is captured by 14.1% in XLK names. Adding an XLK short overlay would partially hedge a sector-wide multiple compression.
- The cleanest *paired hedge* for NVDA inside the book is the existing **INTC short** (2.1%). INTC is the structural loser in the same secular shift. The pair captures the *NVDA wins / INTC loses* asymmetry — but INTC short is small, ratio is unbalanced. No structural change today.
- I am NOT going to use SPX puts on this name specifically — too expensive for a high-conviction long. The macro hedge happens once at the book level, not name-by-name.
- **Earnings risk wrap:** next reported earnings 18 days out (per DTC). I'd rather not be over-target into a binary print. The trim to 5.5% is exactly the right magnitude.

**Step 8 — Convergence check**
- NVDA is not on the firing Convergence panel today (XOM and JNJ are). That's correct: my analysis is "trim modestly," not "act decisively." Convergence is for the loud-signal moments. NVDA today is a calm, disciplined trim.

---

### 5.3 Worked example: XOM (the long-add candidate)

**Step 1 — Identity:** ENE, LONG, 3.8% (target 5.0%, drift −1.2pp), MTD +2.8%, Conv +58, Thesis INTACT, Att 76. Earnings **3 days out** (Apr 29 BMO).

**Step 2 — Data interpretation** (running fast):
- Fwd P/E 9.1x (z −1.2), EV/EBITDA 4.5x (z −1.4) — **deeply cheap** vs own 5-year history.
- Operating margin steady ~15% — boring, but boring is good for an integrated.
- FCF building $28b → $34b 8q — *FCF generation is improving even at flat margins*. That's volume + capital discipline, exactly what the sector thesis predicts.
- Revisions +8/−1 4w — sell-side coming up.

*The interpretation:* XOM is in the configuration of "cheap on its own history, cash-flow accelerating, sell-side late to the rerating." The cheap valuation is not a value trap — it's a residual of 2020 oil-fear narratives that are slowly inverting. The market is gradually accepting XOM is a $100 oil-call option with a 4% dividend.

**Step 3 — News interpretation:** Drift +0.6 over 30 days, 4 confirms in last 14d (per Today stripe). Not reading deeper here in the worked example; the data alone justifies the action.

**Step 4 — Thesis:** XOM is the cleanest expression of the XLE sector thesis (§4) at the cheapest entry valuation. Capital discipline + buyback yield + dividend + WTI tailwind = total-return story with downside floor at $60 oil.

**Step 5 — Drivers + tripwires:** match the XLE sector drivers + (XOM-specific) Permian production growth on plan, Guyana ramp on schedule, no major capex blowout.

**Step 6 — Notes:** Earnings in 3 days. Convergence card firing 5 confirms, suggested ADD. Sector thesis OW.

**Step 7 — Sizing decision:**
- Currently 3.8%, target 5.0%, drift −1.2pp under target.
- Convergence card recommends ADD; my own thesis agrees.
- BUT earnings are 3 days out. Adding a full 1.2pp pre-binary-event is mis-managed risk.
- **Action: half-add now (+0.6pp to 4.4%), half post-print (target 5.0% by next week if results don't break the thesis).** This is exactly the dashboard's Convergence-card risk note; I'd have arrived there independently.

**Step 8 — Hedge:** XOM long is hedged at the book level by the small XLY short tilt (TSLA, HD shorts). No name-level hedge needed; XOM has its own oil-price vol embedded.

---

### 5.4 Worked example: JNJ (the trim candidate)

**Step 1 — Identity:** HCR, LONG, 4.1% (target 4.0%), MTD −0.6%, Conv +18, Thesis DRIFT, Att 71. No near catalyst.

**Step 2 — Data interpretation:**
- Fwd P/E 16.4x (z **+1.4**) — significantly rich vs own 5y, peer median 32x but for a slow-grower this premium is unusual.
- Operating margin **declining** 28% → 25% over 8q.
- FCF declining 21 → 18 over 8q.
- Revisions +1/−7 (very negative) 4w.

*The interpretation:* JNJ is in the configuration of "rich on stretched multiples, fundamentals decelerating, sell-side cutting." This is a *value trap setup in defensive clothing*. The dividend is the only thing supporting the price; the operational story is gently rolling over. Rich + declining + revisions cutting = TRIM.

**Step 3 — News interpretation:** Drift −0.3 over 30d. The Convergence card cites gross-margin pressure 2 quarters running — a structural margin deterioration, not a one-quarter blip. Combined with the data above, the operational pressure is real, not noise.

**Step 4 — Thesis revision:** My existing thesis ("dividend defensive, re-rating opportunity post-talc-litigation") is no longer matching the data. The defensive cohort within Healthcare is rotating (LLY, others taking the air); JNJ specifically is losing relative position.

**Step 5 — Action: TRIM**
- Currently 4.1%, target 4.0%. Convergence card recommends TRIM toward 2.5–3.0%.
- I agree with the direction but moderate the magnitude. Target adjusted: **3.0% (from 4.0%)**. Trim 1.1pp.
- The trim happens this week, not at month-end — the longer I wait, the more the multiple compresses *and* the dividend yield loses its support effect.
- I update the thesis tag from DRIFT to WEAK.
- Notes: "2026-04-26 — JNJ thesis downgraded INTACT→WEAK. Op margin contraction 2 consecutive quarters now, sell-side cutting, P/E premium not earned. Trimming target from 4.0% → 3.0%. Re-evaluate after Q1 print."

**Step 6 — Hedge:** No name-level hedge. The XLV exposure (12.0%) is well-balanced with LLY on the other side; reducing JNJ rebalances toward LLY/UNH.

---

### 5.5 Worked example: INTC (the short side)

The dashboard treats longs and shorts symmetrically, but the analyst's mental model differs. Shorts have **asymmetric loss** (unlimited upside risk vs capped reward), **borrow cost**, **squeeze risk**, and **dividend payout obligations**. The framing is therefore different.

**Step 1 — Identity:** TEC, SHORT, 2.1% (target 2.0%, drift +0.1pp), MTD **+5.9%** (against me), Conv −34, Thesis WEAK, Att 64.

The +5.9% MTD against the short is the first thing to acknowledge — I am being squeezed.

**Step 2 — Data interpretation:**
- Fwd P/E 11.0x (z −0.4), EV/EBITDA 5.8x (z −0.8) — cheap, but cheap-for-a-reason.
- Operating margin **collapsed** 18 → 6 over 8q.
- FCF collapsed 12 → −2 over 8q.
- Revisions 0/−9.

*The interpretation:* INTC is in the configuration of "permanent secular share loser, cheap on historical multiples but not cheap on forward earnings power, fab-build capex sinking FCF, sell-side already capitulated." The structural thesis is right; the timing is the question.

**Step 3 — News interpretation:** Drift −0.5 over 30d, but the +5.9% MTD price action means *the news isn't moving the stock right now*. That's a squeeze from positioning, possibly an activist rumor, possibly sector flows. The dashboard doesn't show short-interest data — this is the single biggest gap for a short-management workflow.

**Step 4 — Thesis stays:** INTC structurally loses to TSMC + AMD + NVDA. Foundry pivot is a 5-year capex sink with uncertain payoff. No meaningful AI accelerator. This thesis hasn't broken; the price has just rallied.

**Step 5 — Action:**
- I am +5.9% offside on the short month-to-date. The pain is real but the thesis hasn't broken.
- Two options: (a) cover and wait for a re-entry, (b) hold and accept the drawdown.
- The dashboard would help me decide if it showed *short interest* (is this a squeeze?) and *days to cover* (how long does a squeeze last?). Neither is there. I have to look it up externally.
- Without that data, I default to: **maintain at 2.0% target, do not add to the short into the squeeze, do not cover.** Re-evaluate after the next earnings print which is the natural reality-check.

**Step 6 — Hedge:** INTC short is itself part of my Tech-sector pair (long NVDA, MSFT / short INTC). It's a hedge, not an outright. Maintaining the structure even into the squeeze is the disciplined call.

---

## 6. Building the book — how the names compose into a portfolio

After per-name decisions, I compose. The dashboard's PM tab shows totals; the analytical work is checking whether the totals match the macro and sector views.

### Current vs target net composition (after my Apr 26 trims/adds)

| Sector | Current | Adjusted target | Net direction |
|---|---|---|---|
| TEC | 14.1% (NVDA 6.2 + MSFT 5.8 + INTC short 2.1) | NVDA 5.5 + MSFT 6.0 + INTC short 2.0 = **13.5%** | trim 0.6pp |
| ENE | 8.4% (XOM 3.8 + CVX 3.0 + OXY 1.6) | XOM 5.0 + CVX 3.0 + OXY 2.0 = **10.0%** | add 1.6pp (split half-now half-post-earnings) |
| FIN | 8.1% (JPM 4.8 + BRKB 3.3) | JPM 5.0 + BRKB 3.0 = **8.0%** | flat |
| COM | 10.9% (GOOG 4.5 + META 4.0 + TMUS 2.4) | unchanged 10.9% | hold |
| HCR | 12.0% (JNJ 4.1 + UNH 3.5 + LLY 3.2 + PFE short 1.2) | JNJ **3.0** + UNH 3.5 + LLY 3.2 + PFE short 1.5 = **11.2%** | trim 0.8pp net (JNJ down, PFE short up) |
| DIS | 7.7% (AMZN 4.2 + TSLA short 2.0 + HD short 1.5) | unchanged 7.7% | hold |
| IND | 6.3% (GE 2.0 + CAT 2.5 + BA short 1.8) | unchanged 6.3% | hold |
| STA | 5.5% (COST 3.0 + PG 2.5) | unchanged 5.5% | hold |
| MAT | 1.5% (FCX 1.5) | unchanged 1.5% | hold |
| RES | 1.5% (AMT 1.5) | unchanged 1.5% | hold |

Net longs ↓ 1.4pp on JNJ + NVDA trims; net longs ↑ 1.6pp on XOM add; net shorts +0.3pp on PFE. Approximately net-flat on gross/net exposure, with composition rebalanced toward the macro+sector view (more energy, less defensive HCR, less AI-rally chase).

### What I would also do (but the dashboard doesn't help with)
- **Beta-adjust the net.** A 6.0% MSFT long has the *price* exposure of 6.0% but the *risk* exposure of ~6.6% (beta ~1.1). A 6.2% NVDA long is ~9.3% of risk (beta ~1.5). I should look at the book on a beta-weighted basis, not just dollar-weighted. The dashboard does not currently surface this.
- **Factor-decompose the book.** Of my 25 names, what's my net exposure to Quality, Growth, Value, Momentum, Low-Vol? The retired Layer 1 style-tilt block did some of this; the new design dropped it. I miss it. (See wishlist below.)
- **Stress-test.** If the 10Y rises 50bps, what does my book do? If oil drops to $55, what does my book do? If China-export-controls expand, what does my book do? Scenario tools are absent.

---

## 7. Hedging — what the dashboard barely addresses

This is the section where I disagree most strongly with the current design. A 25-name long/short fund hedges constantly: against macro (SPX puts, VIX calls, credit ETFs), against sector (sector-ETF shorts), against single-name binary risk (peer pair shorts). The dashboard's only acknowledgment is the position-level "side" (L or S) and the gross/net exposure number.

### What I do today (manually, off-dashboard)

**Macro hedge:** I run a small SPX put-spread (typically 2.5%-OTM put, 7.5%-OTM short put, 60-day) sized to roughly 8–12% of book notional. I roll monthly. Cost ~30bps/month all-in. This is my regime hedge — it doesn't capture all downside but caps the worst week. I would size it up if my macro tripwires fired (claims confirming, ISM cracking, HY OAS > 425).

**Sector hedge:** When I'm tactically OW a sector beyond what I want as net long exposure, I overlay a small short of the sector ETF. Today I'm not doing this — net Energy 8.4% and growing toward 10.0% feels right unhedged given my OW thesis. But if I were to grow Energy past 12%, I'd offset 2–3pp with an XLE short layer to reduce vol contribution.

**Pair hedges:** Already embedded — INTC short pairs against NVDA/MSFT longs. PFE short pairs against LLY/UNH/JNJ longs. TSLA + HD shorts pair against AMZN long. The dashboard doesn't acknowledge these as pairs; they show up as 25 independent positions.

**Earnings hedges:** When a held name has earnings in ≤7 days and I'm at full size, I sometimes buy out-of-the-money put protection — costs 50–80bps but caps a guidance-disaster move. The Today stripe surfaces "Catalyst ≤7d" which is the trigger to consider this.

### What the dashboard would need to add

1. A **Hedge surface** — a section that lists my current macro/sector/pair hedges and shows their current cost, days to expiry, hedge ratio (notional hedged ÷ gross long), and beta-effective net exposure.
2. **Beta-adjusted net exposure** — surfaced in the KPI strip alongside dollar net.
3. **Pair-trade composer** — when I select two names, show the historical correlation, current spread vs spread history, beta-balance ratio, and proposed pair sizing.
4. **Single-name optional protection cost** — for held names approaching earnings, show implied move and ATM put cost. This lets me decide pre-print whether the hedge is worth it.

This is the gap the user's intuition correctly identified.

---

## 8. Calendar discipline — managing the timeline

The dashboard's Today stripe and Catalysts cell are excellent for the daily glance. The work I do beyond that:

- **Weekly cadence (Friday end-of-day):** Walk the Book sorted by Att descending. Open the top 5–8 names, read recent Notes + News, decide if any thesis tag needs to flip. Update my macro tripwire dashboard (off-dashboard). Glance at Convergence — note any names firing 2 weeks running.
- **Monthly cadence (rebalance day):** Sort book by Δw·MTD, identify drifters, adjust toward target. Convergence-firing names from past 4 weeks become rebalance candidates. Salary deposit → deploy first to under-target high-conviction names. Re-state the macro thesis explicitly.
- **Quarterly cadence (post-earnings season, ~3 weeks):** Walk every name. Re-rate every driver against the quarter's earnings, transcript, and filings. Refresh fair-value range with new estimate set. Update sector theses. Update macro thesis.

The dashboard supports all of this. The friction is that the weekly/monthly/quarterly *outputs* (updated theses, refreshed drivers) live in my notebook today rather than in the system. The Notes section in the Name panel is the right placeholder; it's currently the only *narrative* persistence layer.

---

## 9. Dashboard wishlist — what a traditional analyst would ask for

Strictly from the analyst seat. No "have AI write my thesis" requests — those are the operator's call to make. Just the missing inputs and surfaces a working analyst would request.

### Tier 1 — surfaces that close obvious workflow gaps

1. **Macro thesis surface.** A persistent 1-page macro view I can edit: thesis statement, 3–5 named drivers with current values vs threshold, 3–5 tripwires, signposts for next 30 days, and a notes log. Auto-updating where deterministic (driver values, tripwire status), narrative-persistent where mine.
2. **Per-sector thesis surface.** Same shape, one per held sector. Connects each sector's stance score to a *narrative I own* and a list of held names that implement it. Would also show "stance vs sector view drift" — e.g., when the dashboard says +0.51 OW Energy and I'm only 8.4% held, the gap is visible.
3. **Hedge surface.** Macro + sector + pair hedges in one place, with cost and effectiveness. Beta-adjusted net exposure as a KPI.
4. **Watchlist (the 26th–50th names).** The fixed 25-name universe assumption is unrealistic — I should be tracking another 25–50 names as candidates. Same factor stack, lighter display, sortable by "would-add" criteria.
5. **Pair-trade composer.** When I open two names side by side, show historical correlation, spread chart, beta-balance ratio, sizing suggestion.

### Tier 2 — missing data feeds (per analyst convention)

6. **Short interest, days to cover, borrow cost.** Essential for managing every short position. INTC squeeze workflow above is impossible to manage without these.
7. **Options-implied move into earnings.** Reading the straddle is the standard pre-earnings sizing input. ATM straddle / spot = expected move; lets me decide whether to trim, hedge, or sit through.
8. **Insider Form 4 activity.** Net 90d insider buying $ per ticker. Currently fetched but unused per the system reference.
9. **13F holdings deltas.** Per-ticker, which large funds added/exited last quarter. The poor man's "smart money tracker."
10. **Sector relative-valuation history.** Not just "NVDA z-score vs own 5y" but "NVDA premium-to-AMD over time" — lets me see if intra-sector pairs are at extreme spread vs history.

### Tier 3 — quality-of-life additions

11. **Style-tilt back, but as portfolio risk decomposition.** The retired Layer 1 style tilts had real signal — they showed me what factors I was implicitly long. Bring it back as a *risk-decomposition* surface (factor exposures of the book), not as a Layer 1 headline.
12. **Stress-test scenarios.** "If 10Y +50bps / WTI −20% / regime → recession, how does the book P&L?" One screen of pre-baked scenarios.
13. **Drawdown tracker per name.** Historical max drawdown, current drawdown, recovery time. Useful for sizing — names with shallow drawdowns deserve larger sizing than names with deep ones.
14. **Cross-asset tactical alerts.** When VIX > 22, when HY OAS > 425, when 10Y > 5.0%, surface these as actionable Today-stripe items, not just Cross-asset numbers.
15. **News materiality calibration.** The mockup shows "drift_30d −0.4." It would help to also see "drift z-score vs this name's own 12-month drift distribution" — is −0.4 a normal week or a 3σ event for NVDA?

### Things I would *remove* (or never add)
- Anything that crowds the top of the page. The Today stripe is already at the limit of useful density.
- A "social sentiment" overlay (Twitter/Reddit) — noise > signal at this cadence.
- A "AI predicted tomorrow's price" tile — this would erode my own discipline; I don't want it.
- More than 4 cells in the Today stripe — fragmentation kills the triage purpose.

---

## 10. The role left for the analyst — and where the bottlenecks are

The dashboard does a tremendous amount. It keeps the data clean, the news filtered, the indicators current, the calendar honest. The work that remains for the analyst, by section:

| Section | Dashboard does | I still do |
|---|---|---|
| Macro | Surfaces 12 indicators, regime label, cross-asset | Build the macro thesis, name the drivers, set tripwires, decide hedge sizing |
| Sector | Stance composite, holdings, RRG | Build the per-sector thesis, decide pair structure, justify the OW/UW |
| Per-name data | Twelve multiples, twenty quarters of fundamentals, estimates, peers | **Translate the numbers into "what kind of company is this right now"** — the data interpretation |
| Per-name news | Tagged to drivers, drift score | **Synthesize news + data into a forward thesis** — the causal explanation |
| Per-name thesis | Stores the thesis I write | Write the thesis, name the drivers, set tripwires, set fair value |
| Notes | Stores the notes I write | Write the notes |
| Sizing | Shows current/target/range | Decide the target weight from conviction + fair-value gap + hedge cost |
| Hedging | Shows side (L/S) and gross/net | Construct the macro/sector/pair hedge, size it, refresh it |

Reading down the right column, two roles cluster together:

**Bottleneck #1 — data interpretation.** Translating 30+ numerical inputs per name into a paragraph of "what this means" is repetitive structured thinking that I do on every name, every quarter. The output is a 1-paragraph diagnosis ("clean financial profile, expanding margins, two yellow flags on inventory and R&D pace, fortress balance sheet, ROIC well above WACC…"). It is consistent in shape across names. It is the most-rote part of the analyst's day — and the most leverageable.

**Bottleneck #2 — thesis maintenance.** Writing the initial thesis is easy enough; the boring part is keeping it current. Every quarter I should re-state every driver, every tripwire, every fair-value range. Every news event should silently update the driver counts. Every earnings print should refresh the fundamentals interpretation. Today the dashboard handles the news-to-driver tagging (great), but the thesis itself sits frozen until I rewrite it. That decay is where errors creep in.

**Where the analyst's judgment remains essential:**
- Naming the drivers in the first place. *Choosing* which 4 things to track (out of the 30 things the data shows) is the hard part. Anyone can list metrics; an analyst picks the 4 that matter for *this thesis at this moment*.
- Disagreeing with the data. The data says JNJ defensive; my read says JNJ value trap. The data shows the correlation; my read explains the divergence.
- Synthesizing macro + sector + name into a *coherent book*. The dashboard shows each layer; the book is the analyst's composition.
- Deciding when *not* to act. The dashboard's daily job is to make non-acting easy; the analyst's daily job is to actually not act.

The dashboard is a microscope and a calendar. The analyst is the operator who decides *what to look at, what to think about it, and what to do about it.* The mockup gets the microscope right. The next steps will determine whether the dashboard takes on more of the operator's repeatable work, or stays in its current role and lets the operator scale by hand.

---

*End of analysis.*
