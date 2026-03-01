# Documentation Guidelines

**Last updated**: 2026-03-01

Rules for writing and maintaining documentation in this repository.

---

## Organization

1. **STRUCTURE.md is the single entry point.** Every document must be linked from it. If a doc is not reachable from STRUCTURE.md, it does not exist.
2. **Feature docs** go in `docs/features/` — one file per major subsystem.
3. **Guidelines** go in `docs/guidelines/` — process and how-to instructions.
4. **Reports** go in `docs/reports/` — one file per analysis or test session.
5. **DIARY.md** is append-only. Never edit past entries.
6. **MISTAKES.md** only records **solved** problems with root cause and lesson learned. Do not log open issues here.

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

### Cross-References
- Inline: `(see [feature name](features/feature.md))`
- Back-links: every document must end with `[Back to STRUCTURE](../STRUCTURE.md)` or `[Back to STRUCTURE](STRUCTURE.md)`

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

[Back to STRUCTURE](../STRUCTURE.md)
