> [INDEX](../INDEX.md) · [Foundation sprint](SPRINT_agent_foundation.md) · [Ticker pipeline](TICKER_PIPELINE.md) · [Map pipeline](MAP_PIPELINE.md)

# SPRINT · Agent rollout (24 remaining agents)

**Model**: Sonnet 4.6 · **Effort**: ~5h, splittable into two sittings · **Output**: 24 agents wired, dashboard reading from DB, optional `NOTES.md` for any agent flagged for later review.

## Prerequisite

Foundation sprint shipped. `workers/macro-thesis-agent/` and `workers/agent-orchestrator/` exist and work.

## Goal

Apply the foundation pattern to the 24 remaining agents from `TICKER_PIPELINE.md` and `MAP_PIPELINE.md`.

## Model assignment per agent

| Group | Agents | Runtime model |
|---|---|---|
| Per-domain readings (ticker, sector, macro) | Valuation, Fundamentals, Estimates, Peer comps, Context, News drift readings | GPT-5 |
| Synthesis (ticker, sector, macro) | Thesis, Read, Recommendation, Notes, Positioning, Implementation, Hedge ideas | GPT-5 |
| Cached per-event | Earnings summary (per quarter), FOMC summary (per meeting) | GPT-5 |
| Repetitive tagging | Per-topic news classifier, Tape annotation | GPT-4.1-mini |
| Structural-narrative search step | Embedded in Thesis | Gemini-with-search |

Sprint runner is Sonnet regardless of runtime model.

## Per-agent micro-cycle (≤10 tool calls each)

1. Copy `workers/macro-thesis-agent/` → `workers/{agent-name}/`. Edit name + prompt.
2. Pull the prompt contract from the relevant pipeline doc — every input listed there goes in, nothing else.
3. Add JSON column migration (`{agent}_json` on the entity table). Bundle migrations: one combined migration for all 24 columns is fine — don't ship 24 migration files.
4. Add the agent to the orchestrator's trigger config (one row per agent: trigger condition + cadence).
5. Deploy. Hit `/build`. Verify a JSON row lands.
6. Wire the dashboard field that consumes this agent (replace mock with `{agent}_json` read).
7. Commit.

## Quality pass (after all 24 deployed)

For each non-trivial agent (Thesis, Read, Recommendation, Notes, Positioning, Implementation, all readings, Earnings summary, FOMC summary, Hedge ideas — about 11 agents):

- Pull **one** sample output. Read it.
- Bad means: hedges instead of landing on a verdict, repeats raw values from the inputs, invents facts, uses Wall-Street jargon.
- If bad: **one** prompt edit, redeploy, re-read.
- If still bad: write the agent name + 1-line failure mode in `NOTES.md`. Move on.

**MAX 1 iteration per agent. No evaluator agent. No automated loop.** User does deeper review later.

## Cost discipline

- If 3+ agents fail the quality pass on iteration 1, **stop** the sprint — the foundation pattern has a bug. Fix the foundation, then resume.
- The orchestrator should fire **far less often** than every refresh. If you see Thesis firing daily on unchanged inputs, the trigger logic is wrong — fix before continuing.
- Token budget: ~10 tool calls per agent × 24 = ~240. Hard ceiling **300**. If you hit it, commit what you have and stop.

## Rules

- One commit per agent.
- One JSON column per agent on the entity row. No normalization yet.
- Soft-delete any older agent code the new wiring replaces.
- If you find yourself writing infra (cache layer, base class, retry framework), stop — the foundation has it or you don't need it.

## Stop and ask

- If an agent's pipeline contract conflicts with what's actually in the DB: stop, the input doesn't exist yet.
- If the orchestrator needs queueing or fan-out to handle the load: stop, that's a different sprint.

## Done when

- 24 agents deployed.
- Each has a populated JSON row in DB (verify with one SELECT per entity).
- Dashboard reads from JSON columns, not mocks.
- Orchestrator config covers all 24 trigger conditions.
- `NOTES.md` (if any) lists agents flagged for later review.

## Out of scope

- Backfill of historical agent outputs.
- DB normalization of JSON columns.
- Multi-iteration prompt tuning beyond the single-pass quality check.
- New cache infra (use what foundation set up, or what exists).
- UI layout changes.

---

> [INDEX](../INDEX.md) · [Foundation sprint](SPRINT_agent_foundation.md)
