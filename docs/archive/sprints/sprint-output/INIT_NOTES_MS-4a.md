# INIT_NOTES_MS-4a — 3-ticker initialization (NVDA / UNH / XOM)

Run date: 2026-05-05
Orchestrator URL: `https://agent-orchestrator.gines-rodriguez-castro.workers.dev`
Method: `?ticker=<TKR>` filter (one orchestrator call per ticker, 11 agents fired in DAG order each).

## Lights-on summary

| Layer       | Coverage               |
| ----------- | ---------------------- |
| Macro M1–M7 | 7/7 ✓ (M7 cached for 2026-04-29 FOMC) |
| Sectors S1–S6 (Tech / Healthcare / Energy) | 6/6 ✓ each |
| Ticker NVDA (11 fields) | **11/11 ✓** |
| Ticker UNH  (11 fields) | 10/11 (peers ✗ — data-coverage flag, see below) |
| Ticker XOM  (11 fields) | **11/11 ✓** |
| Tape annotations (2026-04-14, 6 movers) | 6/6 ✓ |

## Sample read prose (verdict + driver + tripwire + rec sanity)

**NVDA — intact, add today:**
> Our NVDA thesis remains intact: fundamentals holding and drift intact, with execution-led cash generation and margins offsetting estimates flat (fade FY+2) and valuation cheap amid a context tailwind. The Datacenter AI capex cycle and CUDA platform lock-in are the load-bearing drivers sustaining demand and the platform premium. The nearest tripwire is [eps_rev_negative_2w] given flat 4-week EPS revisions and breadth. Recommendation: add, window today—Add 100bps today.

**UNH — weakening, add this_week:**
> UNH's thesis is weakening as fundamentals are contracting and drift is intact, with profitability deteriorating despite continued scale and Optum diversification. The load-bearing driver is Optum services margin leverage, which must reassert alongside cost normalization to stabilize returns amid a neutral context and valuation cheap. The nearest tripwire is [net_income_below_12b] (TTM net income < $12.0B), with gross margin close to the [gross_margin_below_18] threshold after recent compression. We recommend add this_week to align with estimates revisions_up and UnitedHealthcare membership resilience.

**XOM — weakening, hold weeks:**
> ExxonMobil's thesis is weakening with fundamentals contracting, even as valuation is cheap and drift intact. Positioning still rests on Integrated refining and chemicals, with Buyback-led per-share accretion after buybacks reduced shares outstanding. The nearest tripwire is [current_ratio_below_1_1] as liquidity softened, and we narrow tolerance for further balance-sheet slippage. We maintain a hold stance with a weeks window.

All three reads:
- State a clear position (intact / weakening / weakening) — no hedging language.
- Reference named drivers explicitly.
- Reference tripwires by `[id]` syntax.
- Surface the recommendation stance + window.

→ Meets the MS-3g done-when criterion: "Read prose mentions specific drivers + tripwires."

## Failures + flags

### 🚩 FLAG · `ticker-peers:UNH` — data coverage gap (NOT an agent bug)

`ticker-peers-agent` errored on UNH with:
```
no comp rows found for any peer of UNH
```

UNH's `PEER_SET_config.peers_json` is `["ELV","HUM","CNC","MOH","HQY","ALHC","PGNY","CLOV","PFHO","MRDH"]` — healthcare/managed-care names. None of these have rows in either `STOCK_FACTORS_daily` or `FUND_01_Fundamentals`, because our equity-fact ingestion pipeline today only covers the 24-name book + a few cross-asset tickers, not the full SPY universe.

**Fix path:** broaden the `STOCK_FACTORS_daily` / `FUND_01_Fundamentals` ingestion to cover sector peer sets, OR loosen `ticker-peers-agent` to write a `(insufficient peer coverage)` annotation instead of erroring. Current behavior (hard error) is correct for a peer reading that genuinely cannot be computed; the cleanup MS should pick the path.

**Tracking:** flag — does NOT block MS-4a or MS-4b. The UNH slide-out will simply show an "ERROR" message in the peers card from the existing `loadTickerSlideOut()` error handler.

### 🚩 FLAG · `ticker-notes:NVDA` — transient empty-bullets validation reject

First fire of `ticker-notes:NVDA` errored with `invalid output: bullets is empty` — the LLM filtered every topic out (likely because none touched a thesis driver/tripwire on first eval, before thesis had been refreshed). The agent re-fired automatically on the next pass (after `news_drift` updated → triggered the notes gate via the "drift newer than notes" check) and wrote v1 with 6 bullets successfully.

**Fix path:** consider treating empty-bullets as a `wrote-empty` success state (similar to how `ticker-news-drift-agent` handles empty-topics). For MS-4a it self-recovered, no action.

### `ticker-peers:NVDA` and `:XOM` skipped on this pass

Both showed `peers fresh: no new factors / config for NVDA` because peers had been written in an earlier ad-hoc fire (during the smoke-test run after secrets were set). Not a flag — gate working as intended.

## What was lit by this MS-4a fire (LLM-call accounting)

| Layer       | Calls (excluding skipped/cached) |
| ----------- | ---- |
| Macro       | 6 (M1 already had a v1 from secret-set smoke; M2–M6 fresh + M7 cached) |
| Sectors     | 18 (3 sectors × 6 agents) |
| Tickers     | ~30 (3 × ~10 agents that fired; some skipped due to "fresh" gates) |
| Tape annotations | 6 (already done at secrets-set smoke) |
| **Total**   | **~60 LLM calls** |

Per the credit-budget memory, this is "one happy-path verification per sprint" — the full DAG was exercised once across the build set, end-to-end, and no further re-runs are planned for MS-4a.

## Browser walkthrough — pending

The remaining MS-4a step ("Open the Name slide-out in browser. Read top-to-bottom.") is the user's manual action. No blockers from the data side — all 3 ticker slide-outs will render their MS-3h `#np-agents-block` cards from D1; UNH peers card will show its ERROR state inline, all others will show live agent prose.

→ Ready for MS-4b (rescoped: same 3 tickers + 3 sectors + macro — already done in this MS, so MS-4b will mostly be re-running gates and finding nothing changed).
