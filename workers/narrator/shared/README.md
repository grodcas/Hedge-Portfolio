# Shared utilities (narrator)

Not a worker — a folder of JS modules imported by the 7 narrator workers.

## Planned modules (built alongside the sprints that need them)

| Module | Purpose | Sprint |
|---|---|---|
| `openai.js` | Thin wrapper around GPT-5 + GPT-4o-mini calls with retry, cost log, schema validation | Sprint 1 |
| `gemini-facts.js` | Gemini fact-check agent — takes `[{claim, date}]`, returns `[{claim, verified, source_url}]`. Narrow dated questions only. | Sprint 1 |
| `stability.js` | Stability-check helper: given two input blobs, return `STABLE` if below threshold | Sprint 1 |
| `validate.js` | Numeric validation — every number in LLM output must appear in input JSON; every bullet must cite a source | Sprint 1 |
| `sql.js` | `NARRATIVE_01_Content` read/write helpers (insert with supersede, fetch latest by entity) | Sprint 1 |
| `hash.js` | SHA-256 of canonicalized JSON for `input_hash` | Sprint 1 |

## Conventions

- All modules are side-effect-free — no implicit fetch calls or state.
- No secrets in code; every API key pulled from worker `env.*` at call site.
- Prompts live next to the worker that uses them (e.g. `workers/narrator/regime/prompts.js`), not in `shared/` — keeps each worker's LLM contract self-contained and auditable.
