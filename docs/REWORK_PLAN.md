> [STRUCTURE](STRUCTURE.md)

# Rework Plan — Investment Counseling System

**Last updated**: 2026-04-12
**Status**: **Active** — Phase 4 (News Funnel) complete, dashboard redesign next

This document defines the target state for the Hedge-Portfolio rework. It is the **single source of truth** for what we're building, why, and in what order. No coding begins without referencing this plan.

---

## Vision

Transform the current data monitoring dashboard into a **professional investment counseling system** that produces justified, traceable, daily investment assessments for 25 portfolio tickers.

**Core principle**: Every output links to a verified source. No black-box scoring. Reliability over sophistication.

**Approach**: Long-term investing with progressive entries. Not prediction — probabilistic assessment backed by traceable evidence. This is a hedge fund for personal savings: we hedge against everything and always know what is happening around us. We are not daytrading — we are protecting savings from inflation in the safest way possible.

**Mindset**: There are SAVINGS in play. The system cannot afford to be wrong. Validation and full control of the process is the main value. A simple system that is always correct beats a complex system that is sometimes wrong.

---

## What the System Must Produce

### 1. Per-Stock Assessment (Alpha)

For each of the 25 tickers, daily:
- **Comparative score**: -1.0 to +1.0 (how does this stock look vs recent history AND vs its sector)
- **Relative performance**: always measured AGAINST sector and market — a stock dropping 3% when its sector drops 4% is outperforming, not falling
- **Probability state**: P(favorable) / P(neutral) / P(unfavorable) — updated daily with each new data point
- **Plain-language justification** with source links: why this score, what's driving it
- **Key driver**: the single most important thing about this stock right now
- **Flagged events**: stock-specific news that moved price (AAPL press release → new iPhone → stock +2.3%, sector +0.8%, so +1.5% alpha)
- **Probability curve chart** (last 90 days) overlaid with actual price — the information curve should lead the price curve

### 2. Market Context (Beta)

Single daily assessment:
- **Market regime**: bullish / cautious bullish / neutral / cautious bearish / bearish — with probability
- **S&P 500 direction**: our prediction as P(up), P(flat), P(down)
- **Why it moved**: what drove the market in the last 1-5 days, grounded in data
- **What's next**: upcoming catalysts, what they mean, what to expect
- **Portfolio action**: overweight/underweight sector recommendations based on regime
- **5-layer intelligence**: calendar, geopolitics, regulatory, sectors, market wave (keep existing system)
- **Fed stance** + upcoming catalysts (FOMC, CPI, employment)
- **Sentiment regime**: put/call, AAII, COT with historical comparison

### 3. Action Summary

- **Buy signals**: stocks where our assessment is strongest, with justification
- **Sell signals**: stocks where our assessment is weakest, with justification
- **Hedging suggestions**: based on current regime and sector exposure
- **Flagged discrepancies**: real-time events that explain price moves (AAPL press release → stock up → flagged)
- Upcoming catalysts ranked by expected impact
- Risk flags

---

## Dashboard Design

The dashboard has 6 tabs. Each serves a distinct purpose. No tab should contain walls of unreadable text. Information is headline-first, click-to-expand, numbers over prose.

### Tab 1: OVERVIEW (Results & Portfolio Value)

**Purpose**: How are my savings doing? This is RESULTS — not system health.

```
Portfolio Value: $XXX,XXX (+X.X% YTD)
vs S&P 500: +X.X% alpha

┌──────────┬──────────┬──────────┬────────────────┐
│Top Gainer│ Top Loser│  Hedges  │ Cash Position  │
│NVDA +12% │ BA -8%   │ 3 active │ 15%            │
└──────────┴──────────┴──────────┴────────────────┘

Equity Curve (90 days): portfolio vs S&P overlay chart

Top 5 Contributors         Bottom 5 Drags
NVDA  +$X,XXX              BA   -$X,XXX
AAPL  +$X,XXX              INTC -$X,XXX
```

**Data needed**: Polygon prices (Phase 1) + position data (manual input or config).

### Tab 2: DAILY (Today's Intelligence Feed)

**Purpose**: What happened today that I need to know? Scannable, headline-first, click-to-expand. No walls of text.

```
RELEASES TODAY (badges — click opens summary modal)
┌─────┐ ┌──────┐ ┌────────┐ ┌───────┐
│ CPI │ │ FOMC │ │ AAPL   │ │ JPM   │
│3.2% │ │ Stmt │ │ 10-Q   │ │ Press │
└─────┘ └──────┘ └────────┘ └───────┘
  ↓ click = summary of CPI, FOMC statement, SEC filing, press release

UPCOMING CATALYSTS (countdown timers)
  FOMC Meeting ··········· 12 days
  AAPL 10-Q ·············· 18 days
  CPI Release ············  3 days
  Employment Report ·····  8 days

MACRO HEADLINES (from news funnel — BETA_12)
  > China tariffs raised to 125%            [click to unfold]
    └ 2-3 sentence explanation, portfolio impact, source link
  > Fed signals pause on rate cuts
  > Oil drops below $60 on OPEC split

TICKER HEADLINES
  Filter: [All] [SEC] [Press] [News]
  NVDA > New Blackwell chip orders surge     +0.5
  AAPL > 10-Q filed: revenue flat YoY       [10-Q]
  BA   > FAA investigation expanded          -0.3
  (each unfolds on click → explanation + source)
```

**Key rules**:
- Headlines only, not paragraphs. Each headline is one line.
- Click to unfold = 2-3 sentence explanation underneath.
- If there was a RELEASE (macro data, FOMC, SEC filing, press release), it appears as a prominent badge at top with link to the summarized version.
- Countdown timers for important upcoming releases (FOMC, earnings/SEC, CPI, employment).

**Data sources**: News funnel (BETA_12), SEC filings, press releases, macro releases, FOMC calendar, earnings calendar. Most data exists — needs reformatting.

### Tab 3: MACRO (Market Direction & Prediction)

**Purpose**: Where is the market going and why? What should I do at portfolio level? This is prediction + justification.

```
MARKET REGIME: CAUTIOUS BULLISH
S&P 500: 5,234 (+0.3% today)
Our Prediction: P(up)=55%  P(flat)=30%  P(down)=15%

[Chart: S&P 90-day price + our probability overlay]
  → The information curve should LEAD the price curve

WHY IT MOVED (last 5 days, grounded in data)
  - CPI at 3.2% (above 3.1% expected) → rates stay higher → banks benefit
  - China tariff escalation → dampened tech outlook
  - Oil drop → positive for consumer discretionary

WHAT'S NEXT
  - FOMC in 12 days — market pricing 75% hold
  - Employment report in 3 days — consensus +180K
  - If CPI trend continues → Fed stays hawkish

PORTFOLIO ACTION
  - Overweight: Banks (rate benefit), Energy (inflation hedge)
  - Underweight: Growth tech (rate sensitive)
  - Hedge: Consider XOM/CVX as inflation hedge

5-LAYER INTELLIGENCE (clickable for detail)
  Calendar ███░░  Geopolitics ████░  Regulatory ██░░░
  Sectors  ███░░  Market Wave ████░
```

**Key rules**:
- Separate "what happened" from "what's next" from "what to do." Never mix them.
- Every claim links to the data that produced it (CPI number → BLS source).
- The prediction is a probability distribution, not a yes/no.
- No recent macro events list here (that belongs in Daily tab).

**Data needed**: Polygon S&P prices (Phase 1), probability engine (Phase 6), restructured macro summarizer prompts.

### Tab 4: PORTFOLIO (25 Stocks — Relative Signals)

**Purpose**: Which individual stocks stand out RELATIVE to the market? Buy/sell signals with justification. The key word is RELATIVE.

```
SECTOR SUMMARY
  Tech +0.8%  Pharma -0.3%  Banks +1.2%
  Energy +2.1%  Consumer +0.0%  Industrial -0.5%

SIGNALS (sorted by strength)

  BUY SIGNALS                    SELL SIGNALS
  ┌────────────────────┐  ┌────────────────────┐
  │ XOM  +0.7 ■■■■■■■░ │  │ INTC -0.6 ■■■■■■░ │
  │ Energy + rate play  │  │ Losing share to AMD│
  │ vs sector: +1.2%   │  │ vs sector: -2.1%   │
  └────────────────────┘  └────────────────────┘

FLAGGED EVENTS (stock-specific, not market moves)
  AAPL: New iPhone announced (press release)
        Stock +2.3% (sector +0.8%, so +1.5% alpha)
  NVDA: Blackwell orders 3x expected
        Stock +4.1% (sector +0.8%, so +3.3% alpha)

ALL 25 TICKERS (click to expand)
  ┌──────┬───────┬──────────┬──────────┬──────────┐
  │Ticker│ Score │vs Sector │ Driver   │ Next Cat │
  │ AAPL │ +0.3  │ +0.5%   │ iPhone   │ 10-Q 18d │
  │ MSFT �� +0.1  │ -0.2%   │ Cloud rev│ 10-Q 10d │
  └──────┴───────┴──────────┴──────────┴──────────┘
  (click row → full justification + probability curve + all sources)
```

**Key rules**:
- ALWAYS show performance relative to sector and market. "INTC -3%" means nothing if tech is -4%. "INTC -3% when tech is +2%" = massive red flag.
- Separate stock-specific moves from market-wide moves. If everything is down because of interest rates, don't flag individual stocks for going down — flag the ones that didn't go down (outperformers) or went down more than expected.
- This is the HEDGE FUND tab: show what to buy AND what to sell, because hedging means having both sides.
- Explain discrepancies in real time as news comes in.

**Data needed**: Prices (Phase 1), fundamentals (Phase 2), earnings (Phase 3), assessment engine (Phase 5), probability engine (Phase 6).

### Tab 5: VALIDATION (keep, enrich)

Existing AI fact verification + parser health checks. Working well. Add:
- News funnel validation row (URL validity, LLM coherence, API output) — **done**
- Price data freshness check (Phase 1)
- Fundamentals consistency check (Phase 2)
- Consensus validation results (see Consensus Validator section below)

### Tab 6: MONTHLY CHECK (keep as-is)

Manual validation that opens all pages to verify content is actually there. Working well. No structural change.

---

## Data Processing Architecture

### The Three Layers

The critical design: **separate facts from interpretation, and interpretation from recommendation**. AI never invents numbers — it explains numbers that the computation layer already produced.

```
LAYER 1: DATA (APIs — no AI, no hallucination risk)
  ├── Prices: Polygon daily OHLCV → PRICE_01_Daily
  ├── Fundamentals: Alpha Vantage → FUND_01_Fundamentals
  ├── Earnings: Finnhub → FUND_02_Earnings
  ├── Analyst consensus: Finnhub → FUND_03_Recommendations
  ├── News headlines: RSS + Finnhub → BETA_12_News_digest
  ├── SEC filings: Edgar → existing ALPHA tables
  ├── Macro indicators: BLS/FRED → existing BETA tables
  ├── Sentiment: CBOE/COT/AAII → existing tables
  └── Press releases: Company IR → existing ALPHA tables

LAYER 2: COMPUTATION (math — no AI, deterministic)
  ├── Price vs sector average (relative performance)
  ├── Price vs market (S&P 500 beta-adjusted)
  ├── P/E vs historical average, vs sector average
  ├── Earnings surprise magnitude and trend
  ├── Analyst consensus shift (upgrades - downgrades)
  ├── Days until catalyst (FOMC, earnings, CPI)
  ├── Factor scoring: each factor → +1 / 0 / -1
  ├── Weighted composite: trust level determines weight
  └── Bayesian probability update (daily)

LAYER 3: INTERPRETATION (AI — controlled, validated)
  ├── "Why did it move?" — grounded in Layer 2 facts only
  ├── "What's the direction?" — justified by factor scores
  ├── "What should I do?" — hedging suggestions from signals
  ├── EVERY AI output gets fact-checked against Layer 1
  └── THEN checked against market consensus (see below)
```

**Rule**: Layer 3 can only reference facts that exist in Layer 1 and computations from Layer 2. If the AI says "revenue grew 15%", that number must exist in FUND_01_Fundamentals or ALPHA_01_Reports. If it doesn't, the statement is flagged as ungrounded.

---

## Consensus Validator (Layer 3.5)

### The Problem

Even with a perfect pipeline, our conclusions could be wrong. Not because the data is wrong, but because our INTERPRETATION is biased, incomplete, or misses the dominant market narrative. Example:

- Our pipeline processes all data and concludes: "Nasdaq is going down because Anthropic AI is disrupting the industry"
- This may be technically true, but if 95% of investors think "Nasdaq is going down because of the trade war" and only 1% care about Anthropic, then our conclusion is misleading — we're focusing on a minor factor and missing the elephant in the room
- A hedge fund that acts on a 1% factor while ignoring the 95% factor will lose money

### The Solution: Consensus Check

After Layer 3 produces its conclusions, we run a **Consensus Validator** that checks whether our interpretation aligns with broad market opinion. This is NOT about being a follower — it's about making sure we haven't missed the obvious.

### How It Works

```
LAYER 3 OUTPUT (our conclusion)
  "S&P will decline because tech earnings disappoint"
  "Buy XOM — energy sector benefits from rate environment"
  "Sell INTC — losing market share to AMD"
        │
        ▼
CONSENSUS VALIDATOR
  │
  ├── Step 1: NEUTRAL SEARCH (don't confirm, investigate)
  │     Query: "S&P 500 outlook this week" (NOT "S&P declining")
  │     Query: "XOM stock outlook" (NOT "XOM bullish")
  │     Query: "INTC stock outlook" (NOT "INTC bearish")
  │     → Get the GENERAL sentiment, not confirmation of ours
  │
  ├── Step 2: OPPOSING SEARCH (actively look for the other side)
  │     If our conclusion is bearish → search for bullish arguments
  │     If our conclusion is bullish → search for bearish arguments
  │     → What are the strongest counter-arguments?
  │
  ├── Step 3: WEIGHT ASSESSMENT
  │     How many sources agree with our view vs disagree?
  │     What is the DOMINANT narrative? (the 95% vs the 1%)
  │     Are there major factors we didn't consider?
  │
  └── Step 4: CONFIDENCE ADJUSTMENT
        If consensus strongly agrees → high confidence, proceed
        If consensus is mixed → medium confidence, note dissent
        If consensus strongly disagrees → LOW confidence, FLAG IT
        If we missed a major factor → ADD IT to our assessment
```

### Critical Design Rules

1. **Never search for your own conclusion.** If you concluded "NVDA bullish", don't search "NVDA bullish outlook." Search "NVDA stock outlook" neutrally. Otherwise you only find people who agree with you (confirmation bias).

2. **Always search for the opposite.** If bullish, actively search for bear cases. If bearish, search for bull cases. The strength of your conclusion is measured by how weak the opposing arguments are.

3. **Measure consensus WEIGHT, not existence.** Any conclusion you make will have SOME people who agree. The question is: is this the 95% view or the 1% view? The search must quantify this.

4. **Flag dominant narratives we missed.** If our pipeline says "tech down because of AI disruption" but every investor forum says "tech down because of tariffs", we need to ADD tariffs to our assessment even if our pipeline didn't highlight it. The pipeline is not omniscient.

5. **This is validation, not generation.** The consensus validator does NOT change our conclusion. It adds a confidence level and flags disagreements. The final assessment says: "Our signal: bearish INTC. Consensus alignment: HIGH (78% of sources agree). Noted counter-argument: INTC's foundry pivot may be underpriced."

### Implementation

**Search sources** (in order of reliability):
- Gemini with Google Search grounding (broad market coverage, real-time)
- Financial news aggregators (via news funnel — already available)
- Reddit r/investing, r/wallstreetbets, r/stocks (retail sentiment gauge)
- Analyst consensus data (Finnhub — already in pipeline, Level 3 trust)

**Prompt structure for the validator AI**:

```
You are a market consensus checker. You are NOT generating investment advice.
You are checking whether an existing conclusion aligns with market opinion.

OUR CONCLUSION: [the Layer 3 output]
OUR REASONING: [the factor scores and justification]

SEARCH RESULTS (NEUTRAL): [results from neutral search]
SEARCH RESULTS (OPPOSING): [results from opposing search]

Answer these questions:
1. DOMINANT NARRATIVE: What is the #1 reason most investors give for
   the current [market/stock] direction? Does it match ours?
2. CONSENSUS LEVEL: What % of sources align with our view?
   (>80% = high, 50-80% = medium, <50% = low)
3. MISSED FACTORS: Did we miss any major factor that most sources mention?
4. COUNTER-ARGUMENTS: What is the strongest argument against our conclusion?
5. CONFIDENCE: Given all the above, should we be HIGH / MEDIUM / LOW confidence?

Output as JSON. Do not add opinions. Report what the market thinks.
```

**Output stored in**: `SIGNAL_03_Consensus` table

| Field | Type | Description |
|-------|------|-------------|
| id | text PK | SHA-256 hash |
| date | text | Assessment date |
| target | text | "market" or ticker symbol |
| our_conclusion | text | What Layer 3 produced |
| dominant_narrative | text | What most investors think |
| consensus_level | real | 0.0-1.0 alignment score |
| missed_factors | text | Factors we didn't consider (JSON array) |
| strongest_counter | text | Best argument against our view |
| confidence | text | HIGH / MEDIUM / LOW |
| search_sources | text | JSON array of sources checked |
| created_at | text | Timestamp |

**When to flag**: If `consensus_level < 0.4` OR `missed_factors` is non-empty → the assessment gets a warning badge in the dashboard. The user sees: "Our signal says X, but market consensus disagrees — click to see why."

**Cost**: ~1 Gemini call per ticker assessed + 1 for macro = ~26 calls/day. Within free tier.

---

## Data Architecture

### Trust Hierarchy

Every data source has an explicit trust level. Higher-trust sources override lower-trust ones. Every claim in the output must be traceable to a source at a known trust level.

```
LEVEL 1 (Highest) — Official filings and government data
  SEC Filings (10-K, 10-Q, 8-K, Form 4)
  BLS indicators (CPI, PPI, Employment)
  FRED data (Interest Rates, Bank Reserves)
  FOMC Statements and Minutes

LEVEL 2 — Primary company communication
  Press releases from company IR pages

LEVEL 3 — Verified third-party metrics
  Alpha Vantage OVERVIEW (computed from official filings)
  Finnhub earnings data (expected vs actual, from consensus)
  Finnhub analyst recommendations

LEVEL 4 — Market data
  Stock prices (Polygon.io / Finnhub)
  VIX term structure, put/call ratios, AAII, COT

LEVEL 5 (Lowest) — News flow
  Google News RSS headlines
  Finnhub company news
  AI synthesis of news

LEVEL 6 — Consensus check (external validation only)
  Gemini web search grounding
  Reddit / financial forums sentiment
  → Used to VALIDATE Layer 3, never to generate signals
```

### Data Sources — Current vs Target

| Source | Status | Action |
|--------|--------|--------|
| SEC Filings | Working | Keep as-is |
| Press Releases | Working (~92% uptime) | Keep, fix fragile scrapers |
| BLS/FRED Macro | Working | Keep, add time-series storage |
| FOMC/White House | Working | Keep as-is |
| CBOE/COT Sentiment | Working | Keep as-is |
| AAII Sentiment | Partial (manual MHTML) | Keep manual for now |
| News Funnel (RSS + Finnhub) | **Done** (Phase 4) | Deploy and test |
| Stock Prices | **Missing** | Add via Polygon.io (Phase 1) |
| Fundamentals (P/E, EPS, margins) | **Missing** | Add via Alpha Vantage (Phase 2) |
| Earnings (expected vs actual) | **Missing** | Add via Finnhub (Phase 3) |
| Analyst Consensus | **Missing** | Add via Finnhub (Phase 3) |
| Consensus Validation | **Missing** | Add via Gemini + web search (Phase 7) |

---

## New API Integrations

### Finnhub.io (Free Tier)

**Rate limit**: 60 calls/minute, no daily cap. No credit card required.

| Endpoint | Data | Usage |
|----------|------|-------|
| `/stock/earnings` | Expected EPS, actual EPS, surprise %, multiple quarters | Earnings momentum factor |
| `/stock/metric?metric=all` | P/E, margins, ROE, ROA, growth rates | Supplementary fundamentals |
| `/stock/recommendation` | Analyst buy/hold/sell consensus, monthly history | Analyst sentiment factor |
| `/company-news` | Headline, summary, source, URL, datetime | News funnel — structured input |
| `/stock/candle` | OHLCV price data | Daily prices (backup to Polygon) |

**Daily budget**: ~75 calls (25 tickers x 3 endpoints). Well within 60/min limit.

### Alpha Vantage (Free Tier)

**Rate limit**: 25 calls/day total, 5 calls/minute burst.

| Endpoint | Data | Usage |
|----------|------|-------|
| `OVERVIEW` | 51 fields: RevenueTTM, EPS, PERatio, ForwardPE, OperatingMarginTTM, ProfitMargin, 52WeekHigh/Low, 50/200 DMA, AnalystTargetPrice, DividendYield, MarketCap, Beta | Core fundamentals — 1 call per ticker |

**Daily budget**: 25 calls = exactly 25 tickers x 1 OVERVIEW each. Run once in evening.

### Polygon.io (Free Tier — Key Already Exists)

**Rate limit**: 5 calls/minute. Historical data limited to 2 years.

| Endpoint | Data | Usage |
|----------|------|-------|
| `/v2/aggs/ticker/{ticker}/prev` | Previous day OHLCV | Daily price data |

**Daily budget**: 25 calls for daily prices. At 5/min, takes 5 minutes.

### Google News RSS (No Key Required)

**URL pattern**: `https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en`

**Self-throttle**: 1-2 second delay between requests.

### Gemini API (For Consensus Validator)

**Model**: gemini-2.5-flash with Google Search grounding
**Rate limit**: Free tier allows sufficient calls for daily validation
**Usage**: ~26 calls/day (25 tickers + 1 macro consensus check)

---

## News Funnel Design (DONE)

**Status**: Phase 4 complete. Three workers built, migration ready. Needs deployment and end-to-end test.

News is **Level 5 trust** — least important source, but useful for context and the Daily tab headlines.

### Pipeline

```
STAGE 1: Gather (news-funnel-gatherer) — pure HTTP, no AI
  ├── Google News RSS: ~20 titles per ticker (25 tickers)
  ├── Google News RSS: 8 macro categories
  ├── Finnhub /company-news: 25 tickers (structured, with summaries)
  ├── Deduplicate by title similarity
  └── Total: ~200-400 headlines after dedup

STAGE 2: Filter (news-funnel-filter) — single GPT-4o-mini call
  ├── Select 1-4 headlines per ticker ranked by importance
  ├── Select 10 macro headlines categorized by market impact
  └── Output: ~35-75 relevant headlines

STAGE 3: Summarize (news-funnel-orchestrator) — Gemini with Google Search
  ├── 2-3 sentence summary per headline with market context
  ├── Batched 5 at a time with rate limiting
  └── Write to BETA_12_News_digest in D1

Validation: news-funnel-checker validates URLs, LLM output coherence, API responses
```

---

## Assessment Model

### How the Score Works

The score is NOT a black-box weighted model. It is a **structured comparative assessment** where each factor is evaluated as better/same/worse vs recent history, then combined into a directional signal.

```
Per-ticker daily assessment:

QUANTITATIVE FACTORS (from APIs — reliable, verifiable)
  ├── Earnings momentum: Did estimates go up/down? Last surprise +/-?
  ├── Valuation context: P/E vs 5yr average, vs sector
  ├── Price position: Where vs 50/200 DMA? Near 52wk high/low?
  ├── Analyst consensus: Net upgrades/downgrades recently?
  ├── Relative performance: Stock vs sector vs market (alpha)
  └── Insider activity: Net buying or selling? (from Form 4)

QUALITATIVE FACTORS (from pipeline — contextual, comparative)
  ��── SEC filing narrative: How does this quarter compare to last?
  ├── Press release substance: Any material announcements?
  ├── Macro alignment: Is macro helping or hurting this sector?
  ├── News direction: What's the narrative around this stock?
  └── Sentiment context: Is the market positioned for/against?

COMPOSITE:
  Each factor → better (+1) / same (0) / worse (-1)
  Weighted by trust level (Level 1 factors weigh more than Level 5)
  Combined into -1.0 to +1.0 score
  Score comes WITH the explanation of which factors drove it

CONSENSUS CHECK (post-scoring):
  Score + justification → Consensus Validator
  → Confidence level: HIGH / MEDIUM / LOW
  → Missed factors flagged
  → Final output includes both our signal AND consensus alignment
```

### Probability Curve

Daily Bayesian updating of P(favorable), P(neutral), P(unfavorable) per ticker:
- Prior: market base rates (~40% neutral, ~30% favorable, ~30% unfavorable)
- Each data point shifts probabilities proportional to its trust level
- Stored daily → builds the 90-day curve
- Displayed alongside actual price chart for comparison
- The information curve should lead the price curve by days/weeks

---

## Validation — Expanded Role

The validation system is the **reliability backbone**. It expands to cover new data sources and the consensus layer.

### Current Checks (Keep)

- SEC filing ingestion check
- Macro indicator freshness check
- Sentiment data check
- Press release scraper health
- Policy page availability check
- AI hallucination detection (fact verification)
- News funnel throughput + URL validity + LLM coherence — **done**

### New Checks (Add)

| Check | What It Validates | Phase |
|-------|-------------------|-------|
| Price data freshness | Polygon returned today's data for all 25 tickers | 1 |
| Fundamentals consistency | Alpha Vantage OVERVIEW data matches expected ranges | 2 |
| Earnings data check | Finnhub earnings data is recent and complete | 3 |
| Cross-source validation | SEC filing says "revenue grew" → Alpha Vantage RevenueTTM confirms | 5 |
| Score traceability | Every assessment score decomposes into factors with sources | 5 |
| Consensus alignment | Flag any assessment where consensus_level < 0.4 | 7 |
| Missed factor detection | Flag any assessment where consensus found factors we didn't consider | 7 |

---

## New Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `PRICE_01_Daily` | Daily OHLCV per ticker | ticker, date, open, high, low, close, volume |
| `FUND_01_Fundamentals` | API-sourced metrics per ticker | ticker, date, revenue_ttm, eps, pe_ratio, operating_margin, profit_margin, fcf, market_cap, 52w_high, 52w_low, 50dma, 200dma, analyst_target, beta |
| `FUND_02_Earnings` | Expected vs actual per quarter | ticker, period, estimate, actual, surprise, surprise_pct |
| `FUND_03_Recommendations` | Analyst consensus per ticker | ticker, date, strong_buy, buy, hold, sell, strong_sell |
| `SIGNAL_01_Assessment` | Daily composite score per ticker | ticker, date, score, factors_json, explanation, sources_json |
| `SIGNAL_02_Probability` | Daily probability state per ticker | ticker, date, p_favorable, p_neutral, p_unfavorable |
| `SIGNAL_03_Consensus` | Consensus validation per assessment | date, target, our_conclusion, dominant_narrative, consensus_level, missed_factors, strongest_counter, confidence |
| `BETA_12_News_digest` | News funnel output | **exists** |

Existing tables remain unchanged.

---

## Implementation Phases (Revised)

| Phase | What | Depends On | Unlocks |
|-------|------|-----------|---------|
| ~~**4**~~ | ~~News funnel pipeline~~ | ~~Nothing~~ | ~~Done~~ |
| **1** | Polygon.io daily prices + `PRICE_01_Daily` | Nothing | Overview equity curve, Portfolio "vs sector", Macro S&P chart |
| **2** | Alpha Vantage OVERVIEW + `FUND_01_Fundamentals` | Nothing | Portfolio valuation context |
| **3** | Finnhub earnings + recommendations + `FUND_02/03` | Nothing | Portfolio earnings momentum + analyst consensus |
| **4a** | Dashboard v2: Daily tab | News funnel (done) | Usable daily intelligence feed NOW |
| **4b** | Dashboard v2: Macro tab | Existing data + prompt restructure | "What happened / what's next / what to do" |
| **5** | Assessment engine: quantitative + qualitative → score | Phases 1-3 | The -1 to +1 score with justification |
| **6** | Probability engine + `SIGNAL_01/02` tables | Phase 5 | Daily probability state, 90-day curve |
| **7** | Consensus Validator + `SIGNAL_03_Consensus` | Phase 5 | Confidence levels, missed factor detection |
| **8** | Dashboard v2: Portfolio + Overview tabs | Phases 5-7 | Full signal board with charts + consensus badges |
| **9** | Expanded validation for new data sources | Phases 1-3, 7 | Cross-source + consensus validation |

**Parallelism**:
- Phases 1, 2, 3 can run in parallel (independent API integrations)
- Phases 4a, 4b can start immediately (data exists)
- Phase 5 requires 1-3 complete
- Phases 6, 7 are sequential after 5
- Phase 8 requires 5-7
- Phase 9 can run alongside 6-8

---

## What Stays, What Goes, What's New

### Keep (Working Well)
- SEC Edgar pipeline — qualitative analysis with AI clustering
- Press release scrapers — primary company intelligence (fix fragile ones)
- BLS/FRED macro indicators — official, reliable
- FOMC/White House scraping — automated policy tracking
- CBOE/COT/AAII sentiment — market structure data
- 5-layer macro intelligence — best feature in the system
- Validation system — expand, don't reduce
- Monthly check — manual verification backbone
- Cloudflare Workers + D1 architecture
- Deterministic SHA-256 IDs

### Remove
- GPT web search for news discovery (replaced by news funnel — done)
- Manual HTML news download (replaced by APIs)
- News curator agent (replaced by rules-based filtering)
- Walls of text in dashboard (replaced by headline-first design)

### Add
- Polygon.io price integration
- Alpha Vantage fundamentals integration
- Finnhub earnings + recommendations integration
- Assessment computation engine
- Probability engine with Bayesian updating
- **Consensus Validator** — web search validation of conclusions
- Signal history storage
- Price chart with probability overlay
- Relative performance everywhere (vs sector, vs market)
- Buy/sell signal pairs (hedge fund = both sides)
- Catalyst countdown timers
- Cross-source validation checks
- Dashboard redesign: headline-first, click-to-expand, numbers over prose

---

## Design Principles

1. **Source traceability**: Every number, every claim, every score component must link to a verifiable source at a known trust level.
2. **Comparative over absolute**: "Revenue trend improving" (comparing SEC filings) is more reliable than "Revenue is $94.9B" (extracted number that might be wrong).
3. **API for facts, AI for meaning**: Structured data comes from APIs (prices, P/E, earnings). AI synthesizes and explains — it does not discover or extract.
4. **Validation before features**: A new data source is not "done" until its validation check exists and passes.
5. **Reliability over sophistication**: A simple system that's always correct beats a complex system that's sometimes wrong.
6. **Relative over absolute**: A stock's performance only matters relative to its sector and the market. Never show absolute moves without context.
7. **Headlines over paragraphs**: The dashboard shows headlines first. Details are behind a click. If the user has to read a paragraph to understand a signal, the design has failed.
8. **Conclusions need consensus**: Every AI-generated recommendation passes through the Consensus Validator. We trust our pipeline, but we verify against the market.
9. **Hedge both sides**: Always show buy AND sell signals. A hedge fund hedges — show what to overweight AND what to underweight.

---

> [STRUCTURE](STRUCTURE.md)
