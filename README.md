# Hedge-Portfolio

A personal hedge-fund-grade research dashboard. Live at
[hedge-server.gines-rodriguez-castro.workers.dev](https://hedge-server.gines-rodriguez-castro.workers.dev/).

Two pipelines living together. **Read this before opening any subdirectory.**

---

## 30-second mental model

```
┌────────────────────────────────────────────────────────────────────┐
│  CLOUD  (always on, runs on Cloudflare)                            │
│                                                                    │
│  workers/   — 70 Workers: agents, fetchers, orchestrators          │
│  dashboard/ — index.html (served by hedge-server worker)           │
│  D1         — single source of truth (HEDGE_DB)                    │
└────────────────────────────────────────────────────────────────────┘
                          ▲ ingests via POST /ingest/*
                          │ reads via   GET  /query/*
┌────────────────────────────────────────────────────────────────────┐
│  LAPTOP  (manual, run with `npm run pipeline`)                     │
│                                                                    │
│  src/pipeline.js — 10-step orchestrator                            │
│  src/steps/      — modular step implementations                    │
│  press/ news/ edgar/ macro/ sentiment/ whitehouse/                 │
│                  — domain scrapers, one folder per data source     │
│  scripts/        — one-off backfills + bootstraps + PDF render     │
│  validation/     — local validation runner (`npm run validate`)    │
│  config/         — static config (peers mapping, target weights)   │
└────────────────────────────────────────────────────────────────────┘
```

Why two pipelines? The cloud pipeline runs every cron tick, ingests
vendor data (FRED, Yahoo, Alpha Vantage, Polygon, Finnhub, SEC), runs
LLM agents, serves the dashboard. The laptop pipeline is older — it
scrapes data sources that don't have clean APIs (company press pages,
SEC EDGAR full-text, Bloomberg/WSJ/Reuters HTML) and POSTs results to
the cloud's ingest endpoints. They co-exist because the cloud can't run
puppeteer.

---

## Top-level map

| Path | What lives here | Maintained? |
|---|---|---|
| **`workers/`** | 70 Cloudflare Workers — agents, fetchers, orchestrators. The actual production code. See [docs/architecture.md](docs/architecture.md). | Active |
| **`dashboard/`** | `index.html` (the SPA), `server.js` (local dev), `audits.json` (audit log). Served live by `workers/hedge-server`. | Active |
| **`src/`** | Laptop pipeline: `pipeline.js` orchestrator + `steps/*.js` modules + `lib/*` helpers. Run with `npm run pipeline`. | Active |
| **`scripts/`** | One-off Node scripts: `backfill-*`, `bootstrap-*`, `render-pdf*`, `seed-trades`, `verify-dashboard`. Useful for repair / migration / reporting. | Active |
| **`press/`** | Company-newsroom scraper (puppeteer). Outputs `AA_press_releases_today.json` and per-ticker summaries. | Active |
| **`news/`** | Bloomberg / WSJ / Reuters article scrapers. Outputs `news_summary.json`. | Active |
| **`edgar/`** | SEC EDGAR full-text fetch + parse + cluster pipeline. Bigger than the rest because it caches raw HTML / parsed JSON / clustered JSON locally (gitignored). | Active |
| **`macro/`** | FRED / BLS / FOMC scrapers + bootstrap SQL. | Active |
| **`sentiment/`** | CFTC + market-positioning sentiment scraper. | Active |
| **`whitehouse/`** | whitehouse.gov press-release scraper. | Active |
| **`validation/`** | Local validation runner — checks every parser's output against its source. `npm run validate`. | Active |
| **`config/`** | `peers-mapping.json` (per-ticker peer set), `portfolio-targets.json` (target weights). | Active |
| **`docs/`** | Architecture + reference docs. See [docs/INDEX.md](docs/INDEX.md). | Active |
| **`logs/`** | Local pipeline logs (gitignored content; `.gitkeep` preserves the dir). | Runtime artifact |
| **`package.json`** | Top-level `npm` scripts (laptop pipeline only — workers each have their own deploy). | Active |

There's no `README.md` per scraper folder by design — each folder's `index.js` (or `summary.js`) is short enough that the file is its own documentation.

---

## Where to read first

1. **[docs/architecture.md](docs/architecture.md)** — The canonical mental model: the two horizontal layers (data parsing + AI processing), the four workflows (Macro / Sector / Ticker / Tape), the bug patterns to watch for. Read this first.
2. **[docs/SYSTEM_REFERENCE.md](docs/SYSTEM_REFERENCE.md)** — Long-form reference: every D1 table, every cron, every agent contract. Use as a lookup table, not a tutorial.
3. **[docs/INDEX.md](docs/INDEX.md)** — Worktree map of every doc, with status flags.
4. **[docs/active/](docs/active/)** — In-flight design docs (TICKER_PIPELINE, MAP_PIPELINE, dashboard-AI integration, etc.).
5. **[docs/archive/](docs/archive/)** — Shipped sprint plans + superseded designs, kept for history.
6. **[docs/reference/](docs/reference/)** — DATABASE_SCHEMA, KEY_COMMANDS, WORKER_TAXONOMY.

---

## How to run things

```bash
# Laptop pipeline (one-shot ingest cycle)
npm run pipeline

# Local validation (no LLM calls)
npm run validate

# Local dashboard for hot-reload dev (the live one is on Cloudflare)
npm run dashboard

# Render the SYSTEM_REFERENCE PDF
npm run render-pdf
```

Workers are deployed individually — each has its own `wrangler.jsonc`. Typical pattern:

```bash
cd workers/<worker-name>
npx wrangler deploy
```

The orchestrator and most fetchers run on cron (see `docs/architecture.md` for the full schedule). Manual invocations:

```bash
# Force-fire a single agent through the orchestrator
curl "https://agent-orchestrator.gines-rodriguez-castro.workers.dev/run?agent=macro-thesis&force=1"

# Trigger a fetcher's /build endpoint manually
curl "https://earnings-fetcher.gines-rodriguez-castro.workers.dev/fetch-calendar"
```

---

## Operational invariants

- **D1 is the single source of truth.** Every panel on the dashboard reads from D1. Every agent writes to D1. Vendors are caches.
- **Agents log every OpenAI call** to `PROC_04_API_usage` via `_shared/llm.js` (fleet) and `_shared/openai-call.js` (snowflakes). Validator tab shows real spend.
- **Gates on every agent.** No LLM call without a justification: a fresh data print, a regime flip, a thesis rewrite, etc. See `workers/agent-orchestrator/src/worker.js:295+`.
- **COALESCE on every UPSERT.** Transient nulls from vendor APIs never erase known values. Established pattern, repeated across all `/ingest` endpoints.
