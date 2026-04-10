> [STRUCTURE](STRUCTURE.md)

# Rework Plan — Investment Counseling System

**Last updated**: 2026-04-10
**Status**: **Active** — Frozen goal, not yet started

This document defines the target state for the Hedge-Portfolio rework. It is the **single source of truth** for what we're building, why, and in what order. No coding begins without referencing this plan.

---

## Vision

Transform the current data monitoring dashboard into a **professional investment counseling system** that produces justified, traceable, daily investment assessments for 25 portfolio tickers.

**Core principle**: Every output links to a verified source. No black-box scoring. Reliability over sophistication.

**Approach**: Long-term investing with progressive entries. Not prediction — probabilistic assessment backed by traceable evidence.

---

## What the System Must Produce

### 1. Per-Stock Assessment (Alpha)

For each of the 25 tickers, daily:
- **Comparative score**: -1.0 to +1.0 (how does this stock look now vs recent history)
- **Probability state**: P(favorable) / P(neutral) / P(unfavorable) — updated daily with each new data point
- **Plain-language justification** with source links: why this score, what's driving it
- **Key driver**: the single most important thing about this stock right now
- **Probability curve chart** (last 90 days) overlaid with actual price — the information curve should lead the price curve

### 2. Market Context (Beta)

Single daily assessment:
- **Macro regime**: 5-layer intelligence (keep existing system)
- **Fed stance** + upcoming catalysts (FOMC, CPI, employment)
- **Sentiment regime**: put/call, AAII, COT with historical comparison
- **Market movers**: top events driving the market today, with explanations

### 3. Action Summary

- Which stocks shifted meaningfully and why
- Upcoming catalysts ranked by expected impact
- Risk flags

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
```

### Data Sources — Current vs Target

| Source | Current Status | Target Status | Action |
|--------|---------------|---------------|--------|
| SEC Filings | Working — qualitative analysis with AI | Keep as-is | None |
| Press Releases | Working — 25 scrapers, ~92% uptime | Keep, fix fragile scrapers | Maintenance |
| BLS/FRED Macro | Working — latest + previous values | Keep, add time-series storage | Enhance |
| FOMC/White House | Working — automated scraping | Keep as-is | None |
| CBOE/COT Sentiment | Working — automated | Keep as-is | None |
| AAII Sentiment | Partial — manual MHTML download | Keep manual for now | None |
| News (GPT web search) | Working but unreliable for automation | Replace with API + RSS funnel | Rework |
| News (manual HTML) | Not automated, paywalled sources | Remove — replaced by API funnel | Remove |
| Stock Prices | **Missing** | Add via Polygon.io or Finnhub | New |
| Fundamentals (P/E, EPS, margins) | **Missing** | Add via Alpha Vantage OVERVIEW | New |
| Earnings (expected vs actual) | **Missing** | Add via Finnhub /stock/earnings | New |
| Analyst Consensus | **Missing** | Add via Finnhub /stock/recommendation | New |

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

**Daily budget**: ~75 calls (25 tickers × 3 endpoints). Well within 60/min limit.

### Alpha Vantage (Free Tier)

**Rate limit**: 25 calls/day total, 5 calls/minute burst.

| Endpoint | Data | Usage |
|----------|------|-------|
| `OVERVIEW` | 51 fields: RevenueTTM, EPS, PERatio, ForwardPE, OperatingMarginTTM, ProfitMargin, 52WeekHigh/Low, 50/200 DMA, AnalystTargetPrice, DividendYield, MarketCap, Beta | Core fundamentals — 1 call per ticker |

**Daily budget**: 25 calls = exactly 25 tickers × 1 OVERVIEW each. Run once in evening.

### Polygon.io (Free Tier — Key Already Exists)

**Rate limit**: 5 calls/minute. Historical data limited to 2 years.

| Endpoint | Data | Usage |
|----------|------|-------|
| `/v2/aggs/ticker/{ticker}/prev` | Previous day OHLCV | Daily price data |

**Daily budget**: 25 calls for daily prices. At 5/min, takes 5 minutes.

### Google News RSS (No Key Required)

**URL pattern**: `https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en`

| Query Type | Example | Expected Results |
|------------|---------|-----------------|
| Ticker news | `q=AAPL+stock` | ~20 headlines per ticker (use top 20) |
| Macro topics | `q=federal+reserve`, `q=CPI+inflation`, `q=oil+prices+OPEC` | ~100 per topic, filter to top relevant |

**Self-throttle**: 1-2 second delay between requests. No official rate limit but Google can block aggressive use.

---

## News Funnel Design

News is **Level 5 trust** — least important source, but still useful for context and macro awareness. The funnel is designed to be cheap, automated, and low-noise.

### Pipeline

```
STAGE 1: Gather headlines (free, no AI)
  ├── Google News RSS: ~20 titles per ticker (25 tickers = ~500)
  ├── Google News RSS: 5-8 macro categories = 100-200 titles
  ├── Finnhub /company-news: 25 tickers (structured, with summaries)
  └── Total: ~600-700 headlines

STAGE 2: Filter (cheap — rules + light AI)
  ├── Deduplicate same story from multiple sources
  ├── Frequency filter: stories appearing 3+ times are likely important
  ├── Relevance filter: discard SEO, clickbait, old rehashes
  └── Output: 30-50 headlines that matter

STAGE 3: Overview (selective)
  ├── Finnhub already provides summaries for company news
  ├── For top macro stories: brief AI overview (not full read)
  └── Output: 30-50 headlines with brief context

STAGE 4: Synthesize (AI adds value here)
  ├── Per-ticker: news context feeds into daily assessment
  ├── Macro: news feeds into 5-layer intelligence system
  └── Focus: what does this mean, not what happened
```

### Macro News Categories

| Category | Google News Query | Purpose |
|----------|------------------|---------|
| Central Banks | `federal+reserve+interest+rates` | Fed policy, rate decisions |
| Inflation | `CPI+PPI+inflation+data` | Price pressure tracking |
| Geopolitics | `trade+war+sanctions+geopolitics` | Risk events |
| Energy/Commodities | `oil+prices+OPEC+commodities` | Energy sector + inflation input |
| Labor Market | `unemployment+jobs+employment+data` | Economic health |

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
  └── Insider activity: Net buying or selling? (from Form 4)

QUALITATIVE FACTORS (from pipeline — contextual, comparative)
  ├── SEC filing narrative: How does this quarter compare to last?
  ├── Press release substance: Any material announcements?
  ├── Macro alignment: Is macro helping or hurting this sector?
  ├── News direction: What's the narrative around this stock?
  └── Sentiment context: Is the market positioned for/against?

COMPOSITE:
  Each factor → better (+1) / same (0) / worse (-1)
  Weighted by trust level (Level 1 factors weigh more than Level 5)
  Combined into -1.0 to +1.0 score
  Score comes WITH the explanation of which factors drove it
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

The validation system is the **reliability backbone**. It expands to cover the new data sources:

### Current Checks (Keep)

- SEC filing ingestion check
- Macro indicator freshness check
- Sentiment data check
- Press release scraper health
- Policy page availability check
- AI hallucination detection

### New Checks (Add)

| Check | What It Validates |
|-------|-------------------|
| Price data freshness | Polygon returned today's data for all 25 tickers |
| Fundamentals consistency | Alpha Vantage OVERVIEW data matches expected ranges |
| Earnings data check | Finnhub earnings data is recent and complete |
| News funnel throughput | Google RSS + Finnhub returned non-empty results |
| Cross-source validation | SEC filing says "revenue grew" → Alpha Vantage RevenueTTM confirms |
| Score traceability | Every assessment score can be decomposed into its factors with sources |

---

## New Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `PRICE_01_Daily` | Daily OHLCV per ticker | ticker, date, open, high, low, close, volume |
| `FUND_01_Fundamentals` | API-sourced metrics per ticker | ticker, date, revenue_ttm, eps, pe_ratio, operating_margin, profit_margin, fcf, market_cap, 52w_high, 52w_low, 50dma, 200dma, analyst_target, beta |
| `FUND_02_Earnings` | Expected vs actual per ticker per quarter | ticker, period, estimate, actual, surprise, surprise_pct |
| `FUND_03_Recommendations` | Analyst consensus per ticker | ticker, date, strong_buy, buy, hold, sell, strong_sell |
| `SIGNAL_01_Assessment` | Daily composite score per ticker | ticker, date, score, factors_json, explanation, sources_json |
| `SIGNAL_02_Probability` | Daily probability state per ticker | ticker, date, p_favorable, p_neutral, p_unfavorable |

Existing tables remain unchanged.

---

## Implementation Phases

| Phase | What | Depends On | Key Outcome |
|-------|------|-----------|-------------|
| **1** | Polygon.io daily prices + `PRICE_01_Daily` table | Nothing | Price data for all 25 tickers stored daily |
| **2** | Alpha Vantage OVERVIEW + `FUND_01_Fundamentals` table | Nothing | P/E, EPS, margins, analyst targets for all 25 tickers |
| **3** | Finnhub earnings + recommendations + `FUND_02/03` tables | Nothing | Earnings surprise data + analyst consensus |
| **4** | Google News RSS + Finnhub news → filtering pipeline | Nothing | Automated news funnel replacing GPT web search |
| **5** | Assessment engine — quantitative + qualitative → score | Phases 1-4 | The -1 to +1 score with justification |
| **6** | Probability engine + `SIGNAL_01/02` tables | Phase 5 | Daily probability state, 90-day curve |
| **7** | Dashboard rework — assessment view + price overlay | Phases 5-6 | User-facing signal board with charts |
| **8** | Expanded validation for new data sources | Phases 1-4 | Cross-source validation, score traceability |

Phases 1-4 can run in parallel (no dependencies between them).
Phase 5 requires all of 1-4.
Phases 6-8 are sequential after 5.

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
- Cloudflare Workers + D1 architecture
- Deterministic SHA-256 IDs
- Dashboard structure (rework UI, keep backend pattern)

### Remove
- GPT web search for news discovery (replaced by API + RSS funnel)
- Manual HTML news download (Bloomberg/WSJ/Reuters — replaced by APIs)
- News curator agent (replaced by rules-based filtering)

### Add
- Polygon.io price integration
- Alpha Vantage fundamentals integration
- Finnhub earnings + recommendations integration
- Google News RSS headline gathering
- Assessment computation engine
- Probability engine with Bayesian updating
- Signal history storage
- Price chart with probability overlay
- Cross-source validation checks
- Morning brief / action summary view

---

## Design Principles

1. **Source traceability**: Every number, every claim, every score component must link to a verifiable source at a known trust level.
2. **Comparative over absolute**: "Revenue trend improving" (comparing SEC filings) is more reliable than "Revenue is $94.9B" (extracted number that might be wrong).
3. **API for facts, AI for meaning**: Structured data comes from APIs (prices, P/E, earnings). AI synthesizes and explains — it does not discover or extract.
4. **Validation before features**: A new data source is not "done" until its validation check exists and passes.
5. **Reliability over sophistication**: A simple system that's always correct beats a complex system that's sometimes wrong.

---

> [STRUCTURE](STRUCTURE.md)
