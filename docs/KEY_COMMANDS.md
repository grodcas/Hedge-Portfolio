# Key Commands Reference

## Worker Deployment

```bash
wrangler deploy src/worker.js --config wrangler.jsonc
```

---

## Workflow Endpoints (job-engine-workflow)

Base URL: `https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run`

### Master Endpoint

Runs everything: daily_news for all tickers, daily_macro, trend_beta, macro_news.

```bash
# Daily Update (all tickers)
curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run \
  -H "Content-Type: application/json" \
  -d '{"action":"daily_update"}'

# Daily Update (specific date)
curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run \
  -H "Content-Type: application/json" \
  -d '{"action":"daily_update","date":"2026-02-05"}'
```

---

### Alpha Orchestrators (Direct Execution)

```bash
# Trend (single ticker)
curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run \
  -H "Content-Type: application/json" \
  -d '{"action":"trend","ticker":"NVDA"}'

# Report (single ticker)
curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run \
  -H "Content-Type: application/json" \
  -d '{"action":"report","ticker":"NVDA"}'
```

---

### Alpha Orchestrators (Queued Execution)

```bash
# Daily News (all 25 tickers)
curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run \
  -H "Content-Type: application/json" \
  -d '{"action":"daily_news"}'

# Daily News (single ticker)
curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run \
  -H "Content-Type: application/json" \
  -d '{"action":"daily_news","ticker":"AAPL"}'
```

---

### Beta Orchestrators (Direct Execution)

```bash
# Gen (macro + sentiment synthesis)
curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run \
  -H "Content-Type: application/json" \
  -d '{"action":"gen"}'

# Trend Beta
curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run \
  -H "Content-Type: application/json" \
  -d '{"action":"trend_beta"}'
```

---

### Beta Orchestrators (Queued Execution)

```bash
# Daily Macro (macro + sentiment daily summary)
curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run \
  -H "Content-Type: application/json" \
  -d '{"action":"daily_macro"}'

# Macro News (market news summary)
curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run \
  -H "Content-Type: application/json" \
  -d '{"action":"macro_news"}'

# Macro News (specific date)
curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run \
  -H "Content-Type: application/json" \
  -d '{"action":"macro_news","date":"2026-02-05"}'
```

---

## Actions Summary

| Action | Type | Description |
|--------|------|-------------|
| `daily_update` | QUEUED | Master: runs daily_news + daily_macro + trend_beta + macro_news |
| `daily_news` | QUEUED | News summary for all/single ticker |
| `daily_macro` | QUEUED | Daily macro indicators summary |
| `macro_news` | QUEUED | Market news summary |
| `report` | DIRECT | Report processing for ticker |
| `trend` | DIRECT | Alpha trend for ticker |
| `gen` | DIRECT | Gen synthesis (macro + sentiment) |
| `trend_beta` | DIRECT | Beta trend synthesis |

---

## Portfolio Tickers (25)

```
AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, BRK, JPM, GS,
BAC, XOM, CVX, UNH, LLY, JNJ, PG, KO, HD, CAT, BA, INTC,
AMD, NFLX, MS
```

---

## Local Commands

```bash
# Run full pipeline
npm run pipeline

# Run validation only
npm run validate

# Run fact verification
npm run verify

# Start dashboard (port 4200)
npm run dashboard
```

---

*Last updated: 2026-02-25*
