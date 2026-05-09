# Documentation Index · what's where

**Last updated**: 2026-05-09

This index tells you what's being worked on right now, what the canonical reference is, and what's archived for history.

If a doc is not listed here, it does not exist (or it should be added here).

---

## Canonical reference

The two docs to update when system architecture changes.

| Doc | Purpose |
|---|---|
| [architecture.md](architecture.md) | The mental model: two horizontal layers (data parsing + AI processing), four workflows (Macro / Sector / Ticker / Tape), bug patterns to avoid. **Read this first.** |
| [SYSTEM_REFERENCE.md](SYSTEM_REFERENCE.md) | Long-form reference for every cluster (full schemas, full data flow). PDF: [SYSTEM_REFERENCE.pdf](SYSTEM_REFERENCE.pdf). Use as a lookup, not a tutorial. |

---

## Active work · `active/`

In-flight design docs. Each new feature gets a doc here. When the design is folded into the canonical refs, the doc moves to `archive/`.

| Doc | What it captures | Status |
|---|---|---|
| [active/TICKER_PIPELINE.md](active/TICKER_PIPELINE.md) | Per-agent pipeline for the three Ticker surfaces (Name slide-out 10 agents, Today, Tape). Includes the topic-feed contract. | Active |
| [active/MAP_PIPELINE.md](active/MAP_PIPELINE.md) | Per-agent pipeline for the Macro slide-out (7 agents) and Sector slide-out (6 agents). Cross-pipeline lineage Macro → Sector → Ticker defined. | Active |
| [active/DASHBOARD_AI_INTEGRATION.md](active/DASHBOARD_AI_INTEGRATION.md) | Writing principles for AI-generated readings (§16 prompt-design contract). Source of truth for how each agent must write. | Active |
| [active/HEDGE_FUND_DATA_REQUIREMENTS.md](active/HEDGE_FUND_DATA_REQUIREMENTS.md) | What hedge-fund-grade analysis actually needs from the data layer. Strategic reference. | Active |
| [active/v2_BALANCED_MOCKUP.md](active/v2_BALANCED_MOCKUP.md) | Rationale for the balanced v2 mockup: REMOVED / CHANGED / ADDED, per-section before/after, full source map. | Active reference |
| [active/PORTFOLIO_DASHBOARD_DESIGN.md](active/PORTFOLIO_DASHBOARD_DESIGN.md) | v2 dashboard design doc (layout, sections, surfaces). PDF alongside. | Active design ref |
| [active/MOCKUP_ANALYSIS.md](active/MOCKUP_ANALYSIS.md) | Critique notes from the v2 mockup rebuild — what to keep, what to cut. | Active reference |
| [active/FEATURE_gemini_grounded_summary.md](active/FEATURE_gemini_grounded_summary.md) | Optional Stage 3 summary path (Gemini 2.5 Flash + Google Search grounding). Disabled on master to save ~$15/mo. Live code on `feature/gemini-grounded-summary` branch. | Optional · disabled |

---

## Stable subsystem docs

Don't churn. Update only when the underlying subsystem changes.

| Folder | Contents |
|---|---|
| [`core/`](core/) | [CONVENTIONS](core/CONVENTIONS.md) · [DIARY](core/DIARY.md) · [MISTAKES](core/MISTAKES.md) |
| [`features/`](features/) | One file per stable subsystem: [dashboard](features/dashboard.md) · [pipeline](features/pipeline.md) · [data-sources](features/data-sources.md) · [validation](features/validation.md) · [worker-d1](features/worker-d1.md) |
| [`reference/`](reference/) | [DATABASE_SCHEMA](reference/DATABASE_SCHEMA.md) · [KEY_COMMANDS](reference/KEY_COMMANDS.md) · [WORKER_TAXONOMY](reference/WORKER_TAXONOMY.md) |
| [`guidelines/`](guidelines/) | [DOC_GUIDELINES](guidelines/DOC_GUIDELINES.md) — the rules this index follows |
| [`narrative/`](narrative/) | Narrative-phase audits ([entities](narrative/audit-entities.md), [surfaces](narrative/audit-surfaces.md), [data inventory](narrative/data-inventory.md), [sector decision](narrative/sector-decision.md)). |

---

## Archive · `archive/`

Completed plans, finished sprints, point-in-time test reports, superseded references. Kept for traceability — never delete.

### `archive/plans/` · completed multi-week build plans

| Doc | What it was |
|---|---|
| [REWORK_PLAN.md](archive/plans/REWORK_PLAN.md) | Apr 2026 broad rework plan |
| [PIPELINE_BUILD_PLAN.md](archive/plans/PIPELINE_BUILD_PLAN.md) | Pipeline build-out plan |
| [PIPELINE_FIXES_PLAN.md](archive/plans/PIPELINE_FIXES_PLAN.md) | Pipeline-fixes punch list |
| [NARRATIVE_BUILD_PLAN.md](archive/plans/NARRATIVE_BUILD_PLAN.md) | Narrative phase 1 build plan |
| [NARRATIVE_PHASE_2_PLAN.md](archive/plans/NARRATIVE_PHASE_2_PLAN.md) | Narrative phase 2 plan |
| [REFACTORING_PLAN.md](archive/plans/REFACTORING_PLAN.md) | Earlier refactoring plan |

### `archive/sprints/` · completed sprint docs + outputs

| Doc | What it was |
|---|---|
| [SPRINT_14_DETAILING_REPORT.md](archive/sprints/SPRINT_14_DETAILING_REPORT.md) | Sprint 14 — detailing report |
| [SPRINT_15_PLAN_local_to_cron_migration.md](archive/sprints/SPRINT_15_PLAN_local_to_cron_migration.md) | Sprint 15 — local→cron migration plan |
| [PRE_SPRINT_AUDIT_2026-05-04.md](archive/sprints/PRE_SPRINT_AUDIT_2026-05-04.md) | Pre-sprint audit — surveys existing AI workers, identifies four risks the original sprint chain didn't cover |
| [SPRINT_2026-05-04_dashboard_balance.md](archive/sprints/SPRINT_2026-05-04_dashboard_balance.md) | Mockup-vs-DB-vs-pipeline audit; built the balanced new mockup |
| [SPRINT_CHAIN_2026-05-05.md](archive/sprints/SPRINT_CHAIN_2026-05-05.md) | The dashboard go-live runbook — 26 micro-sprints across 6 phases |
| [SPRINT_pipeline_implementation.md](archive/sprints/SPRINT_pipeline_implementation.md) | Parameter swap in pipeline + DB; new free-source parsers |
| [SPRINT_pipeline_leftovers.md](archive/sprints/SPRINT_pipeline_leftovers.md) | Closed 5 known follow-ups from pipeline-implementation sprint |
| [SPRINT_2026-05-06_pre_init_api_audit.md](archive/sprints/SPRINT_2026-05-06_pre_init_api_audit.md) | AV 25/day budget coordination; consensus-fetcher event-driven via earnings calendar |
| [SPRINT_2026-05-06_historical_init.md](archive/sprints/SPRINT_2026-05-06_historical_init.md) | Historical-init fan-out (22 tickers + 11 sectors + STOCK_FACTORS / FUND_01 / FUND_03 backfill) |
| [SPRINT_2026-05-06_validator_tab.md](archive/sprints/SPRINT_2026-05-06_validator_tab.md) | Validator tab + cost tracking — added PROC_03_Pipeline_runs + PROC_04_API_usage tables |
| [sprint-output/](archive/sprints/sprint-output/) | Sprint outputs from May-04 audit + May-06 init: AUDIT_INVENTORY, PARAMETER_DECISIONS, PIPELINE_AUDIT, VALIDATION_REPORT, BUGS_FOUND, INIT_NOTES, HISTORICAL_INIT_FANOUT |

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
| [ARCHITECTURE.md](archive/superseded/ARCHITECTURE.md) | [architecture.md](architecture.md) |
| [PIPELINE.md](archive/superseded/PIPELINE.md) | [SYSTEM_REFERENCE.md](SYSTEM_REFERENCE.md) |
| [VALIDATION_SYSTEM_SPEC.md](archive/superseded/VALIDATION_SYSTEM_SPEC.md) | [features/validation.md](features/validation.md) |
| [SPRINT_agent_foundation.md](archive/superseded/SPRINT_agent_foundation.md) | SPRINT_CHAIN phase 2 (executed) |
| [SPRINT_agent_rollout.md](archive/superseded/SPRINT_agent_rollout.md) | SPRINT_CHAIN phase 3 (executed) |
| [SPRINT_validation_cleanup.md](archive/superseded/SPRINT_validation_cleanup.md) | SPRINT_CHAIN phase 5 (executed) |
| [V2_PIPELINE_DRAFT.md](archive/superseded/V2_PIPELINE_DRAFT.md) | [active/TICKER_PIPELINE.md](active/TICKER_PIPELINE.md) + [active/MAP_PIPELINE.md](active/MAP_PIPELINE.md) |

---

## Workflow

1. **Starting a new feature?** Create `active/{FEATURE_NAME}.md`. Add a row to the "Active work" table above.
2. **Iterating on an active doc?** Edit in place. Bump its `Last updated` date.
3. **Feature shipped?** Either (a) fold the design into the canonical refs (architecture / SYSTEM_REFERENCE / features) and move the active doc to `archive/plans/` or `archive/superseded/`, or (b) leave it in `active/` if it's still being iterated.
4. **Doc proven wrong or replaced?** Move to `archive/superseded/` and update the table above with what replaced it.
5. **Sprint or test session done?** Drop the report in `archive/sprints/` or `archive/tests/`.

The rule: **if it's in `active/`, it's live. If it's in `archive/`, it's history.** No middle ground.
