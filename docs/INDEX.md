# Documentation Index · what's where

**Last updated**: 2026-05-04

This is the worktree. It tells you what is being worked on right now, what the canonical reference is, and what is archived for history.

If a doc is not listed here, it does not exist (or it should be added here).

---

## Canonical reference (kept consistent)

These two are the project's "readme" pair. Update them when system architecture changes.

| Doc | Purpose |
|---|---|
| [STRUCTURE.md](STRUCTURE.md) | Single-page system map: data sources, pipeline, workers, surfaces. The entry point. |
| [SYSTEM_REFERENCE.md](SYSTEM_REFERENCE.md) | Long-form reference for every cluster (12 clusters, full schemas, full data flow). |

PDFs of SYSTEM_REFERENCE: [color](SYSTEM_REFERENCE.pdf) · [b&w print](SYSTEM_REFERENCE-bw.pdf).

---

## Active work · `active/`

In-flight brainstorming and feature drafts. Each new feature gets a doc here. When the feature ships and the design is folded into the canonical reference, the doc moves to `archive/`.

| Doc | What it captures | Status |
|---|---|---|
| [active/TICKER_PIPELINE.md](active/TICKER_PIPELINE.md) | Per-agent pipeline for three surfaces: Name slide-out (10 agents), Today (composition only, 0 agents), Tape (1 annotation agent). Includes the upstream topic-feed contract with persistence counter. | Active · 2026-05-03 |
| [active/MAP_PIPELINE.md](active/MAP_PIPELINE.md) | Per-agent pipeline for the Macro slide-out (7 agents incl. FOMC summary) and Sector slide-out (6 agents). Map surface itself is fully numerical — no AI. Cross-pipeline lineage (Macro → Sector → Ticker) defined. | Active · 2026-05-03 |
| [active/SPRINT_2026-05-04_dashboard_balance.md](active/SPRINT_2026-05-04_dashboard_balance.md) | Sprint plan — audit mockup vs DB/pipeline, decide free-API or drop per gap, build a balanced new mockup. Audit + new mockup + rationale doc only — no DB / pipeline / current-mockup mods. | **Shipped 2026-05-04** |
| [active/sprint-output/AUDIT_INVENTORY.md](active/sprint-output/AUDIT_INVENTORY.md) | Sprint output A — three-way reconciliation (mockup × pipeline × DB). Tags every parameter AVAILABLE / GAP / UNUSED / PARSED-BUT-LOST. | Shipped 2026-05-04 |
| [active/sprint-output/PARAMETER_DECISIONS.md](active/sprint-output/PARAMETER_DECISIONS.md) | Sprint output B — KEEP / CALCULATE / DROP per gap row, with free-source method. **§0 (Feasibility-revised) is the live decision set.** | Shipped 2026-05-04 |
| [active/sprint-output/PIPELINE_AUDIT.md](active/sprint-output/PIPELINE_AUDIT.md) | Pipeline implementation sprint output D — three-way audit (cron × parsers × DB). Tags every PARAMETER_DECISIONS row as EXTEND / NEW / DEPRECATE / NO-OP. | Shipped 2026-05-04 |
| [active/sprint-output/VALIDATION_REPORT.md](active/sprint-output/VALIDATION_REPORT.md) | Pipeline implementation sprint output G — per-parser sample-check (45 entries). User fills in values column after live deploy + cron tick. Locks ship/no-ship per parser. | Scaffold shipped 2026-05-04 · pending live values |
| [active/v2_BALANCED_MOCKUP.md](active/v2_BALANCED_MOCKUP.md) | Sprint output C — rationale for the new balanced mockup: REMOVED / CHANGED / ADDED, per-section before/after, full source map. New mockup at `dashboard/mockup/v2-balanced/index.html`. | Shipped 2026-05-04 |
| [active/SPRINT_pipeline_implementation.md](active/SPRINT_pipeline_implementation.md) | Sprint plan — runs **after** the audit sprint and after user signs off on `PARAMETER_DECISIONS.md`. Implements the parameter swap in the pipeline + DB: new free-source parsers, soft-delete cleanup of unused parsers and columns, cron wiring, mandatory per-parser validation against source. Soft delete only (no DROP COLUMN), no backfill, no UI / AI changes. | Planned · sequential to audit |
| [active/SPRINT_pipeline_leftovers.md](active/SPRINT_pipeline_leftovers.md) | Sprint plan — closes 5 known follow-ups from the pipeline implementation sprint: per-parser commits, FOMC SEP parser fix, NAAIM/ISM keep-or-drop decision, validation report auto-fill. Sonnet · ~1.5h. | Planned · runs first |
| [active/SPRINT_agent_foundation.md](active/SPRINT_agent_foundation.md) | Sprint plan — builds the orchestrator + one canonical agent (Macro Thesis) end-to-end, to lock the pattern before rollout. Sonnet runner, GPT-5 runtime · ~3h. | Planned · sequential after leftovers |
| [active/SPRINT_agent_rollout.md](active/SPRINT_agent_rollout.md) | Sprint plan — applies the foundation pattern to the remaining 24 agents from TICKER_PIPELINE + MAP_PIPELINE. One worker per agent, one commit per agent, one JSON column per agent. Single-pass quality check (no evaluator loop). Sonnet runner · ~5h, splittable. | Planned · sequential after foundation |
| [active/SPRINT_validation_cleanup.md](active/SPRINT_validation_cleanup.md) | Sprint plan — runs last. End-to-end smoke test, three user-journey walkthroughs, schema reconciliation, doc lifecycle (archive shipped sprints). Bug log for follow-up. No new features, no refactors. Sonnet · ~2h. | Planned · sequential, final |
| [active/V2_PIPELINE_DRAFT.md](active/V2_PIPELINE_DRAFT.md) | Earlier broader v2 pipeline sketch (engines + clusters). Now superseded in scope by TICKER_PIPELINE for the Ticker tab — kept as reference for the macro / sector / tape pipelines that still need the same treatment. | Active but partially superseded |
| [active/DASHBOARD_AI_INTEGRATION.md](active/DASHBOARD_AI_INTEGRATION.md) | Writing principles for AI-generated readings (§16: the prompt-design contract). Source of truth for how each agent must write. | Active · 2026-04-29 |
| [active/MOCKUP_ANALYSIS.md](active/MOCKUP_ANALYSIS.md) | Critique notes from the v2 mockup rebuild (what to keep, what to cut). | Active reference for the rebuild |
| [active/PORTFOLIO_DASHBOARD_DESIGN.md](active/PORTFOLIO_DASHBOARD_DESIGN.md) | v2 dashboard design doc (layout, sections, surfaces). PDF alongside. | Active design ref |
| [active/HEDGE_FUND_DATA_REQUIREMENTS.md](active/HEDGE_FUND_DATA_REQUIREMENTS.md) | What hedge-fund-grade analysis actually needs from the data layer. | Active strategic ref |

The current mockup lives at [`dashboard/mockup/index.html`](../dashboard/mockup/index.html) (visually-locked v2). The free-source-honest variant from the 2026-05-04 audit is at [`dashboard/mockup/v2-balanced/index.html`](../dashboard/mockup/v2-balanced/index.html). Both serve on `localhost:8000` during design iteration.

---

## Stable subsystem docs

Don't churn. Update only when the underlying subsystem changes.

| Folder | Contents |
|---|---|
| [`core/`](core/) | [CONVENTIONS](core/CONVENTIONS.md) · [DIARY](core/DIARY.md) · [MISTAKES](core/MISTAKES.md) |
| [`features/`](features/) | One file per stable subsystem: [dashboard](features/dashboard.md) · [pipeline](features/pipeline.md) · [data-sources](features/data-sources.md) · [validation](features/validation.md) · [worker-d1](features/worker-d1.md) |
| [`reference/`](reference/) | [DATABASE_SCHEMA](reference/DATABASE_SCHEMA.md) · [KEY_COMMANDS](reference/KEY_COMMANDS.md) · [WORKER_TAXONOMY](reference/WORKER_TAXONOMY.md) |
| [`guidelines/`](guidelines/) | [DOC_GUIDELINES](guidelines/DOC_GUIDELINES.md) — the rules this index follows |
| [`narrative/`](narrative/) | Narrative-phase audits ([entities](narrative/audit-entities.md), [surfaces](narrative/audit-surfaces.md), [data inventory](narrative/data-inventory.md), [sector decision](narrative/sector-decision.md)). Phase work appears complete — leave for now, archive when next-gen narrative ships. |

---

## Archive · `archive/`

Completed plans, finished sprints, point-in-time test reports, and superseded references. Kept for history and traceability — never delete.

### `archive/plans/` · completed multi-week build plans

| Doc | What it was |
|---|---|
| [REWORK_PLAN.md](archive/plans/REWORK_PLAN.md) | Apr 2026 broad rework plan |
| [PIPELINE_BUILD_PLAN.md](archive/plans/PIPELINE_BUILD_PLAN.md) | Pipeline build-out plan |
| [PIPELINE_FIXES_PLAN.md](archive/plans/PIPELINE_FIXES_PLAN.md) | Pipeline-fixes punch list |
| [NARRATIVE_BUILD_PLAN.md](archive/plans/NARRATIVE_BUILD_PLAN.md) | Narrative phase 1 build plan |
| [NARRATIVE_PHASE_2_PLAN.md](archive/plans/NARRATIVE_PHASE_2_PLAN.md) | Narrative phase 2 plan |
| [REFACTORING_PLAN.md](archive/plans/REFACTORING_PLAN.md) | Earlier refactoring plan |

### `archive/sprints/` · completed sprint docs

| Doc | What it was |
|---|---|
| [SPRINT_14_DETAILING_REPORT.md](archive/sprints/SPRINT_14_DETAILING_REPORT.md) | Sprint 14 — detailing report |
| [SPRINT_15_PLAN_local_to_cron_migration.md](archive/sprints/SPRINT_15_PLAN_local_to_cron_migration.md) | Sprint 15 — local→cron migration plan |

### `archive/tests/` · point-in-time test results and timings

| Doc | What it was |
|---|---|
| [TEST_CHECKLIST.md](archive/tests/TEST_CHECKLIST.md) | Test checklist (Apr 10) |
| [TEST_PLAN_V4.md](archive/tests/TEST_PLAN_V4.md) | Test plan v4 (Apr 12) |
| [TEST_RESULTS_20260410.md](archive/tests/TEST_RESULTS_20260410.md) | Results from Apr 10 run |
| [PIPELINE_TIMINGS_2026-04-12.md](archive/tests/PIPELINE_TIMINGS_2026-04-12.md) | Pipeline timings snapshot Apr 12 |

### `archive/superseded/` · replaced by current canonical refs

| Doc | Replaced by |
|---|---|
| [FULL_PIPELINE.md](archive/superseded/FULL_PIPELINE.md) | [SYSTEM_REFERENCE.md](SYSTEM_REFERENCE.md) |
| [ARCHITECTURE.md](archive/superseded/ARCHITECTURE.md) | [SYSTEM_REFERENCE.md](SYSTEM_REFERENCE.md) + [STRUCTURE.md](STRUCTURE.md) |
| [PIPELINE.md](archive/superseded/PIPELINE.md) | [SYSTEM_REFERENCE.md](SYSTEM_REFERENCE.md) |
| [VALIDATION_SYSTEM_SPEC.md](archive/superseded/VALIDATION_SYSTEM_SPEC.md) | [features/validation.md](features/validation.md) |

---

## Workflow

1. **Starting a new feature?** Create `active/{FEATURE_NAME}.md`. Add a row to the "Active work" table above with one sentence on what it is.
2. **Iterating on an active doc?** Edit in place. Bump its `Last updated` date.
3. **Feature shipped?** Either (a) fold the design into the canonical refs (STRUCTURE / SYSTEM_REFERENCE / features) and move the active doc to `archive/plans/` or `archive/superseded/`, or (b) leave it in `active/` if it is still being iterated.
4. **Doc proven wrong or replaced?** Move to `archive/superseded/` and update the table above with what replaced it.
5. **Sprint or test session done?** Drop the report in `archive/sprints/` or `archive/tests/`.

The rule: **if it's in `active/`, it's live. If it's in `archive/`, it's history.** No middle ground.
