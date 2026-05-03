> [INDEX](../INDEX.md) · [Audit sprint](SPRINT_2026-05-04_dashboard_balance.md) · [Pipeline impl sprint](SPRINT_pipeline_implementation.md) · [Ticker pipeline](TICKER_PIPELINE.md) · [Map pipeline](MAP_PIPELINE.md)

# SPRINT · AI agent worker wiring

**Status**: Planned. Runs **sequentially after** [SPRINT_pipeline_implementation](SPRINT_pipeline_implementation.md) — every parameter the agents need must already be landing in the DB.
**Owner**: TBD
**Estimated effort**: 10–12h, splittable across two days.

---

## Objective

Stand up the 25 AI agents defined in [TICKER_PIPELINE](TICKER_PIPELINE.md) and [MAP_PIPELINE](MAP_PIPELINE.md), wire them into the existing worker + cron infrastructure, persist their text + structured outputs to the DB, and have the dashboard fields read from those rows.

The user has emphasized this every prior sprint and the emphasis is strongest here: **the heavy work — workers, deploy, cron, DB, parsers — is already in place and working**. This sprint is **not a rebuild**. It's: pick the existing worker pattern, add 25 thin agent workers that follow it, wire them through the orchestrator, validate the outputs are analyst-grade.

---

## Hard constraints (read before starting)

| # | Constraint |
|---|---|
| 1 | **Inputs are locked**: this sprint runs only after the prior pipeline-implementation sprint has shipped and its `VALIDATION_REPORT.md` is green. Every numerical / textual field referenced in TICKER_PIPELINE.md and MAP_PIPELINE.md as an "input" must be present in the DB before any agent starts. |
| 2 | **Reuse existing worker infra.** Discover it in §H.1. Do not invent a new worker framework, a new deploy script, a new secret store, or a new orchestrator pattern. |
| 3 | **Model assignment is deterministic per agent** (table in §I.1). GPT-5 for important (Thesis, Read, Recommendation, Notes, Positioning, Implementation, Hedge ideas, Earnings summary, FOMC summary, all the per-domain readings). GPT-4.1-mini for repetitive simple tasks (per-topic driver classifier, per-item tagging, Tape annotation). Gemini-with-search for the structural-narrative search step. **No price ceiling**, but choose the right tier per agent. |
| 4 | **Triggers are orchestrator-managed (option a from planning).** A single orchestrator decides who runs based on the per-agent trigger contract from TICKER_PIPELINE / MAP_PIPELINE. Agents do not self-poll. Smart triggering is critical — Thesis must not recompute daily just because price changed; it recomputes only when its input verdicts flip or a tripwire fires. |
| 5 | **Output storage shape**: one **JSON column per agent per entity** (e.g., `name_thesis_json` on the ticker row, `macro_thesis_json` on the macro state row). Holds prose + structured fields together. Reasoning: schema-light, easy to evolve prompt outputs without DB migrations. Normalize later only if a query path needs it. |
| 6 | **Soft delete only** during cleanup. Same protocol as the prior sprint: `DEPRECATED YYYY-MM-DD` headers, commented entries, schema notes. Never delete agent code that something else may reference. |
| 7 | **Critical-judgment review is part of this sprint, not optional.** §K runs an evaluator agent against samples, iterates prompts until pass rate clears the bar. The user reviews manually later — but this sprint must leave outputs at analyst-grade *before* shipping. |
| 8 | **No UI changes beyond wiring.** The dashboard layout was locked by the prior audit sprint. This sprint replaces hardcoded mock values with DB reads — that's it. No layout shifts, no new components. |

---

## Sub-sprint H · Worker infra audit (≈1.5h)

The runner orients before changing anything. **The user's #1 emphasis: understand what's in place because everything is already done.**

### H.1 Discover the worker infrastructure
Locate where workers live and how they deploy. Likely candidates:
- `wrangler.toml` (Cloudflare Workers — most likely if the cron is also CF Workers)
- `workers/` directory (the repo lists `workers/` at root)
- Existing deploy scripts, env-var management, secret handling

Capture: which worker framework, deploy command, env structure, secret store (where do API keys live for current parsers?).

### H.2 Walk every existing worker
For each worker file:
- Entry point and signature
- What triggers it (cron entry, HTTP route, queue message)
- What it reads / writes
- Logging convention
- Failure handling

### H.3 Walk the dashboard data path
How does the current mockup field get its value today? Three possibilities:
- (a) Hardcoded in HTML/JS — most likely for the v2 mockup we built.
- (b) Reads from the live DB via an API.
- (c) Some other intermediate.

Capture how the **balanced mockup** from the audit sprint is meant to bind to data — the runner needs that path to wire the agent outputs through.

### H.4 Reconcile against pipeline contracts
Take every agent from TICKER_PIPELINE.md + MAP_PIPELINE.md (25 in total) and tag:
- **EXISTS** — there's already a worker doing roughly this; extend or rewrite.
- **NEW** — needs a fresh worker file following the existing pattern.
- **NO-OP** — covered by something else, no agent needed.

**Deliverable**: `docs/active/sprint-output/WORKER_AUDIT.md`. Sections: worker framework summary · worker inventory · dashboard data-path summary · per-agent tagging.

---

## Sub-sprint I · Agent worker implementation (≈4–5h)

One sub-task per agent. Each is a self-contained micro-cycle: pick pattern → write worker → write prompt → run-once → verify output shape → commit.

### I.1 Model assignment per agent
| Agent (where) | Model | Notes |
|---|---|---|
| Ticker · Valuation reading | GPT-5 | Per-domain reading, lands on verdict |
| Ticker · Fundamentals reading | GPT-5 | |
| Ticker · Estimates reading | GPT-5 | |
| Ticker · Peer comps reading | GPT-5 | |
| Ticker · Context reading | GPT-5 | |
| Ticker · News drift reading | GPT-5 | Synthesis paragraph |
| Ticker · News drift · per-topic classifier | GPT-4.1-mini | Repetitive structured tagging |
| Ticker · Thesis | GPT-5 + Gemini-search | Keystone; structural narrative cached |
| Ticker · Notes | GPT-5 | Claim extraction with cross-refs |
| Ticker · Recommendation | GPT-5 | Critical action call |
| Ticker · Read (lede) | GPT-5 | Synthesis |
| Ticker · Earnings summary | GPT-5 | Cached per quarter |
| Tape annotation | GPT-4.1-mini | One sentence, repetitive |
| Macro · News drift reading | GPT-5 | |
| Macro · News drift · per-topic classifier | GPT-4.1-mini | |
| Macro · Thesis | GPT-5 + Gemini-search | |
| Macro · Notes | GPT-5 | |
| Macro · Positioning | GPT-5 | |
| Macro · Signposts | GPT-5 | |
| Macro · Read (lede) | GPT-5 | |
| Macro · FOMC summary | GPT-5 | Cached per meeting |
| Sector · News drift reading | GPT-5 | |
| Sector · News drift · per-topic classifier | GPT-4.1-mini | |
| Sector · Thesis | GPT-5 + Gemini-search | |
| Sector · Notes | GPT-5 | |
| Sector · Implementation | GPT-5 | Critical bridge to Book |
| Sector · Hedge ideas | GPT-5 | |
| Sector · Read (lede) | GPT-5 | |

### I.2 Per-agent micro-cycle
For each agent in the table above:

1. **Find the closest existing worker pattern** (from §H.2). Reuse imports, env handling, retry logic, logging.
2. **Write the worker file**. One file per agent. Filename follows existing convention.
3. **Write the prompt template**. Pull the contract from the corresponding pipeline doc — every input listed there goes into the prompt; nothing else. The "what it does NOT consume" lines are equally important.
4. **Define the output schema** — JSON shape that combines the prose + structured fields. Validate the model output against it; reject + retry on parse failure.
5. **Run once** with real DB inputs. Capture the output. Confirm the JSON parses and the structured fields are populated.
6. **Commit per agent**: `add {agent name} worker · {model}`.

### I.3 Output storage
Write the agent's full JSON output to its dedicated column on the entity row:
- Ticker outputs → `tickers.{agent}_json` (e.g., `tickers.thesis_json`, `tickers.recommendation_json`).
- Macro outputs → `macro_state.{agent}_json`.
- Sector outputs → `sectors.{agent}_json` (one row per sector).
- Tape annotations → `moves.annotation_json` (per qualifying move).

Each row also stamps `{agent}_updated_at` and `{agent}_model` for traceability.

If the column doesn't exist, add it via the project's existing migration mechanism (discover in §H, do not invent). Update `docs/reference/DATABASE_SCHEMA.md` accordingly.

### I.4 Caching
Earnings summary, FOMC summary, and structural-narrative search are explicitly cached in their pipeline contracts. Implementation:
- Earnings: keyed by `ticker + earnings_event_id`. Re-runs only when a new earnings event row appears.
- FOMC: keyed by `meeting_date`. Re-runs only when a new meeting row appears.
- Structural-narrative search: keyed by `entity + sha256(narrative_query)`, TTL = 14 days.

Use the project's existing cache mechanism if one is in place. If not, simplest: extra column `{agent}_cache_key` checked before the LLM call.

---

## Sub-sprint J · Orchestrator + wiring (≈1.5–2h)

### J.1 Build the orchestrator (option (a) from planning)
A single orchestrator script that, on each scheduled tick:
1. Reads the per-agent **trigger contract** (encoded as a small config — pulled from the per-agent docs):
   - `recommendation`: every refresh
   - `thesis`: only when (fundamentals verdict flipped) OR (news drift verdict flipped) OR (any tripwire fired)
   - `valuation reading`: when underlying numerical fields changed by > epsilon
   - `news drift`: when new topics appeared in the topic feed
   - `earnings summary`: when a new earnings event appeared
   - `fomc summary`: when a new FOMC meeting appeared
   - …etc per the per-agent docs
2. Computes "what changed" since each agent's last `_updated_at`.
3. Fires only the agents whose trigger condition is met.
4. Respects the DAG order from the pipeline docs (Layer 1 readings before Thesis; Thesis before Notes / Recommendation / Positioning; Read last).
5. Logs per-agent fire/skip decisions for debuggability.

### J.2 Smart triggering · explicit anti-patterns to avoid
The user called this out:
- **Thesis must not recompute daily** just because price changed. Trigger is verdict-flip, not raw-input-change.
- **Fundamentals reading must not recompute daily** if only one trivial metric moved. Trigger is "verdict-relevant change."
- **Drivers / tripwires** are sticky — only re-emitted when Thesis re-runs.

Encode an `epsilon` per agent input and only count a change as material if it crosses the epsilon. Document the epsilons in the worker config.

### J.3 Wire orchestrator into the existing cron
Add the orchestrator entry to the discovered cron file from §H.1. Cadence: **every 1h** during US market hours (most agents will skip-because-no-change), **every 4h** off-hours. Calibrate based on observed fire rates after the first day.

### J.4 Dashboard read paths
For each field on the balanced mockup that this sprint wires:
- Replace the hardcoded mock value with a read from the appropriate `{agent}_json` column.
- Handle the "agent never ran yet" case: show "—" or last-known stale value (whatever the existing dashboard pattern uses).
- Make sure the field shows `_updated_at` somewhere (existing mockup has these "refreshed Xm ago" subtitles — bind them).

---

## Sub-sprint K · Critical-judgment review + prompt iteration (≈2h)

The user explicitly called this out as its own sub-sprint. They will do a **manual review later**, but **this sprint must leave outputs at analyst-grade** before shipping.

### K.1 Build the evaluator agent
A single evaluator (GPT-5) that reads an agent's output + its inputs and scores it 0–5 per criterion:

| Criterion | Definition |
|---|---|
| Lands on verdict | Output ends with a clear conclusion, not a hedge soup |
| No value-listing | Doesn't repeat raw values in a comma-separated string when the chart already shows them |
| References by name | Cites indicators by name, not by raw value |
| Cross-refs | References adjacent readings / drivers / tripwires where applicable |
| Surprising/non-obvious | Says something a reader couldn't extract themselves from the inputs |
| No Wall-Street jargon | Plain language, not "fortress balance sheet earning 5x its cost of capital" |
| Acts on cited inputs only | Doesn't invent facts not in the inputs |

Output: per-criterion score + a 1-line "what to fix" if any score < 4.

### K.2 Sample-evaluate every agent
For each non-trivial agent (Thesis, Read, Recommendation, Positioning, Implementation, Notes, all readings, Earnings summary, FOMC summary, Hedge ideas):
- Sample 5 outputs (across different tickers / sectors / time points).
- Run the evaluator.
- Capture per-criterion pass rate.

### K.3 Iterate prompts until pass rate ≥ 80% per criterion per agent
Tight loop:
1. Run sample → score.
2. Read low-score "what to fix" notes.
3. Edit the prompt (clarify the contract, add a forbidden-behaviors line, sharpen the verdict instruction).
4. Re-run on same samples + 2 fresh ones.
5. Repeat until ≥ 80% pass on every criterion.

This is the part where prompts get tuned to actual data, not idealised inputs. Expect 2–3 iterations per agent. Time-box: 10 minutes per agent maximum, after which **flag for user manual review** and move on.

### K.4 Lock prompts at end of sprint
Once pass rates are good, save final prompts to `workers/prompts/{agent}.md` (or wherever the worker pattern stores them). Stamp them with version + date.

**Deliverable**: `docs/active/sprint-output/AGENT_QUALITY_REPORT.md` — per-agent pass rates pre-iteration vs post-iteration, plus any "flag for user manual review" notes.

---

## Sub-sprint L · Cleanup + deprecation (≈0.5h)

For any prior agent code or DB column the new wiring replaces:

### L.1 Soft-delete protocol (same as prior sprint)
- `DEPRECATED YYYY-MM-DD` header on the file.
- Commented-out cron entry with `# DEPRECATED YYYY-MM-DD`.
- DEPRECATED tag in `docs/reference/DATABASE_SCHEMA.md`.
- Grep-verify no live consumers; if any, stop and update.

### L.2 No file deletes, no `DROP COLUMN`.

### L.3 Run pipeline + dashboard end-to-end
Confirm:
- Every dashboard field that the new wiring covers reads a real value (not a stale mock).
- The orchestrator fires the right agents at the right cadence.
- Logs are clean.
- No dead writes to deprecated columns.

---

## Final deliverables checklist

- [ ] `docs/active/sprint-output/WORKER_AUDIT.md` (H)
- [ ] One worker file per agent, each in its own commit (I)
- [ ] Prompt templates per agent in `workers/prompts/` (I + K.4)
- [ ] Orchestrator script wired into existing cron (J)
- [ ] Dashboard fields binding to `{agent}_json` columns (J.4)
- [ ] `docs/reference/DATABASE_SCHEMA.md` updated with new JSON columns + DEPRECATED tags (I.3 + L)
- [ ] `docs/active/sprint-output/AGENT_QUALITY_REPORT.md` — evaluator scores pre/post iteration (K)
- [ ] DEPRECATED markers on any replaced agent code (L)
- [ ] INDEX.md updated; this sprint moves to `archive/sprints/` once shipped.

---

## Out of scope (do not touch)

- **DB schema redesign.** Add JSON columns only. Do not refactor existing tables.
- **`DROP COLUMN` or any destructive DB op.** Soft delete only.
- **UI layout changes.** Replace hardcoded mock values with DB reads — that's it.
- **New worker framework / new orchestrator pattern.** Reuse what's there.
- **Backfill of historical agent outputs.** New agents start from go-live; deferred.
- **User manual review.** That happens after this sprint, not during.

---

## Notes for tomorrow's runner

- **Read WORKER_AUDIT.md before touching code.** The single most important thing: understand the existing worker pattern. Every agent in this sprint follows it. Inventing a new pattern is the failure mode the user has called out twice in prior sprints.
- **One agent per commit.** Makes the quality-iteration loop and any rollback trivial.
- **Smart triggering is the orchestrator's whole job.** If you find yourself making Thesis run every refresh, stop and re-read the per-agent contract. Trigger logic prevents cost blow-up and noise in the outputs.
- **The evaluator agent is permanent.** It's not a one-shot for this sprint — it stays wired so future prompt edits get re-validated automatically.
- **When prompts hit a wall** (can't get pass rate above 80% even after 3 iterations), flag the agent in AGENT_QUALITY_REPORT for user manual review and move on. Don't burn the day on one prompt.
- **Failure mode**: the user said pick a sensible default. Default: stale-value-with-timestamp + `agent failed at HH:MM` sub-line on the failing field. Logs the error for inspection. Does not crash the orchestrator.

---

> [INDEX](../INDEX.md)
