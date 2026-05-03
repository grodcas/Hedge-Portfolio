> [INDEX](../INDEX.md) · [Audit sprint](SPRINT_2026-05-04_dashboard_balance.md) · [Pipeline impl](SPRINT_pipeline_implementation.md) · [Agent wiring](SPRINT_ai_agent_wiring.md)

# SPRINT · End-to-end validation + cleanup

**Status**: Planned. Runs **last**, after all three prior sprints have shipped.
**Owner**: TBD
**Estimated effort**: 3–5h. Smaller than the others — this is verification, not building.

---

## Objective

Walk the floor after the three feature sprints have shipped and look for cracks: things wired wrong, fields not populating, agents over-firing, prompts producing noise, dead code that survived cleanup, schema drifted from doc, orphan files, dangling imports, broken links in docs. Fix the trivial; log the rest into a follow-up issue list.

This sprint is **not for adding features, not for refactoring**. It is a verification pass and a janitorial pass. The user has left scope here intentionally loose — use judgment.

---

## Hard constraints

| # | Constraint |
|---|---|
| 1 | **No new features.** If you find a missing capability, log it — don't build it here. |
| 2 | **No refactors.** "Better way to organise" temptations go in the follow-up list. |
| 3 | **Soft delete still applies.** Anything that looks dead gets a `DEPRECATED YYYY-MM-DD` tag, not a `git rm`. |
| 4 | **Trivial fixes only**: typos, broken doc links, stale comments, obvious one-line bugs. Anything bigger goes to `docs/active/sprint-output/BUGS_FOUND.md` with a reproducer. |
| 5 | **Don't break things to verify them.** Don't truncate a table to test "what happens." Read-only verification wherever possible. |

---

## Sub-sprint M · End-to-end smoke test (≈1h)

Walk the system as a user would and check it actually works.

### M.1 Dashboard render
- Serve `dashboard/mockup/v2-balanced/index.html` (the balanced mockup from the audit sprint output).
- Open in browser, scroll the whole page top-to-bottom.
- Open every slide-out (Name on a few tickers, Macro, Sector on a few sectors, Tape).
- Check: no console errors, no missing values, no `[object Object]` placeholders, no `—` where data should exist, no overlapping or broken layout.

### M.2 Cron is actually firing
- Look at the cron schedule discovered in prior sprints.
- Confirm the **last successful run** of every job is recent (within its expected cadence).
- Tail logs for the last 24h: any errors? Any silent failures (job exited 0 but wrote nothing)?
- For each agent in the orchestrator: confirm at least one fire in the past 24h, OR confirm the agent's trigger condition explains the no-fire.

### M.3 DB has the rows it should
- For a sample ticker, sample sector, and the macro state row: confirm every `{agent}_json` column has a value and a recent `_updated_at` stamp.
- For deprecated columns: confirm `_updated_at` is frozen at the deprecation date (no zombie writes).
- For new free-source parsers from the pipeline sprint: confirm the column has a fresh value matching the most recent published source.

### M.4 Dashboard ↔ DB binding
- Pick 5 fields on the dashboard at random.
- For each, trace: dashboard reads from `X.column` → DB has value `V` → check `V` matches what's displayed.
- If any mismatch: bug.

### M.5 User-journey walkthroughs (manual)
Three quick walkthroughs:
- **Walkthrough 1**: open dashboard → glance at Today → click a name in Book → scan the Name slide-out → unfold Earnings summary. Does it tell a coherent story?
- **Walkthrough 2**: glance at Macro strip → click regime anchor → read macro slide-out → unfold FOMC summary → click "Open full Tape →".
- **Walkthrough 3**: click a sector row → read sector slide-out → unfold a couple of readings → check the Implementation card mentions concrete names from the book.

Note any moments where the data feels wrong, off, or incoherent.

**Deliverable**: `docs/active/sprint-output/SMOKE_TEST_REPORT.md`. Pass / fail per check + notes per walkthrough.

---

## Sub-sprint N · Dead-code + orphan walk (≈1h)

The prior sprints used soft-delete protocol everywhere. Verify it was applied consistently and find anything that fell through.

### N.1 Parser files
For each file in `edgar/`, `macro/`, `news/`, `sentiment/`, `press/`, `whitehouse/`:
- Has it been called in the past 30 days (logs)?
- If not, does it have a `DEPRECATED` header?
- If neither: orphan. Add the header now (don't delete).

### N.2 Worker files
Same drill in `workers/` (and wherever workers live per §H.1 from the wiring sprint).

### N.3 Cron entries
- Every active entry: does the corresponding file exist and run cleanly?
- Every deprecated (commented) entry: still has a `# DEPRECATED YYYY-MM-DD` tag?
- Any entry pointing to a file that no longer exists: orphan, log it.

### N.4 DB columns
- Cross-check `docs/reference/DATABASE_SCHEMA.md` against what's actually in the schema.
- Columns in DB but not documented: undocumented — add to schema doc.
- Columns documented but not in DB: stale doc — fix the doc.
- Columns marked DEPRECATED: confirm no live consumer (grep the codebase for the column name).

### N.5 Imports + dependencies
- Run a dead-import check (any equivalent of `eslint --no-unused-vars` for the project's stack).
- Any imports referencing files that have moved during the doc reorganization or sprint cleanup: fix the path.

### N.6 Sprint output files
- Sprint-output docs (AUDIT_INVENTORY, PARAMETER_DECISIONS, PIPELINE_AUDIT, WORKER_AUDIT, VALIDATION_REPORT, AGENT_QUALITY_REPORT, etc.) — they served their purpose during the sprints. Decide per file: archive (if frozen reference) or delete (if churn-only). Default: archive.

**Deliverable**: `docs/active/sprint-output/CLEANUP_REPORT.md`. List of orphans found, action taken (header added / commented out / fixed / archived).

---

## Sub-sprint O · DB + schema reconciliation (≈30min)

A focused pass on the data layer because cracks here cause silent wrongness.

### O.1 Schema doc vs reality
Already partly covered in §N.4 — finish it. The `DATABASE_SCHEMA.md` should match the actual schema at byte level for column names + types + nullability.

### O.2 Sanity-check the JSON columns
For each `{agent}_json` column: pull a sample row, parse the JSON, confirm the structured fields documented in the pipeline contracts (drivers, tripwires, drift signs, version, last_updated, etc.) are actually present and shaped as expected.

### O.3 Index audit
Any new column that gets queried in a hot path (e.g., the dashboard reads `tickers.thesis_json` every refresh) should be on an index path. If a critical query is doing a table scan, log it for a follow-up perf sprint.

---

## Sub-sprint P · Doc lifecycle + INDEX reconciliation (≈30min)

After three feature sprints + a cleanup sprint, the doc tree needs a trim.

### P.1 Move shipped sprints to archive
- `SPRINT_2026-05-04_dashboard_balance.md` → `archive/sprints/`
- `SPRINT_pipeline_implementation.md` → `archive/sprints/`
- `SPRINT_ai_agent_wiring.md` → `archive/sprints/`
- This sprint itself moves once it ships.

### P.2 Decide each `active/` doc's home
For every doc currently in `active/`, decide:
- **Keep in `active/`** — still being iterated (e.g., AI prompt contracts in DASHBOARD_AI_INTEGRATION may keep churning).
- **Promote to `features/`** — design has stabilised; doc is now reference (e.g., TICKER_PIPELINE / MAP_PIPELINE if outputs are validated and prompts are locked).
- **Archive** — was a one-off design memo and is now superseded.

The user's prior preference: **fold living design into the canonical refs (SYSTEM_REFERENCE / STRUCTURE / features/)** when a feature ships. Apply that.

### P.3 Update STRUCTURE.md and SYSTEM_REFERENCE.md
If pipeline architecture, worker model, or DB schema changed during the three sprints, sync the canonical refs. Don't rewrite — surgical edits to keep them accurate.

### P.4 Update INDEX.md
Reflect the new layout: archived sprints out of Active, promoted docs in their new locations, new sprint-output references where they ended up.

### P.5 Verify all internal doc links
Every `[link](path)` across all docs — does the target exist after the moves? Fix or log.

**Deliverable**: nothing new — this sub-sprint produces clean state, not a new doc. INDEX.md changes are the visible artefact.

---

## Sub-sprint Q · Bug log for follow-up (≈30min — runs in parallel with the others)

Anything found during M / N / O / P that isn't trivial-one-line-fix material goes here, not into the working tree as a hot fix.

### Q.1 Format
For each bug or rough edge:

```
## {short title}
**Found in**: M / N / O / P
**Severity**: Low / Medium / High
**Reproducer**: 1-2 lines
**Suspected cause**: 1 line
**Why deferred**: too big for this sprint / needs design / not blocking ship
```

### Q.2 Triage at end of sprint
At the very end, glance at `BUGS_FOUND.md`:
- Any High that should actually be patched now? (Rare — the sprint scope says trivial only.)
- Otherwise: file a follow-up sprint stub in `active/` with the High items at the top.

**Deliverable**: `docs/active/sprint-output/BUGS_FOUND.md`.

---

## Final deliverables checklist

- [ ] `docs/active/sprint-output/SMOKE_TEST_REPORT.md` (M)
- [ ] `docs/active/sprint-output/CLEANUP_REPORT.md` (N)
- [ ] DB schema doc reconciled with reality (O)
- [ ] Doc tree pruned + INDEX.md updated (P)
- [ ] `docs/active/sprint-output/BUGS_FOUND.md` (Q)
- [ ] Three prior sprint plans moved to `archive/sprints/`
- [ ] This sprint plan ready to move to `archive/sprints/` once it ships

---

## Out of scope

- New features
- Refactors
- Performance optimisation (log to BUGS_FOUND if anything is obviously slow, defer)
- Schema redesign
- Prompt re-tuning beyond trivial typo fixes
- Anything destructive

---

## Notes for the runner

- **Be a skeptical visitor.** Open the dashboard cold and look for things that *should* be true but aren't. The three feature sprints were build sprints — this is the first one that actually says "does it actually work end-to-end."
- **Don't fall in love with what you find.** Log → move on. The point of the bug list is to keep the floor walk moving.
- **Soft delete still rules.** Even orphans get a header, not a delete. The user explicitly chose this in the prior sprint.
- **The dashboard's "feels wrong" moments are gold.** During the user-journey walkthroughs, write down anything that makes you pause — even if you can't articulate why. Those are the bugs analysts catch and engineers miss.
- **Don't try to "finish strong" by sneaking in a feature improvement.** Resist. The user can decide what's next after seeing the bug list.

---

> [INDEX](../INDEX.md)
