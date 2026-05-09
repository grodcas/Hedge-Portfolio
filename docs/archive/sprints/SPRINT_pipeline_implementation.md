> [INDEX](../INDEX.md) · [Audit sprint](SPRINT_2026-05-04_dashboard_balance.md)

# SPRINT · Pipeline parameter implementation

**Status**: Planned. Runs **sequentially after** [SPRINT_2026-05-04_dashboard_balance](SPRINT_2026-05-04_dashboard_balance.md) and after the user signs off on its `PARAMETER_DECISIONS.md` output.
**Owner**: TBD
**Estimated effort**: 6–7h, split across the day.

---

## Objective

Apply the parameter decisions from the audit sprint to the actual pipeline + DB. Add parsers for newly-needed free-source fields. **Soft-delete** the parsers and DB columns the new mockup no longer needs. Wire everything into the **existing cron infrastructure**. Validate every new field against its source.

This is **not a rebuild**. The heavy work — pipeline architecture, workers, DB layer, cron — is already in place and working. This sprint is a clean **parameter swap**: small, surgical changes that leave no dead code, no orphaned columns, no half-wired parsers behind.

---

## Hard constraints (read before starting)

| # | Constraint |
|---|---|
| 1 | **Inputs are locked**: this sprint executes against `docs/active/sprint-output/PARAMETER_DECISIONS.md` as approved by the user. If a row in there looks wrong, **stop and ask** — do not improvise the decisions. |
| 2 | **Free APIs only.** Same shortlist as audit sprint: FRED, BLS, Yahoo, EDGAR, EIA, Federal Reserve H.4.1, Treasury Direct, Stooq, AAII, NAAIM. No paid sources. |
| 3 | **Soft delete only.** Never `DROP COLUMN`. Never delete a parser file. Stop writing, mark DEPRECATED. (Protocol below in §F.) |
| 4 | **No backfill in this sprint.** Initialisation of historical series is deferred to a later sprint. New fields start collecting forward from go-live. |
| 5 | **Use existing cron infrastructure.** Discover it in §D.1 — do not invent new scheduling. New parsers slot in alongside existing entries. |
| 6 | **Reuse existing parser patterns.** Each new parser must follow the closest existing one (look at `edgar/`, `macro/`, `news/`, `sentiment/`, `press/`, `whitehouse/` for the right template). No new architecture. |
| 7 | **Validation gate is mandatory.** A parser is not "done" until it has been run once and the value sample-checked against the source's published page. (Protocol in §G.4.) |
| 8 | **No UI changes.** That was the audit sprint's job. Touch nothing in `dashboard/`. |
| 9 | **No AI agent wiring.** That's a separate sprint family (TICKER_PIPELINE / MAP_PIPELINE consumers). This sprint stops at "value lands in the right column of the right table." |

---

## Sub-sprint D · Pipeline audit (≈1.5h)

The runner orients before changing anything. The user emphasized: **understand what's already in place** because the system is real and works — this is a swap, not a rebuild.

### D.1 Discover the cron schedule
Locate the file(s) that define the schedule. Likely candidates in this repo:
- `wrangler.toml` (Cloudflare Workers cron triggers)
- `.github/workflows/*.yml` (GitHub Actions cron)
- crontab on the server (less likely)
- `src/pipeline.js` orchestrator (the file already references "Pipeline Orchestrator")

Capture: which file owns the schedule, what jobs run, on what cadence, against what env (local vs deployed). Note the existing rate-limit handling if any.

### D.2 Walk every existing parser
For each parser file in `edgar/`, `macro/`, `news/`, `sentiment/`, `press/`, `whitehouse/`:
- Function entry point
- Source URL / API
- Where it writes (table.column or file path)
- Frequency (from §D.1 cron findings)
- Failure mode (silent? logged? throws?)

### D.3 Walk DB write paths
Cross-reference `docs/reference/DATABASE_SCHEMA.md` against actual `INSERT` / `UPDATE` paths in code. For each column: which parser writes it, last-write timestamp pattern, any consumers (UI, scripts).

### D.4 Cross-reference with PARAMETER_DECISIONS
Take every row from `docs/active/sprint-output/PARAMETER_DECISIONS.md` and tag it:
- **EXTEND existing parser** — same source, just write a new column or fix a value path
- **NEW parser** — needs a fresh file
- **DEPRECATE** — soft-delete in §F
- **NO-OP** — already correct, nothing to do

**Deliverable**: `docs/active/sprint-output/PIPELINE_AUDIT.md`. Sections: cron schedule summary · parser inventory · DB write-path inventory · per-decision tagging.

---

## Sub-sprint E · New parser implementation (≈3–4h)

One sub-task per **NEW** or **EXTEND** row from §D.4. Each sub-task is a self-contained micro-cycle: pattern → write → run-once → validate → wire → commit.

### E.1 Pick the closest existing pattern
Before writing any parser, find the existing parser that most closely matches:
- API shape (REST JSON? CSV download? scrape?)
- Cadence (daily / weekly / monthly)
- Write target (existing table or new)

Reuse imports, error handling, logging conventions, file layout. **Do not invent new patterns** — the user explicitly does not want this.

### E.2 Write the parser
- File location follows the existing convention for that data domain (e.g., new macro series → `macro/`).
- Function name follows the existing naming.
- Output goes to the destination decided in PIPELINE_AUDIT.md.

### E.3 Run once locally
Execute the parser in isolation. Confirm a row appears in the right place with a non-null value.

### E.4 Wire into DB
- If column already exists (EXTEND case): just confirm the write path lands in the right column.
- If new column needed: add it via the project's existing migration mechanism (check what's in place — Drizzle? raw SQL? D1 migrations?). **Do not invent a new migration tool.** If no migration tool exists, **stop and ask** — do not hand-edit the schema.
- Update `docs/reference/DATABASE_SCHEMA.md` with the new column entry.

### E.5 Wire into cron
- Add the parser to the schedule file from §D.1.
- Choose cadence to match the source (FRED daily/weekly per series, EIA weekly Wed, BLS monthly per release calendar, Yahoo intraday or daily). Do not over-poll.
- Stagger requests to respect free-API rate limits.

### E.6 Commit per-parser
Each new parser gets its own commit (`add parser for {SERIES} from {SOURCE}`) so the cleanup sprint history is readable. **Do not** lump all new parsers into one commit.

---

## Sub-sprint F · Soft-delete cleanup (≈1h)

For every **DEPRECATE** row from §D.4:

### F.1 Mark the parser file
Add a header comment to the parser file:
```js
// DEPRECATED 2026-MM-DD: replaced/dropped by SPRINT_pipeline_implementation.
// Stopped writing on this date. File kept for history; do not call.
// Rationale: see docs/active/v2_BALANCED_MOCKUP.md
```

### F.2 Disable in cron
Comment out the cron entry (do not delete the line — leave the commented version with a `# DEPRECATED YYYY-MM-DD` tag so future readers see it).

### F.3 Mark the DB column
In `docs/reference/DATABASE_SCHEMA.md`, tag the column:
```
status: DEPRECATED 2026-MM-DD — last write 2026-MM-DD. Historical data preserved. Do not query in new code.
```

### F.4 Verify no live consumers
Grep the codebase for the column name. If anything still reads it, **flag and stop** — that consumer either needs to be updated or the deprecation is premature.

### F.5 Run the pipeline end-to-end
Confirm:
- No warnings about "missing parser" or "unknown column"
- Cron logs are clean
- DB writes go to the right places
- Deprecated columns no longer receive writes (last_write_at stays frozen at deprecation date)

### F.6 No `DROP COLUMN`. No file deletes.
The user explicitly chose soft delete to preserve history for future backtests. Anything destructive is a different sprint.

---

## Sub-sprint G · Cron wiring + validation (≈1h)

Final integration pass before ship.

### G.1 Schedule review
Open the cron file, confirm:
- Every new parser is present
- Every deprecated parser is commented (not deleted) with a `DEPRECATED YYYY-MM-DD` tag
- Cadence is sensible per source (no daily polling of monthly data, no minute-level polling of free APIs that throttle)
- Staggering: requests to the same domain are spaced

### G.2 End-to-end dry run
Trigger the full pipeline once from the orchestrator. Tail the logs.
Confirm:
- No errors
- No retries beyond expected backoff
- Every new column receives a value
- Every deprecated column does not

### G.3 Validation gate · per-parser sample check
For each **new or extended** parser, produce a 4-line entry in the validation report:

```
Series: {NAME}
Date checked: 2026-MM-DD
Value written by parser: {VALUE}
Value from source (URL): {VALUE} ({SOURCE-URL})
Match? YES / NO
```

If NO, the parser does not ship — investigate the discrepancy, fix, re-validate.

This catches:
- API shape changes (most common silent failure)
- Wrong unit (% vs basis-points, $M vs $B)
- Wrong frequency snap (using the prior month's release as the current value)
- Stale endpoint (returns last-week data without erroring)

### G.4 Final commit
A summary commit `validate + wire all new parsers, deprecate {N} unused`. Includes the validation report file.

---

## Final deliverables checklist

- [ ] `docs/active/sprint-output/PIPELINE_AUDIT.md` (D)
- [ ] One new parser file per **NEW** decision row, each in its own commit (E)
- [ ] Modified parser files for **EXTEND** decision rows, each in its own commit (E)
- [ ] DEPRECATED headers on parser files no longer used (F)
- [ ] Commented-out cron entries with DEPRECATED tags (F)
- [ ] `docs/reference/DATABASE_SCHEMA.md` updated: new columns added, deprecated columns tagged (E + F)
- [ ] `docs/active/sprint-output/VALIDATION_REPORT.md` — sample-check per new parser (G)
- [ ] Update `docs/INDEX.md` — link the validation report under Active work; this sprint moves to `archive/sprints/` once shipped.

---

## Out of scope (do not touch)

- **Backfill of historical data.** Deferred to a later sprint. New fields start collecting forward from go-live; Z-vs-trend calcs that need history will be stale until the backfill sprint runs.
- **`DROP COLUMN` or any destructive DB op.** Soft-delete only.
- **AI agent wiring** (TICKER_PIPELINE / MAP_PIPELINE consumers). This sprint stops at "value in column."
- **UI changes.** Already covered by the audit sprint output.
- **New parser architecture / new abstractions.** Reuse existing patterns.
- **Schema redesign.** Only add columns; do not refactor existing tables.
- **Cron framework swap.** Use what's there.

---

## Notes for tomorrow's runner

- **Read PIPELINE_AUDIT.md before touching code.** The user's #1 emphasis: understand what's already in place. The system works today — this is parameter swap, not architecture.
- **One parser per commit.** Makes the validation report and any rollback trivial.
- **When stuck on the existing pattern, grep first.** The parser you're about to write almost certainly has a sibling. Reuse > invent.
- **Validation is mandatory, not optional.** A silently-wrong parser is worse than a missing one — it pollutes the dashboard with confidence.
- **If a decision row in PARAMETER_DECISIONS turns out to be wrong on contact with the actual code (e.g., source endpoint moved, column name in DB doesn't match), stop and document the conflict.** Do not improvise — the audit sprint's decisions are the contract.
- The user has stated: "I do not want everything messy behind with dead code and dead database layers." The DEPRECATED protocol is what keeps the cleanup honest.

---

> [INDEX](../INDEX.md) · [Audit sprint](SPRINT_2026-05-04_dashboard_balance.md)
