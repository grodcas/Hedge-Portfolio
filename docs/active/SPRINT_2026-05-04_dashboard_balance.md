> [INDEX](../INDEX.md)

# SPRINT · 2026-05-04 · Dashboard parameter audit + balanced rework

**Status**: Planned, runs tomorrow
**Owner**: TBD (probably Claude in next session)
**Estimated effort**: 6–7h, splittable across the day

---

## Objective

Bring the v2 mockup into honest alignment with what the data layer can actually deliver from **free APIs** (or by calculation from existing fields). Output is a **new mockup file** plus a short justification doc.

The current mockup is locked-in visually — the user loves how it looks. The redesign must keep the same look and feel, only swap underlying parameters and remove slots that have no free-source backing.

---

## Hard constraints (read before starting)

| # | Constraint |
|---|---|
| 1 | **Free APIs only.** FRED, BLS, Yahoo Finance, EDGAR, EIA, Federal Reserve H.4.1, Treasury Direct, Stooq, AAII free feeds, NAAIM weekly, etc. No paid hooks. |
| 2 | **Do not modify**: DB schema, pipeline code, parser code, the current mockup at `dashboard/mockup/index.html`, or any production system. |
| 3 | New mockup is added at **`dashboard/mockup/v2-balanced/index.html`** (alongside the current one, not replacing it). |
| 4 | Visual language must match the current mockup — same colors, same typography, same slide-out patterns, same sparkline style. Only the *content* changes. |
| 5 | **Drop cleanly.** If a feature has no free source and no calculable substitute, remove the slot from the new mockup. No "phase 2" placeholders, no greyed-out tiles. The user explicitly does not want useless features. |
| 6 | Where the new field-type doesn't fit the original slot shape, reshape the slot minimally — same visual idiom, different content. Do not invent new patterns. |
| 7 | This sprint produces only audit + new mockup + rationale doc. **No DB migrations, no parser additions, no pipeline edits.** Those are deliberately out of scope so the user can decide order/timing later. |

---

## Sub-sprint A · Inventory (≈1.5h)

Goal: a single reconciliation table showing what the mockup expects vs what the pipeline + DB actually provide.

### A.1 Mockup parameter inventory
Scan `dashboard/mockup/index.html` end-to-end. For every numerical or textual data point on the page, capture:
- Section (Top bar / Today / Book / Map · Macro strip / Map · Sector strip / Convergence / Hedges / Name slide-out / Macro slide-out / Sector slide-out / Tape)
- Field name (label as displayed)
- Current display value (the mock value baked into HTML/JS)
- Expected source / series name

Don't try to enumerate every cell of repeating tables — one row per *kind* of value.

### A.2 Pipeline parameter inventory
Walk `src/pipeline.js` and the parsers under `edgar/`, `macro/`, `news/`, `sentiment/`, `press/`, `whitehouse/`. For every series being fetched and/or written, capture:
- Parser file
- Series / field name
- Destination (table.column, file path, JSON key)
- Upstream source URL/API

### A.3 DB schema inventory
Read `docs/reference/DATABASE_SCHEMA.md` for the persisted-field list. Do not grep production DB. Capture: table, column, source, type.

### A.4 Three-way reconciliation
Produce a single delta table with these tags:

| Tag | Meaning | Action lane |
|---|---|---|
| 🟢 **AVAILABLE** | Used in mockup, in DB, parsed by pipeline | Keep as-is in new mockup |
| 🔴 **GAP** | Used in mockup, not in DB | Sub-sprint B decides: source from free API, calculate, or drop |
| 🔵 **UNUSED** | In DB, not surfaced in mockup | Sub-sprint B decides: surface in new mockup, or note as latent |
| 🟡 **PARSED-BUT-LOST** | Pipeline fetches it but doesn't persist it | Note in doc; out of scope to fix this sprint |

**Deliverable**: `docs/active/sprint-output/AUDIT_INVENTORY.md`

---

## Sub-sprint B · Free-source decisions (≈1h)

Goal: a decision per row in the reconciliation. Apply only to 🔴 GAP and 🔵 UNUSED rows.

### B.1 For every 🔴 GAP row
1. Check if a **free API** gives the value. Reference shortlist:
   - **FRED** — rates (DGS2, DGS10, DGS5, DFII5, T5YIE, T5YIFR), macro releases (CPI, PCE, GDP, NFP, UNRATE, ICSA, JOLTS, INDPRO, RSAFS, HOUST, UMCSENT), credit (BAMLH0A0HYM2, BAMLC0A0CM), Fed (FEDFUNDS, WALCL).
   - **BLS** — jobs detail, wages, regional employment.
   - **Yahoo Finance (yfinance / direct)** — equity prices, peer prices, ETF prices, options summary, earnings dates, basic estimates.
   - **EDGAR** — 10-Q/10-K filings, MD&A, financial statements.
   - **EIA** — crude inventory (PET.WCESTUS1.W), gasoline, rig count (PET.E_ERTRR0_XR0_NUS_C.W), nat gas.
   - **Federal Reserve H.4.1** — balance sheet detail.
   - **Treasury Direct** — daily yields confirmation, auctions.
   - **Stooq** — international indices, FX.
   - **AAII / NAAIM** — sentiment surveys (free weekly feeds).
2. If yes → mark **KEEP + new source** with the FRED/BLS/etc. series ID noted.
3. If no → check if it can be **calculated** from other fields the pipeline already produces. Examples:
   - Breadth (% above 50d MA) = compute from constituent price series.
   - SUE z-score = standardize EPS surprise series.
   - Sector RS-3m = sector ETF return − SPY return.
   - Drift score per driver = arithmetic on per-topic classifier output.
4. If no free source AND no calculable substitute → mark **DROP** with one-line reason.

### B.2 For every 🔵 UNUSED row
- Does this parameter add real signal that the current mockup is missing? Examples that probably do: CPI/PPI/GDP individual prints, Fed balance-sheet weekly delta, EIA inventory weekly delta, JOLTS, AAII bull/bear.
- If yes → propose **which existing block** of the mockup can absorb it without layout drift. Prefer reusing existing slot patterns (the macro indicator panel, a new tile in cross-asset, etc.).
- If no → leave unused, note in doc as "latent capability."

### B.3 Avoid scope creep
If a row needs a brand-new UI component to surface, prefer KEEP-AS-LATENT over inventing a new pattern. The user does not want strategic UI changes — only parameter swaps and cuts.

**Deliverable**: `docs/active/sprint-output/PARAMETER_DECISIONS.md` — one row per gap/unused parameter with action + source + reason.

---

## Sub-sprint C · New mockup + rationale doc (≈3–4h)

Goal: ship the redesigned mockup and the design-decision doc.

### C.1 Build the new mockup
1. Create folder `dashboard/mockup/v2-balanced/`.
2. Copy `dashboard/mockup/index.html` → `dashboard/mockup/v2-balanced/index.html`.
3. Apply changes from sub-sprint B:
   - Remove every slot tagged DROP.
   - For each KEEP-with-new-source row, swap the field label + mock value to match the new source.
   - For each ADD row from B.2, insert into the proposed block.
4. Wherever a removal leaves a layout hole, **rebalance the surrounding grid** so it looks intentional (don't leave gaps). Use the same idiom — if a 4-column row drops to 3 items, restretch the grid to 3 columns.
5. Keep all CSS, JS, and slide-out machinery as-is. Just edit the data and labels.

### C.2 Render check
- `python3 -m http.server 8000` from `dashboard/mockup/v2-balanced/`.
- Open `http://localhost:8000/index.html`.
- Confirm: no console errors, all blocks render, every slide-out opens, sparklines + tiles + tables look intact, no obvious visual regression vs current mockup.

### C.3 Design rationale doc
**Deliverable**: `docs/active/v2_BALANCED_MOCKUP.md`. Structure:

1. **Summary** (1 short paragraph) — what the rework achieves.
2. **What changed**, three lists: REMOVED (with reason per item), CHANGED (parameter swap, with new source), ADDED (with source).
3. **Per-section before/after**, walking the dashboard top-to-bottom — what each block displays now vs in the new mockup, with parameter list.
4. **Source map** — every visible parameter in the new mockup → API endpoint / FRED series ID / calculation method.
5. **Open questions** — anything that needs the user's call before next sprints (e.g., "Sector breadth requires daily ingestion of 11 sector constituents — is the pipeline volume acceptable?").

---

## Final deliverables checklist

- [ ] `docs/active/sprint-output/AUDIT_INVENTORY.md` (Sub-sprint A)
- [ ] `docs/active/sprint-output/PARAMETER_DECISIONS.md` (Sub-sprint B)
- [ ] `dashboard/mockup/v2-balanced/index.html` (Sub-sprint C)
- [ ] `docs/active/v2_BALANCED_MOCKUP.md` (Sub-sprint C)
- [ ] Update `docs/INDEX.md` — link the new mockup + rationale doc under Active work.

---

## What is explicitly out of scope

- DB schema changes — propose only, do not implement.
- Parser additions for new free sources — list in the doc, do not write code.
- Modifications to the current `dashboard/mockup/index.html`.
- Modifications to the AI-agent pipelines (TICKER_PIPELINE, MAP_PIPELINE).
- Pipeline code anywhere.

If during the sprint a tempting follow-up surfaces (e.g., "this would be much better if we wired a parser for X"), capture it in the rationale doc's "Open questions" section and move on. Don't rabbit-hole.

---

## Notes for tomorrow's runner

- Start by reading this doc end-to-end and the current `INDEX.md` to orient.
- The current mockup is the source of truth for "what features exist today" — read it carefully.
- Free-API decisions should default to **drop > placeholder**. The user prefers a tighter, honest dashboard over a fuller dashboard with broken slots.
- When in doubt about whether a feature is worth keeping after parameter swap, write the question into PARAMETER_DECISIONS.md rather than guessing — the user can answer in a 30-second back-and-forth.

---

> [INDEX](../INDEX.md)
