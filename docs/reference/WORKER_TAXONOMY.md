# Worker Taxonomy

**Last audited**: 2026-05-09 · 70 workers in `workers/`.

The fleet splits into **5 tiers** by how each worker is invoked. Knowing the
tier tells you whether a worker is alive, what triggers it, and what fails if
you delete it.

---

## Tier 1 — Cron entry points (10)

These run themselves on Cloudflare's scheduler. Each `wrangler.jsonc` carries
a `triggers.crons` entry. **No inbound service binding needed.**

| Worker | Schedule (UTC) | What it does |
|---|---|---|
| `agent-orchestrator` | `0 22 * * 1-5` | Walks the 25-agent fleet (Tier 3). Per-agent gate decides fire/skip. |
| `consensus-fetcher` | `0 13 * * 1-5` | AlphaVantage analyst-estimates → `FUND_03_Estimates`. Event-driven via earnings calendar. |
| `economic-calendar-fetcher` | `0 0 * * *` | Finnhub upcoming econ events → `MACRO_STATE_calendar`. |
| `fomc-statement-fetcher` | `0 0 * * *` | federalreserve.gov RSS → `MACRO_STATE_fomc` + `FOMC_PROJECTIONS`. |
| `macro-state-fetcher` | `10 0 * * *` | FRED / BLS macro indicators → `MACRO_STATE_indicators`. |
| `sentiment-state-fetcher` | `25 0 * * *` | CFTC positioning + AAII → `SENTIMENT_STATE_indicators`. |
| `yfinance-cross-asset-fetcher` | `20 0 * * *` | Yahoo SPX / VIX / WTI / DXY / etc. → `MACRO_STATE_indicators`. |
| `topic-feed-builder` | `0 2 * * *` | Daily news clusters → `TOPIC_FEED`. |
| `valuation-curve-builder` | `15 1 * * *` + `30 1 * * *` | DCF curves → `SIGNAL_03_ValuationCurve_*`. Long path bimonthly. |
| `big-movers-why` | `0 7 * * 2-6` | Daily mover explanations → `MOVER_EXPLANATIONS_daily`. |

---

## Tier 2 — Public-facing (2)

| Worker | Role |
|---|---|
| `hedge-server` | The dashboard's edge. Serves `dashboard/index.html`. Proxies `/api/<x>` → `portfolio-ingestor` `/query/<x>`. |
| `portfolio-ingestor` | The D1 swiss-army worker. 100+ `/query/*`, `/ingest/*` endpoints. The only worker that touches D1 directly via HTTP. |

---

## Tier 3 — AI agent fleet (25)

Called by `agent-orchestrator` via service bindings. Each takes `?ticker=`,
`?sector=`, or no args. Each makes ~1 OpenAI call per fire (logged via
`_shared/llm.js`).

| Group | Agents (in fire order) |
|---|---|
| **Macro (7)** | `macro-news-drift` → `macro-thesis` → `macro-notes` → `macro-positioning` → `macro-signposts` → `macro-read` → `macro-fomc-summary` |
| **Sector × 3 (6)** | `macro-sector-news-drift` → `macro-sector-thesis` → `macro-sector-notes` → `macro-sector-implementation` → `macro-sector-hedges` → `macro-sector-read` |
| **Ticker × 5 (11)** | `ticker-valuation` → `ticker-fundamentals` → `ticker-estimates` → `ticker-peers` → `ticker-context` → `ticker-news-drift` → `ticker-thesis` → `ticker-notes` → `ticker-recommendation` → `ticker-read` → `ticker-earnings-summary` |
| **Tape (1)** | `tape-annotation` |

Currently in scope: `["NVDA", "UNH", "XOM", "AAPL", "JPM"]` tickers ×
`["Technology", "Healthcare", "Energy"]` sectors. See
`workers/agent-orchestrator/src/worker.js:38-43`.

---

## Tier 4 — Laptop pipeline (26)

Invoked when you run `npm run pipeline`. The chain is:

```
src/pipeline.js → POST .../job-engine-workflow/run
                      ↓
                  job-engine-workflow → 25 service bindings (LIFO queue)
```

`job-engine-workflow` itself has no cron and no inbound binding — it's only
ever hit manually. Its 25 downstream workers all wrote to D1 in the last
4 days, so the chain is alive.

| Subsystem | Workers |
|---|---|
| **Data fetchers** | `price-fetcher`, `earnings-fetcher` |
| **Factor builders** | `stock-factor-builder`, `sector-factor-builder` |
| **Position math** | `nav-builder`, `position-builder` |
| **Signal layer** | `assessment-engine`, `probability-engine`, `signal-history-builder` |
| **Summarizers** | `sentiment-summarizer`, `macro-summarizer`, `macro-intelligence-builder` |
| **Gen pipeline** | `gen-builder`, `gen-orchestrator` |
| **Trend pipeline** | `beta-trend-builder`, `beta-trend-orchestrator` |
| **SEC filings** | `8k-summarizer`, `qk-summarizer`, `qk-structure-builder`, `qk-report-summarizer`, `form4-summarizer`, `report-orchestrator` |
| **News funnel** | `news-funnel-orchestrator`, `news-funnel-filter`, `news-funnel-gatherer` |
| **Meta** | `job-engine-workflow` |

---

## Tier 5 — Suspicious / likely dead (7)

Held in the fleet but with no recent writes. Audited 2026-05-09. **Not deleted
yet** — kept here so the next cleanup pass can act with confidence.

| Worker | Target table | Last write | Verdict |
|---|---|---|---|
| `operations-agent` | `OPERATION_01_Signals` | **EMPTY (never wrote)** | ✅ Confirmed dead. Bound by `job-engine-workflow` but produces nothing. |
| `ticker-trend-short` | `TICKER_TREND_short` | 2026-04-15 (24 days) | 🟡 Likely superseded by `ticker-thesis-agent` + `ticker-recommendation-agent`. |
| `sector-trend-short` | `SECTOR_TREND_short` | 2026-04-18 (21 days) | 🟡 Likely superseded by `macro-sector-thesis-agent`. |
| `sector-trend-long` | `SECTOR_TREND_long` | 2026-04-18 row create (table still UPDATEd daily by sector agents) | 🟡 Was the row-seeder; agents update the JSON columns. May still be needed for new sectors. |
| `consensus-validator` | (no table writes) | Runs only when `TICKER_TREND_short` fires | 🟡 Dead by dependency — if `ticker-trend-short` is dead, this is too. |
| `wealth-distribution` | `REBALANCE_01` | 2026-04-16 (23 days) | 🟡 Likely rare-fire by design (rebalancing trigger), or dead. |
| `event-attribution-engine` | (no structural writes — diagnostics only) | unknown | 🟡 Pure diagnostic layer. Read source to confirm whether output still consumed. |

### How to delete a Tier-5 worker safely

1. Remove its binding from `workers/job-engine-workflow/wrangler.jsonc` `services` array.
2. `cd workers/job-engine-workflow && npx wrangler deploy`.
3. `cd workers/<dead-worker> && npx wrangler delete` to drop it from Cloudflare.
4. `rm -rf workers/<dead-worker>` and commit.

Skipping step 1+2 first means `job-engine-workflow`'s next deploy will fail
because the service binding refers to a non-existent worker.

---

## Reference: the call graph

```
                  ┌─────────────────────────────────────────────────┐
                  │              CLOUDFLARE CRON                    │
                  └──┬──────┬──────┬──────┬──────┬──────┬──────┬───┘
                     ▼      ▼      ▼      ▼      ▼      ▼      ▼
              agent-orch  consensus  econ-cal  fomc  macro-state  ...
                  │
                  ▼ (25 service bindings)
              [ 7 macro · 6 sector · 11 ticker · 1 tape ] = 25 agents
                  │
                  ▼ (each calls OpenAI, writes D1)
              D1 (HEDGE_DB)
                  ▲
                  │
              portfolio-ingestor ◄── hedge-server ◄── dashboard/index.html
                  ▲
                  │
              job-engine-workflow  (manual trigger from `npm run pipeline`)
                  │
                  ▼ (28 service bindings; 26 alive, 2 dead-ish)
              [ Tier 4 workers ]
```

The two chains (cloud agents vs. laptop pipeline) never call each other —
they share D1, both read and write the same tables. That's the entire
integration surface.
