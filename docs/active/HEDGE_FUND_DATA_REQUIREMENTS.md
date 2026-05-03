# Hedge Fund Data Requirements

**Last updated**: 2026-04-26
**Status**: Reference — to be reconciled against current schema

This document defines what data a fundamental long/short equity hedge fund actually tracks to make trading decisions, and what design principles the database should follow to support that. It is the source of truth for "what should the system contain" — the existing schema is a partial subset. Subsequent build plans should be reconciled against this document.

The framing throughout is **fundamental long/short equity**: 25–50 names, multi-week to multi-quarter horizon, edge from deeper-than-consensus per-name work plus a macro and sector overlay. Not intraday, not pure quant, not pure macro.

Tags used below:
- `[have]` — already wired and stored in the current pipeline
- `[have-snapshot]` — fetched but only the latest value is stored (history is missing — easy fix)
- `[NEW]` — source not currently wired
- `[compute]` — derivation we'd build on top of raw data

---

## Part 1 — What a Fundamental L/S Hedge Fund Tracks

Three buckets. Each item: what to compute, raw data feed.

### MACRO — the regime backdrop

#### Rates & curve
- 3M / 2Y / 5Y / 10Y / 30Y Treasury yields. *Raw: FRED — DGS3MO, DGS2, DGS5, DGS10, DGS30.* `[have-partial]` *Compute: levels + 1d/1w/1m Δ.*
- Yield curve slope (10Y−2Y, 10Y−3M). *Raw: FRED.* `[compute]` *Compute: difference, days inverted, slope of slope.*
- Real yields. *Raw: FRED — DFII5, DFII10.* `[NEW]` *Compute: levels + Δ.*
- Breakeven inflation. *Raw: FRED — T5YIE, T10YIE, T5YIFR.* `[NEW]` *Compute: levels + Δ.*
- Fed Funds rate + SOFR. *Raw: FRED — FEDFUNDS, SOFR.* `[have]` *Compute: level, time since last change, market-implied path from Fed Funds futures (`[NEW]`: CME).*

#### Inflation
- Headline CPI, Core CPI. *Raw: BLS.* `[have]` *Compute: m/m, y/y, 3m annualized, surprise vs consensus.*
- Core PCE (the Fed's preferred gauge). *Raw: `[NEW]` BEA.* *Compute: m/m, y/y.*
- PPI (input pressure). *Raw: `[NEW]` BLS PPI series.* *Compute: y/y.*
- Wage growth. *Raw: BLS — average hourly earnings.* `[NEW]` *Compute: y/y.*
- 5Y5Y forward inflation expectations. *Raw: FRED — T5YIFR.* `[NEW]` *Compute: level + Δ.*

#### Growth & labor
- Non-Farm Payrolls. *Raw: BLS.* `[have]` *Compute: 3m avg, surprise vs consensus, revisions.*
- Unemployment rate + U-6. *Raw: BLS.* `[have-partial]` *Compute: level, Sahm rule trigger.*
- Weekly initial jobless claims. *Raw: `[NEW]` FRED — ICSA.* *Compute: 4w avg.*
- JOLTS job openings. *Raw: `[NEW]` BLS.* *Compute: openings/unemployed ratio.*
- Real GDP. *Raw: FRED — GDPC1.* `[NEW]` *Compute: q/q annualized, y/y.*
- ISM Manufacturing & Services PMI. *Raw: `[NEW]` ISM (paywalled — proxy via S&P Global PMI from FRED).* *Compute: level vs 50, new-orders subindex.*
- Retail sales, industrial production. *Raw: `[NEW]` FRED.*

#### Liquidity & policy
- Fed balance sheet. *Raw: FRED — WALCL.* `[NEW]` *Compute: w/w Δ, QT pace.*
- Reverse repo. *Raw: FRED — RRPONTSYD.* `[NEW]` *Compute: level + Δ.*
- M2 money supply. *Raw: FRED — M2SL.* `[NEW]` *Compute: y/y.*
- Net Treasury issuance. *Raw: `[NEW]` TreasuryDirect.* *Compute: weekly net coupon issuance.*
- FOMC statements + minutes + dot plot. *Raw: Fed RSS.* `[have]` *Compute: hawkish/dovish text delta vs prior — LLM-scored.*

#### Risk & cross-asset
- VIX, VVIX, MOVE. *Raw: VIX/VVIX from Polygon (capable, not yet pulled); MOVE `[NEW]` from ICE.* *Compute: level, percentile vs 1y/5y.*
- IG and HY credit spreads. *Raw: `[NEW]` FRED — BAMLC0A0CM, BAMLH0A0HYM2.* *Compute: level + 1m Δ, percentile.*
- Put/call ratio. *Raw: `[NEW]` CBOE.* *Compute: 5d avg.*
- Equity ETF flows. *Raw: `[NEW]` ETF.com / Bloomberg — skip if too expensive, derive from short interest as proxy.*
- Margin debt. *Raw: `[NEW]` FINRA monthly.* *Compute: y/y Δ.*

#### Currency & commodities
- DXY, EURUSD, USDJPY, USDCNY. *Raw: Polygon (extend ticker list).* `[have-capable]` *Compute: 1d/1m Δ, regime — strong/weak dollar.*
- WTI / Brent oil. *Raw: Polygon (extend).* *Compute: spot, 1m Δ, contango/backwardation from futures (`[NEW]` CME).*
- Copper, gold, natural gas. *Raw: Polygon (extend).*

#### Geopolitics & calendar
- Economic release calendar. *Raw: Finnhub.* `[have]` *Compute: next 14d high-impact events.*
- Election dates, tariff announcements, China credit impulse. *Raw: `[NEW]` manual / news — LLM-tagged.*
- Treasury auction results. *Raw: `[NEW]` TreasuryDirect.* *Compute: bid-to-cover, indirect bidder %.*

---

### SECTOR — where to allocate

#### Relative performance & rotation
- 11 SPDR sector ETF returns (XLK, XLY, XLC, XLF, XLE, XLV, XLP, XLI, XLB, XLRE, XLU). *Raw: Polygon.* `[have]` (currently 8, extend to 11) *Compute: 1d/1w/1m/3m/6m/12m return vs SPY.*
- RRG coordinates (rs_ratio, rs_momentum). `[have]` (sector-factor-builder)
- Breadth: % constituents above 50d / 200d MA per sector. *Raw: Polygon constituent prices.* `[compute]` *Compute: % above MA.*
- New highs / new lows per sector. *Compute: count of constituents at 52w high vs low.* `[compute]`

#### Valuation
- Forward P/E, trailing P/E, EV/EBITDA, EV/Sales, P/B per sector. *Raw: SSGA monthly fact sheet (P/E only) `[have]` + extend `[NEW]` Bloomberg/Refinitiv aggregates OR derive bottom-up from constituents.* *Compute: level, 5y z-score, vs other sectors today.*
- Dividend yield + buyback yield per sector. *Compute: bottom-up from constituents.* `[compute]`
- Valuation z-score vs own 10y history. *Compute: z-score using full SSGA history (need to backfill).* `[compute]`

#### Earnings & estimates
- Aggregate sector forward earnings growth (NTM). *Compute: market-cap weighted sum of constituent estimates from Finnhub.* `[compute]`
- Sector earnings revision breadth (% of constituents revised up last 4w). `[have]` (eps_rev_4w aggregate)
- Sector beat rate last quarter (% beating revenue, % beating EPS). *Raw: Finnhub earnings (extend storage — currently latest only).* `[have-snapshot]`
- Sector guidance change rate (% raising vs cutting). *Raw: `[NEW]` earnings call transcripts + LLM-tagged.*

#### Sector-specific KPIs (the real edge)
- **Tech**: semiconductor book-to-bill (`[NEW]` SIA monthly), cloud capex (sum of MSFT/AMZN/GOOG capex from filings), enterprise software ARR growth aggregate.
- **Energy**: WTI level + curve, US rig count (`[NEW]` Baker Hughes weekly), OPEC production (`[NEW]` monthly), US crude inventories (`[NEW]` EIA weekly).
- **Financials**: 10Y−2Y spread, bank deposit growth (`[NEW]` FRED H.8 weekly), loan loss provisions trend, regional bank stress (KRE/SPY ratio).
- **Healthcare**: FDA approval rate (`[NEW]` FDA database), Medicare drug price negotiation list, biotech XBI/SPY ratio.
- **Consumer Discretionary**: retail sales, credit card spend (`[NEW]` BAC/JPM card data, paid), consumer confidence (`[NEW]` UMICH from FRED).
- **Staples**: pricing vs volume (from constituent earnings), USDA commodity inputs.
- **Industrials**: PMI new orders, freight rates (`[NEW]` Cass Freight Index), Architecture Billings Index.
- **Materials**: copper, gold, ag prices.
- **Real Estate**: REIT yield vs 10Y, occupancy trends (from filings).
- **Utilities**: rate base growth (filings), FERC rulings (`[NEW]` news scrape).
- **Communication Services**: ad spend trends, subscriber metrics from earnings.

#### Sector flows & positioning
- Sector ETF net flows. *Raw: `[NEW]` ETF.com or NAV-implied creations.* *Compute: 4w cumulative.*
- Sector short interest aggregate. *Raw: `[NEW]` FINRA biweekly.* *Compute: % of float.*
- 13F sector tilt of large hedge funds. *Raw: `[NEW]` SEC EDGAR 13F filings (free, quarterly).* *Compute: q/q Δ in HF allocation per sector.*

#### Sector regime sensitivity
- Beta to rates, dollar, oil, credit spreads per sector. *Compute: rolling 1y regression of sector ETF returns on each macro factor.* `[compute]`
- Hand-tuned regime affinity matrix. `[have]` (sector-factor-builder K1 — **flagged as the strongest unaudited prior in the system**)

---

### STOCK — per name

#### Identity & structure (one-time per ticker)
- CIK, sector, industry, market cap, shares outstanding, float, fiscal year end, IPO date, index membership. *Raw: AV OVERVIEW + SEC EDGAR.* `[have]` *Compute: bucket into peer group.*

#### Income statement (full 20-quarter history) — **the big missing piece**
- Revenue (total + by segment if disclosed). *Raw: AV INCOME_STATEMENT (latest stored only — backfill 20q). Segment data: SEC EDGAR XBRL or 10-Q parsing.* `[have-snapshot]`
- COGS, gross profit, gross margin. *Compute: trend over 8q, slope.* `[have-snapshot]`
- R&D, SG&A — dollar and % of revenue. *Compute: trend.* `[have-snapshot]`
- Operating income, operating margin. *Compute: 8q trend, peer-relative.* `[have-snapshot]`
- Interest expense, effective tax rate. *Compute: levels.* `[have-snapshot]`
- Net income, EBITDA. *Compute: y/y growth, margin trend.* `[have-snapshot]` *(EBITDA = OperatingIncome + D&A — currently NOT stored)*
- EPS basic + diluted. *Compute: y/y growth, dilution-adjusted.* `[have-snapshot]`

#### Balance sheet (20q history)
- Cash + short-term investments. *Raw: AV BS.* `[have-snapshot]` *Compute: cash burn rate if negative FCF.*
- Receivables → DSO. *Compute: DSO trend (rising = collections deteriorating).* `[have-snapshot]`
- Inventory → DIO. *Compute: DIO trend (rising = demand softening).* `[have-snapshot]`
- Payables → DPO. *Compute: DPO trend.* `[have-snapshot]`
- PP&E, goodwill, intangibles. *Compute: capex effectiveness.* `[have-snapshot]`
- Total debt, net debt. *Compute: net debt/EBITDA, interest coverage.* `[have-snapshot]`
- Shareholders' equity, book value/share. *Compute: BV growth.* `[have-snapshot]`
- Shares outstanding. *Compute: dilution rate (CAGR), buyback yield.* `[have-snapshot]`

#### Cash flow statement (20q history)
- Operating cash flow. *Raw: AV CF.* `[have-snapshot]` *Compute: OCF/NI ratio (cash conversion).*
- Capex. *Compute: capex/sales trend.* `[have-snapshot]`
- Free cash flow. *Compute: FCF margin, FCF/share growth.* `[have-snapshot]`
- Buybacks, dividends, total return of capital. *Compute: total yield.* `[have-snapshot]`
- Acquisitions. *Compute: M&A intensity.* `[have-snapshot]`

#### Composite financial-health scores
- Piotroski F-score (0-9). `[have]`
- Altman Z-score (bankruptcy risk). *Compute from BS + IS.* `[compute]`
- Beneish M-score (earnings manipulation flag). *Compute from filings.* `[compute]`
- ROIC, ROE, ROA + 8q trend. *Compute.* `[compute]`

#### Estimates & analyst (real-time)
- Consensus EPS: current Q, next Q, FY1, FY2. *Raw: Finnhub or AV EARNINGS_ESTIMATE.* `[have-partial]` *Compute: y/y growth implied.*
- EPS revision count last 4w (up vs down). `[have]` (eps_rev_4w — extend to dollar magnitude of revision).
- Revenue estimates + revisions. *Same source.* `[have-partial]`
- Rating distribution (strong buy / buy / hold / sell / strong sell). *Raw: Finnhub recommendations.* `[have]` *Compute: bullish ratio + 4w Δ.*
- Price target: median, high, low, dispersion. *Raw: Finnhub.* `[NEW]` *Compute: implied upside vs spot, dispersion z-score.*
- Earnings surprise history (last 8q). *Raw: Finnhub earnings (extend storage).* `[have-snapshot]` *Compute: SUE = (actual − consensus) / σ_surprises.*

#### Valuation — **largely missing despite the data being available**
- Trailing P/E, forward P/E, PEG. *Raw: AV OVERVIEW + estimates.* `[have-partial]` *(only fwd_pe currently computed)* *Compute: vs own 5y, vs sector peers.*
- EV/EBITDA, EV/Sales, EV/FCF. *Compute from BS + IS.* `[compute]` *(none stored — every analyst quotes EV/EBITDA first)*
- P/B, P/S. *Compute.* `[compute]`
- Dividend yield, buyback yield, total yield. *Compute.* `[compute]`
- Free cash flow yield. *Compute.* `[compute]`
- DCF-implied fair value. *Compute: simple 2-stage DCF using consensus growth + reasonable WACC + terminal multiple.* `[compute]`
- Reverse DCF: implied growth at current price. *Compute.* `[compute]`

#### Price & technicals (daily)
- OHLCV. *Raw: Polygon.* `[have]`
- Returns: 1d, 5d, 21d, 63d, 126d, 252d. *Compute.* `[compute]`
- Momentum 12-1 (Jegadeesh-Titman). `[have]` (mom_12_1)
- Realized vol: 21d, 63d. *Compute.* `[have-partial]`
- Beta to SPY + sector ETF (rolling 252d). *Compute.* `[compute]`
- Relative strength vs sector, vs SPY. `[have]` (rs_vs_sector_3m — extend to 1m, 6m).
- Distance from 52w high/low. *Compute.* `[compute]`
- Distance from 50/200d MA. *Compute.* `[compute]`

#### Ownership & positioning
- Insider Form 4 transactions. *Raw: SEC EDGAR.* `[have-fetched-not-parsed]` *Compute: 90d net insider buying $.*
- Institutional ownership %, top holders, q/q Δ. *Raw: SEC 13F filings.* `[NEW parser]` *Compute: HF concentration, recent additions/exits.*
- Short interest, days to cover. *Raw: `[NEW]` FINRA biweekly.* *Compute: % of float, trend.*
- Borrow rate / hard-to-borrow flag. *Raw: `[NEW]` paid (Interactive Brokers SLB API).*

#### Catalysts & calendar
- Next earnings date. *Raw: Finnhub.* `[have]` (days_to_catalyst)
- Investor day, capital markets day. *Raw: `[NEW]` scrape IR sites or Finnhub events.*
- Index rebalance dates. *Raw: `[NEW]` S&P / FTSE schedule.*
- For Pharma: FDA PDUFA dates. *Raw: `[NEW]` FDA database.*
- Lockup expirations (post-IPO). *Raw: `[NEW]` SEC S-1 parse.*

#### Qualitative — the missing intelligence layer
- 10-K Item 1A Risk Factors — y/y delta (new risks added, removed). *Raw: SEC EDGAR HTML.* `[have-fetched-not-compared]` *Compute: LLM diff → flag new risks.*
- 10-K / 10-Q MD&A — narrative tone, language shift on key drivers. *Raw: SEC HTML (parsed by edgar/cluster-10k.js, output unused).* `[have-parsed-not-consumed]` *Compute: LLM-tagged tone Δ vs prior quarter.*
- Earnings call transcript — tone, guidance language, Q&A pushback intensity. *Raw: `[NEW]` Finnhub transcripts (paid tier) or scrape Seeking Alpha / IR.* *Compute: LLM-scored tone Δ + guidance direction.*
- 8-K material events. *Raw: SEC + 8k-summarizer.* `[have]` *Compute: LLM-classified event type + thesis impact.*
- Press releases. *Raw: own scrapers.* `[have-not-wired-to-sizing]` *Compute: tag to thesis driver.*
- News articles. *Raw: news pipeline + GPT-scored.* `[have-not-wired-to-sizing]` *Compute: tag to thesis driver, aggregate to thesis_drift_30d.*
- Litigation disclosures, going-concern language, auditor changes. *Raw: 8-K + 10-K.* *Compute: LLM-flagged.* `[compute]`

#### Industry-specific KPIs (per sub-sector)
- **SaaS**: ARR, NRR, RPO, billings, gross margin on subscription. *Raw: 10-Q + earnings deck.* *Compute: LLM-extracted from MD&A or transcripts (validate against XBRL when available).*
- **Hardware**: book-to-bill, channel inventory, ASP. *Same.*
- **Banks**: NIM, deposit β, NPL %, CET1 ratio. *Raw: 10-Q (XBRL has many).* *Compute: trend.*
- **Pharma**: phase progression, peak sales estimates, patent cliff schedule. *Raw: company filings + clinicaltrials.gov.*
- **Retail/Restaurants**: same-store sales, traffic, ticket size. *Raw: earnings releases.*
- **Energy E&P**: production (boe/d), F&D cost, breakeven oil. *Raw: 10-Q reserves disclosure.*
- **Semis**: utilization, lead times, inventory days. *Raw: earnings + transcripts.*

#### Comparables
- Peer set (5-10 closest by sector + size + business model). *Compute: sector + market-cap bucket + business-line tag.* `[compute]`
- Multiples vs peers (P/E, EV/EBITDA, EV/Sales). *Compute: peer median + percentile.* `[compute]`
- Growth vs peers, margin vs peers, return vs peers (1y, 3y). *Compute.* `[compute]`

#### Risk & exposures
- Beta to factors (size, value, momentum, quality, low-vol). *Compute: rolling regression vs Fama-French factor returns (`[NEW]` Ken French data library, free).* `[compute]`
- Customer concentration (top 10 customers % of revenue). *Raw: 10-K Item 1.* *Compute: extract.*
- Geographic revenue split. *Raw: 10-K segment data (XBRL).* *Compute: extract.*
- Supplier concentration. *Raw: 10-K.*

---

## Part 2 — News and Press: the Causal Layer

News is non-negotiable for a fundamental L/S fund. Without it you cannot answer the *why* underneath any factor. That's the core problem with the current design — every numerical signal sits in the dashboard as a shadow with no caster.

Concretely:
- **Low valuation σ without news** → is it a bargain, or a value trap because the market knows something? You can't tell.
- **High RS (relative strength) without news** → real catalyst, or a short squeeze that reverses next week? You can't tell.
- **Low earnings revision without news** → a one-quarter air pocket, or the start of a structural reset? You can't tell.

Factors describe *what* is happening to the price and the numbers. News describes *why*. Trading on factors alone is trading on shadows.

### Where news fits — three concrete roles

1. **Per-ticker, per-headline thesis-driver tagging.** Every headline with magnitude ≥ 0.5 on a held name → tagged to which thesis driver it touches (revenue growth / margin / competitive position / management / regulation / capital allocation), and classified `confirm | weaken | invalidate`.

2. **Aggregated as a Layer 3 factor (`thesis_drift_30d`).** Rolling 30-day weighted score per ticker, computed from (1). This becomes another column in the stock factor stack. **Unlike most existing factors it updates daily, not quarterly** — this is what materially upgrades the system from quarterly fundamentalism to actual hedge-fund cadence.

3. **Catalyst surfacing on Layer 1's morning brief.** Anything magnitude ≥ 0.7 on a held name surfaces as "needs review today." That's the analyst watchlist.

Without (1)–(3), the news pipeline is decoration. With it, news becomes the bridge between the slow fundamental signals and daily decision-making — which is the entire missing piece between this app and an actual hedge fund.

### Press releases

Same principle applies. Per-ticker press feeds the same thesis-driver tagging pipeline. They tend to be more material than news (company-issued, signal-rich) and should weight higher in the thesis-drift aggregate.

### SEC filings (10-K / 10-Q content)

A subset of "qualitative news" that's currently fetched and parsed but never consumed. The MD&A and Risk Factor sections of consecutive filings, diffed, produce some of the highest-signal qualitative inputs available — language drift on guidance, new risks added, segment commentary changes. Today this content sits in `edgar/edgar_parsed_json/` and never reaches a factor.

---

## Part 3 — Valuation Stack: What's Missing Today

Every analyst opens with the valuation multiples. Today the system computes exactly **one** of them (`fwd_pe`) from a data feed (Alpha Vantage) that already returns everything needed for the full standard stack:

| Metric | Status | Inputs already pulled |
|---|---|---|
| Trailing P/E | not stored | OVERVIEW |
| Forward P/E | `[have]` | OVERVIEW + estimates |
| PEG | not computed | + growth |
| EV/EBITDA | not computed | IS + BS (EBITDA derivable) |
| EV/Sales | not computed | IS + BS |
| EV/FCF | not computed | CF + BS |
| P/B | not computed | OVERVIEW + BS |
| P/S | not computed | OVERVIEW + IS |
| FCF yield | not computed | CF + market cap |
| Dividend yield | partial | OVERVIEW |
| Buyback yield | not computed | CF (share count Δ) |
| Total yield (div + buyback) | not computed | combine |
| DCF fair value | not computed | requires WACC + terminal assumptions |
| Reverse DCF (implied growth) | not computed | inverse of above |

EBITDA itself isn't stored despite being two lines of arithmetic from the income statement. Same disease as the 20-quarter history: data is paid for and discarded.

This is the cheapest substantive win in the entire redesign — every metric above is computable from data we already have. None require new sources.

---

## Part 4 — Database Design Principles

These are the rules the schema and the dashboard should follow. They're general; they apply to whatever specific tables and views we end up with.

### 1. Store the full history, not the latest snapshot

Most upstream APIs return multi-quarter or multi-year history (Alpha Vantage IS/BS/CF: ~20 quarters; SEC EDGAR: full filing history; FRED: full series). Our writes currently overwrite or only insert the latest. **Storage policy: append-only, dated, indexed by `(entity, period_end)`.** No "current" tables — current is just `MAX(period_end)`.

This unlocks all trend factors (margin trajectory, dilution rate, FCF growth, valuation z-score vs own history) at zero new fetching cost.

### 2. Levels AND changes — never just levels

A trader trades on changes. Every dashboard tile that shows a level (CPI = 3.2%, 10Y = 4.18%, sector regime_fit = +0.6) must also show:
- 1d Δ
- 1w / 1m Δ where relevant
- z-score vs own history (for things with history)
- Surprise vs consensus (for releases that have estimates)

Storage implication: when storing a level, store enough history to compute the Δ at read time. Don't precompute every Δ — compute at query time off the dated series.

### 3. Numbers from structured sources, AI for qualitative only

The reliability rule we've been operating under: **never let an LLM produce a numerical financial value that enters a model.** Numbers come from XBRL, Alpha Vantage statements, FRED, BLS — structured, auditable. LLMs are used only for:
- Classifying news/press/filings against thesis drivers
- Tone scoring
- Y/y diffs of qualitative text (Risk Factors, MD&A)
- Generating analyst-style explanations on top of deterministic factors

If we ever want an LLM to extract a number from text, we cross-check against the structured equivalent. No exceptions.

### 4. One composite per entity, with attribution

Each entity (ticker, sector, regime) should have **one headline conviction/score**, computed deterministically from its underlying factors, with the **top contributing reasons surfaced**. Not 9 colored cells — one number with "what's pulling it up, what's pulling it down."

The dashboard should always show: composite + the inputs that drove it. Never a black-box composite alone, never raw factors without the composite.

### 5. Per-name thesis as a first-class entity

Each of the 25 names has a row in a `THESIS` table:
- 3–5 named drivers (text + direction)
- Conviction (0–1)
- Fair value range (low / high)
- Tripwires (numerical or qualitative thresholds for thesis invalidation)
- `as_of`, `next_review_due`

The thesis is the unit of trading. Sizing flows from conviction. News and earnings get evaluated *against* the thesis, not in isolation. Versioned (one row per (ticker, version)) so we can audit thesis drift over time.

### 6. News and press wired to sizing through thesis

Currently terminal: news is scored, displayed, dies. Required: every material headline (mag ≥ 0.5) on a held name produces a `THESIS_EVENT` row with `(ticker, headline_id, driver_touched, impact ∈ {confirm, weaken, invalidate})`. Aggregated to `thesis_drift_30d` which feeds Layer 3's composite score, which feeds Layer 4's sizing.

This wire is what makes the news pipeline non-decorative.

### 7. The hardcoded sector-affinity matrix is the system's loudest unaudited prior

`workers/sector-factor-builder/src/worker.js` contains a 5-regime × 8-sector hand-tuned matrix that drives the strongest single component of sector stance (30% weight). It is not validated against historical regime/sector returns. Either:
- Replace with a backtested lookup from historical sector returns conditional on regime, OR
- Document explicitly as a manual prior the user owns and edits, with an audit trail.

Until one of these happens, every Layer 2 verdict carries the epistemic weight of a guess.

### 8. Show inputs *and* indicators, never just indicators

The user-facing rule: an analyst never trusts a black-box conviction score; they want to see the inputs and the score. The dashboard must always present both, with the inputs framed as *evidence for* the score. A composite alone is decoration; raw factors alone are noise. The combination is the deliverable.

---

## Part 5 — Current State vs. Target State

A summary of where we are, by bucket.

### Macro
- **Have**: 10Y/2Y/Fed Funds, CPI/Core CPI, NFP, UNEMP, FOMC text, Finnhub calendar, Polygon SPY.
- **Missing**: real yields, breakevens, PCE, PPI, wage growth, jobless claims, JOLTS, GDP, PMI proxy, Fed balance sheet, RRP, M2, VIX, credit spreads, put/call, FX (DXY etc), commodities (WTI, copper, gold), Treasury auctions.
- **Cadence problem**: macro-state-fetcher runs daily — fine. Most missing series are also daily/weekly via FRED — easy.

### Sector
- **Have**: 8 SPDR sector ETFs + RRG math, regime-fit lookup, eps_rev_4w aggregate, valuation σ from SSGA P/E.
- **Missing**: extend to 11 sectors, full valuation stack per sector, breadth measures, sector flows, 13F sector tilt, beat/guidance rates, all sector-specific KPIs.
- **Concern**: hardcoded affinity matrix carries 30% weight in stance with no validation.

### Stock
- **Have**: prices, momentum/vol/RS, single quarter of fundamentals, Piotroski, fwd P/E, eps_rev_4w, sue, days_to_catalyst.
- **Missing**: 20-quarter fundamental history (data already fetched, not stored), full valuation stack (data available), trend factors, financial-health composites beyond Piotroski, price targets and dispersion, parsed insider Form 4, 13F holdings, short interest, 10-K Risk Factor diff, MD&A tone diff, earnings transcripts, news → thesis-driver tagging, thesis_drift_30d, per-ticker thesis object, composite conviction score.
- **The single largest gap**: news/press/filings are pulled and parsed but never wired into a numerical signal. The whole qualitative pipeline is decoration.

### Database design
- **Have**: append-only ledgers for trades and prices.
- **Missing**: append-only history for fundamentals (currently overwritten/snapshot), thesis table, thesis-event table, per-ticker composite scores, daily Δ-derivation conventions.

---

## Part 6 — Parameters to Add (audit, 2026-04-26)

Net additions decided after the indicator audit. *What*, not *how* — sequencing and engineering live in the build plan. Anything paid or niche has been dropped and is not listed here.

### Storage / display contract (applies to everything below)
- Always store full history (append-only). Display is per-surface: scan tables show `level + Δ + z`; charts only on the stock detail page and on a small set of stock-level trends (margin, FCF, valuation z, composite).

### Tier 1 — derivable from data already pulled
- Backfill 20-quarter fundamentals (AV IS/BS/CF) — append-only.
- EBITDA + full valuation stack: trailing P/E, PEG, EV/EBITDA, EV/Sales, EV/FCF, P/B, P/S, FCF yield, dividend yield, buyback yield, total yield, DCF fair value, reverse-DCF implied growth.
- Trend factors off 20q history: margin trajectory, FCF growth, dilution rate, ROIC/ROE/ROA trend, valuation z-score vs own 5y.
- Consume already-parsed 10-K / 10-Q output: MD&A tone delta, Risk Factor y/y diff.
- Parse already-fetched insider Form 4: 90d net insider $ buying.
- Extend Polygon tickers: 8 → 11 SPDR sectors, plus DXY, WTI, Brent, copper, gold, VIX, VVIX.
- Price-derived breadth: % constituents above 50d / 200d MA, A/D line, McClellan, distance from 52w high/low, distance from 50/200d MA, returns 1d/5d/21d/63d/126d/252d, beta to SPY + sector.
- 8-quarter EPS surprise + SUE history.
- Price targets: median, high, low, dispersion (Finnhub).

### Tier 2 — free new sources
- FRED expansion: real yields (DFII5, DFII10), breakevens (T5YIE, T10YIE, T5YIFR), IG/HY credit spreads (BAMLC0A0CM, BAMLH0A0HYM2), initial jobless claims (ICSA), JOLTS, real GDP (GDPC1), Fed balance sheet (WALCL), reverse repo (RRPONTSYD), M2 (M2SL), CFNAI, ADS Index, S&P Global PMI proxy, PCE, PPI, wage growth, Conference Board Consumer Confidence.
- Sentiment / positioning: NAAIM Exposure Index, AAII bull/bear, CBOE put/call.
- 13F parser (SEC EDGAR): per-sector HF tilt + per-name HF concentration, q/q Δ.
- FINRA short interest: % float, days to cover.
- Earnings call transcripts via free scrape (Motley Fool / IR): tone delta, guidance language, Q&A pushback — LLM-scored.
- THESIS + THESIS_EVENT tables; wire news/press headlines (mag ≥ 0.5 on held names) to driver tagging → `thesis_drift_30d` factor.

### Tier 3 — aspirational, deferred
- Bottom-up sector valuation aggregates from constituent OVERVIEW.
- Sector-specific KPI extractors (SaaS ARR, Bank NIM, Pharma pipeline, etc.) via XBRL — per-sector engineering.
- Replace hardcoded sector-affinity matrix with backtested regime/sector return lookup.
- Fama-French factor betas (Ken French data).

### Explicitly dropped (do not add)
- ICE MOVE, Bloomberg/Refinitiv aggregates, paid card-spend panels, paid ETF flow data, Finnhub paid transcript tier, IB SLB borrow API, CME Fed Funds futures feed, Architecture Billings, Cass Freight, USDA ag, FERC, China credit impulse, index rebalance / lockup calendars, hard-to-borrow flags, Twitter/Reddit/Google Trends.

---

## What this implies — direction, not implementation

This document is the *what*, not the *how*. Subsequent work plans should:
1. Map each `[have-snapshot]` item to a backfill job and a schema change to append-only.
2. Map each `[NEW]` source to a fetcher worker with a documented cron and rate-limit profile.
3. Map each `[compute]` factor to a worker, with explicit inputs, formula, and where it surfaces in the dashboard.
4. Build the `THESIS` and `THESIS_EVENT` tables before wiring news to sizing — without thesis as a first-class entity, news has nothing to attach to.
5. Treat the dashboard redesign (composite + inputs, levels + Δ, ranked lists not colored grids) as a parallel workstream with its own plan, not as a downstream side-effect of the data work.

Order of operations and prioritization are in the build plan — not here.
