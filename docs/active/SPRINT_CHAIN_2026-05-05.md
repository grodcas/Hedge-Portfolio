> [INDEX](../INDEX.md) · [Audit](PRE_SPRINT_AUDIT_2026-05-04.md) · [Map pipeline](MAP_PIPELINE.md) · [Ticker pipeline](TICKER_PIPELINE.md) · [Dashboard AI integration](DASHBOARD_AI_INTEGRATION.md)

# SPRINT CHAIN · 2026-05-05

**Goal**: get the v2-balanced dashboard fully live and self-running, hosted on hedge-server.

**Shape**: 25 micro-sprints, each 15–60 min, single output, lights-on test, then commit. Six `/clear` checkpoints between phases keep the runner's context fresh.

## How to run this

For each micro-sprint:
1. Runner reads the relevant section here + linked contracts.
2. Executes. One commit per micro-sprint, message starts with `MS-Xy:`.
3. Reports "✅ shipped, ready for next" or "⛔ blocked: <reason>".
4. User glances at the commit + reply, says "go" or "fix X".
5. At each `/clear` marker the user resets the session and pastes "Continue with MS-Yz" — the runner reads its sprint file and resumes.

## Locked defaults (no questions about these)

- **Hosting**: hedge-server (Tailscale `100.124.104.92`, hostname `hedge-server`). Dashboard binds to its Tailscale IP, not localhost.
- **Estimates table**: lands now in MS-1e via Finnhub.
- **Z-scores**: stored on insert (MS-1b extends `macro-state-fetcher`).
- **AI worker template**: `workers/operations-agent/src/worker.js` lines 229–244 are canonical. Lifted to `workers/_shared/llm.js` in MS-1f.
- **Cleanup aggressiveness**: soft-delete only. Column drops logged to BUGS_FOUND.md for user review.
- **TOPIC_FEED clustering**: `gpt-5-mini` over a 14-day BETA_12_News_digest window, scoped per ticker / sector / macro-theme.
- **Models**: `gpt-5` for synthesis (Thesis, Read, Recommendation, Notes, Positioning), `gpt-5-mini` for tagging (topic clusterer, Tape annotation).

---

## PHASE 0 · Deploy hedge-server (~45 min · 1 micro-sprint)

### MS-0a · Provision hedge-server + serve dashboard publicly

**Why first**: every later sprint deploys workers / verifies dashboard. Need the box ready.

**Steps**:
1. SSH to `hedge-server` (`ssh hedge-server` works passwordlessly).
2. Install `nodejs` 20.x + `npm` + `git`. Clone repo to `~/Hedge-Portfolio`.
3. Copy `.env` from laptop via `scp` (manual step the runner asks user to confirm — only `.env` should ever be transferred this way).
4. `npm install` in repo root.
5. Edit `dashboard/server.js`: change `app.listen(PORT)` → `app.listen(PORT, "0.0.0.0")` so Tailscale peers can reach it.
6. Create `/etc/systemd/system/hedge-dashboard.service`. Enable + start. Verify `http://hedge-server:4200/` from laptop browser.
7. Add crontab: `0 7 * * * cd ~/Hedge-Portfolio && /usr/bin/npm run pipeline >> ~/pipeline.log 2>&1` (daily 07:00 local — adjust later if needed).

**Done when**: `http://hedge-server:4200/` opens in laptop browser and shows the OLD dashboard (the v2-balanced wire-up happens in later phases).

→ **`/clear` after MS-0a**

---

## PHASE 1 · Data layer prep (~2.5h · 6 micro-sprints)

### MS-1a · Migrations 0042–0045

**Files**: `workers/portfolio-ingestor/migrations/`

- `0042_add_topic_feed.sql` — schema in [audit §2.1](PRE_SPRINT_AUDIT_2026-05-04.md#21--topic_feed-clustering--does-not-exist).
- `0043_add_fund03_estimates.sql` — `(id, ticker, period_label, period_kind, fiscal_year, eps_consensus, rev_consensus, eps_revisions_30d, rev_revisions_30d, eps_dispersion, source, created_at)`.
- `0044_extend_macro_state_indicators.sql` — `ALTER TABLE MACRO_STATE_indicators ADD COLUMN delta_1m REAL; ADD COLUMN z_vs_24m REAL;`.
- `0045_add_agent_json_columns.sql` — adds 25 `*_json` + `*_updated_at` + `*_model` columns across `BETA_10_Daily_macro`, `SECTOR_TREND_long`, `TICKER_TREND_long`. Bundle to avoid 25 migrations.

Apply each via `cd workers/portfolio-ingestor && npx wrangler d1 migrations apply portfolio-db --remote`.

**Done when**: 4 migrations in `migrations list --remote`. One commit per migration.

### MS-1b · Extend `macro-state-fetcher` (4 FRED series + Z-scores)

Add to `FRED_SERIES`: `WPU0911` (rig count proxy) — actually use `IPN213111S` if rig count is unavailable; `HOUST` (housing starts); `INDPRO` (industrial production); `JTSJOL` (JOLTS openings).

Compute on insert: `delta_1m` = current − value 30 calendar days ago; `z_vs_24m` = (current − mean_24m) / stdev_24m. Both via D1 sub-queries inside the existing INSERT.

**Done when**: `/build` lands all 4 new codes with non-null `delta_1m` and `z_vs_24m`.

### MS-1c · Bootstrap `PEER_SET_config`

One-shot script: `scripts/bootstrap-peer-set-config.js` reads `config/peers-mapping.json`, POSTs to a new `/ingest/peer-set-config` endpoint on `portfolio-ingestor` (build the endpoint as part of this MS).

**Done when**: `SELECT COUNT(*) FROM PEER_SET_config` ≥ number of tracked tickers.

### MS-1d · New worker `topic-feed-builder`

Reads last 14d of `BETA_12_News_digest`, clusters by canonical topic via `gpt-5-mini` (one call with all titles + ask for cluster JSON), upserts to `TOPIC_FEED`. Scope set per row: `ticker:NVDA`, `sector:Technology`, `macro:rates`, etc. Cron daily 02:00 UTC.

**Done when**: `/build` produces ≥10 rows; spot-check that `days_active` is correct on a topic that recurs across multiple days.

### MS-1e · New worker `consensus-fetcher`

Per tracked ticker, calls Finnhub `/stock/eps-estimate?symbol=…&freq=annual` and `/stock/revenue-estimate`. Writes FY / FY+1 / FY+2 rows to `FUND_03_Estimates`. Cron daily 13:00 UTC. Use existing `FINNHUB_API_KEY` env var.

**Done when**: ≥3 ticker rows present after `/build`.

### MS-1f · Lift `workers/_shared/llm.js`

Extract `callGPT5(apiKey, prompt, model = "gpt-5")` from `operations-agent` and `parseJsonFromResponse` from `news-funnel-filter` into a shared module. Add a single retry on transient (HTTP 5xx / timeout). Existing workers stay as-is; new agents `import { callLLM } from '../_shared/llm.js'`.

**Done when**: a smoke worker importing the helper deploys + returns valid JSON for a simple prompt.

→ **`/clear` after MS-1f** — phase 1 done, data layer is ready for agents.

---

## PHASE 2 · Agent foundation (~2h · 4 micro-sprints)

### MS-2a · Already in MS-1a

Migration 0045 already added `thesis_json` to `BETA_10_Daily_macro`. Skip — placeholder kept so numbering doesn't shift.

### MS-2b · Build `macro-thesis-agent`

Copy template from `operations-agent`. Read M2 contract from [MAP_PIPELINE.md §M2](MAP_PIPELINE.md). Inputs: regime label + cross-asset state + macro indicator panel (with `delta_1m` and `z_vs_24m` from MS-1b) + previous thesis. **News-drift verdict hardcoded to "regime intact" for this MS** — wired in MS-3e.

Endpoint `/build`. Validates JSON output against schema (drivers[], tripwires[], prose, version, last_updated). Writes to `BETA_10_Daily_macro.thesis_json`.

**Done when**: `/build` lands one row; second `/build` against unchanged inputs is a no-op (epsilon check via `thesis_updated_at`).

### MS-2c · Build `agent-orchestrator`

Reads each agent's `*_updated_at`, computes diff against current input snapshot, fires the agent only if any input crossed its epsilon. M2 epsilon: regime label changed OR any panel indicator `|z_vs_24m| > 1.5` OR a tripwire flag fired. Cron hourly during US market hours (Mon–Fri 14:00–22:00 UTC).

**Done when**: 1st `/build` fires M2; 2nd `/build` skips it; `firing_log` in DB shows the skip reason.

### MS-2d · Wire dashboard for Macro Thesis (full 3-hop)

1. `portfolio-ingestor` — add `/query/macro-thesis` returning the latest `thesis_json` row.
2. `dashboard/server.js` — add `/api/macro-thesis` that proxies through `fetchFromWorker`.
3. `dashboard/mockup/v2-balanced/index.html` — replace static prose at line 2211 with a `fetch('/api/macro-thesis').then(...)` block. Add a `<script>` section near the bottom if v2-balanced doesn't already have one.

**Done when**: open `http://hedge-server:4200/mockup/v2-balanced/` in laptop browser, see live thesis text loaded from D1. Take screenshot, save to `docs/active/sprint-output/lights-on-MS-2d.png`. Commit screenshot.

→ **`/clear` after MS-2d** — pattern locked, lights-on confirmed, ready to scale.

---

## PHASE 3 · Agent rollout (~5h · 9 micro-sprints — split with `/clear` after MS-3d)

For every rollout MS the runner follows the same loop:
1. Build the FIRST agent of the batch end-to-end (worker → deploy → fire → verify JSON in DB → commit).
2. Report "first agent of batch ✅ — continuing with N more".
3. Copy the pattern for remaining agents in batch. One commit per agent.
4. At end of batch, run a single wiring pass for the surface (ONE wiring MS per surface).

**No per-agent dashboard wiring inside a build batch** — wiring is its own MS.

### MS-3a · Macro non-drift agents (M4 Positioning, M5 Signposts, M6 Read, M7 FOMC summary)

4 agents, each reads its contract from [MAP_PIPELINE.md](MAP_PIPELINE.md). Output column: `BETA_10_Daily_macro.{positioning,signposts,read,fomc_summary}_json`. Add to orchestrator config.

**Done when**: 4 commits, 4 JSON rows present.

### MS-3b · Wire Macro slide-out

One pass adds 5 new `/query/*`, 5 new `/api/*`, and 5 fetch+render blocks (M2 already done in MS-2d, plus M4/M5/M6/M7). Updates v2-balanced sections that today show static macro content.

**Done when**: open Macro slide-out in browser, all 5 fields render from DB. Screenshot `lights-on-MS-3b.png`.

### MS-3c · Sector non-drift agents (S2 Thesis, S4 Implementation, S5 Hedges, S6 Read)

4 agents. Output column: `SECTOR_TREND_long.{thesis,implementation,hedges,read}_json`. Add to orchestrator.

**Done when**: 4 commits, 4 JSON rows per sector (run for at least 2 sectors as smoke test).

### MS-3d · Wire Sector slide-out

Same shape as MS-3b. Screenshot `lights-on-MS-3d.png`.

→ **`/clear` after MS-3d** — Macro + Sector slide-outs LIVE. Natural day-1 stop point if user is short on time.

### MS-3e · Drift + Notes agents (M1, M3, S1, S3 — needs TOPIC_FEED live from MS-1d)

4 agents. Each reads its scope's slice of `TOPIC_FEED` (e.g., M1 reads `WHERE scope LIKE 'macro:%'`). Output: `BETA_10_Daily_macro.{news_drift,notes}_json` + same on `SECTOR_TREND_long`. After M1 lands, also re-run `macro-thesis-agent` so it consumes the real drift verdict (no longer "intact" hardcoded).

**Done when**: 4 commits, JSON rows present, M2's prose now references real drift signals.

### MS-3f · Ticker readings batch (Valuation, Fundamentals, Estimates, Peers, Context)

5 agents. Output: `TICKER_TREND_long.{valuation,fundamentals,estimates,peers,context}_json`. Estimates reads from `FUND_03_Estimates` (MS-1e). Peers reads from `PEER_SET_config` (MS-1c).

**Done when**: 5 commits, JSON rows for at least 1 test ticker (NVDA).

### MS-3g · Ticker synthesis batch (News drift, Thesis, Notes, Recommendation, Read, Earnings summary)

6 agents. Thesis is keystone (reads all readings). Recommendation reads Thesis + Positioning. Read stitches everything. Earnings summary is event-driven (per-quarter).

**Done when**: 6 commits, JSON rows for NVDA. Read prose mentions specific drivers + tripwires.

### MS-3h · Wire Ticker slide-out

One pass for all 11 ticker fields. Largest wiring MS — budget 1h. Screenshot `lights-on-MS-3h.png`.

### MS-3i · Tape annotation agent + wire

Single `gpt-5-mini` agent. Output: `MOVER_EXPLANATIONS_daily.annotation_json`. Wire it into v2-balanced's Tape strip. Screenshot.

**Done when**: full Tape view shows live annotations + the per-row "why this moved" sentences.

→ **`/clear` after MS-3i** — all 25 agents shipped, dashboard fully wired.

---

## PHASE 4 · Initialization (~4.5h · 2 micro-sprints)

### MS-4a · Initialization mockup (3 tickers)

Pick NVDA · UNH · XOM (covers Tech / Healthcare / Energy). For each ticker:
1. Manually fire orchestrator with `?ticker=<TKR>&force=1`.
2. Verify all 11 ticker JSON columns populate.
3. Open the Name slide-out in browser. Read top-to-bottom.
4. Log "feels-wrong" moments to `docs/active/sprint-output/INIT_NOTES_MS-4a.md`.

**Stop**: any blank panel, any prose that hedges instead of landing on a verdict, any JSON parse failure. Fix-or-flag, then continue.

**Done when**: 3 slide-outs render fully + INIT_NOTES.md exists (can be empty if all clean).

### MS-4b · Initialization scoped (3 tickers + 3 sectors + macro)

**Scope reduced 2026-05-05** — full 24-ticker / 8-sector fan-out deferred to a
post-validation MS so we ship the dashboard against the same NVDA / UNH / XOM
+ Technology / Healthcare / Energy slice we used in MS-4a. Macro is unscoped
(it's a single set of 7 agents — no fan-out anyway).

Prereq: MS-4a clean.

1. Fire orchestrator for the 3 build tickers (NVDA, UNH, XOM). One batch is fine
   at this volume; 11 agents × 3 tickers = ~33 LLM calls.
2. Fire the 3 build sectors (Technology, Healthcare, Energy) — 4 sector agents
   each = 12 LLM calls. Other 5 sectors stay empty (slide-out renders 404).
3. Fire all 7 macro orchestrator runs (M1–M7).
4. Open all 3 ticker slide-outs in browser; verify all 11 cards render.
5. Open all 3 sector slide-outs; verify all 4 cards render.
6. Walkthrough top-to-bottom: Today → Map → Macro slide-out → Sector slide-out
   (each of the 3) → Name slide-out (each of the 3) → Tape.

**Tickers / sectors outside the build set are *intentionally* empty**: their
slide-outs surface clean 404 messages from the agent endpoints. That's the
expected state until a follow-up fan-out MS.

**Done when**: 3 tickers + 3 sectors + macro fully populated. No
`[object Object]`, no `—` where data should be, no console errors. Empty
slide-outs for the other 21 tickers / 5 sectors show their 404 message.

→ **`/clear` after MS-4b** — dashboard is LIVE for the build set.
Validation + cleanup follows.

---

## PHASE 5 · Validation + cleanup (~5h · 4 micro-sprints)

### MS-5a · Validation walk

Three user-journey walkthroughs (per [SPRINT_validation_cleanup §2](SPRINT_validation_cleanup.md)). For each, screenshot the journey + log feels-wrong moments. Schema reconciliation pass on tables that changed in this chain. Logs to `BUGS_FOUND.md`.

**Done when**: BUGS_FOUND.md exists (can be empty); 3 walkthrough screenshots committed.

### MS-5b · Cleanup orphan workers

For each worker, check: fired by cron in last 14d? read by dashboard? If neither → soft-delete (header DEPRECATED, cron commented). Likely candidates: `narrator`, `*-summarizer` superseded by new agents.

**Done when**: list of soft-deleted workers in commit message. Worker count reduced from 45 to ≤30.

### MS-5c · Column / doc audit

1. Run a "list every column not written by any worker AND not read by any /api/ endpoint" query — log results to BUGS_FOUND.md (do NOT drop autonomously).
2. Move shipped sprint files to `docs/archive/sprints/`. Update INDEX.
3. Promote stable design docs (DASHBOARD_AI_INTEGRATION, MAP_PIPELINE, TICKER_PIPELINE) to `docs/reference/`.

**Done when**: `docs/active/` only contains in-flight work; reference docs are in `docs/reference/`.

### MS-5d · Tag release + final regression

1. Open dashboard, take fresh screenshot, diff against `lights-on-MS-3i.png` from the rollout. Any visual regression → log + fix.
2. `git tag v1.0-live-2026-MM-DD && git push origin v1.0-live-2026-MM-DD`.
3. Verify hedge-server cron is firing (`tail ~/pipeline.log` on hedge-server).

**Done when**: tag exists, no visual regressions, cron fired at least once successfully.

→ **`/clear` after MS-5d** — done. App is live, self-running, lightweight.

---

## Summary table

| Phase | Micro-sprints | Effort | Output |
|---|---|---|---|
| 0 — Hedge-server deploy | 1 | 45 min | Dashboard reachable from laptop browser via Tailscale |
| 1 — Data layer prep | 6 | 2.5h | TOPIC_FEED + estimates + peer config + Z-scores + shared llm.js |
| 2 — Agent foundation | 4 (3 real + 1 placeholder) | 2h | Macro Thesis live end-to-end, orchestrator pattern proven |
| 3 — Agent rollout | 9 | 5h | All 25 agents shipped, dashboard fully wired |
| 4 — Initialization | 2 | 4.5h | All entities populated, dashboard live |
| 5 — Validation + cleanup | 4 | 5h | Cleaned up, tagged, regression-tested |
| **Total** | **26** | **~20h** | **Live self-running dashboard at http://hedge-server:4200/** |

`/clear` checkpoints: **6** (after MS-0a, MS-1f, MS-2d, MS-3d, MS-3i, MS-4b).

If a micro-sprint stalls, the runner reports the blocker, commits whatever's safe, and waits for user direction. Do not invent fallbacks past what's spec'd here — defer to user.

---

> [INDEX](../INDEX.md) · [Audit](PRE_SPRINT_AUDIT_2026-05-04.md)
