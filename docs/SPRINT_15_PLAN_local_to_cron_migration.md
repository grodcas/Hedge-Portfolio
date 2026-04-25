# Sprint 15 — Local-to-cron migration feasibility

**Planned 2026-04-23 for execution on 2026-04-24.**

**Goal:** produce a definitive map of what's currently running locally in `src/pipeline.js`, what the *real* blockers are for each piece, and a ranked migration plan that moves as much as possible onto Cloudflare scheduled Workers. Outcome is either a shipped migration (if feasible in the time window) or a documented roadmap with concrete effort estimates per piece.

Why this matters: today, hitting the Run-pipeline button consumes ~5–8 minutes of your computer's time, and the database only advances on days you click. Each step we move to the cloud is a step toward "dashboard always fresh, no button required."

---

## 1. Scope

Audit **every step inside `src/pipeline.js`** (11 steps as of Sprint 14) and for each one answer 5 questions:

1. **What does it do** (the single responsibility)?
2. **External dependencies**: which APIs does it call, which scrapers does it run, what Node-only packages does it import?
3. **Rate limits**: what's the binding throughput constraint? (Alpha Vantage 5 req/min free, Finnhub 60/min, FRED/BLS/BEA varying, OpenAI per-key tier, etc.)
4. **Runtime**: average seconds per run today, based on either the pipeline logs in `logs/` or a fresh timing pass.
5. **Worker-runtime compatibility**: can this code run in a Cloudflare Worker *as-is*, or does it use things Workers don't support (puppeteer, fs.writeFile, native modules, `require()`, streams larger than 128 MB)?

Then **rank each step** across three buckets:
- **Easy**: pure API caller, no Node-only deps → port in <1 hour
- **Medium**: scraper using cheerio/fetch, may need small adaptations → 1–2 hours
- **Hard or keep-local**: puppeteer, heavy file I/O, or genuinely unfit for Worker runtime

The end state: a **per-step migration card** I can hand you in ~2 hours of work.

---

## 2. Per-step audit template

Use this for every one of the 11 steps in `src/pipeline.js`:

```
Step: <name>
File: src/steps/<name>.js
Single responsibility: <one sentence>

Externals:
  - APIs: <list with endpoints + auth method>
  - Scrapers: <sites hit + selectors used>
  - Libraries: <full list of imports, flagging any Node-only>

Rate limits:
  - <source>: <limit/period>
  - Binding constraint: <slowest bottleneck>

Timing (from logs/ or fresh run):
  - Typical: <seconds>
  - P95: <seconds>
  - Bottleneck: <e.g. "Alpha Vantage sleep() between calls">

Worker compatibility:
  - Blockers: <list explicit ones, e.g. "uses puppeteer">
  - Workarounds: <what we'd need to change>

Migration bucket: Easy | Medium | Hard | Keep-local
Estimated port effort: <hours>
```

Fill in 11 cards → ranked, actionable.

---

## 3. Hypotheses going in (to confirm or reject)

Based on what I already know from the session, here's the **expected** ranking. The sprint's first job is to validate or overturn these.

### Easy (migrate first, highest leverage)
- **`fetchFundamentals`** — 100 Alpha Vantage calls for 25 tickers × 4 endpoints (OVERVIEW + IS + BS + CF). This is the biggest single contributor to pipeline latency (~3–4 min today). Pure API calls, no scraping. Perfectly fits a Worker with a daily cron. **If nothing else moves, moving this one alone cuts the button wait in half.**
- **`ingestMacro`** — FRED + BLS + BEA API calls (CPI, NFP, yields, unemployment, etc.). ~15 HTTPS requests, all rate-limit-friendly. Identical to `fomc-statement-fetcher` in structure. Port = near-copy.
- **`summarize`** — OpenAI/Gemini summarize pass over ingested news/filings. Workers already make LLM calls in 15+ places.
- **`verifyFacts`** — same shape as summarize: LLM calls with structured outputs. Trivial to port.

### Medium
- **`ingestWhitehouse`** — scrapes `whitehouse.gov/news`, fetches per-article HTML, summarizes with GPT-4.1-mini. Uses `cheerio` + `node-fetch` + `openai`. All three are Worker-compatible. Sprint 10 proved this pattern works (the worker `fomc-statement-fetcher` scrapes federalreserve.gov with essentially the same toolkit).
- **`ingestEdgar`** — SEC RSS feed + filing metadata. RSS parsing was straightforward in the FOMC worker (regex, no xml2js). Likely medium-easy.
- **`ingestPress`** — depends on which sources it calls. If it's pulling from Finnhub press endpoint or similar: easy. If it's scraping corporate IR pages: medium.
- **`ingestSentiment`** and **`ingestNews`** — these need careful reading. The cloud side already has a `news-funnel-orchestrator` worker doing news ingestion. Possible that the local steps are **partial duplicates** or **vestigial** from a pre-Sprint-7 era. First audit finding: figure out which of these is still load-bearing.

### Hard or keep-local
- **`upload`** — this step specifically pushes local state to the cloud and triggers the Cloudflare workflow. If everything upstream is already cloud-native, **this step ceases to exist**. Otherwise it keeps a small residual role for whatever remains local.
- **`syncDashboard`** — writes local artifacts (probably JSON snapshots for the dashboard's mock-data fallback path). If we're fully cloud, this is redundant. If we keep a local fallback, it stays.

### Unknown until inspected
- Anything using `puppeteer` or `playwright` (need headless Chrome) — **can't run in a Worker**. The audit needs to grep for these.
- Anything with large file I/O or cumulative state across steps (a cache that carries across runs) — needs re-architecture, not port.

---

## 4. Investigation tasks (first 90 min of the sprint)

1. **Inventory imports** — grep `import` across `src/` and `validation/` to surface every dependency. Flag puppeteer / playwright / native-module / fs-heavy imports immediately.
2. **Time each step** — run the local pipeline once with verbose timing (`console.time` per step) and capture a fresh profile. Store in `logs/timing-2026-04-24.md`.
3. **Cross-reference with Worker duplicates** — for each local step, check if a Cloudflare Worker already does something similar (e.g., `news-funnel-orchestrator` may already cover `ingestNews`). Mark duplicates as candidates for deletion, not migration.
4. **Check rate-limit budgets** — for Alpha Vantage / Finnhub / FRED / BLS / BEA, confirm which tier's keys we have and what the per-minute / per-day ceilings are. A Worker can hit those same limits; we just shift who holds the burden.

---

## 5. Migration design decisions (next 60 min)

Once the audit is done, decide these explicitly before coding:

### D1 — Many workers or one?
- **Option A** — one worker per step (`fundamentals-fetcher`, `macro-fetcher`, `edgar-fetcher`, etc.). Clean separation, individual crons, easy to debug.
- **Option B** — single `daily-pipeline-runner` worker that sequences all migrated steps internally. Mirrors today's `src/pipeline.js`. Simpler orchestration, one cron, but violates the "one Worker one concern" pattern we've been using.

**Recommended default: Option A.** Every other piece of the cloud side is one-worker-per-concern. Stay consistent.

### D2 — Cron times
- Each Worker's ideal fire time depends on its data source's update cadence:
  - `fundamentals-fetcher`: after US market close (~22:00 UTC) so fundamentals are stable for the day
  - `macro-fetcher`: hourly during US business hours (13:00–21:00 UTC) because FRED/BLS release at irregular times
  - `edgar-fetcher`: hourly during US business hours (filings arrive continuously)
  - `whitehouse-fetcher`: every ~6h (low-volume source)
  - `press-fetcher`: hourly
- Stagger minute-offsets so they don't all hammer D1 at `:00`.

### D3 — Event orchestration
- Today's `job-engine-workflow` is triggered by `src/steps/upload.js`. After migration, the trigger would come from the last-running cron worker OR become event-driven (once a fundamentals-fetcher finishes, it invokes `job-engine-workflow` via service binding).
- Alternative: `job-engine-workflow` gets its own cron that fires after all ingestion crons complete.

**Recommended: event-driven via service binding** (consistent with the dispatcher pattern narrator already uses).

### D4 — Secrets
- Each new Worker needs the relevant API keys as Cloudflare secrets.
- Local `.env` keeps getting sourced by whatever still runs locally (including the dashboard).
- Never check secrets into wrangler.jsonc.

### D5 — Keep-local fallback?
- Should `src/pipeline.js` still be runnable after migration, as a "force catch-up" tool?
- **Recommended: yes, keep it.** Zero marginal cost (the scripts already exist), useful for debugging or cold-start after an outage.

---

## 6. Execution plan

Once the audit + design decisions are locked, port steps in this order:

1. **`fetchFundamentals`** — biggest latency win. Expected: new worker `fundamentals-fetcher`, cron `0 22 * * *` (after US close), 25 × 4 API calls with rate-limit-aware pacing.
2. **`ingestMacro`** — second-biggest. Worker `macro-fetcher`, cron hourly during US business hours.
3. **`summarize` + `verifyFacts`** — LLM passes. May consolidate into existing `qk-summarizer` family if patterns match.
4. **`ingestWhitehouse`** — port the scraper. Mirrors `fomc-statement-fetcher` almost exactly.
5. **`ingestEdgar`** — port the RSS + filing ingestion.
6. **`ingestPress`** — port (depends on source audit).
7. **`ingestNews` / `ingestSentiment`** — decide if they're migrated or retired (if `news-funnel-orchestrator` already covers).
8. **Retire `upload` + `syncDashboard`** once everything upstream is cloud-native.

After each port, **keep the local step running in parallel** for ~3 days as a comparison safety net. When Worker + local produce identical D1 state, remove the local step.

---

## 7. Deliverables

1. **Audit findings document** — `docs/LOCAL_PIPELINE_AUDIT_2026-04-24.md` with 11 per-step cards
2. **Migration cards ranked** Easy / Medium / Hard / Keep-local with effort estimates
3. **Quick wins done same-day** — if the `fundamentals-fetcher` port comes out trivially, ship it inside the sprint
4. **Full migration roadmap** — if trivial ports don't finish, produce a dated backlog (one worker per week?) with dependencies

---

## 8. Quality gates

If any migration actually ships in the sprint:
- [ ] New Worker deployed with cron
- [ ] First cron run produces D1 row counts matching (or exceeding) what the local step produced
- [ ] Local step runs in parallel, outputs match for 3 consecutive days before retirement
- [ ] Rate limits respected — no 429s in worker logs
- [ ] Button click with the migrated step disabled still produces a complete dashboard

If no migrations ship (audit-only sprint):
- [ ] Every local step has a per-step audit card
- [ ] Top-3 migration candidates have a one-page implementation spec each
- [ ] A single summary table of "local bottleneck → cloud feasibility → effort estimate"

---

## 9. Risks & gotchas

- **Alpha Vantage rate limits**: moving `fetchFundamentals` to the cloud doesn't change the 5-req-per-minute ceiling on the free tier. If the Worker tries to hammer it in a tight loop, we get 429s. Needs built-in throttling (e.g. 12s between calls → 5/min).
- **Puppeteer/Playwright blocker**: if any step uses headless Chrome for scraping, it can't move to a Worker. Alternative: port the specific scraping logic to `fetch` + cheerio (we've done this pattern twice now: Sprint 10 FOMC scraper and Sprint 11 Finnhub calendar). If the site absolutely requires JS rendering, we keep it local (or use Cloudflare Browser Rendering, which is a newer paid feature).
- **Sequencing**: some local steps depend on earlier steps' output (e.g. `summarize` consumes output from `ingestNews`). If moved to the cloud, this has to become an explicit wave in `job-engine-workflow` or a service-binding chain.
- **Idempotence regressions**: porting a step that's been local-only for a while may expose subtle "write then read back" assumptions that worked in a single Node process but break across two independent Worker invocations. Audit this explicitly.
- **Button semantics change**: if the pipeline becomes fully cloud-native, the "Run pipeline" button becomes "force-run all cloud crons now." Feature still useful, but the meaning shifts.

---

## 10. Estimated time

- Audit: **2 hours**
- Design decisions: **1 hour**
- Ship `fundamentals-fetcher` (the highest-leverage port): **1–2 hours**
- Total first-day scope: **4–5 hours**, of which 2 are investigation and the rest execution on the quick win.

Stretch goal if time permits: also port `macro-fetcher` (should be under 1 hour given FRED/BLS are simple API calls and we have the pattern from other fetchers).

---

## 11. Definition of done

This sprint is complete when:
- [ ] Every local step has a migration card
- [ ] At least `fetchFundamentals` has shipped as a Worker OR has a one-page port spec ready for the next sprint
- [ ] The Run-pipeline button's typical latency is measurable both before and after
- [ ] A short update to `SPRINT_14_DETAILING_REPORT.md` conceptual-issue #5.6 (daily sanity check) notes whether we're still recommending it or whether cron migration made it moot
