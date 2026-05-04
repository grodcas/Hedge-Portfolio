# v2 Balanced Mockup · rationale + source map

**Sprint**: SPRINT_2026-05-04_dashboard_balance · Sub-sprint C
**Last updated**: 2026-05-04 (revised post-feasibility-review)
**Status**: Active reference for the rebuild

The new mockup lives at [`dashboard/mockup/v2-balanced/index.html`](../../dashboard/mockup/v2-balanced/index.html). The current (visually-loved) mockup at [`dashboard/mockup/index.html`](../../dashboard/mockup/index.html) is **untouched**.

This doc explains what changed and why, walks the dashboard top-to-bottom, and maps every visible parameter in the new mockup to a source — FRED series, Finnhub endpoint, D1 column, or computation method.

---

## 1 · Summary

The original sub-sprint B output was over-conservative — it dropped ~30% of slots on the rule "drop > placeholder if data isn't there today". The user's correction (the **4-month feasibility rule**) is stricter: a slot is feasible if it can be *initialized* via a one-off backfill OR will be *fully populated within 4 months* of forward writes. Only slots failing both tests are dropped.

Under that rule, **only one slot fails**: the per-quarter sell-side consensus + 4-week revisions tape (Refinitiv / Visible Alpha — paid). Everything else from the original v2 mockup is feasible:

- **20q sparklines / 8q deltas / quality scores (Altman, Beneish, ROIC) / DSO / DIO / share-count Δ** — AV `quarterlyReports` returns ~20 quarters in a single call; pipeline currently keeps only [0]+[4]. One backfill change → 20q populated immediately for all 25 tickers.
- **12m regime trajectory / convergence engine history / driver-tagged news / Tape theme overlay** — re-run classifiers / engines over historical state. Backfill-able.
- **Recommendation block / tripwire counter / FOMC dot-plot blocks / peer comps / reverse DCF** — structured fields added once; populate immediately.
- **Hedge cover + hedge table / earnings-call tone delta** — populate within 4 months once `kind` column is tagged / transcript scraper runs.

So the v2-balanced mockup is **the original v2 mockup with surgical edits**:

1. **DROP** only one slot: per-quarter EPS revisions tape (and the EPS↑ Book column).
2. **ADD** four price surfaces (per the user's direct request): a 1y price sparkline column in Book, a 1y price detail card on the Name slide-out, a SPY 1y card on the Macro slide-out, an ETF 1y card on the Sector slide-out.
3. **ADD** two UNUSED → surfaced tables: a verified Recent macro prints table on the Macro slide-out (9 rows — CPI Headline, Core CPI, PPI, NFP, UNEMP, UMich Cons Sentiment, Inflation Exp 1Y/5Y, Bank Reserves) and P/C / AAII / COT mini-tiles in the cross-asset Vol · Positioning column.

> The first cut of this mockup also added a Probability strip (SIGNAL_02_Probability), a Consensus check card (SIGNAL_03_Consensus), and a Model-accuracy footer (SIGNAL_03_ValuationRealized). All three were **removed** after a critical review: the first two are LLM-emitted subjective numbers with no calibration (conflicts with the reliability memory's "don't trust AI-extracted numbers in models"), and the back-test footer is too sample-thin to be load-bearing. Will revisit Model accuracy once ≥50 forecasts accumulate.

Everything else is the original mockup, source-annotated where the source is non-obvious.

The audit and feasibility-revised decisions are in:
- [sprint-output/AUDIT_INVENTORY.md](sprint-output/AUDIT_INVENTORY.md)
- [sprint-output/PARAMETER_DECISIONS.md](sprint-output/PARAMETER_DECISIONS.md) — see **§0 Feasibility-revised decisions**.

---

## 2 · What changed (vs the visually-locked v1 mockup)

### REMOVED — exactly one slot

| Slot | Reason |
|---|---|
| Estimates per-quarter consensus + 4w revisions tape (Q1/Q2/FY/FY+1 table) and the Book `EPS↑` column | Refinitiv / Visible Alpha only; no free substitute within 4 months. |

The Estimates card replaces the dropped per-quarter table with a small amber callout explaining why; the rest of the card (PT distribution + ratings + 8q surprise history) is intact.

### ADDED — 4 price surfaces (user request)

| New element | Where | Source |
|---|---|---|
| **Price · 1y** sparkline column | Book table, between EV/EBITDA and Margin 8q | PRICE_01_Daily for the ticker, last 252 sessions; cell shows the line, current $ price, and 1y % return |
| **PRICE · 1Y** detail card | Top of Name slide-out, before the Read | PRICE_01_Daily — full 252-session SVG line chart + LAST / 1Y RETURN / 52W HI / 52W LO / 50DMA / 200DMA |
| **SPY · 1Y** detail card | Top of Macro slide-out (above the macro thesis) | PRICE_01_Daily for SPY |
| **Sector ETF · 1Y** detail card | Top of Sector slide-out (above the sector thesis); H3 retargets per sector clicked (XLE / XLK / XLF / etc.) | PRICE_01_Daily for the ETF |

All four use the same `renderPricePanel(ticker, …)` helper. Real implementation reads `PRICE_01_Daily` over the relevant window (Yahoo bulk-init feasible).

### ADDED — 2 UNUSED-table surfaces (post-review)

| New element | Where | Source |
|---|---|---|
| **Recent macro prints mini-table** — 9 rows: CPI Headline, Core CPI, PPI Final Demand, NFP, UNEMP, UMich Cons Sentiment, Inflation Exp 1Y, Inflation Exp 5Y, Bank Reserves (WRESBAL) | Macro slide-out, between Drivers/Tripwires and FOMC summary | Each row verified against `macro/scraper.js` + `macro/index.js` ingestion; 5 of the 9 (PPI, UMich Cons, Inflation 1Y, Inflation 5Y, Bank Reserves) are surfaced for the first time |
| **P/C eq, AAII bull−bear, COT ES net** mini-tiles | Map · cross-asset Vol·Positioning column (now 6 tiles instead of 3) | BETA_04_Sentiment — already ingested via CBOE Puppeteer / AAII / CFTC parsers |

### REMOVED on critical review (originally added in first pass)

| Removed slot | Why |
|---|---|
| Probability strip (`SIGNAL_02_Probability`) | LLM-emitted subjective probabilities; no calibration; conflicts with reliability memory. |
| Consensus check card (`SIGNAL_03_Consensus`) | LLM prose + fabricated `consensus_level` value; duplicates the Read card with less sourcing. |
| Model accuracy footer (`SIGNAL_03_ValuationRealized`) | Sample too thin to be trustworthy. Restore once ≥50 forecasts have accumulated and the back-test stabilises. |
| ICSA (Initial Claims) row, ISM Mfg row in the prints table | Not actually ingested by any current scraper. Listed as candidates for the pipeline sprint, not the v2-balanced mockup. |

### CHANGED — minor labelling only

- Title: "Mockup v2 (with AI analyst layer)" → "Mockup v2 · Balanced (free-source-honest, +price surfaces)".
- Brand tag: "MOCKUP · v2 · with AI analyst layer" → "MOCKUP · v2 · BALANCED · free-source-honest + price".

Visual language, layout, sparkline style, slide-out machinery — all identical to v1.

---

## 3 · Per-section walk

Only the sections that have an addition or change. Everything else is the v1 mockup verbatim.

### Top bar
Brand tag updated. Otherwise unchanged.

### Today
Unchanged. (The Recommendation block on the Name slide-out, the convergence section, the hedge table, etc. are all preserved.)

### Book
Column lineup changes: drop **EPS↑**, add **Price · 1y**. New column shows a deterministic per-ticker price sparkline + last $ + 1y %. Margin 8q and FCF 8q sparklines are preserved.

### Map · Macro strip
Vol·Positioning column expands from 3 tiles (VIX · VVIX · NAAIM) to 6 tiles (+ P/C eq · AAII · COT ES). All remaining cross-asset tiles unchanged.

### Map · Sector strip
Unchanged.

### Convergence
Unchanged.

### Hedges
Unchanged. (Hedge cover % + hedge table both stay; pipeline-sprint adds `kind` column to PORTFOLIO_01_Holdings, table populates as user tags positions.)

### Name slide-out
- **NEW Price detail card** at the top, before the Read.
- Thesis card unchanged through the Recommendation block.
- **NEW Probability strip** added after Recommendation, alongside it (visually a quiet indigo block matching the AI palette).
- Valuation card unchanged through the DCF block; **NEW Model accuracy footer** appended beneath Reverse DCF.
- Estimates card: per-quarter table replaced with an amber "feasibility callout" explaining the paid-feed reason; PT block + rating distribution + surprise history all preserved.
- **NEW Consensus check card** between News and Peers.
- Peers card unchanged.
- Context card unchanged.

### Macro slide-out
- **NEW SPY · 1Y card** at the top, between the Tape strip and the Read.
- Thesis card unchanged through tripwires.
- **NEW Recent macro prints mini-table** added between the thesis cols and the FOMC keypoints.
- Last FOMC / Signposts / Positioning / Notes — all unchanged.

### Sector slide-out
- **NEW Sector ETF · 1Y card** at the top (H3 retargets per sector clicked).
- All other sections unchanged.

### Tape slide-out
Unchanged. Theme overlay preserved (decision: re-run theme classifier over historical BETA_12 to initialize).

---

## 4 · Source map (only the sections with changes)

### Book — Price · 1y column
| Field | Source / Method |
|---|---|
| 1y sparkline | `PRICE_01_Daily.close` for the ticker, last 252 sessions |
| Last $ | most recent close from same series |
| 1y % | `(last / first − 1) × 100` |

### Name slide-out — Price detail card
| Field | Source / Method |
|---|---|
| Line chart | `PRICE_01_Daily.close` last 252 sessions |
| LAST | latest close |
| 1Y RETURN | `(close[−1] / close[0] − 1) × 100` |
| 52W HIGH | `max(close[−252:])` |
| 52W LOW | `min(close[−252:])` |
| 50DMA | `mean(close[−50:])` |
| 200DMA | `mean(close[−200:])` |

### Macro slide-out — SPY card
Same source / method as Name detail card, with `ticker = SPY`.

### Sector slide-out — ETF card
Same source / method, with ticker = the sector ETF code clicked (XLE/XLK/etc.).

### Name slide-out — Probability strip
| Field | Source |
|---|---|
| FAVORABLE % | `SIGNAL_02_Probability.p_favorable` |
| NEUTRAL % | `SIGNAL_02_Probability.p_neutral` |
| UNFAVORABLE % | `SIGNAL_02_Probability.p_unfavorable` |

### Name slide-out — Consensus check card
| Field | Source |
|---|---|
| Dominant market narrative | `SIGNAL_03_Consensus.dominant_narrative` |
| Our conclusion | `SIGNAL_03_Consensus.our_conclusion` |
| Consensus level | `SIGNAL_03_Consensus.consensus_level` |
| Strongest counter | `SIGNAL_03_Consensus.strongest_counter` |
| Missed factor | `SIGNAL_03_Consensus.missed_factors` |

### Valuation — Model accuracy footer
| Field | Source |
|---|---|
| 5d gap-closure % | `SIGNAL_03_ValuationRealized` aggregated `gap_closed_pct` filtered `horizon_days=5`, last N forecasts |
| 21d gap-closure % | same with `horizon_days=21` |

### Macro slide-out — Recent macro prints
| Row | Source code |
|---|---|
| CPI Headline | `MACRO_STATE_indicators` `CPI_HEADLINE` |
| Core CPI | `CPI_CORE` |
| Nonfarm Payrolls | `NFP` |
| Unemployment Rate | `UNEMP` |
| Initial Claims (4w avg) | `ICSA` (or 4w-avg derived) |
| ISM Mfg | `ISM_MFG` |

### Vol · Positioning — new tiles
| Tile | Source |
|---|---|
| P/C eq | `BETA_04_Sentiment` Put/Call equity ratio (CBOE) |
| AAII bull−bear | `BETA_04_Sentiment` AAII survey (live + MHTML fallback) |
| COT ES net | `BETA_04_Sentiment` CFTC E-MINI S&P asset-mgr net |

(Existing v1 tiles — VIX / VVIX / NAAIM — already documented at the v1 source.)

---

## 5 · Pipeline-sprint actions implied (carry into the next sprint)

These are the line items the upcoming `SPRINT_pipeline_implementation.md` should cover so the v2-balanced mockup actually reflects live data:

1. Persist the **full** AV `quarterlyReports` array per endpoint (income / balance / cash flow). One-shot backfill of 25 tickers gives 20q of revenue / margins / FCF / balance-sheet / share-count history immediately. Restores 8q Book sparklines, 20q Fundamentals charts, 8q DSO/DIO/share-count Δ, Altman/Beneish/ROIC composites.
2. Add **typed `regime` + `confidence` fields** to macro-intelligence-builder output. Re-run retroactively over historical MACRO_STATE_indicators for the 12m trajectory bars.
3. Add **structured tripwire JSON** to TICKER_TREND_long and macro thesis output. Lights up tripwire counters in Today / Macro / Name.
4. Add **`kind` column** to PORTFOLIO_01_Holdings (`null | hedge_macro | hedge_pair | core_long | core_short`). Lights up Hedges section's hedge cover + hedge table once user tags positions.
5. Add **driver-tagging classifier** (AI agent step in `SPRINT_ai_agent_wiring.md`) and run it as a batch over historical BETA_12_News_digest. Lights up: News-row impact tags, per-driver drift breakdown, today's news drift breakdown by impact, Tape theme overlay (same classifier handles the 6-theme vocabulary).
6. Add **transcript scraper** (free source: motley fool, IR pages) and a tone classifier. Lights up Last-earnings transcript bullets + Earnings call tone delta block.
7. Add **dot-plot + SEP parser** for federalreserve.gov archive. Lights up FOMC dot-plot / SEP / market-reaction blocks.
8. Add **peer_set config table** (per-ticker → list of 5 peer tickers). Lights up the 5-row Peer Comps table and the peer-median / peer-pctile columns of the Valuation table.
9. Confirm `price-fetcher` covers SPY + 11 sector ETFs + DXY/EURUSD/WTI/Copper/Gold/VIX/VVIX symbols. Lights up the 4 new price cards plus the cross-asset DXY/EURUSD/WTI/Copper/Gold/VVIX tiles.
10. Confirm `macro-state-fetcher` covers DGS2/DGS10/DFII5/T5YIE/T5YIFR/BAMLC0A0CM/BAMLH0A0HYM2/WALCL. Lights up cross-asset Rates and Credit columns.
11. **Wire `macro/scraper.js :: getSkew` through `ingest-macro`** — currently parsed but not pushed (PARSED-BUT-LOST). Once persisted, surface in Vol·Positioning as the 7th tile (tail-risk indicator).
12. **Add ICSA + ISM Mfg ingestion** — Initial Claims (FRED `ICSA`) is straight FRED bulk-init; ISM Mfg requires a new parser (ISM publishes monthly to `https://www.ismworld.org/`, no free API but scrape-able). Once ingested, both belong in the Recent macro prints table.
11. **Sizing engine** for the Recommendation block (deterministic verb + delta from sizing rules vs target + thesis state + DTC). Forward-populates immediately on day 1.
12. **Convergence engine** running over historical state. Lights up the Convergence section with backfilled history.

---

## 6 · Open questions (resolve before pipeline sprint starts)

1. **`raw_json` reads at query time** — OK to parse `FUND_01.raw_json` for PEG / EV/EBITDA / EV/Sales / P/B / P/S / ROE / ROA in the v2-balanced mockup, with the pipeline sprint promoting them to typed columns later?
2. **Breadth >50d MA basis** — OK to use ETF top-10 holdings as the proxy basis (with a footnote)?
3. **Transcript source choice** — which free source should the transcript scraper target (motley fool / company IR / both)?
4. **Peer_set config** — should we curate it manually (25 tickers × 5 peers ~125 rows) or use Finnhub `/stock/peers` (free) as the seed?
5. **Hedge `kind` taxonomy** — confirm enum: `null | hedge_macro | hedge_pair | core_long | core_short`. Add others?
6. **Backfill scope** — for the AV quarterlyReports backfill, do we want 20q (5y) for all 25 tickers, or only the most recent N?

---

## 7 · What did NOT change (visual language preserved)

- All CSS color tokens, font, line-height, numeric tabular setting.
- All slide-out machinery (open/close, backdrop, ESC, scope retargeting).
- All foldable patterns: AI chips, note-draft cards, foldable readings.
- Sparkline style identical (same SVG idiom).
- Sector strip table layout, Book table layout (column count adjusted by ±1).
- Tape grid 2-column + unexplained sub-section.
- Macro-anchor late-cycle yellow gradient.
- Sector tag / side tag / thesis tag chip style.
- Convergence section: structure preserved (engine populates over historical state).
- Hedges section: structure preserved (`kind` tagging populates the table).
- Estimates card: removed only the per-quarter table; PT/ratings/surprise blocks identical.

---

> [INDEX](../INDEX.md) · [Sprint plan](SPRINT_2026-05-04_dashboard_balance.md) · [Audit inventory](sprint-output/AUDIT_INVENTORY.md) · [Parameter decisions (§0 is the live decision set)](sprint-output/PARAMETER_DECISIONS.md)
