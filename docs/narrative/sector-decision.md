# Sector count decision — LOCKED (Sprint 0, task 4)

**Status:** ✅ resolved. 8 sectors, AI-axis split for the Tech/ConsDisc/Communication bucket. Decided after brainstorm on 2026-04-21.

---

## Final canonical list (8 sectors)

One string per sector — same string in the backend `SECTOR_BUCKET`, dashboard `ENTITIES` keys, `NARRATIVE_01_Content.entity_id`, and `SECTOR_FACTORS_daily.sector`. No display-vs-id translation layer.

| # | Canonical | Display label | SPDR proxy | Portfolio tickers | Count | Dominant narrative |
|---|---|---|---|---|---|---|
| 1 | `TechHardware` | Tech · Hardware | XLK subset | NVDA, AMD, INTC | 3 | AI-compute war: capex, export controls, NVDA-vs-AMD share, INTC catch-up |
| 2 | `TechSoftware` | Tech · Software | XLK + XLC subset | AAPL, MSFT, GOOGL, META | 4 | AI platform monetization: Copilot/Gemini/Apple Intelligence, ads, regulation |
| 3 | `TechDigitalConsumer` | Tech · Digital Consumer | XLY + XLC subset | AMZN, TSLA, NFLX, HD | 4 | Consumer-digital unit economics: e-com, EV, streaming, home-improvement |
| 4 | `Finance` | Finance | XLF | JPM, GS, BAC, MS, BRK.B | 5 | Rates regime, credit cycle, cap-markets volumes |
| 5 | `Energy` | Energy | XLE | XOM, CVX | 2 | Crude balance, OPEC+, capex discipline |
| 6 | `Healthcare` | Healthcare | XLV | UNH, LLY, JNJ | 3 | MCR cycle, GLP-1 ramp, drug-pricing politics |
| 7 | `Staples` | Staples | XLP | PG, KO | 2 | Elasticity, emerging-market volumes, defensives rotation |
| 8 | `Industrial` | Industrial | XLI | CAT, BA | 2 | Capex cycle, aerospace supply chain, infrastructure spend |

**Total:** 25 tickers across 8 sectors. Minimum 2 tickers per sector (no empty sectors — user's hard constraint). Balanced distribution.

---

## Why this split (captured for future reference)

The backend's original 8 sectors (Technology, ConsDisc, Communication, Finance, Energy, Healthcare, Staples, Industrial) had **Communication with only NFLX — 1 ticker**, violating the "no empty sectors" rule. Two ways to fix:

- **GICS-classic rebalance** — move META + GOOGL to Communication. Aligns with standard taxonomy but forces narrators to juggle AAPL-services, NVDA-AI-compute, and INTC-cyclical inside a single "Technology" bullet.
- **AI-axis split** ✅ — treat the 11 tickers in Tech/ConsDisc/Comm as three different narratives based on how AI affects each:
  - *Hardware* is the compute layer (semis + AI picks-and-shovels)
  - *Software* is AI platform monetization
  - *Digital Consumer* is consumer-facing digital businesses

The AI-axis split was chosen because the narrative layer's job is to *interpret* — and interpretation is sharpest when each bucket has one dominant story. GICS would force blended bullets; AI-axis gives three clean narratives.

---

## Naming conventions (locked)

- **CamelCase, no spaces** for canonical IDs (safe as entity_id, URL fragment, DB key).
- **Display labels** may use a center-dot separator for the Tech triplet (`Tech · Hardware` / `Tech · Software` / `Tech · Digital Consumer`) to signal they're related buckets. Other sectors use their single-word display names unchanged.
- **Never** introduce plural variants (`Financials`, `Industrials`) — single-word canonical.
- **Never** abbreviate (no `ConsDisc`, no `Comm Svcs`, no `TechHW`).

---

## Bug to fix in the same pass: 4 workers using a 6-sector "Consumer" variant

These workers currently use their own sector map that predates the 8-sector canonical list:

- `workers/ticker-trend-long/src/worker.js:23–30`
- `workers/ticker-trend-short/src/worker.js:328–335`
- `workers/assessment-engine/src/worker.js:32–41`
- `workers/operations-agent/src/worker.js:23–30`

They must be aligned to the locked 8-sector canonical list. Happens in the same Sprint 3 prep pass as the backend rename.

---

## Migration scope (executes in Sprint 3 prep, NOT in Sprint 0)

Listed here so the scope is visible. Nothing below runs until Sprint 3 kicks off.

1. Update `SECTOR_BUCKET` in the 4 primary workers (`sector-factor-builder`, `sector-trend-long/short`, `stock-factor-builder`) to the new 8-sector list with correct ticker placements.
2. Update `SECTOR_ETF` mapping. Note: `TechHardware`, `TechSoftware`, `TechDigitalConsumer` are not pure SPDR mappings — each ticker will pull prices directly via `price-fetcher`; the ETF proxy column can store the nearest match (XLK, XLK, XLY respectively) for beta/benchmarking purposes only, with a comment explaining the composite nature.
3. Fix the 4 "Consumer" workers to the same canonical list.
4. Dashboard: delete old `ENTITIES['sector:Technology']`, `ENTITIES['sector:Staples']`, `ENTITIES['sector:Financials']`, etc. (or rename in place). Add 8 new/updated sector entity stubs. All 8 filled with full profiles in Sprint 3.
5. Historical rewrite of `SECTOR_FACTORS_daily`:
   ```sql
   -- ConsDisc rows are deleted (tickers split across TechDigitalConsumer);
   -- Technology rows are deleted (split across 3 new tech sectors);
   -- Communication rows are deleted (NFLX absorbed into TechDigitalConsumer).
   -- New factor rows are generated by sector-factor-builder from the new SECTOR_BUCKET.
   ```
   Accept a ~1-day gap in historical sector factor continuity at cutover. Non-issue for narrative (we're not back-testing).
6. Rename `ENTITIES['sector:Financials']` → `ENTITIES['sector:Finance']` in dashboard.
7. Post-migration validation: `SELECT sector, COUNT(*) FROM SECTOR_FACTORS_daily WHERE date = <today> GROUP BY sector` should return exactly 8 rows, all matching the canonical list.

**Blast radius:** touches 8 workers + 1 dashboard file + 1 SQL rewrite. 2–3 hours of careful execution + regression checks. Does not affect Sprint 1 (regime narrative) or Sprint 2 (sector landscape narrative uses whatever `SECTOR_FACTORS_daily` contains on the day it runs).

---

## Decision log

| Date | Decision | Signed off by |
|---|---|---|
| 2026-04-21 | Collapse to 8 sectors; no empty sectors | user |
| 2026-04-21 | AI-axis split for Tech/ConsDisc/Comm → TechHardware / TechSoftware / TechDigitalConsumer | user |
| 2026-04-21 | Canonical CamelCase names locked: TechHardware, TechSoftware, TechDigitalConsumer, Finance, Energy, Healthcare, Staples, Industrial | user |
