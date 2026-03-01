> [STRUCTURE](../STRUCTURE.md) · [Doc Guidelines](DOC_GUIDELINES.md)

# Documentation Guidelines

**Last updated**: 2026-03-01

Rules for writing and maintaining documentation in this repository.

---

## Organization

1. **STRUCTURE.md is the single entry point** and the only file at `docs/` root. Every document must be linked from it. If a doc is not reachable from STRUCTURE.md, it does not exist.
2. **Core docs** go in `docs/core/` — CONVENTIONS, MISTAKES, DIARY.
3. **Feature docs** go in `docs/features/` — one file per major subsystem.
4. **Reference docs** go in `docs/reference/` — DATABASE_SCHEMA, WORKER_TAXONOMY, KEY_COMMANDS.
5. **Guidelines** go in `docs/guidelines/` — process and how-to instructions.
6. **Archive** goes in `docs/archive/` — superseded docs kept for reference.
7. **Reports** go in `docs/reports/` — one file per analysis or test session.
8. **DIARY.md** is append-only. Never edit past entries.
9. **MISTAKES.md** only records **solved** problems with root cause and lesson learned. Do not log open issues here.
10. **Every doc** must have a navigation bar at top and bottom linking back to STRUCTURE.md and to sibling docs in the same folder.

---

## Naming Conventions

| Location | Convention | Example |
|----------|-----------|---------|
| Root-level docs | `ALLCAPS.md` | `STRUCTURE.md`, `CONVENTIONS.md` |
| Feature docs | `lowercase-kebab.md` | `data-sources.md`, `worker-d1.md` |
| Guidelines | `ALLCAPS_GUIDELINES.md` | `DOC_GUIDELINES.md` |
| Reports | `{topic}_{YYYYMMDD}_report.md` | `sec_validation_20260301_report.md` |

---

## Formatting Standards

### Headers
- `#` (H1) for document title — one per file
- `##` (H2) for major sections
- `###` (H3) for subsections

### Tables
Use markdown pipe tables for structured data (metrics, file inventories, API routes, comparisons).

### Code Blocks
Use triple-backtick fenced blocks for: code snippets, shell commands, data structure examples, ASCII diagrams.

### Status Labels
Always bold: `**Solved**`, `**Active**`, `**Outdated**`, `**Archived**`.

### Navigation Bars
- Every doc has a blockquote nav bar at top and bottom: `> [STRUCTURE](../STRUCTURE.md) · [Sibling 1](sibling.md) · [Sibling 2](sibling.md)`
- The nav bar links to STRUCTURE.md and all sibling docs in the same folder

### Cross-References
- Inline: `(see [feature name](../features/feature.md))`
- Reference docs: `(see [DATABASE_SCHEMA](../reference/DATABASE_SCHEMA.md))`

### Diagrams
- Mermaid diagrams live **only** in STRUCTURE.md.
- Feature docs use ASCII diagrams or plain text descriptions.

---

## Templates

### MISTAKES.md Entry

```markdown
## [Short Title]

**Date**: YYYY-MM-DD
**Severity**: High / Medium / Low
**Status**: Solved

### Problem
What went wrong, from the user's perspective.

### Root Cause
The technical reason it happened.

### Solution
What was changed and where.

### Lesson Learned
The general principle to avoid this class of bug.
```

### DIARY.md Entry

```markdown
### YYYY-MM-DD

- Bullet points of what was done
- Each entry is a completed action, not a plan
- Reference commit hashes or file paths where relevant
```

---

## When to Update Docs

- **New feature**: Add to relevant feature doc + link from STRUCTURE.md
- **Bug fix with lesson**: Add to MISTAKES.md
- **Architecture change**: Update STRUCTURE.md diagrams and feature docs
- **New worker**: Add to WORKER_TAXONOMY.md
- **New D1 table**: Add to DATABASE_SCHEMA.md
- **Daily work**: Append to DIARY.md

---

> [STRUCTURE](../STRUCTURE.md) · [Doc Guidelines](DOC_GUIDELINES.md)
