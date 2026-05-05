# INIT_NOTES_MS-4b — Initialization scoped (3 tickers + 3 sectors + macro)

Run date: 2026-05-05
Scope: same NVDA / UNH / XOM + Technology / Healthcare / Energy + macro slice as MS-4a (rescope per `f3df16e`).

## What MS-4b actually did

Steps 1-3 of the MS-4b spec ("fire orchestrator for tickers / sectors / macro") were already executed as part of MS-4a's full DAG fire. MS-4b's job here was to **prove idempotency** — that re-running `/run` doesn't re-fire agents whose inputs haven't changed — and verify the **dashboard endpoint chain** works end-to-end before the user's browser walkthrough.

## Idempotent /run results

One full DAG fire (`/run` no filter) over the entire AGENTS array (59 entries):

| Decision | Count | Notes |
| -------- | ----- | ----- |
| skip     | 53    | gates correctly say "fresh" / "no new prints" |
| fire     | 4     | legit downstream catch-ups (see below) |
| error    | 2     | same flagged failures as MS-4a |

**The 4 "fires" are correct, not waste:**
- `macro-news-drift` — M2 was rewritten in MS-4a (post-MS-3e) with new drivers/tripwires; M1 catches up to score the new targets.
- `macro-signposts` — fresh `MACRO_STATE_calendar` row landed (US/ISM_SVC on 2026-05-05). Real new event.
- `sector-news-drift:Technology` and `:Healthcare` — sector thesis was rewritten in MS-4a; sector drift catches up.

These cycles terminate after one pass because each agent's `input_fingerprint` epsilon check no-ops the next run when drivers/tripwires don't actually change.

**The 2 errors are the known MS-4a flags** (no new failure modes):
1. `ticker-peers:UNH` — UNH's healthcare peers not in `STOCK_FACTORS_daily` / `FUND_01_Fundamentals` coverage.
2. `ticker-notes:NVDA` — same transient empty-bullets validator reject.

## Final lights-on (after idempotent pass)

| Layer | Status |
| ----- | ------ |
| Macro M1–M7 | 7/7 ✓ |
| Sector Technology  | 6/6 ✓ |
| Sector Healthcare  | 6/6 ✓ |
| Sector Energy      | 6/6 ✓ |
| Ticker NVDA | 11/11 ✓ |
| Ticker UNH  | 10/11 (peers ✗ — flag) |
| Ticker XOM  | 11/11 ✓ |
| Tape annotations | 6/6 ✓ for 2026-04-14 |

## Dashboard endpoint chain — verified directly via ingestor

The dashboard server (Express proxy at `/api/*`) is a thin pass-through to the ingestor's `/query/*`. Ingestor calls (the bottom of the stack — server adds only the `source: "D1"` envelope):

| Endpoint | Result |
| -------- | ------ |
| `/query/ticker-read?ticker=NVDA` | full payload (472-char prose, v1, agent meta) |
| `/query/ticker-peers?ticker=UNH` | clean 404 `"No peers_json for ticker UNH"` (the flagged one — slide-out renders the inline ERROR via the MS-3h handler) |
| `/query/ticker-read?ticker=AAPL` | clean 404 (non-build ticker — expected per MS-4b done-when) |
| `/query/sector-read?sector=Materials` | clean 404 (non-build sector — expected) |
| `/query/tape-annotations` | 6 annotations for 2026-04-14, all cautious "no plausible match" sentences |

→ The full chain D1 → ingestor → server → v2-balanced is working. Empty cells the user sees in the browser will be either:
  - Built into the mockup (intentional UX scaffolding from MS-3h),
  - The agent-card ERROR state (UNH peers card),
  - Or 404s for non-build tickers/sectors (`AAPL`, `Materials`, etc.) that surface the same inline error.

## Outstanding for MS-4b done-when

Per the rescoped spec, the remaining MS-4b done-when criteria are **browser-side**:
- No `[object Object]` anywhere
- No `—` where data should be
- No console errors
- Empty slide-outs for non-build tickers/sectors show their 404 message

These are the user's manual walkthrough:
1. Today → Map view
2. Macro slide-out (open from regime pill)
3. Sector slide-outs × 3 (Technology / Healthcare / Energy)
4. Name slide-outs × 3 (NVDA / UNH / XOM)
5. Tape panel
6. Optional: open AAPL or Materials to see the expected 404 empty state

## Credit-budget accounting

MS-4b: 4 LLM calls (the legit catch-up fires). Cumulative this session including MS-4a: ~64 LLM calls across 25 deployed agents — well under any reasonable burn budget for a full-fleet first-light verification.

→ **`/clear` after MS-4b** per the runbook. Dashboard is LIVE for the build set. Validation + cleanup phase (MS-5a / 5b / 5c / 5d) follows.
