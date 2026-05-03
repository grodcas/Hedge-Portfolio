# Portfolio Dashboard — How to Use It

**Last updated**: 2026-04-26
**Companion to**: the live mockup at `/mockup/` and `HEDGE_FUND_DATA_REQUIREMENTS.md`

This document is a usage guide for the Portfolio dashboard, grounded in the actual mockup that was built. It walks through every surface and explains: *what's there, why it's placed where it is, why it has the color it does, and what the analyst is meant to do with it.* Design rationale and workflow are interleaved — you cannot read one without the other.

The dashboard's reason to exist is **one deliverable per day**: a small action list of names that warrant attention this week, with reasons attached. Most days that list is short or empty. That's correct.

---

## 0. The premise everything follows from

The user is a solo analyst running a **25-name long/short portfolio**, monitoring daily, trading monthly to quarterly, with the goal of beating SPY on return AND volatility through positions held weeks to quarters.

Every layout decision below follows from three implications of that premise:

1. **Daily P&L is irrelevant.** The big net-exposure gauge that used to dominate the page is gone. Net exposure changes by 0.3pp overnight; it's not a decision driver.
2. **The universe is fixed.** No screening across 500 names. The dashboard is *defense-primary* — its job is monitoring 25 known names for thesis drift, not hunting for new ideas.
3. **Stocks are central, not regime.** The old Layer 1 (regime) → Layer 2 (sector) → Layer 3 (stock) funnel assumes top-down allocation. For this user, allocation decisions are already made; the daily question is *"which of my 25 names changed?"* — a stock-first question. So macro and sector get demoted from headline to interpretive context.

---

## 1. The four cadences — when to use what

The dashboard is designed around four cadences. Every surface is built for one of them.

### Daily — 5 to 10 minutes, every morning

**Step 1.** Land on **Today** (sticky at top).
**Step 2.** Read the Attention queue (top-left cell). If empty, no catalysts in next 3 days, and the News Drift count is dominated by *confirm* — close the laptop. The dashboard's job for today is done.
**Step 3.** If anything fires, click the row → **Name** panel slides out from the right.
**Step 4.** 60-second look at the Thesis card and the recent News headlines. Decide: real signal or noise?
**Step 5.** If thesis-relevant, add a timestamped note. Mark the row mentally for the weekly review.
**Step 6.** Close.

The whole point of the daily flow is that **most mornings should take 3 minutes.** The dashboard exists so you quickly *don't* act on the 23 quiet names and focus on the 2 noisy ones.

### Weekly — 30 to 60 minutes, end of week

1. Open **Book**, default sort (Att descending).
2. Walk the top 5–10 rows. For each, open Name → read Thesis card + News panel.
3. Decide per name: still on track / drifting / needs digging next week.
4. Filter pill `Thesis: drift+weak` → enumerate the maintenance queue. Should be ~5–8 names.
5. Cross-check **Map**: any sector or regime shift since last week?
6. Glance at **Convergence**. Note any names that have been firing for two consecutive weeks — those are next month's candidates.
7. Write 2–3 lines of journal: regime read, thesis updates.

### Monthly — 2 to 3 hours, on rebalance day

This is when actual trading happens. New salary deploys, weights adjust, thesis-broken names exit.

1. **Map** first. Has the regime label flipped? Any sector stance materially diverged from current sector weight? (Energy stance +0.51 vs you only at 8.4% in energy → candidate to deploy salary into XOM/CVX/OXY toward target.)
2. **Book** sorted by `Δw·MTD` — names farthest from target. Why drifted? Thesis change or just price drift? Different action per case.
3. **Convergence** queue from past 4 weeks. Names firing ≥2 consecutive weeks are the highest-conviction adds.
4. Allocate the new monthly capital: under-target high-conviction adds first, Convergence-firing names second, target-restoration third.
5. Trim or exit any thesis WEAK / BROKEN names. Document reasons in the thesis history.

### Quarterly — half-day, after earnings season

1. Open every Name panel in turn (25 names × ~10 minutes each).
2. Re-rate every thesis driver against the quarter's earnings, transcript, filings: still CONFIRM / WEAKEN / INVALIDATE.
3. Update conviction; revise fair-value range if estimates have moved meaningfully; revise tripwires if business conditions have shifted.
4. Refresh the named drivers — sometimes the right driver to track isn't what you wrote 6 months ago.
5. Set `next_review_due` to +90 days.

The protocol *is* the dashboard's reason to exist. Every surface below is designed to support one of these four cadences.

---

## 2. Top nav strip

### What's there
Brand mark, anchor links (Today / Book / Map / Convergence), regime pill (yellow, "Late-cycle 72%"), SPY overnight pill (green when up, red when down), date.

### Why it's designed this way
The first three questions in any analyst's morning are: *"what regime am I in, did the market move overnight, what day is it."* All three answer in the top 30 pixels. No clicks, no scrolls, no drilldown.

The **regime pill is yellow** because Late-cycle is a yellow-light state — neither bull-market growth nor recession. The color tells the analyst at a glance "be alert; the regime is mature." If the regime flipped to Recession, the pill would turn red; Early-cycle would be green. One visual cue.

The **SPY o/n pill** is colored green/red — the same green/red that means *with me / against me* throughout the rest of the dashboard. It tells the analyst whether the market is moving with their book or against it before they even start scanning.

**Anchor links instead of tabs** is a deliberate choice. Tabs hide state — the analyst loses sight of the rest of the dashboard. Scroll-with-anchors keeps everything in one continuous flow, which matches how an analyst actually works: glance at Today → scroll to Book → drill in → scroll to Map → drill back to Book. Tab-switching breaks that flow.

---

## 3. Today stripe

### What's there
Sticky under the top nav. Four cells in a row: **Attention** (3 names), **Catalysts ≤14d** (5 events), **Macro Today** (today's economic releases), **News Drift 24h** (counts by impact). A thin info bar at the bottom: "Convergence firing on 2 names today" with anchor link.

### Why these four cells, in this order
The analyst reads left to right.

**Attention** is leftmost because it is the dashboard's *first deliverable* — *which names should you look at first.* Each row has the ticker, a one-clause reason, and the score. **The top row (NVDA in the mockup) has a pale yellow background** because it has the highest attention score AND a one-clause reason that explains why ("Inventory build flagged — thesis driver weakened"). This is the only call-out color on the entire stripe — by isolating it to one row, the eye lands there first without effort.

**Catalysts ≤14d** is second because it is the analyst's *calendar awareness*. Earnings in 3 days for a held name (XOM in the mockup) means you should not size in or out without thinking about the binary outcome. FOMC in 7 days means rates may move and tech weights matter. PFE FDA PDUFA in 10 days means a binary biotech event is approaching. These are pre-known events the analyst should always have in the periphery.

**Macro Today** is third because macro releases affect everything but they're context, not action. 8:30 ET claims, 14:00 ET FOMC minutes — useful to know they're coming, not material to today's trades.

**News Drift 24h** is rightmost because it's a *summary count* of overnight news traffic — "7 events, 2 invalidate, 3 weaken/mixed, 2 confirm." It tells the analyst whether the news night was hot or cold without reading 7 headlines. If it's dominated by confirms, mood is supportive; dominated by invalidates, something material happened.

### Why a 4-column grid, not a single feed
A chronological feed forces the analyst to scan in time-order — useless if you don't care when each item arrived, only what type it is. The 4-column grid lets the eye triangulate four independent dimensions in parallel: "high attention on NVDA *and* tech earnings start tomorrow *and* News Drift is mildly negative" → that's a coherent picture, look at NVDA first.

### What you do here
- **Empty Attention + no near catalyst + benign drift** → close the laptop. Dashboard's done its job.
- **Top Attention row has a "weakened" reason** → click it. Name panel opens. Read Thesis card + recent News. Real or noise? Note or close.
- **Catalyst ≤3d on a held name** → open that name in Book, check whether you're at target weight, decide if you want to adjust pre-print.
- **News Drift heavily skewed negative** → scroll to the Convergence section to see if any names crossed the firing threshold.

---

## 4. Book table — the workhorse

### What's there
25 rows, one per held name. 14 columns. Default sort: **Attention descending** — the most-needs-looking-at name on top. Sortable headers. Filter pills above the table.

### Why default sort is Attention descending
Because the dashboard's daily question is *which names need attention.* The eye lands on top of the table; the top of the table is the most-needs-looking-at row. Sorting by Conviction would rank by *current state* (interesting weekly, not daily). Sorting by ticker is filing-cabinet order — useful never.

### Column-by-column: what's there, why, what to extract

#### # (row index)
Just a reading aid after sort. The number itself is meaningless because the table is sorted.

#### Name
Ticker (bold) and full company name (gray subtitle). Tickers are how the analyst thinks; full names are sanity-checks. Two lines in one cell saves horizontal space without losing context.

#### Sec (sector tag)
3-letter pill: TEC, ENE, HCR, etc. Background is **monochrome gray, not sector-colored**. Why? Because sector itself doesn't carry a positive/negative signal — sector tag is a *grouping*, not a value judgment. Coloring it would falsely imply "green sector good, red sector bad."

#### Side · Wt
`L` (green-tinted) or `S` (red-tinted) pill, then current weight, then target weight in muted gray below. **Green and red are reserved for direction-as-signal** — long is green, short is red. This is the most important thing about a position; it earns the color. The target below the current weight tells you instantly whether you've drifted up or down. For monthly rebalancing, this is the column you scan first to decide where to deploy salary.

#### Δw · MTD
Drift from target in percentage points, then month-to-date return. Two values in one cell because they answer related questions: *"how much did I drift, and is it because the position is winning (positive MTD pulls weight up) or losing (negative MTD drags weight down)."* NVDA shows `+1.2pp · +4.1%` — drifted up because the price ran. XOM shows `−1.2pp · +2.8%` — drifted down because it's been at low size and the sector ran without you. Different stories, same column.

#### Conv (conviction composite)
Range −100 to +100. **Background is a green-tinted gradient for high positive, red-tinted for high negative, neutral near zero.** Saturation conveys magnitude — never font size, never bold weight, never anything that breaks column alignment. Sort by this when you want to know "what's my highest-conviction position right now." Conv is *current state* — pair it mentally with Att (next column) which is *change/urgency*.

#### Thesis
INTACT / DRIFT / WEAK / BROKEN tag. **Color-coded green / amber / red / near-black.** Why exactly four states? Because the analyst's question "is this thesis still my thesis" only has four practical answers. Five states forces pseudo-precision; two states (good/bad) loses the action distinction between "monitor" (DRIFT) and "act" (WEAK).

#### Att (attention score)
0–100. **Background is grayscale gradient — darker = higher attention.** Why grayscale, not a color? Because attention is *direction-agnostic* — a name that just confirmed wildly demands attention; so does one that just invalidated. Both demand looking. Coloring it green-or-red would create a false directional signal. Default sort is Att descending, so the column reads top-to-bottom in attention order.

#### Fwd P/E (and EV/EBITDA — same format)
Number with a small superscript z-score. **Background is light blue when z ≤ −1 (cheap vs own history), light orange when z ≥ +1 (rich), neutral otherwise.** Diverging two-tone, *never red/green*. This is critical: red/green are reserved for direction (long/short, bullish/bearish), and a low P/E isn't unambiguously bullish — a −1.2σ P/E could be opportunity OR value trap. Blue/orange is information-rich-but-direction-neutral.

Two valuation columns instead of one because every analyst quotes EV/EBITDA — strips out capital structure and tax differences. For Energy, Industrials, anything with debt, EV/EBITDA matters more than P/E. The full 12-multiple stack is in the Name panel; the Book gets the two most important.

#### Margin 8q / FCF 8q (sparklines)
Why sparklines, not numbers? Because the *direction* matters more than the level. "Margin = 67%" means nothing without "rising from 52% over 8 quarters" or "falling from 75%." **The dot at the right end of each sparkline is colored green if the slope is positive, red if negative, gray if flat** — so you read slope at a glance without studying the curve. Hover the sparkline for actual values.

#### EPS↑
Recent EPS revision count, format `+12 / 0`. Up-count is green, down-count is red. Simplest possible analyst-direction signal — when up-revisions dominate, consensus is becoming more positive; when down dominates, the opposite. Inflection points usually show here first.

#### News 30d
The `thesis_drift_30d` aggregate, signed. **Green if positive (confirmations dominate), red if negative.** This is the *only column* that condenses the news pipeline into one number per name — and it's sortable. Sort descending → names where news has been most confirming over 30d. Ascending → most weakening. Critical column. Without it, news lives entirely outside the factor stack and is just decoration in the Name panel.

#### DTC (days to catalyst)
Days to next material catalyst. **Bold red when ≤7 days, normal otherwise.** The only column showing pure timing. Sort ascending to see "what's coming next on my book" — XOM at 3 days, CVX at 5, BA at 8. Rebalancing 2 days before earnings is a binary decision the analyst should make consciously, not by accident.

### Filter pills
- `All` — default, all 25.
- `Long only` / `Short only` — sometimes you want to focus on one side. The short side is usually the smaller side and worth its own scan.
- `Thesis: drift+weak` — the **maintenance queue.** Click this and the table collapses to ~5–8 names whose thesis status is DRIFT, WEAK, or BROKEN. This is your weekly priority list.
- `Catalyst ≤7d` — the **earnings-this-week queue.** Names with imminent events. Drives sizing decisions before binary outcomes.

### How to use it across cadences
- **Daily**: glance at the top 3 rows. Click into one if needed.
- **Weekly**: filter `Thesis: drift+weak` → walk every visible row. Open Name → check what's drifting.
- **Monthly**: sort by `Δw·MTD` descending and ascending → see most over- and under-target. Sort by Conv → see highest-conviction. Plan rebalance.
- **Quarterly**: walk all 25 in default sort → for each, open Name → re-rate thesis drivers.

---

## 5. Name panel — where deep work happens

### What it is
A right-side slide-out, 60% screen width, that opens when you click any Book row. The Book stays visible at the left. Eight panels stacked top to bottom.

### Why slide-out, not full-page navigation
A full-page detail forces back-button gestures to return to Book. Slide-out keeps Book one click away — important because the analyst often wants to compare two names: click NVDA → look → close → click AMD → look. Slide-out preserves Book state (sort, filter, scroll). It also keeps the contextual visual reminder of "you're still in the book" — you haven't left, you've drilled in.

### The eight panels in order

The panel order matches the analyst's question hierarchy.

#### Header strip (sticky)
*"What is this position."* Ticker, name, sector tag, side, weight, drift from target, MTD/QTD, conviction, thesis status, attention. Stays visible while the rest scrolls. Without it the analyst loses orientation after the third panel — "wait, am I still reading NVDA or did I switch."

#### Panel 1 — Thesis card
*"Is this still my thesis?"* The single most important question every other panel exists to inform.

Contains: 3–5 named drivers with confirm/weaken counts; tripwires with current values vs trigger; a 12-month conviction history sparkline; sizing range (current/target/range/last change date); timestamped notes log.

The **WEAKEN driver is amber-tagged** — that's where the eye should go. The thing that's slipping. The notes are timestamped because the analyst needs to read their *own past reasoning* over time — "what did I say in March?" Without that history, every quarterly review starts from scratch.

#### Panel 2 — Valuation stack
*"Is the price reasonable?"* 12 multiples in one table — Trail P/E, Fwd P/E, PEG, EV/EBITDA, EV/Sales, EV/FCF, P/B, P/S, FCF yield, dividend yield, buyback yield, total yield. Columns: Now, 5y mean, z-score, peer median, peer percentile, vs SPY.

The z-score column uses the same blue/orange diverging palette as the Book — **consistency across surfaces matters.** The analyst learns "blue means cheap, orange means rich" once and reads it everywhere.

The DCF and reverse-DCF blocks below close the loop: "implied growth at current price is 28% NTM." If that number is wildly above or below your thesis growth assumption, the price is mispriced one way or the other. This is where the analyst spends 5 minutes when considering a sizing change.

#### Panel 3 — Fundamentals (20-quarter charts)
*"Is the business actually doing it?"* Three full charts side-by-side: Revenue TTM, Operating Margin, FCF TTM. Each shows latest value bold, YoY/Δ in green or red, the curve.

These are **full charts, not sparklines** — at the quarterly cadence, the *shape* of the trajectory matters. Below the charts: six derivative metrics (R&D %, gross margin trend, DSO, DIO, net debt/EBITDA, share count Δ). Below those: three composite scores (Piotroski, Altman, Beneish) and three returns metrics (ROIC, ROE, ROA). Each composite is one number; clicking would expand its inputs (a future enhancement).

The DSO/DIO row carries hidden value: **rising DIO is the earliest sign of softening demand** in many consumer/industrial names. A row showing "DIO 96d ↑ from 78d" with an amber arrow is a soft warning that doesn't show up in any sparkline of revenue or margin.

#### Panel 4 — Estimates & analysts
*"What does the consensus expect, and where do you disagree?"* EPS estimates by period with revision counts; price target dispersion (low dispersion = high consensus); rating distribution as a stacked horizontal bar (32 SB / 14 B / 5 H / 1 S — colored by rating, ratio is implicit in width); 8-quarter surprise history with SUE z-score.

The **rating distribution as a bar** instead of a list is a deliberate compression — the analyst needs to see proportions, not exact counts. A wide green bar = bullish street; a long yellow segment = lots of holds = no conviction.

#### Panel 5 — News & qualitative — *the causal layer*
This panel is the heart of the system's news upgrade. Six columns per headline:

| Column | Meaning |
|---|---|
| Date | when |
| Source pill (PRESS / NEWS / 8-K) | how reliable / who issued |
| Headline text | what was said |
| Impact tag (CONFIRM / WEAKEN / INVALIDATE) | direction of effect on thesis |
| Driver (▸ DC growth, ▸ Inventory, etc.) | which thesis driver it touches |
| Magnitude (signed) | how much |

The **Driver column is the bridge between news and thesis.** Without it, a stream of headlines is noise. With it, every event rolls up to a specific named driver, and you can ask "which driver is the news weakening this month?"

Below the news list, a **drift summary by driver**: "DC +1.4 net confirm · GM +0.4 · HS −0.5 · Inv −0.7." The aggregate `thesis_drift_30d` decomposes into per-driver contributions. So in the NVDA mockup the score is −0.4 *net*, but the breakdown shows DC and GM are confirming strongly while Inventory is weakening. That decomposition is the actionable read.

Below the drift summary, three qualitative blocks: **10-K Risk Factor diff** (NEW tags on risks newly added year-over-year), **MD&A tone delta** vs prior quarter, **earnings call tone delta**. These are the SEC and transcript signals — they update quarterly, not daily, but carry serious weight when they move. The MD&A block in NVDA's mockup says "cautious on near-term inventory (new language)" — that *new language* phrase is the smoking gun: management explicitly added caution to a segment they hadn't previously qualified.

#### Panel 6 — Peer comps
*"Is this name's situation better or worse than its peers?"* 5 closest peers in a table with EV/EBITDA, op margin, revenue YoY, FCF margin, RS-3m, conviction. The subject ticker is highlighted in pale blue. Sector median is in italics.

This panel exists for the question "if I want exposure to this theme, is this the right name?" The mockup shows NVDA at 30x EV/EBITDA, AMD at 18x, AVGO at 16x. The 2x premium has to be justified by the +89% revenue growth versus AMD's +28%. The numbers tell you whether the relative bet is rational.

#### Panel 7 — Context strip
*"What's the macro/sector backdrop?"* One row with sector stance + sector RS + RRG quadrant + regime label + regime-fit for this name. Below that, an explanation paragraph translating the context into plain language: *"Late-cycle expansion historically favors quality growth + secular themes; sector is in leading RRG quadrant; backdrop is supportive of current 6.2% weight."*

This is **the only place regime/sector data appears in the Name view**, and it's at the bottom because they're *interpretive context, not decision drivers.* The analyst already decided to own the name; the macro tells them whether the size is right.

### How to use the Name panel

The panel is designed for two modes:
- **Quick check** (daily): open the panel, jump straight to the relevant section (recent News, latest revisions, valuation drift), close. 60 seconds.
- **Full read** (weekly/monthly/quarterly): top to bottom, every panel. 10–15 minutes per name.

Both modes are supported by the panel-by-panel structure. You can scroll sequentially OR jump directly to a panel.

---

## 6. Map — the backdrop, not the headline

### What's there
Three panels side by side. **Regime card** (left), **Sector grid** with 11 sectors (middle), **Cross-asset strip** (right). Below the table, a yellow audit-warning callout about the hardcoded affinity matrix.

### Why Map is below Book, not above

Two reasons.

**First, the analyst's primary daily question is "what's happening on my held names"** — which is Book. Macro and sector are interpretive context, not the entry point. Putting Map at the top would force the eye through context the analyst doesn't need 80% of the time. The dashboard pays the *occasional* scroll cost on regime-shift days to save the *daily* eye-cost on every other day.

**Second, Layer 1 dominance was the original sin of the prior design.** A 5×8 hardcoded regime-affinity matrix carrying 30% weight in sector stance was occupying the top of the page like a load-bearing wall. The redesign demotes it to a section the analyst consults intentionally, with an explicit audit warning attached.

### Regime card (left)
**Big bold label** ("Late-cycle expansion") — the headline. Confidence percentage. Two columns of indicators: those *consistent* with the label (4 in mockup) and those on the *watch list* (4 transitioning). 12-month regime-history sparkline at the bottom shows whether the regime is *new* or *continued*.

The bold size of the regime label is intentional: the regime is the most important macro fact, and it gets the largest typography on the page. The drivers below are gray and small because they're supporting evidence, not the headline.

### Sector grid (middle)
11 sectors with: name, **stance composite** (green/red gradient background), four sub-scores (Fit / Earn / Val / RS), 1m delta, and a **Holdings column** showing how many of your 25 names sit in each sector and at what aggregate weight.

The **Holdings column is the most important addition vs the old Layer 2**. It is the bridge between Map and Book. Without it, Map is abstract sector data ("Energy stance +0.51"). With it, you read "Energy stance +0.51, holdings 8.4% across 3 names" — and immediately ask "should I be at 8.4% if energy is the most-favored sector?" That's a rebalance question, surfaced visually.

The **audit-flag callout below the grid** is yellow-bordered, intentional. It explains that 30% of the Stance composite comes from a hardcoded regime-affinity matrix that hasn't been validated against historical sector returns. The dashboard refuses to hide its weakest assumption — every time the analyst consults Map, the yellow flag is there.

### Cross-asset strip (right)
Two columns of small key-value pairs. Equity vol (VIX, VVIX), credit (IG/HY OAS), rates (10Y, 2Y, 10−2, real 5Y), inflation expectations (5Y BE, 5Y5Y forward), currency (DXY, EURUSD), commodities (WTI, copper, gold), sentiment (NAAIM).

Why this density? **Cross-asset is the deepest interpretive context.** When something on Book behaves oddly — a tech name selling off on a quiet day — the analyst checks cross-asset for the explanation. "Real yields just spiked 8 bps" → that's why long-duration tech is selling off. Without cross-asset, you'd be guessing.

### How to use Map across cadences
- **Daily**: don't. Map is not for daily.
- **Weekly**: glance at Regime label and Sector stance. If the regime label changed since last week, check the indicators that drove it.
- **Monthly**: spend real time. Sector stance vs current sector weight is the rebalance compass. Cross-asset is the broader read.
- **When a name behaves oddly**: open Map, check cross-asset, look for the macro driver of the oddity.

---

## 7. Convergence — the act surface

### What's there
A list of held names where ≥3 of 8 signals fire same direction *right now*. Each card has the signals enumerated with green checks or red Xs, a suggested action, and a risk note. **Empty most days by design.**

### The 8 signals
Thesis tilt (14d events), valuation extreme (z-score), sector backdrop, catalyst proximity, estimate revisions, surprise momentum, price action, insider activity. Each fires when its threshold is crossed.

### Why this surface exists
A 25-name fund holding for weeks-to-quarters does not need daily trade alerts. It needs occasional *clear-signal moments* surfaced clearly. Most current dashboards either fire constantly (noise — the analyst stops trusting them) or never fire (no synthesis). Convergence is calibrated for this user's cadence: **empty most days, loud on the days that matter.**

### Why ADD cards are green-bordered, TRIM cards are red-bordered
The analyst's eye should pre-classify the action *before* reading the details. A green-bordered card means "consider adding"; a red-bordered card means "consider trimming." The signals inside use the same green-check / red-X grammar as the rest of the dashboard.

### Why suggested actions are advisory
The dashboard suggests; the analyst decides. Each card includes a **Risk line** noting the obvious counter-argument: "earnings in 3 days makes a pre-earnings add binary," "thesis WEAK not BROKEN means partial trim only, not exit." This forces the analyst to weigh trade-offs before acting.

The XOM card in the mockup shows ALL FIVE positive signals firing, the suggested action is ADD, and the risk note flags the binary earnings event 3 days out. The analyst reads that and knows: the setup is real, but the timing is binary, so split the add — half now, half post-print.

### "Other names approaching convergence" footnote
Below the firing cards, names with **2 of 8 signals firing**. These are almost-firing — useful for scanning ahead. If CVX is at 2 signals this week and stays there next week + adds one more, it'll cross the firing threshold on its own.

### How to use Convergence
- **Daily**: glance. Most days empty. When firing, read the cards.
- **Weekly**: log any firing names. Which ones have been firing two weeks in a row? Those are next month's candidates.
- **Monthly**: this is where the rebalance plan comes from. Names firing ≥2 weeks → real candidates. Names firing once → wait another week.

---

## 8. Color and format conventions — every color carries one meaning

The dashboard uses color sparingly and consistently. Each color encodes one concept; mixing meanings is what kills professional dashboards.

| Color | Meaning |
|---|---|
| **Green** (forest, #047857) | Long, bullish, confirm, rising trend |
| **Red** (deep, #B91C1C) | Short, bearish, invalidate, falling trend |
| **Amber** (#B45309) | Caution, drift, weakening, near catalyst |
| **Blue** (deep, #1D4ED8) | Information, neutral signal, clickable link |
| **Light blue background** | Cheap on z-score (z ≤ −1) |
| **Light orange background** | Rich on z-score (z ≥ +1) |
| **Grayscale gradient** | Magnitude without direction (used only for Attention score) |
| **Pale yellow border/box** | Caution callout (audit flag, attention highlight) |

### Rules behind the rules

- **Numbers are tabular-aligned everywhere.** Eyes scan columns of numbers vertically; non-tabular fonts misalign the digits and slow the scan.
- **Sparklines are 60×18px, monochrome curve, colored end-dot for slope.** Bigger sparklines waste space; colored curves create false intensity.
- **Magnitudes are encoded in background color, not font weight or font size.** This preserves column alignment so the eye reads down without bouncing on big-text rows.
- **Density is tight on purpose.** Row height 28px. Whitespace is for marketing materials; analyst dashboards earn their floor space with information.
- **Light mode** (warm off-white background `#FAFAF7`, white cards) chosen over dark because modern analyst platforms (Tegus, AlphaSense, Visible Alpha) are light. Dark mode for terminals is Bloomberg-tradition; this user prefers light, and light is also better for printing/sharing.

---

## 9. The decision flow — putting it together

A worked example: it's Monday morning. You open the dashboard.

1. **Top nav says** "Late-cycle 72%, SPY +0.3% o/n." Regime stable, market up small. Calibrate expectations.
2. **Today stripe:**
   - Attention: NVDA highest (inventory build flagged), XOM (earnings ≤3d), JNJ (P/E expanded +1.4σ)
   - Catalysts: AAPL earnings tomorrow, XOM Wednesday, FOMC next week
   - Macro Today: claims 8:30, FOMC minutes 14:00
   - News Drift: 2 invalidate / 3 weaken / 2 confirm — slightly negative night
3. **Click NVDA.** Name panel slides out. Read Thesis card: "Inventory days <90" driver is WEAKEN ⚠ ×2 — same signal as Today flagged. Scroll to News panel: see the Apr 10 inventory build headline (mag −0.7) and the Apr 22 datacenter guide above whisper (mag +0.8). Drift summary: DC +1.4 vs Inv −0.7. Conclusion: inventory is real, but DC growth is overwhelmingly confirming. Add note: "Inventory weakening is monitored; thesis intact pending Q1 print." Close.
4. **Scan Book.** XOM is row 2 (Att 76). Click → Name panel: Convergence-grade setup. 5 confirms.
5. **Scroll to Convergence.** XOM card already showing: ADD action, 5 confirms, 1 risk note (earnings 3d binary). Decision: half-add today, half post-print.
6. **JNJ card in Convergence** showing: TRIM action, 4 weakens. P/E expanded +1.4σ, est revisions falling 1/-7. Decision: partial trim toward 3.0%, document reason in thesis notes.
7. **Glance at Map.** Regime unchanged, Energy still leading. Validates the XOM ADD.
8. **Close laptop.** 12 minutes elapsed. Two trade decisions made (XOM half-add, JNJ partial trim) with documented reasons. Three thesis notes added.

That flow — Today → drill → Book → Convergence → Map sanity-check → close — is the dashboard's intended use. Every surface played its role. Nothing was wasted.

---

## 10. What was retired and why

| Element | Why it's gone |
|---|---|
| Net-exposure gauge centerpiece | Net exposure changes by 0.3pp overnight. Not a daily decision driver. The regime pill in the top nav now carries the macro headline. |
| Style-tilt block (Quality / LowVol / Growth / Value / Momentum) | Described the *current book composition*, not regime-implied tilts. Useless for action — you can't trade off your own tilts. |
| Allocation bar | Belongs in PM (out of scope), not Portfolio. |
| Layer attribution waterfall | The 40/30/20/10 proxy split forced all four bars to the same sign. Misinforming, not informing. Will return when real per-position attribution lands. |
| 8-sector table at L2 | Survives in Map, expanded to 11 sectors, given the Holdings column. |
| Stock factor scatter chart | Survives as data inside the Name panel's Peer Comps table; no longer occupies its own surface. |
| L1 → L2 → L3 funnel structure | Replaced by the inverted model: stocks central (Book), regime/sector as backdrop (Map). |

---

## 11. The one-paragraph case

The dashboard is built around one premise: an analyst running 25 names monthly-quarterly does not need a top-down macro funnel; they need a stock-centric defense view with macro/sector as interpretive context. Five surfaces support four cadences. **Today** triages the morning. **Book** is the workhorse — sortable, filterable, attention-ranked. **Name** is the deep-work surface that didn't exist before. **Map** is the backdrop, demoted from headline. **Convergence** fires only when ≥3 signals align — empty most days, loud when it matters. Every color encodes one meaning, every column has a purpose, every panel answers an analyst's specific question. The deliverable each day is a small action list — often empty. The dashboard's job is to make *not acting* as easy as *acting*, and to make *acting* defensible when the day comes.
