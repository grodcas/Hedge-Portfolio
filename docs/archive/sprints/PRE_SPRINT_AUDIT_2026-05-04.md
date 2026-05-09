> [INDEX](../INDEX.md) · [Foundation](SPRINT_agent_foundation.md) · [Rollout](SPRINT_agent_rollout.md) · [Validation+cleanup](SPRINT_validation_cleanup.md) · [Map pipeline](MAP_PIPELINE.md) · [Ticker pipeline](TICKER_PIPELINE.md)

# PRE-SPRINT AUDIT · 2026-05-04

**Purpose**: catch problems tonight so tomorrow's autonomous sprint runs don't break or over-engineer the app. Read top-to-bottom.

---

## TL;DR — four risks, one decision each

| # | Risk | Cost if unmitigated | Decision |
|---|---|---|---|
| 1 | **TOPIC_FEED with `days_active` is in 5+ agent contracts but does not exist anywhere.** No worker, no migration, no table. | 8 of 25 agents block: every news-drift agent, all Notes agents, Tape annotation. Foundation pattern collapses. | **New SPRINT_data_layer_prep runs first.** Adds the table + a clustering writer. ~2h. |
| 2 | **Foundation sprint says "wire dashboard = one-line change" but the real path is 3 hops** (`portfolio-ingestor /query/*` → `dashboard/server.js /api/*` → `v2-balanced/index.html` fetch+render). Each agent ≈ 30 min of plumbing. | Rollout sprint underestimates by ~12 hours. Either runs over budget or skips wiring and ships agents with no UI. | **Rewrite the wiring step**: per-agent plumbing is explicit, batched per surface, ~30 min budgeted each. |
| 3 | **Existing 12 LLM workers are snowflakes** — different models (gpt-5, gpt-5-mini, gpt-4o-mini, gpt-5.2), two different OpenAI APIs, four different JSON-parse strategies, zero retries anywhere. | Foundation sprint picks "the closest analog" → propagates a snowflake's bugs to 24 copies. | **Pin `operations-agent` as the explicit canonical template.** lines 229–244 of `workers/operations-agent/src/worker.js` are the call site to copy verbatim. |
| 4 | **"Initialization" (run all agents on all tickers, populate dashboard end-to-end) is missing from the sprint chain entirely.** The user mentioned needing this. | After rollout, dashboard would render with mostly-empty agent JSON columns until cron eventually fires for each entity. | **Two new sprints**: `initialization_mockup` (1–3 tickers, dry-run UI) and `initialization_full` (all 24 + sectors + macro). |

If we apply all four, tomorrow's chain becomes reliable and finite. If we apply none, the rollout sprint has at least an even chance of stalling on agent #4 and producing a half-wired dashboard.

---

## §1 · What's already in place (don't re-build)

Verified via repo-wide audit:

**Pipeline (numerical) — substantially live**
- 45 workers exist, ~12 of them call LLMs
- D1 schema through migration 0041; 28 of 32 cross-asset / sentiment indicators populated remotely (verified by VALIDATION_REPORT auto-fill earlier today)
- 2 deprecated cleanly (NAAIM, ISM — no free numeric source)
- `portfolio-ingestor` worker proxies all D1 reads via `/query/*` routes
- `dashboard/server.js` (localhost Express, port 4200) re-proxies them as `/api/*` for the dashboard

**Existing AI workers (will be reused or superseded)**
- `macro-intelligence-builder` — already produces a regime + recommendation blob into `BETA_10_Daily_macro`. Closest in spirit to what M2 (Macro Thesis) wants but the output schema is monolithic, not the per-agent JSON the v2 dashboard expects.
- `operations-agent` — clean GPT-5 → JSON pattern. **Best template.**
- `news-funnel-filter` — best JSON-parse robustness (markdown-fence stripping). Worth lifting that helper into a shared module.
- `big-movers-why`, `narrator`, `*-summarizer` workers — narrative output but not in per-agent JSON shape. Will be **superseded** by the new agents (soft-delete protocol, not removal).

**Dashboard surfaces**
- Old live dashboard (`dashboard/index.html`, `app.js`) — 6.6k lines, fully wired to `/api/*`. The "what's live today."
- New mockup (`dashboard/mockup/v2-balanced/index.html`) — 3,163 lines of static HTML, **zero `fetch()` calls**, all narrative content hardcoded. The "where we want to be."

**Config that just needs to be loaded into D1**
- `config/peers-mapping.json` (5.5kb) — peer cohorts. Migration 0039 has the table; bootstrap script needed.

---

## §2 · What's missing or ambiguous (the load-bearing gaps)

### 2.1 · TOPIC_FEED clustering — **does not exist**

Five agent contracts in `MAP_PIPELINE.md` and `TICKER_PIPELINE.md` reference a `topic feed with days_active counter`. Nothing in the repo implements it:
- No migration creates a `TOPIC_FEED` table
- Zero workers grep for `days_active` or `date_first_seen`
- `BETA_12_News_digest` exists but is per-headline, not per-topic-cluster

**Agents that block on this**: M1 Macro News drift, M3 Macro Notes, S1 Sector News drift, S3 Sector Notes, Ticker #5 News drift, Ticker #8 Notes, Tape annotation. That's 7 of 25.

**Decision**: build it in the new pre-sprint. Schema:
```sql
CREATE TABLE TOPIC_FEED (
  id TEXT PRIMARY KEY,            -- hash(scope|topic_canonical|first_seen)
  scope TEXT,                     -- 'ticker:NVDA' | 'sector:Tech' | 'macro:rates' | 'macro:fed' | ...
  topic_canonical TEXT,           -- de-duped human-readable label
  summary TEXT,                   -- one-sentence current state
  date_first_seen TEXT,
  date_last_seen TEXT,
  days_active INTEGER,            -- date_last_seen - date_first_seen + 1
  mention_count INTEGER,
  source_count INTEGER,
  sources_json TEXT,              -- list of headline IDs
  score REAL,                     -- mention_count * source_diversity
  created_at TEXT
);
```
Writer: a single worker (`topic-feed-builder`) that runs over `BETA_12_News_digest` rows of the last 14 days, clusters by canonical topic (LLM-assisted, gpt-5-mini), and upserts. Cron daily at 02:00 UTC.

### 2.2 · Estimates / consensus table — **does not exist**

Ticker agent #3 (Estimates reading) needs FY/FY+1/FY+2 consensus EPS + revisions. `FUND_02_Earnings` only has historical surprise. **Fix in pre-sprint**: add `FUND_03_Estimates` table + a Finnhub fetcher worker. Or, if the user prefers to defer, drop agent #3 to the post-rollout backlog and have the Fundamentals reading agent surface "consensus data not wired yet" in its prose.

### 2.3 · Sector-specific raw releases — **partial**

S2 (Sector Thesis) wants EIA crude/rig, housing starts, freight, etc. Some are in `MACRO_STATE_indicators` after today's migration bundle (WTI is); most aren't (no rig count, no housing starts, no freight). **Fix**: add the missing FRED series to `macro-state-fetcher`. Each is one row in `FRED_SERIES`. ~30 min total, can fold into the pre-sprint.

### 2.4 · Macro indicator panel deltas / Z-scores — **not stored**

M2 trigger says "any panel indicator crossed its Z = ±1.5 band." Z-scores need rolling-window stats vs history. Nothing computes them today. **Fix**: extend `macro-state-fetcher` to also write a `delta_1m` and `z_vs_24m` column on each insert. ~1h.

### 2.5 · "Hedge portfolio server" hosting — **needs user clarification**

`dashboard/server.js` is localhost-only. No public deployment found. Two interpretations:
- **A**: User has a separate always-on box (Pi / VPS) that runs the local pipeline via cron and serves the dashboard publicly.
- **B**: User runs `npm run dev` on their work machine; the cron-driven Cloudflare workers update D1 in the background; the dashboard re-fetches on page load.

Initialization sprint scope depends on which.

---

## §3 · The dashboard-wire path is 3 hops, not 1 (foundation sprint must say so)

Sprint plan, step 6 today:
> Wire dashboard. Find the macro thesis field in `dashboard/mockup/v2-balanced/index.html`. Replace the hardcoded mock string with a read from `thesis_json`. **One-line change.**

Reality, per code:

| Hop | Where | Work | Lines |
|---|---|---|---|
| A | `workers/portfolio-ingestor/src/worker.js` | Add a `/query/macro-thesis` route that selects `thesis_json` from D1 | ~10 lines |
| B | `dashboard/server.js` | Add `app.get("/api/macro-thesis", …)` proxying through `fetchFromWorker` | ~8 lines |
| C | `dashboard/mockup/v2-balanced/index.html` | Add a `fetch('/api/macro-thesis').then(render)` block + replace the static prose at line 2211 | ~20 lines (including loading state) |

**~38 lines, ~30 minutes, per agent.** Times 25 = ~12.5 hours.

If the rollout sprint takes that hidden cost seriously, it must either (a) extend the time budget to ~10h splittable into 2 sittings, or (b) batch the wiring per surface (Macro = 7 agents in one wiring pass; Sector = 6; Ticker = 11; Tape = 1). Per-surface batching is dramatically faster — one fetch helper, one render module per surface — and is what we'll prescribe.

---

## §4 · Existing AI workers are not a single pattern — pin one explicitly

Surveyed 12 LLM-calling workers. Findings:

| Dimension | Variation | Cleanest |
|---|---|---|
| Model | `gpt-5`, `gpt-5-mini`, `gpt-4o-mini`, `gpt-5.2` | `gpt-5` for synthesis (operations-agent, macro-intelligence-builder); `gpt-5-mini` for tagging (news-funnel-filter) |
| API | `/v1/chat/completions` (most) vs `/v1/responses` (qk-summarizer family) | `/v1/chat/completions` with `response_format: { type: "json_object" }` |
| JSON parse | direct `JSON.parse` (crashes on bad output), markdown-fence strip (news-funnel-filter), no parse (`*-summarizer` write raw text) | news-funnel-filter's `parseJsonFromResponse` helper |
| Retry | none anywhere | none. Add a single retry on transient (timeout / 5xx) and stop. |
| D1 binding | always `DB` | (already consistent) |

**Foundation sprint amendment**: copy `workers/operations-agent/src/worker.js`, specifically the `callGPT5` function at lines 229–244, as the canonical LLM caller. Lift `news-funnel-filter`'s JSON-parse helper into a shared `lib/llm.js` module that all new agents import. Lock model to `gpt-5` for synthesis agents and `gpt-5-mini` for the topic classifier.

---

## §5 · Sprint chain — recommended new order

Today's chain in INDEX:
```
pipeline-leftovers (DONE today) → agent-foundation → agent-rollout → validation-cleanup
```

Recommended:
```
pipeline-leftovers (DONE) →
  data-layer-prep (NEW, ~2h) →
    agent-foundation (REVISED, ~3h) →
      agent-rollout (REVISED, batched, ~8h splittable) →
        initialization-mockup (NEW, ~1.5h, 3 tickers dry-run) →
          initialization-full (NEW, ~3h, all 24 + sectors + macro) →
            validation-cleanup (REVISED minor, ~2h) →
              lightweight-cleanup (NEW, ~2h, drop orphans, lock-down)
```

Total work tomorrow if you want full live: ~21.5h. **That doesn't fit in one work day.** It splits naturally into two days:

- **Day 1 (today + tomorrow ~10h)**: data-layer-prep, agent-foundation, agent-rollout-batch-A (Macro + Sector agents that don't need topic feed)
- **Day 2 (~11.5h)**: agent-rollout-batch-B (news-drift / Notes — needs topic feed live), agent-rollout-batch-C (Ticker agents), initialization-mockup, initialization-full, validation-cleanup, lightweight-cleanup

Suggest splitting the rollout sprint formally so day-1 has a clean stop point with the dashboard partially live (Macro + Sector slide-outs working).

---

## §6 · Per-sprint amendments

### 6.1 · NEW · `SPRINT_data_layer_prep.md` (runs first tomorrow)

**Effort**: ~2h · **Output**: TOPIC_FEED + estimates table populated, peer config bootstrapped, AI worker template scaffolded.

1. **Migration 0042** — `TOPIC_FEED` table (schema in §2.1).
2. **Migration 0043** — `FUND_03_Estimates` table (FY/FY+1/FY+2 EPS + rev + revisions).
3. **Migration 0044** — extend `MACRO_STATE_indicators` with `delta_1m REAL`, `z_vs_24m REAL` columns. Update `macro-state-fetcher` to compute on insert.
4. **Add 4 missing FRED series** to `macro-state-fetcher`: `WPU0911` (rig count proxy), `HOUST` (housing starts), `INDPRO`, `JTSJOL` (JOLTS). 30 min.
5. **Bootstrap PEER_SET_config** from `config/peers-mapping.json`. One-shot insert script.
6. **NEW worker `topic-feed-builder`** — clusters last 14d of `BETA_12_News_digest` rows by canonical topic via gpt-5-mini, upserts `TOPIC_FEED`. Cron daily 02:00 UTC.
7. **NEW worker `consensus-fetcher`** — Finnhub `/stock/recommendation` + `/stock/eps-estimate` + `/stock/revenue-estimate` per tracked ticker → `FUND_03_Estimates`. Cron daily 13:00 UTC.
8. **Lift `lib/llm.js` shared module** into `workers/_shared/` — the `callGPT5(apiKey, prompt)` function from operations-agent + the JSON-parse helper from news-funnel-filter. New agents import this; existing workers stay as-is.

**Done when**: All 4 migrations applied, both new workers deploy + populate at least one row, `lib/llm.js` exists and imports clean from a test worker.

---

### 6.2 · REVISED · `SPRINT_agent_foundation.md`

Two amendments to the existing file:

**A. Make Macro Thesis (M2) the canonical agent.** It needs M5 (Signposts) inputs that already exist in `MACRO_STATE_calendar` and indicator panel data that's fully populated post-data-layer-prep. M2 doesn't depend on TOPIC_FEED for its non-drift inputs (drift verdict can be hardcoded "regime intact" for the foundation sprint, then wired in batch B). Existing sprint already picks Macro Thesis — keep it.

**B. Replace step 6 ("Wire dashboard. One-line change.") with this:**

> 6. **Wire dashboard — explicit 3-hop path:**
>    - 6a. Add `/query/macro-thesis` route to `workers/portfolio-ingestor/src/worker.js`: `SELECT thesis_json FROM BETA_10_Daily_macro ORDER BY date DESC LIMIT 1`. Deploy.
>    - 6b. Add `/api/macro-thesis` to `dashboard/server.js`, proxying through `fetchFromWorker`.
>    - 6c. In `dashboard/mockup/v2-balanced/index.html` near line 2211, replace the static `<p class="thesis-prose">` content with a `fetch('/api/macro-thesis').then(r => r.json()).then(data => render(data.thesis_json))` block. Use the existing `app.js` fetch helper pattern.
>    - 6d. **Lights-on test**: serve v2-balanced locally, confirm thesis text renders from DB and is not the mock. Take a screenshot.

**C. Add explicit canonical-template directive in step 1**: "Copy `callGPT5` from `workers/operations-agent/src/worker.js` lines 229–244. Use `lib/llm.js` from data-layer-prep for JSON parse robustness. Do not invent a new pattern."

---

### 6.3 · REVISED · `SPRINT_agent_rollout.md`

**Three amendments:**

**A. Batch by dependency, not just by agent count:**

| Batch | Agents | Topic feed needed? | Effort |
|---|---|---|---|
| **A** (Macro non-drift) | M2 already done in foundation, M4 Positioning, M5 Signposts, M6 Read, M7 FOMC summary | No | ~1.5h |
| **B** (Sector non-drift) | S2 Sector Thesis, S4 Implementation, S5 Hedges, S6 Read | No | ~1.5h |
| **C** (drift + notes — needs TOPIC_FEED live) | M1 Macro News drift, M3 Macro Notes, S1 Sector News drift, S3 Sector Notes | Yes | ~1.5h |
| **D** (Ticker surface) | All 11 ticker agents | Some need topic feed | ~3.5h |
| **E** (Tape) | Tape annotation | Yes | ~30 min |

Total ~8.5h. Splittable: stop after Batch B for a "Macro/Sector slide-outs live" milestone. Resume next sitting for C/D/E.

**B. Wire-once-per-surface, not per-agent.**

After all agents in Batch A land their JSON columns, do ONE wiring pass on the Macro slide-out (~45 min): add 5 `/query/*` routes, 5 `/api/*` endpoints, 5 fetch+render blocks. That's ~9 min/agent, not 30. Same for Sector and Ticker.

**C. Add explicit "input contract verify" step before each agent.**

> For each agent: read its contract in TICKER_PIPELINE.md or MAP_PIPELINE.md, verify every input field has a SQL path. If any input is missing or ambiguous, **STOP** and log to NOTES.md. Do not invent fallbacks. The data-layer-prep sprint is supposed to have closed all gaps; if one slipped through, sprint-runner is out of scope to fix it.

---

### 6.4 · REVISED · `SPRINT_validation_cleanup.md` (minor)

Two amendments:

**A.** Step 1 ("Smoke test"): add explicit list of slide-outs to open and screenshots to take. Without screenshots there's no record of "the dashboard renders without errors" — only "agent didn't crash."

**B.** Step 6 ("Doc lifecycle"): add the new sprint files to the archive list (data-layer-prep, initialization-*, lightweight-cleanup).

---

### 6.5 · NEW · `SPRINT_initialization_mockup.md`

**Effort**: ~1.5h · **Output**: 3 tickers fully populated end-to-end + screenshot proof.

Pick 3 representative tickers spanning sectors (e.g., NVDA · UNH · XOM). For each:

1. Fire every ticker agent for that ticker once.
2. Verify every agent's JSON column populates without error.
3. Open the Name slide-out for that ticker in the dashboard.
4. Read the slide-out top to bottom — does the prose make sense, is anything blank, do numbers match reality?
5. Log "feels-wrong" moments to NOTES.md.

**Stop conditions**: any blank panel, any prose that hedges instead of landing on a verdict, any JSON parse failure. Fix-or-flag, then continue.

This is the user's explicit ask: validate UI on a small set before paying the full-fan-out cost.

---

### 6.6 · NEW · `SPRINT_initialization_full.md`

**Effort**: ~3h · **Output**: all 24 tickers + 11 sectors + macro fully populated, dashboard fully rendered.

Prereqs: mockup sprint shipped clean.

1. Fire orchestrator for all 24 tickers in batches of 6 (rate-limit OpenAI).
2. Fire all 6 sector agents.
3. Fire all 7 macro agents.
4. Spot-check 5 random ticker slide-outs for completeness.
5. Final dashboard walkthrough: Today → Map → Macro slide-out → Sector slide-out → Name slide-out → Tape.
6. Verify cron schedules so agents update on input drift without manual fires.

---

### 6.7 · NEW · `SPRINT_lightweight_cleanup.md` (runs last)

**Effort**: ~2h · **Output**: app is self-running, lightweight, no orphans.

1. **Worker audit**: cross-reference 45 workers against currently-fired cron + dashboard reads. Soft-delete any worker not fired in the last 14 days AND not read by the dashboard. Likely candidates: `narrator`, `*-summarizer` workers superseded by new agents. **No `git rm`** — DEPRECATED header + cron commented.
2. **Column audit**: list every column written by no worker / read by no dashboard endpoint. Log to `BUGS_FOUND.md` for the user to make the keep/drop call (don't drop columns autonomously).
3. **Doc audit**: archive shipped sprints, prune obsolete drafts in `docs/active/`. Move stable design docs to `docs/reference/`.
4. **Final regression**: serve the dashboard, take screenshots, diff against the screenshots from `validation-cleanup`. Any visual regression → log + fix.
5. **Tag a release**: `git tag v1.0-live-2026-MM-DD`. The "we're done with the foundation" gate.

---

## §7 · Decision matrix — what the user must answer before tomorrow

| Question | Default if no answer | Affects |
|---|---|---|
| Is the "hedge portfolio server" localhost (Express on your laptop) or a separate always-on box? | Assume localhost. Initialization sprint runs `npm run dev` and screenshots; cron-driven workers populate D1 in background. | Initialization scope |
| Should the Estimates table land in pre-sprint, or is it OK to ship Ticker agent #3 with "consensus not yet wired" prose? | Land it now (pre-sprint adds `FUND_03_Estimates`). | Pre-sprint scope |
| Z-score / delta computation: store on insert (in `macro-state-fetcher`) or compute on read (in agent prompt)? | Store on insert. Cleaner. | Pre-sprint scope |
| Day-1 stop point: after foundation, or after rollout batch B (Macro + Sector slide-outs live)? | After batch B — that's a satisfying visible milestone. | How tomorrow's autonomous runs are split |
| Cleanup aggressiveness: soft-delete only, or also drop unused D1 columns? | Soft-delete only. User reviews column drop manually. | Cleanup sprint scope |

---

## §8 · Tomorrow's run plan (if all decisions go to defaults)

```
08:00  data-layer-prep             (~2h)   ← me, autonomous
10:00  agent-foundation            (~3h)   ← me, autonomous  
13:00  agent-rollout batch A       (~1.5h) ← me, autonomous
14:30  agent-rollout batch B       (~1.5h) ← me, autonomous
16:00  STOP — Macro + Sector slide-outs live, you review
```

Day 2:
```
08:00  agent-rollout batch C        (~1.5h)
09:30  agent-rollout batch D + E    (~4h)
13:30  initialization-mockup        (~1.5h)
15:00  initialization-full          (~3h)
18:00  validation-cleanup           (~2h)
20:00  lightweight-cleanup          (~2h)
```

This assumes no sprint hits its stop condition. Real-world: budget +30% per sprint for unplanned issues — expect day 2 to push to a partial day 3.

---

## §9 · What I want to confirm before locking the chain

1. The hosting question (§2.5).
2. Whether to land the Estimates table now or defer (§7 row 2).
3. Whether the day-1 stop point is correct (§7 row 4).
4. Whether to additionally split rollout-D (Ticker agents — heaviest batch) into D1-D2 (5 agents each) for a cleaner cadence. **My default**: yes, split.

If you respond to the four with "defaults are fine, go" tonight, I lock the sprint files and INDEX, and tomorrow runs cleanly.

---

> [INDEX](../INDEX.md) · Updated chain in [INDEX](../INDEX.md) reflects the proposal once you sign off.
