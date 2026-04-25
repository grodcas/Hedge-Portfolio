# Audit — Entity coverage (Sprint 0, task 2)

Which stocks, sectors, and indicators have entity deep-dive views today, and which need to be built in Sprints 3 and 5. Lifted from NARRATIVE_BUILD_PLAN lines 56–63, verified against `dashboard/portfolio-funnel-mockup.js`, updated for the locked 8-sector list in `sector-decision.md`.

---

## Verification

Grepped `ENTITIES['stock:*']`, `ENTITIES['sector:*']`, `ENTITIES['indicator:*']` in `dashboard/portfolio-funnel-mockup.js`:

- **5 stock entities** present (lines 876, 981, 1086, 1188, 1277): UNH, LLY, NVDA, MSFT, KO
- **4 sector entities** present (lines 1365, 1443, 1512, 1580): Healthcare, Technology, Staples, Financials — **all require rename/restructure** per the locked sector decision
- **4 indicator entities** present (lines 1647, 1687, 1731, 1771): Regime, Core CPI YoY, 10Y Yield, GDP Nowcast

---

## Stocks — 5 present, 20 missing (out of 25)

Sector column reflects the locked 8-sector list (`sector-decision.md`).

| Status | Ticker | Sector (canonical) | JS line |
|---|---|---|---|
| ✅ present | UNH | Healthcare | 876 |
| ✅ present | LLY | Healthcare | 981 |
| ✅ present | NVDA | TechHardware | 1086 |
| ✅ present | MSFT | TechSoftware | 1188 |
| ✅ present | KO | Staples | 1277 |
| ❌ missing | AAPL | TechSoftware | — |
| ❌ missing | GOOGL | TechSoftware | — |
| ❌ missing | META | TechSoftware | — |
| ❌ missing | INTC | TechHardware | — |
| ❌ missing | AMD | TechHardware | — |
| ❌ missing | AMZN | TechDigitalConsumer | — |
| ❌ missing | TSLA | TechDigitalConsumer | — |
| ❌ missing | NFLX | TechDigitalConsumer | — |
| ❌ missing | HD | TechDigitalConsumer | — |
| ❌ missing | JPM | Finance | — |
| ❌ missing | GS | Finance | — |
| ❌ missing | BAC | Finance | — |
| ❌ missing | MS | Finance | — |
| ❌ missing | BRK.B | Finance | — |
| ❌ missing | XOM | Energy | — |
| ❌ missing | CVX | Energy | — |
| ❌ missing | JNJ | Healthcare | — |
| ❌ missing | PG | Staples | — |
| ❌ missing | CAT | Industrial | — |
| ❌ missing | BA | Industrial | — |

**Built by:** Sprint 5. Template to copy: `ENTITIES['stock:UNH']` (lines 876–980). ~1h per stock.

**Note on existing 5:** all of UNH/LLY/NVDA/MSFT/KO need their ticker-to-sector mapping reviewed once the backend sector rename runs in Sprint 3 prep — currently keyed to old backend strings.

---

## Sectors — 0 fully match canonical, 4 need rework, 4 to build new

Post-decision, **no dashboard sector entity matches the locked canonical list**. All 4 existing entities need renames and/or profile rewrites in Sprint 3:

| Current dashboard key | Canonical target | Action |
|---|---|---|
| `sector:Technology` (line 1443) | split into `sector:TechHardware`, `sector:TechSoftware`, `sector:TechDigitalConsumer` | **split + rebuild**: old entity is deleted; 3 new entities built with differentiated narratives |
| `sector:Healthcare` (line 1365) | `sector:Healthcare` | **rename-free, refactor**: profile stays, but hardcoded mock prose (`thesis`, `drivers`, `risks`) is killed per audit-surfaces.md |
| `sector:Staples` (line 1512) | `sector:Staples` | **rename-free, refactor**: same |
| `sector:Financials` (line 1580) | `sector:Finance` | **rename**: key changes; profile refactored |

### Sectors to build new in Sprint 3

| Canonical | Tickers | Count | Notes |
|---|---|---|---|
| `sector:TechHardware` | NVDA, AMD, INTC | 3 | new profile; narrative dominates AI-compute war |
| `sector:TechSoftware` | AAPL, MSFT, GOOGL, META | 4 | new profile; AI platform monetization |
| `sector:TechDigitalConsumer` | AMZN, TSLA, NFLX, HD | 4 | new profile; consumer-digital unit economics |
| `sector:Energy` | XOM, CVX | 2 | new profile; crude balance + OPEC+ + capex |
| `sector:Industrial` | CAT, BA | 2 | new profile; capex cycle + aerospace |

### Sectors already present but requiring refactor

| Canonical | Tickers | Count | Action |
|---|---|---|---|
| `sector:Healthcare` | UNH, LLY, JNJ | 3 | kill hardcoded prose, 3-block narrative |
| `sector:Staples` | PG, KO | 2 | kill hardcoded prose, 3-block narrative |
| `sector:Finance` | JPM, GS, BAC, MS, BRK.B | 5 | rename from `Financials`, kill prose, 3-block narrative |

**Sprint 3 total:** 5 new profiles + 3 refactored profiles = **8 sector narratives**, down from the prior estimate of 11 (thanks to the collapse to 8 canonical sectors).

**Template to copy:** `ENTITIES['sector:Healthcare']` (lines 1365–1441). ~1–1.5h per sector. Estimated total: 8 × 1.25h ≈ **10 hours** for the 8 sector profiles — revises Sprint 3 down from 16–20h to **~10–12h**.

---

## Indicators — 4 present, 9 missing (out of 13)

The Regime entity is the only indicator touched by Sprint 1. The remaining indicators are not part of the narrative build's scope — they render a snapshot + trajectory chart + link to the regime narrative.

| Status | Key | Source |
|---|---|---|
| ✅ present | `indicator:Regime` | Line 1647 — replaced by 3-block narrative in Sprint 1 |
| ✅ present | `indicator:Core CPI YoY` | Line 1687 |
| ✅ present | `indicator:10Y Yield` | Line 1731 |
| ✅ present | `indicator:GDP Nowcast` | Line 1771 |
| ❌ missing | `indicator:2Y Yield` | |
| ❌ missing | `indicator:Curve (2s10s)` | |
| ❌ missing | `indicator:Fed Path` | |
| ❌ missing | `indicator:HY Spread` | |
| ❌ missing | `indicator:DXY` | |
| ❌ missing | `indicator:Brent Oil` | |
| ❌ missing | `indicator:Gold` | |
| ❌ missing | `indicator:VIX` | |
| ❌ missing | `indicator:AAII Bull %` | |

**Status:** not in scope for Sprints 1–7 of the narrative plan. Post-Sprint-7 add-on if desired.

---

## Summary

| Entity type | Present | Missing (build) | Existing to refactor | Build sprint |
|---|---|---|---|---|
| Stocks | 5 / 25 | 20 | 5 | Sprint 5 (×20 new + ×5 refactor = 25 full profiles) |
| Sectors | 4 (3 refactor, 1 rename+refactor) | 5 new | 3 | Sprint 3 (×5 new + ×3 refactor = 8 full profiles) |
| Regime indicator | 1 | 0 | 1 (kill prose, add 3-block narrative) | Sprint 1 |
| Other indicators | 3 / 13 | 10 | — | Out of scope |

**Total narrative-touching entity work:** 25 stock profiles + 8 sector profiles + 1 regime narrative = **34 entities** across Sprints 1/3/5.

**Revised Sprint 3 estimate:** 10–12 hours (down from 16–20h) thanks to 8-sector collapse.
