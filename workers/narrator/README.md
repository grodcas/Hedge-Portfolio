# Narrator workers

Home for all narrative-generation workers, per `docs/NARRATIVE_BUILD_PLAN.md`. Each subfolder (except `shared/`) is a separate Cloudflare Worker so it can be scheduled, deployed, and debugged independently.

## Layout

| Folder | Role | Built in |
|---|---|---|
| `regime/` | Builds the regime narrative (current_reading + identification + recommendation + lede). Consumed by Layer 1 card + Macro hero + Regime entity view. | Sprint 1 |
| `sector-landscape/` | Builds the comparative narrative across all sectors. Consumed by Layer 2 card + `landscape:sector` entity view. | Sprint 2 |
| `sector/` | Builds the narrative for one sector at a time (11 sectors). Takes `?sector=<name>`. | Sprint 3 |
| `stock-landscape/` | Builds the comparative narrative across the shortlist. Consumed by Layer 3 card + `landscape:stock` entity view. | Sprint 4 |
| `stock/` | Builds the narrative for one ticker at a time (25 tickers). Produces long-term + tactical pairs. | Sprint 5 |
| `lede/` | GPT-4o-mini lede generator. Reads the three narrative blocks for a given entity and writes the 3–4 line summary used on main cards. | Sprint 6 |
| `dispatcher/` | Event-driven orchestrator. Runs every 15 min; fans out to the narrators based on source-table inserts. | Sprint 7 |
| `shared/` | Common utilities. Not a worker — just a folder of JS modules imported by the others (e.g. `gemini-facts.js`, `openai.js`, `stability.js`, `validate.js`). | Sprint 1+ |

## Shared architecture (applies to all narrators)

Each narrator worker exposes:

- `GET /build` — runs the full pipeline for the default entity (regime) or the entity passed via `?sector=` / `?ticker=`.
- `GET /build-all` — fans out to every entity it handles (sector × 11, stock × 25). Batched.
- `GET /status` — returns the last write timestamps + input_hash for its entities.

Each narrator's internal pipeline is: **gather → stability check → current_reading (deterministic) → identification (GPT-5) → recommendation (GPT-5) → lede (GPT-4o-mini) → write**. See `docs/NARRATIVE_BUILD_PLAN.md` Sprint 1 for the canonical flow; all others copy it.

## Output

Every narrator writes to `NARRATIVE_01_Content` (migration 0031). One row per `{entity_type, entity_id, date, field}`. Prior rows are marked `superseded_by` on rewrite, never deleted.

## Interpretation contract

Every identification bullet written by any narrator must carry `{headline, number, event, interpretation, source}`. `interpretation` is not a paraphrase of `number` — it is the critical read of *what the number means in context*. Prompts must enforce this structurally; validation must drop bullets that have a missing or too-short interpretation field.
