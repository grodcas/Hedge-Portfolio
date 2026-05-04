# PARAMETER_DECISIONS · Free-source decisions per gap / unused row

**Sprint**: SPRINT_2026-05-04_dashboard_balance · Sub-sprint B
**Date**: 2026-05-04
**Inputs**: [AUDIT_INVENTORY.md](AUDIT_INVENTORY.md)
**Output discipline**: KEEP-with-new-source / CALCULATE-from-existing / DROP. One row per GAP / UNUSED. Reason included.

> Default is **drop > placeholder**. Where a slot fits but the new field-type doesn't fit the original idiom, the new mockup reshapes the slot minimally — same visual language, different content. No "phase 2" tiles.

> **⚠️ See §0 below — feasibility-revised decisions** override most of the original DROPs in §1–3. The original section is kept for traceability; §0 is the live decision set used by the v2-balanced mockup.

---

## §0 · FEASIBILITY-REVISED DECISIONS · 4-month rule

**Date added**: 2026-05-04 (post-review)
**Rule**: a slot is feasible if it can be *initialized* via a one-off backfill OR will be *fully populated within 4 months* of forward writes. Only slots failing both tests are dropped.

This rule overrides earlier "drop > placeholder" calls where the underlying data is one backfill or a few months of accumulation away. The v1 audit was over-conservative; this section is the live truth for the v2-balanced mockup.

### Slots restored from §1–3 DROPs (now keep — feasible)

| § ref | Slot | Why feasible |
|---|---|---|
| TB-2 | Regime confidence (e.g. "72%") | Pipeline writes regime + confidence as structured fields once added; populates immediately on next macro-intelligence-builder run. |
| T-1 | Tripwire counter (0/4 fired) | Same — once structured tripwire flags are added, current state populates immediately. |
| T-7 | News drift 24h breakdown by impact (CONFIRM/WEAKEN/INVALIDATE) | LLM driver-tagging classifier can be **re-run over historical BETA_12_News_digest** → full backfill. AI sprint adds the classifier; one batch run initializes. |
| T-8 | Convergence summary | Engine reads historical FUND_01 / STOCK_FACTORS / BETA_12 / TICKER_TREND / SECTOR_FACTORS / MOVER_EXPLANATIONS — all initialized. Compute signal alignment per historical day. |
| B-12, B-13 | 8q Margin / FCF Book sparklines | AV `INCOME_STATEMENT` / `CASH_FLOW` `quarterlyReports` array returns **20 quarters per call**. Pipeline currently throws away [1..3, 5..7]. One change to persist the full array → instant 8q + 20q backfill. |
| B-14 | EPS revisions 4w | **NOT FEASIBLE** — Refinitiv / Visible Alpha only. Sole DROP. |
| M-3 | 12m regime trajectory bars | Re-run macro-intelligence-builder over historical MACRO_STATE_indicators (which IS initialized via FRED bulk pull) → retrospective regime label per period. |
| M-6 | DXY / EURUSD / WTI / Copper / Gold | FRED + Yahoo bulk-init feasible. Add to price-fetcher / macro-state-fetcher in pipeline sprint. |
| M-7 | VVIX / NAAIM | yfinance ^VVIX free; NAAIM weekly free CSV. Bulk-init feasible. |
| S-4 | Sector breadth >50d MA | Compute from constituent prices via Yahoo bulk daily history. Feasible for full ETF-top-10 universe per sector. |
| CV-1..CV-4 | Convergence cards | Engine runs over historical state — see T-8. |
| H-4, H-5 | Hedge cover %, Hedge table | Add `kind` column to PORTFOLIO_01_Holdings; user tags hedges as user goes. Within 4mo of adoption, table populates. |
| N-4 | Drivers ×counts (CONFIRM/WEAKEN/INVALIDATE) | Re-classify historical BETA_12 with driver-tagging classifier (AI sprint deliverable). |
| N-5 | Tripwires (per-driver thresholds + status) | Structured per-driver thresholds added in pipeline sprint. Computes from current values immediately. |
| N-8 | Recommendation block (verb + delta + prose) | Sizing engine builds today; runs over current portfolio state immediately on day 1. |
| N-10 | 12 multiples (PEG, EV/EBITDA, EV/Sales, EV/FCF, P/B, P/S, FCF yield, Buyback yield, Total yield, etc.) | All in AV `OVERVIEW.raw_json` already. Promote to typed columns OR read raw_json at query time. **For yields needing share-count history (Buyback, Total)**: AV BALANCE_SHEET `commonStockSharesOutstanding` is in quarterlyReports — full 20q history one backfill away. |
| N-11 | 5y mean / z / peer median / peer pctile / vs SPY | Own-5y from FUND_01 daily history (initialized via PRICE_01 + AV statements 20q backfill). Peer median via static peer_set config + cross-pull. vs SPY via SPY composite multiples (PRICE_01 + S&P 500 aggregate financials). All feasible. |
| N-13 | Reverse DCF (NTM/terminal/WACC implied) | valuation-curve-builder writes structured fields (NTM, terminal, WACC) directly once added — immediately populated on next run. |
| N-14, N-15 | 20q sparklines + 3y CAGR + 8q slope | AV quarterlyReports backfill — see B-12. |
| N-16 | DSO, DIO, share count Δ8q | Same — quarterly balance sheet history one backfill away. |
| N-17 | Altman Z, Beneish M, ROIC | Derive from AV financials. All inputs initialized via the same 20q backfill. |
| N-18 | Estimates Q1/Q2/FY/FY+1 (consensus + range + revisions 4w) | **NOT FEASIBLE** — Refinitiv / Visible Alpha. Sole large DROP. |
| N-19 | Price targets (median/high/low) + dispersion | Finnhub `/stock/price-target` — free tier. Already feasible. |
| N-22 | Earnings keypoints incl. transcript | Free transcript scraper (e.g., motley fool, company IR transcripts) feasible. ~25 transcripts populate within 4mo (1 quarter of prints). |
| N-25, N-26 | 10-K Risk Factors y/y diff + MD&A tone delta | Compute at query time from existing ALPHA_02_Clusters. Already feasible — restored. |
| N-27 | Earnings call tone delta | Once transcript scraper added (see N-22), classifier runs over corpus. Within 4mo. |
| N-28 | 5-row peer comps table | Static peer-set config (per ticker → list of 5 peer tickers, ~125 entries total) + cross-pull current FUND_01 for each peer. Initialize immediately. |
| MA-6 | FOMC dot-plot, SEP, statement diff, market reaction | Federal Reserve archive provides historical dot-plot CSV + SEP table per meeting (40 meetings × 5y). Statement diff is text comparison of `MACRO_STATE_fomc.statement_text` (already stored). Market reaction snapshot is PRICE_01 ±2d around meeting date. All initialize-able. |
| SE-7 | Pair / Hedge ideas | AI generation per sector — runs day 1. |
| TP-1..TP-4 | Tape theme overlay (curated 6-theme vocabulary) | Re-classify historical BETA_12 with theme classifier. Initialize-able batch run. |

### The single slot that fails the rule (still DROP)

| Slot | Reason |
|---|---|
| **N-18 Estimates per-quarter consensus + 4w revisions tape** | Sell-side per-quarter consensus + revisions count requires Refinitiv or Visible Alpha — paid. Free Finnhub gives only PT distribution + ratings. No feasible substitute within 4 months. |

This is the **only** slot dropped from the v2-balanced mockup on feasibility grounds. EPS↑ column in the Book table is also dropped for the same reason (it's the per-row revisions tape).

### New slots ADDED (UNUSED → surface) — feasible day 1

| New slot | Source | Status |
|---|---|---|
| **Stock-price 1y sparkline column** in Book | PRICE_01_Daily, last 252 bars | Yahoo bulk-init feasible. Live now in mockup. |
| **Price detail card** (1y line chart + last/52w hi-lo/50DMA/200DMA) on Name slide-out | PRICE_01_Daily for the ticker | Same. Live in mockup. |
| **SPY · 1y price card** on Macro slide-out | PRICE_01_Daily for SPY | Same. Live. |
| **Sector ETF · 1y price card** on Sector slide-out | PRICE_01_Daily for the ETF (XLE/XLK/etc.) | Same. Live. |
| **Recent macro prints mini-table** in Macro slide-out | MACRO_STATE_indicators / BETA_03_Macro · last 8 weeks · 9 indicators | Live. See revised lineup below — every row is verified against current scrapers. |
| **P/C, AAII, COT mini-tiles** in cross-asset Vol·Positioning | BETA_04_Sentiment | Already ingested (CBOE Puppeteer / AAII / CFTC). Live. |

### Reverted additions (post critical review)

| Slot | Why removed |
|---|---|
| **Probability strip** (SIGNAL_02_Probability) on Name slide-out | LLM-emitted subjective probabilities with no calibration; false precision. Conflicts with reliability memory ("don't trust AI-extracted numbers in models"). The frozen final-goal "probability curves" wants calibrated frequentist probabilities, not three LLM-generated bars. Removed. |
| **Consensus check card** (SIGNAL_03_Consensus) on Name slide-out | Two paragraphs of LLM prose plus a fabricated `consensus_level` number with no methodology. Duplicates the **Read** card at the top of the slide-out, which already does interpretation with sourcing. Removed. |
| **Model accuracy footer** (SIGNAL_03_ValuationRealized) inside Valuation card | Borderline. Sample size too small for trustworthy gap-closure %. Will likely return after the back-test accumulates ≥50 forecasts. Removed for now. |

### Recent macro prints — verified lineup

The first version of this table (CPI, Core CPI, NFP, UNEMP, ICSA, ISM Mfg) included two indicators we don't ingest. Corrected to match `macro/scraper.js` + `macro-state-fetcher` actuals:

| Row | Source | Status |
|---|---|---|
| CPI Headline | BLS `CUUR0000SA0` | ✅ ingested |
| Core CPI | BLS `CUUR0000SA0L1E` | ✅ ingested |
| PPI Final Demand | BLS `WPSFD4` | ✅ ingested, **first time surfaced** |
| Nonfarm Payrolls | BLS `CES0000000001` | ✅ ingested |
| Unemployment Rate | BLS `LNS14000000` | ✅ ingested |
| UMich Consumer Sentiment | UMich CSV | ✅ ingested, **first time surfaced** |
| Inflation Expectations 1Y | UMich CSV | ✅ ingested, **first time surfaced** |
| Inflation Expectations 5Y | UMich CSV | ✅ ingested, **first time surfaced** |
| Bank Reserves (WRESBAL) | FRED `WRESBAL` | ✅ ingested, **first time surfaced** |

**Dropped from the original table**:
- ICSA (Initial Claims) — not in `macro/scraper.js`. The MACRO slide-out's signpost list mentions claims but data isn't ingested. Pipeline-sprint candidate.
- ISM Mfg — not ingested anywhere. Same.

Interest rates, yield curve, Fed funds, WALCL are deliberately NOT in the prints table because they already appear elsewhere — the cross-asset Map's RATES column (daily live levels with 1w/1m delta) and the Macro anchor header (Fed funds + WALCL). Adding them to a "prints" table would be duplication of the same number in the same surface.

### CBOE Skew — queued for pipeline sprint

`macro/scraper.js :: getSkew` reads CBOE daily skew CSV but the result is **not pushed via `ingest-macro`** (PARSED-BUT-LOST per the audit). Pipeline sprint must wire it through. Once persisted in `BETA_03_Macro` (or a structured column), surface as a 7th tile in Vol · Positioning — tail-risk indicator alongside VIX / VVIX / NAAIM / P-C / AAII / COT.

### Net effect (vs the §1–3 over-conservative version)

- **Restored**: Convergence section, Hedge table, 12-multiple Valuation table with all 7 columns, Reverse DCF, 20q Fundamentals charts, 8q DSO/DIO/share-count, Altman/Beneish/ROIC, Peer comps 5-row, FOMC dot-plot/SEP/diff blocks, Tape theme overlay, driver-tagged news, recommendation block.
- **Added**: 4 stock-price surfaces + 5 UNUSED→surface tiles/cards.
- **Sole drop**: per-quarter EPS consensus + revisions tape (paid feed only, no free substitute, won't populate in 4mo).

### Pipeline-sprint actions implied by this section

1. Persist the **full** AV `quarterlyReports` array per endpoint (not just [0]+[4]). One-shot backfill of all 25 tickers gives 20q of revenue / margins / FCF / balance-sheet / share-count history immediately.
2. Add a **typed `regime` + `confidence` field** to the macro-intelligence output. Run retroactively over historical MACRO_STATE_indicators for the 12m trajectory bars.
3. Add **structured `tripwires` JSON column** to TICKER_TREND_long and macro thesis output.
4. Add **`kind` column** to PORTFOLIO_01_Holdings (`null | hedge_macro | hedge_pair | core_long | core_short`).
5. Add **driver-tagging classifier** (AI agent) and run it as a batch over historical BETA_12_News_digest. Same classifier handles the 6-theme Tape vocabulary.
6. Add **transcript scraper** (free source: e.g. motley fool / IR pages) and a tone classifier.
7. Add **dot-plot + SEP parser** for federalreserve.gov archive PDFs/CSVs.
8. Add **peer_set config table** (per-ticker → list of 5 peer tickers).
9. Confirm `price-fetcher` covers SPY + 11 sector ETFs + DXY/EURUSD/WTI/Copper/Gold/VIX/VVIX symbols.
10. Confirm `macro-state-fetcher` covers DGS2/DGS10/DFII5/T5YIE/T5YIFR/BAMLC0A0CM/BAMLH0A0HYM2/WALCL.

These are the line items the next pipeline-implementation sprint plan should pick up.

---

> The rest of this document (§1–3 below) is the original sub-sprint B output, kept for traceability. The decisions in those sections are **superseded** by §0 wherever they conflict.

---

## 🔴 GAP rows — decisions

### Top bar / Today

| Mock # | Field | Decision | Source / Method |
|---|---|---|---|
| TB-1 | "AI fresh · 6m ago" | **CALCULATE** | `MAX(created_at)` over TICKER_TREND_long ∪ SECTOR_TREND_long ∪ macro-narrative; render minutes-ago. |
| TB-2 | Regime label + confidence | **DROP confidence number, KEEP label** | `MACRO_STATE_indicators` doesn't carry a structured regime; `macro-intelligence-builder` writes a narrative, not typed `regime+confidence` columns. The narrative may say "late-cycle expansion" — extract the label only. The "72%" in the mockup is fabricated; until the AI sprint persists a structured regime, drop the % and the "4 of 6 indicators consistent" sub-line. |
| T-1 | "0/4 tripwires" | **DROP** | Same reason — tripwire structured state lives in narrative only. Re-introduce in the AI agent sprint. |
| T-2 | News 24h count (held names) | **CALCULATE** | `COUNT(*) FROM BETA_12_News_digest WHERE date=today AND ticker IN (held)` (display "held names" wording). |
| T-3 | Big moves 14d count | **CALCULATE** | over PRICE_01: count of |daily return| > 2σ on a 60d rolling vol, over the last 14 trading days, restricted to held names ∪ cross-asset symbols. |
| T-4 | Attention queue (top 3) | **KEEP — simple-rule version** | Define `att = w₁·|drift| + w₂·dtc_proximity + w₃·|news_drift_30d| + w₄·thesis_state` with `w₁=40, w₂=30, w₃=20, w₄=10`, normalized 0–100. Same field name but a deterministic rule, not the composite "attention" of the v1 spec. |
| T-7 | News drift 24h breakdown by impact | **DROP** | "CONFIRM / WEAKEN / INVALIDATE" requires per-event tagging to thesis drivers — an AI-agent step that's the explicit deliverable of `SPRINT_ai_agent_wiring.md`. Replace the 4-line breakdown with a single line: "**N events · net sentiment +X.XX**" using BETA_12.sentiment×magnitude aggregation, which is honest deterministic data. |
| T-8 | Convergence summary at top | **DROP entire convergence surface** | The 8-signal engine doesn't exist. Replace with a single line in Today: "Conviction extremes today — top 3 long, top 3 short by `TICKER_TREND_long.score`". Convergence section in the body is removed (see B-9 below). |

### Book

| Mock # | Field | Decision | Source / Method |
|---|---|---|---|
| B-2 | Sector code | **KEEP — static config** | Per-ticker sector mapping is a 25-row config; not a DB lookup. Use the same TEC/ENE/HCR/IND/COM/STA/DIS/MAT/RES/FIN/UTL codes the mockup already uses. |
| B-3 | Side L/S | **KEEP — derived from POSITION_01** | `qty < 0 → S`, else `L`. Pure short books would need a separate flag; for now, sign-based works. |
| B-8 | Thesis tag (INTACT/DRIFT/WEAK/BROKEN) | **DROP and replace with 5-bucket regime label** | Replace with `TICKER_TREND_long.regime` directly: bullish / cautious_bullish / neutral / cautious_bearish / bearish. The 5-bucket regime is a structured field; the 4-bucket thesis-state is not. Visually same idiom (small colored tag); semantics honest. |
| B-9 | Att score | **KEEP — same simple rule as T-4** | Same calc as T-4. |
| B-10 (5y z) | Forward P/E own-5y z | **KEEP — calculated from FUND_01 daily history** | FUND_01 is written daily with `forward_pe`; rolling-window z over the last 252×5 trading days is straightforward. Where history doesn't yet reach 5y, use whatever is available and label "z (Ny)" with the actual N. Drop the cell only when history < 60d. |
| B-11 | EV/EBITDA + own-5y z | **KEEP — read from `FUND_01.raw_json`** | AV OVERVIEW returns `EVToEBITDA` inside the raw blob already persisted. Read it at query-time. Z over rolling history same as B-10. (Pipeline sprint will later promote it to a typed column; this sprint surfaces what exists.) |
| B-12 | Margin sparkline (8q) | **DROP** | We persist only [0]+[4] of AV quarterlyReports today — no 8q to draw. Reshape the slot: replace with a single value `Op margin (TTM, Δ vs prior year): 67.4% (+1.8pp)` — using `FUND_01.operating_margin` and the `_prev` sibling already kept. Honest, fits the same row. |
| B-13 | FCF sparkline (8q) | **DROP** | Same reason. Replace with `FCF margin TTM, Δ YoY` derived from CFO and Revenue: `cfo / revenue_ttm` and the prior-year version. |
| B-14 | EPS revisions 4w | **DROP from the Book table** | Sell-side revisions count requires a paid feed. Keep the cell removed from Book; keep "FUND_03 ratings distribution" only on the Name slide-out (N-20). |

### Map · Macro

| Mock # | Field | Decision | Source / Method |
|---|---|---|---|
| M-3 | 12m regime trajectory bars | **DROP** | Depends on regime-classifier history we don't keep. Drop the bars; keep the regime label tile. |
| M-5 | IG OAS / HY OAS | **KEEP — confirm FRED ingestion** | FRED `BAMLC0A0CM` / `BAMLH0A0HYM2` are the canonical free series. Verify `macro-state-fetcher` includes them; if not, add to the **next sprint's** parser list (not this one). For *this* mockup, render values from MACRO_STATE_indicators.indicator_code lookups; if missing, label "—" gracefully. |
| M-6 | DXY / EURUSD / WTI / Copper / Gold | **KEEP — FRED + yfinance** | FRED: `DTWEXBGS` (broad-dollar-index proxy for DXY, free), `DCOILWTICO` (WTI), `PCOPPUSDM` (copper monthly — daily not free; yfinance HG=F is fine), `GOLDAMGBD228NLBM` (London gold AM fix). EURUSD: yfinance `EURUSD=X`. All free. (Confirm `price-fetcher` covers these symbols in pipeline sprint.) |
| M-7 (VVIX, NAAIM) | VVIX, NAAIM | **VVIX KEEP via yfinance ^VVIX (free); NAAIM KEEP via NAAIM weekly CSV (free)** | Both are free standard series. Confirm in pipeline sprint that they're added to the daily/weekly fetch. |

### Sector strip

| Mock # | Field | Decision | Source / Method |
|---|---|---|---|
| S-2 (cross-check) | 1D / 5D / 1M return per sector | **KEEP — yfinance ETF prices** | XLE/XLK/XLF/XLC/XLP/XLV/XLU/XLI/XLB/XLY/XLRE — 11 ETF symbols. Pipeline sprint must confirm price-fetcher pulls them. |
| S-4 | Breadth >50d MA | **KEEP — calculated** | per sector, `% of constituents above 50d MA` from PRICE_01. Requires constituent price coverage — see "Open questions" below. If the price universe is portfolio-only (25 names), breadth is biased; better to use the ETF top-10 holdings (well-known free static list per ETF) as the breadth basis and document the limitation. |

### Convergence section

| Mock # | Field | Decision | Source / Method |
|---|---|---|---|
| CV-1..CV-4 | Convergence cards (firing signals, suggested action, "approaching" footer) | **DROP entire section** | The 8-signal engine isn't built. Replacing with a 1-signal version ("conviction extremes") would mislead; the section's whole point is signal *alignment*. Cut the section, restore in a later sprint. The Today line ("Conviction extremes" — see T-8) carries the lighter version. |

### Hedges section

| Mock # | Field | Decision | Source / Method |
|---|---|---|---|
| H-4 | Hedge cover % | **DROP** | Requires a `kind=hedge` flag we don't have. |
| H-5 | Hedge table | **DROP** | Same reason — no hedge metadata model. Keep H-1/H-2/H-3 (KPIs) only and reshape the Hedges section into a single 3-tile strip: Net dollar / Net beta-adj / Gross. Three honest numbers > four numbers + a fake table. |

### Name slide-out

| Mock # | Field | Decision | Source / Method |
|---|---|---|---|
| N-4 | Drivers with CONFIRM/WEAKEN counts | **DROP the counts; KEEP driver list as plain bullets** | Drivers themselves are stored as `TICKER_TREND_long.drivers` JSON `[{text, bias}]`. Render the bullets and color by bias (positive/negative/neutral). The "×4 confirmed in last 14d" tally requires per-event driver-tagging which doesn't exist. |
| N-5 | Tripwires | **DROP** | No structured tripwire fields. Re-add when AI sprint persists them. |
| N-8 | Recommendation block | **REPLACE with sizing-vs-target line** | Plain text: "Current X.X% · Target Y.Y% · Drift ±Zpp · Last sizing change date (note)". Deterministic from PORTFOLIO + POSITION + TRADE_LEDGER. The "trim toward 5.5%" prescriptive recommendation requires a sizing engine — not built. |
| N-9 | Notes (last 60d) | **REPLACE with `TICKER_TREND_long.narrative`** | The trend narrative is the closest equivalent the data layer has — render the bullets array as the notes list. Add user-note creation to a later sprint. |
| N-10 | Valuation multiples (12 rows) | **KEEP 8 rows from `FUND_01.raw_json` + 1 typed column; DROP 3** | KEEP: Trailing P/E, Forward P/E, **PEG (raw_json.PEGRatio)**, **EV/EBITDA (raw_json.EVToEBITDA)**, **EV/Sales (raw_json.EVToRevenue)**, **P/B (raw_json.PriceToBookRatio)**, **P/S (raw_json.PriceToSalesRatioTTM)**, Dividend yield (typed col). DROP: EV/FCF (no AV field, fragile derived), FCF yield (derived & sensitive to capex normalization), Buyback yield (would require share-count history we don't keep), Total yield (composite of unavailable). Net: 8 multiples, all honestly sourced. |
| N-11 | 5y mean / z / peer median / peer pctile / vs SPY columns | **KEEP own-5y mean & z; DROP peer median / peer pctile / vs SPY** | Own-5y mean & z computable from FUND_01 daily history (rolling). Peer median requires a peer set table that doesn't exist; "vs SPY" requires SPY composite multiples (computable in principle but would balloon scope). Trim columns to: Multiple / Now / 5y mean / z. Same idiom — 4 columns instead of 7. |
| N-12 | DCF fair value | **KEEP as-is** | `SIGNAL_03_ValuationCurve_long.fair_value` already exists. |
| N-13 | Reverse DCF (NTM/terminal/WACC) | **DROP** | Not structured today. The valuation-curve `rationale` text is free-form prose; extracting NTM/terminal/WACC is a parsing exercise that fragile across rationales. |
| N-14, N-15 | 20q sparklines (revenue / op margin / FCF) + CAGR | **DROP, replace with TTM-and-YoY row** | Only [0]+[4] kept today. Reshape: a single "Revenue TTM · YoY · Op margin TTM · YoY · FCF TTM · YoY" tile-strip with 6 numbers. Honest at the cost of losing the trajectory; re-add the 20q sparklines after pipeline sprint persists full quarterly history. |
| N-16 | R&D %, GM, DSO, DIO, ND/EBITDA, share count Δ | **KEEP what's in raw_json; DROP DSO/DIO/share-count Δ** | KEEP: Gross margin (cur+prev derivable), R&D % (raw_json.ResearchAndDevelopmentExpensesTTM / RevenueTTM), Net debt/EBITDA (raw_json.EVToEBITDA proxy isn't right; instead use TotalDebt - cash from balance sheet, /EBITDA from income statement). DROP: DSO and DIO (need quarterly receivables/inventory history — only [0]+[4] persisted), Share count Δ8q (only [0]+[4] persisted). |
| N-17 | Composite quality (Piotroski, Altman, Beneish, ROIC, ROE, ROA) | **KEEP Piotroski, ROE, ROA; DROP Altman, Beneish, ROIC** | Piotroski → STOCK_FACTORS_daily (typed). ROE/ROA → `raw_json.ReturnOnEquityTTM` / `ReturnOnAssetsTTM`. DROP Altman Z (needs market cap / book value / EBIT history aligned), Beneish M (8 ratios over 2y), ROIC (NOPAT / IC, requires careful calculation). Re-add later when typed and validated. |
| N-18, N-19 | Estimates (consensus / range / revisions) + price targets | **REPLACE with Finnhub-free version** | Free Finnhub gives `/stock/price-target` (median/high/low + lastUpdated) — KEEP the price-target row with median / high / low / dispersion (σ/μ from std dev, computable). DROP the per-quarter / per-year consensus + revisions tape (paid). Reshape Estimates card as: "Price target distribution + Rating distribution + Surprise history". Three rows instead of five. (Confirm Finnhub free tier `/stock/price-target` is being captured by `macro/backfill_fundamentals_finnhub.js`; if not, add to pipeline sprint.) |
| N-22 | Last earnings keypoints | **KEEP — derive from 10-Q + PR (drop transcript bullets)** | ALPHA_02_Clusters Items 7 (MD&A), 8 (financials), 1A (risks) + ALPHA_03_Press for the earnings press release. Drop transcript-derived bullets. The keypoints become 5–7 deterministic bullets sourced from the structured filings; tone delta lives in N-26. |
| N-24 | Aggregate thesis drift 30d + per-driver breakdown | **KEEP aggregate; DROP per-driver breakdown** | Aggregate = sum(BETA_12.sentiment × magnitude) over 30d for the ticker. Per-driver requires driver-tagging (AI). |
| N-25 | 10-K Risk Factors y/y diff (NEW lines) | **KEEP — calculable from clusters** | ALPHA_02_Clusters Item 1A current vs prior year; cluster-text diff at line level → flag NEW / strengthened / removed. Pure deterministic. Persist the diff in this sprint? **NO — read at query time.** |
| N-26 | MD&A tone delta | **KEEP — deterministic classifier** | Item 7 cluster text, simple sentiment per quarter, delta vs prior. No LLM needed; can be a finite-vocabulary rule (positive / neutral / cautious words tally). |
| N-27 | Earnings call tone delta | **DROP** | Transcript not ingested. |
| N-28 | Peers table | **REPLACE with smaller version using STOCK_FACTORS_daily** | STOCK_FACTORS_daily.peer_median_pe is a single number — useful as a "vs peer median" indicator but not enough to render 5 peer rows. Replace the full peers table with a single "Peer median fwd P/E" tile in the Valuation card, plus a note "Peer set: see config". Drop the 5-row peer table. (Re-add when a peer-set table is introduced.) |

### Macro slide-out

| Mock # | Field | Decision | Source / Method |
|---|---|---|---|
| MA-6 (dot plot, SEP, statement diff, market reaction) | structured FOMC blocks | **DROP all four; KEEP statement_text-derived bullets** | Dot plot, SEP, statement diff, market reaction blocks all require structured fields (or post-processing) we don't persist. Replace with a single "Last FOMC keypoints" foldable using the existing `MACRO_STATE_fomc.statement_text` (LLM summary at refresh time, or a simple bullet extractor). |

### Sector slide-out

| Mock # | Field | Decision | Source / Method |
|---|---|---|---|
| SE-7 | Pair / Hedge ideas | **DROP** | No metadata model. |

### Tape slide-out

| Mock # | Field | Decision | Source / Method |
|---|---|---|---|
| TP-1 | News theme tags | **DROP theme overlay; KEEP news rows** | The 6-theme curated vocabulary requires AI tagging. Without tags, the "matching" cue between News and Moves columns falls away. Render News rows with: date / source / headline / tickers (no color tags). |
| TP-2 | Moves theme tags | **DROP overlay** | Same reason. Render Moves with: date / ticker / move% / desc (BETA_12 headline if a same-day news exists for that ticker, else dash). |
| TP-3 | Unexplained moves "no theme match" | **REDEFINE deterministically** | Without theme tags, redefine "unexplained" as: a >2σ price move with **no BETA_12 news for the same ticker within ±2 trading days**. Surface those in a separate column — same visual idiom, different definition. |
| TP-4 | Theme filter chips | **DROP** | Replace with two filter chips: "Held names only" / "All". |

---

## 🔵 UNUSED — propose to surface or leave latent

| Source | Decision | Where to surface (if KEEP) |
|---|---|---|
| BETA_04_Sentiment (put-call, AAII bull/bear, COT net) | **KEEP — surface 3 mini-tiles in Vol·Positioning column** | Add to Map cross-asset's Vol·Positioning group: P/C ratio (eq), AAII bull-bear, COT ES net (asset mgr). Same tile idiom as VIX/VVIX/NAAIM — fits cleanly. |
| MACRO_STATE_indicators individual prints (CPI, NFP, UNEMP, JOLTS, ICSA, etc.) | **KEEP — surface in Macro slide-out** | Add a "Recent prints" mini-table to Macro slide-out: indicator / period / value / prior / Δ. ~10 rows. New visual idiom is the same as the existing `driver-row` block. |
| Fed funds DFF / target upper / target lower | **KEEP — Macro slide-out header** | Currently the regime header reads "stance / 1w Δ / tripwires". Replace 1w-Δ and tripwires (dropped) with "Fed funds 4.50–4.75%" and "Bal sheet $7.4T (WRESBAL)". Two structured numbers > two narrative-derived fields that don't exist. |
| UMich Consumer Sentiment + Inflation Expectations 1Y/5Y | **LATENT** | Not enough room without bloat. Note: feeds Macro driver narratives, no direct surface. |
| CBOE Skew | **LATENT** | Useful tail-risk indicator but adds noise to Vol·Positioning column already populated by VIX/VVIX/P-C/AAII/COT. Skip. |
| SIGNAL_HISTORY_daily (per-ticker per-day rollup of news / earnings / trend triggers) | **LATENT** | Better surfaced in a future "what fired today" dedicated tile — not in scope for this rework. |
| SIGNAL_02_Probability (p_favorable / p_neutral / p_unfavorable) | **KEEP — Name slide-out, replaces 'Recommendation' (N-8)** | The user-profile final goal explicitly calls for **probability curves** — and we already write them. Render as a 3-bar probability strip on the Name slide-out, same visual size as the recommendation block being dropped. This is the single highest-leverage UNUSED → SHIP move in the sprint. |
| SIGNAL_03_Consensus (our vs market) | **KEEP — Name slide-out, after News** | Add a small "Consensus check" card: dominant_narrative + our_conclusion + consensus_level + missed_factors + strongest_counter. Same `ent-card` idiom. Strong narrative-interpretation signal that aligns with the user's "narrative interpretation" feedback memory. |
| SIGNAL_03_ValuationRealized (back-tests at 5d/21d) | **KEEP — Name slide-out, in the Valuation card footer** | Append a 1-line "Model accuracy: 5d gap-closure X% · 21d gap-closure Y%" beneath the DCF block. Builds trust in the fair_value number. |
| MOVER_EXPLANATIONS_daily.bullets | **KEEP — surface on hover/expand from sector top-mover label** | Currently sector top-mover shows ticker + %. Add a ▸ chevron that expands the bullets list and the LLM thesis sentence inline. No new section — same row. |
| SECTOR_VALUATION_monthly | **LATENT** | Aligns with valuation z but adds complexity. Skip. |

---

## 🟡 PARSED-BUT-LOST — note for pipeline sprint, no action this sprint

| Source field | Where it lives now | Pipeline-sprint action |
|---|---|---|
| AV OVERVIEW.PEGRatio / EVToEBITDA / EVToRevenue / PriceToBookRatio / PriceToSalesRatioTTM / ReturnOnEquityTTM / ReturnOnAssetsTTM | `FUND_01.raw_json` | promote to typed columns (read-at-query-time works for v2-balanced; pipeline sprint adds typed cols for sortability) |
| AV INCOME_STATEMENT [1..3, 5..7] / BALANCE_SHEET / CASH_FLOW middle quarters | dropped on insert | pipeline sprint persists full 8q (or 20q) of quarterlyReports |
| Finnhub `/stock/metric` (when run) full set: P/B, P/S, EV/EBITDA, EV/Sales, FCF yield, ROIC, ROE, ROA, current ratio, debt/equity | written via `backfill_fundamentals_finnhub.js` only — daily AV path doesn't | pipeline sprint chooses one source-of-truth and ingests daily |
| `macro/scraper.js :: getSkew` and `getGammaRegime_ETF` | computed but not pushed via ingest-macro | pipeline sprint either deletes the unused fetchers or wires them through |
| 10-K / 10-Q clusters (Item 1A, Item 7) | persisted but not diffed | pipeline sprint adds a yearly-diff job for risk factors and tone classifier for MD&A |

---

## Open questions for the user (resolve before C ships)

1. **`raw_json` reads at query time** — is it acceptable for the v2-balanced mockup to read AV multiples (PEG, EV/EBITDA, P/B, P/S, EV/Sales, ROE, ROA) by parsing `FUND_01.raw_json` rather than typed columns? The pipeline sprint will promote these to typed columns; this is a 2-week-bridge approach. If "no, only typed columns", drop those 7 multiple rows from N-10 and the Valuation card collapses to 5 rows.

2. **Breadth >50d MA basis** — sector breadth ideally measures all sector constituents. We only ingest 25-portfolio prices. Acceptable to use ETF top-10 holdings as the proxy basis (well-known free static lists per sector ETF), with a footnote that breadth is approximate? If "no, full universe required", drop the breadth column.

3. **Convergence section** — fully dropped here. Confirm: do you want a single-card replacement (e.g., "Conviction extremes today: top-3 by score") or pure removal? Removal keeps the dashboard tighter; the extremes line could live in Today.

4. **Tape — keep or drop entirely?** Without theme overlay the Tape becomes "news + moves + unexplained-by-no-news-within-±2d", which is less useful than the v1 design. Confirm: keep deterministic Tape (option A) or drop the entire Tape surface until AI tagging ships (option B). Default in C.1 is option A — keep deterministic.

5. **Probability strip on Name slide-out** — adding the SIGNAL_02_Probability surface is an ADD (not a swap). Confirm OK to introduce a new slot here, since it aligns with the user-profile memory ("probability curves are part of the final goal"). Default in C.1: yes, add.

6. **Hedges → 3-tile strip** — the Hedges section becomes 3 KPIs only (no table). Confirm acceptable to keep the section heading "HEDGES · NET EXPOSURE" rather than just "EXPOSURES" — naming is your call. Default in C.1: rename to "EXPOSURES · NET / GROSS" since the table is gone.

---

## Effect summary on the new mockup

- **Removed sections**: Convergence (fully).
- **Reshaped sections**:
  - Today drift breakdown → single net-sentiment line.
  - Hedges → 3-tile EXPOSURES strip.
  - Book columns: drop EPS revisions; replace 8q sparklines with TTM+YoY pair.
  - Valuation: 12→8 multiple rows; columns Now/5y mean/z (4 cols).
  - Fundamentals: drop 20q sparklines, replace with TTM+YoY tile-strip + composite-row pruned.
  - Estimates: drop revisions tape; keep price-target distribution + ratings + surprise history.
  - Last earnings: drop transcript bullets, keep filing-derived ones.
  - News: drop "driver" + "impact tag" columns; keep date/src/headline/sentiment/magnitude.
  - Tape: drop theme overlay; redefine "unexplained" deterministically; reduce filters to held/all.
  - Peers: drop 5-row table, keep peer-median tile.
  - Macro slide-out: drop dot-plot/SEP/statement-diff blocks; keep statement-text bullets; remove tripwire counter and 1w-Δ; surface Fed funds + balance sheet instead.
- **Added (UNUSED → surface)**:
  - Probability strip (Name slide-out).
  - Consensus check card (Name slide-out).
  - Model accuracy footer (Valuation card).
  - Mover-explanation expand on sector top-mover.
  - P/C, AAII, COT mini-tiles in cross-asset Vol·Positioning.
  - Recent macro prints mini-table (Macro slide-out).

Net effect: ~30% fewer slots overall, every remaining slot has a real free-data source or computation behind it.

---

> [INDEX](../../INDEX.md) · [Audit inventory](AUDIT_INVENTORY.md) · [Sprint plan](../SPRINT_2026-05-04_dashboard_balance.md)
