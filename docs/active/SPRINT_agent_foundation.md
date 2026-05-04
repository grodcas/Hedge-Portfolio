> [INDEX](../INDEX.md) · [Ticker pipeline](TICKER_PIPELINE.md) · [Map pipeline](MAP_PIPELINE.md)

# SPRINT · Agent foundation (orchestrator + 1 canonical agent)

**Model**: Sonnet 4.6 · **Effort**: ~3h · **Output**: working Macro Thesis end-to-end + a reusable worker template for the rollout sprint.

## Goal

Prove the agent pattern works once, end-to-end. Build the orchestrator. Build **Macro Thesis** as the canonical agent. Wire it to the dashboard. Every later agent will be a copy of this one.

## Why one agent first

The rollout sprint copies this pattern 24 times. If the pattern is wrong, finding out on agent 1 costs ~3h; finding out on agent 25 costs ~25h. Spend the upfront time once, here.

## Steps

1. **Pick the worker template.** Read one existing worker that calls an LLM (e.g., `workers/macro-intelligence-builder/src/worker.js` if it exists, or the closest analog). Confirm the pattern: env vars for API keys, retry logic, JSON output validation. **Do not invent a new pattern.**

2. **Migration**: add `thesis_json TEXT`, `thesis_updated_at TEXT`, `thesis_model TEXT` columns to whatever table holds macro state (likely `BETA_10_Daily_macro` or a new `macro_state` table — check first). One migration file: `0042_add_macro_thesis_json.sql`.

3. **Build the agent worker** at `workers/macro-thesis-agent/`:
   - Reads inputs per the contract in `MAP_PIPELINE.md` Thesis section.
   - Calls GPT-5 with the prompt from the contract.
   - Validates JSON output against the schema.
   - Upserts to `thesis_json`.

4. **Build the orchestrator** at `workers/agent-orchestrator/`:
   - Reads each agent's last `_updated_at`.
   - Diff-checks: if any input field crossed its epsilon since then, fire the agent.
   - For Thesis specifically: trigger only on (fundamentals verdict flipped) OR (news drift verdict flipped) OR (tripwire fired).
   - Cron: every 1h during US market hours.
   - Logs per-agent fire/skip decisions.

5. **Deploy + smoke-test.** Hit `/build` on the orchestrator. Confirm Macro Thesis fires once, JSON lands in DB. Hit `/build` again immediately — confirm it skips (no inputs changed). This is the proof.

6. **Wire dashboard.** Find the macro thesis field in `dashboard/mockup/v2-balanced/index.html`. Replace the hardcoded mock string with a read from `thesis_json`. One-line change.

7. **Sample-read the output.** Open the rendered dashboard. Read the thesis. Is it analyst-grade or does it hedge / repeat raw values? If clearly bad: edit the prompt **once**, redeploy, re-read. If still bad: write 3 lines in NOTES.md describing the failure and move on. The rollout sprint can iterate further.

## Rules

- One worker pattern. Copy-paste from the existing one.
- One commit per step (migration, agent worker, orchestrator, dashboard wire).
- GPT-5 in the runtime (per the model assignment). Sonnet for the sprint runner.
- No new abstractions. If you find yourself writing a `BaseAgent` class, stop.

## Stop and ask

- If no existing worker calls an LLM: stop, the template needs design.
- If the orchestrator turns out to need queue infrastructure: stop, that's a separate sprint.
- Token budget: **~50 tool calls**. If you hit 60, stop and report.

## Done when

- Macro Thesis JSON in DB, populated, readable.
- Dashboard renders the thesis text from DB (not the mock).
- Orchestrator skips re-firing when inputs haven't changed (verified by hitting /build twice).
- Per-step commits in git history.
- A reusable template exists at `workers/macro-thesis-agent/` for the rollout sprint to copy.

## Out of scope

- The other 24 agents (rollout sprint).
- Critical-judgment evaluator (rollout sprint, single iteration only).
- New worker framework, queue system, or any non-existing infra.

---

> [INDEX](../INDEX.md) · [Rollout sprint](SPRINT_agent_rollout.md)
