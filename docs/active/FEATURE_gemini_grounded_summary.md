# Feature · Gemini grounded news summary

**Status**: Optional. **Disabled on `master` (2026-05-05)** to cut monthly spend.
Live implementation preserved on branch [`feature/gemini-grounded-summary`](https://github.com/grodcas/Hedge-Portfolio/tree/feature/gemini-grounded-summary).

## What it does

In `news-funnel-orchestrator`, Stage 3 calls `gemini-2.5-flash` with the
`google_search` tool enabled. Per selected headline, Gemini runs a fresh
Google search, ingests the top hits, and writes a 2–3 sentence cited summary
that lands in `BETA_12_News_digest.summary`.

## Why we turned it off

By the time Stage 3 fires we already have, for every selected headline:

- **Title** — the actual signal.
- **Finnhub blurb** — present on most ticker items from Stage 1.
- **`relevance` / `portfolio_impact`** — Stage 2's gpt-5-mini already wrote a
  hedge-fund-grade one-liner per pick.

Re-searching the web to write 2 sentences on top of those was paying ~$0.035
per item for context already on hand. ~20 selections × 22 weekdays ≈ **~$15/mo**.

The current Stage 3 simply persists the Stage 2 output (or Finnhub's blurb when
present) as the `summary` column. Quality cost in the dashboard is minimal —
the dashboard renders title + summary, and the title carries the news.

## When to turn it back on

Re-enable if any of these become true:

- The dashboard prose feels too thin (Stage 2's `relevance` is one sentence).
- We want auditable web citations behind every news row.
- We add a "what changed since yesterday" view that needs day-over-day fresh
  context rather than headline + filter rationale.

## How to turn it back on

```
git checkout feature/gemini-grounded-summary -- workers/news-funnel-orchestrator/src/worker.js
cd workers/news-funnel-orchestrator && npx wrangler deploy
```

Then make sure `GEMINI_API_KEY` is set as a secret on the worker. Cost will
re-add ~$15/month at the current 20-pick/weekday cap.

## Cost reference

| Configuration | Per weekday | Per month |
|---|---:|---:|
| Stage 3 = Gemini grounded (the feature branch) | ~$0.70 | ~$15 |
| Stage 3 = stitched from Stage 2 output (current master) | ~$0.001 | ~$0.02 |
