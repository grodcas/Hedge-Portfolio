# ===== CONFIG =====
$BaseDir = "cloudflare-workers"
$Workers = @(
  "trend-builder",
  "trend-orchestrator",
  "job-engine-workflow",
  "gen-orchestrator",
  "sentiment-summarizer",
  "macro-summarizer",
  "job-cron",
  "beta-trend-orchestrator",
  "beta-trend-builder",
  "gen-builder",
  "macro-news-summarizer",
  "portfolio-ingestor",
  "news-summarizer",
  "news-orchestrator",
  "report-orchestrator",
  "8k-summarizer",
  "form4-summarizer",
  "qk-report-summarizer",
  "qk-structure-builder",
  "qk-summarizer",
  "from48-summarizer"
)

# ===== SCRIPT =====


foreach ($worker in $Workers) {
  Write-Host "`n=== Bootstrapping $worker ===" -ForegroundColor Cyan

  if (Test-Path $worker) {
    Write-Host "Skipping $worker (already exists)" -ForegroundColor Yellow
    continue
  }

  npx create-cloudflare@latest $worker --existing-script $worker

  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: $worker" -ForegroundColor Red
    continue
  }

  Write-Host "OK: $worker downloaded" -ForegroundColor Green
}

Write-Host "`nAll done." -ForegroundColor Green
