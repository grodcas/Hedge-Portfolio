// dashboard/server.js - Local dashboard server
import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import open from "open";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");

const app = express();
const PORT = 4200;

// Worker API base URL
const WORKER_API = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

// Helper to fetch from worker with fallback to local files
async function fetchFromWorker(endpoint) {
  try {
    const res = await fetch(`${WORKER_API}${endpoint}`);
    if (!res.ok) throw new Error(`Worker returned ${res.status}`);
    return await res.json();
  } catch (err) {
    console.log(`Worker fetch failed for ${endpoint}: ${err.message}`);
    return null;
  }
}

app.use(express.json());
app.use(express.static(__dirname));

// ============ API ENDPOINTS ============

// Get list of available log dates
app.get("/api/dates", (req, res) => {
  const logDir = path.join(ROOT_DIR, "logs");
  if (!fs.existsSync(logDir)) {
    return res.json({ dates: [] });
  }

  const files = fs.readdirSync(logDir)
    .filter(f => f.startsWith("ingest_") && f.endsWith(".json"))
    .map(f => {
      const match = f.match(/ingest_(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : null;
    })
    .filter(Boolean)
    .sort()
    .reverse();

  const uniqueDates = [...new Set(files)];
  res.json({ dates: uniqueDates });
});

// Get validation data for a specific date
app.get("/api/validation/:date", (req, res) => {
  const { date } = req.params;
  const logDir = path.join(ROOT_DIR, "logs");

  const files = fs.readdirSync(logDir)
    .filter(f => f.startsWith(`ingest_${date}`) && f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    return res.status(404).json({ error: "No data for this date" });
  }

  const data = JSON.parse(fs.readFileSync(path.join(logDir, files[0]), "utf8"));
  res.json(data);
});

// Get macro summary
app.get("/api/macro/:date", (req, res) => {
  const macroPath = path.join(ROOT_DIR, "macro/macro_summary.json");
  if (!fs.existsSync(macroPath)) {
    return res.status(404).json({ error: "Macro data not found" });
  }

  const data = JSON.parse(fs.readFileSync(macroPath, "utf8"));
  res.json(data);
});

// Get sentiment summary
app.get("/api/sentiment/:date", (req, res) => {
  const sentPath = path.join(ROOT_DIR, "sentiment/sentiment_summary.json");
  if (!fs.existsSync(sentPath)) {
    return res.status(404).json({ error: "Sentiment data not found" });
  }

  const data = JSON.parse(fs.readFileSync(sentPath, "utf8"));
  res.json(data);
});

// Get news summary
app.get("/api/news/:date", (req, res) => {
  const newsPath = path.join(ROOT_DIR, "news/news_summary.json");
  if (!fs.existsSync(newsPath)) {
    return res.status(404).json({ error: "News data not found" });
  }

  const data = JSON.parse(fs.readFileSync(newsPath, "utf8"));
  res.json(data);
});

// Get press releases
app.get("/api/press/:date", (req, res) => {
  const pressPath = path.join(ROOT_DIR, "press/AA_press_summary.json");
  if (!fs.existsSync(pressPath)) {
    return res.status(404).json({ error: "Press data not found" });
  }

  const data = JSON.parse(fs.readFileSync(pressPath, "utf8"));
  res.json(data);
});

// Get whitehouse news
app.get("/api/whitehouse/:date", (req, res) => {
  const whPath = path.join(ROOT_DIR, "whitehouse/whitehouse_summary.json");
  if (!fs.existsSync(whPath)) {
    return res.status(404).json({ error: "Whitehouse data not found" });
  }

  const data = JSON.parse(fs.readFileSync(whPath, "utf8"));
  res.json(data);
});

// ============ NEW: Daily Macro (BETA_10_Daily_macro) ============
app.get("/api/daily-macro/:date", (req, res) => {
  // Try to load from local cache first
  const dailyMacroPath = path.join(ROOT_DIR, "data/daily_macro.json");
  if (fs.existsSync(dailyMacroPath)) {
    const data = JSON.parse(fs.readFileSync(dailyMacroPath, "utf8"));
    return res.json(data);
  }

  // Return mock data structure matching BETA_10_Daily_macro schema
  res.json({
    id: `daily-macro-${req.params.date}`,
    creation_date: req.params.date,
    structure: [
      { type: "CPI", date: req.params.date, source: "BLS" },
      { type: "Employment", date: req.params.date, source: "BLS" }
    ],
    summary: "No daily macro summary cached locally. Connect to Cloudflare D1 to fetch BETA_10_Daily_macro data."
  });
});

// ============ NEW: Daily News per Ticker (ALPHA_05_Daily_news) ============
app.get("/api/daily-news/:date", (req, res) => {
  const dailyNewsPath = path.join(ROOT_DIR, "data/daily_news.json");
  if (fs.existsSync(dailyNewsPath)) {
    const data = JSON.parse(fs.readFileSync(dailyNewsPath, "utf8"));
    return res.json(data);
  }

  // Return empty structure - will be populated from D1
  res.json({});
});

// ============ NEW: Macro Trend (BETA_09_Trend) ============
app.get("/api/macro-trend/:date", (req, res) => {
  const macroTrendPath = path.join(ROOT_DIR, "data/macro_trend.json");
  if (fs.existsSync(macroTrendPath)) {
    const data = JSON.parse(fs.readFileSync(macroTrendPath, "utf8"));
    return res.json(data);
  }

  res.json({
    id: `trend-${req.params.date}`,
    date: req.params.date,
    summary: "No weekly macro trend cached locally. Connect to Cloudflare D1 to fetch BETA_09_Trend data."
  });
});

// ============ NEW: Ticker Trends (ALPHA_04_Trends) ============
app.get("/api/ticker-trends", (req, res) => {
  const trendsPath = path.join(ROOT_DIR, "data/ticker_trends.json");
  if (fs.existsSync(trendsPath)) {
    const data = JSON.parse(fs.readFileSync(trendsPath, "utf8"));
    return res.json(data);
  }

  // Return empty structure - will be populated from D1
  res.json({});
});

// ============ NEW: Reports (ALPHA_01_REPORTS) ============
app.get("/api/reports/:ticker", (req, res) => {
  const reportsPath = path.join(ROOT_DIR, "data/reports.json");
  if (fs.existsSync(reportsPath)) {
    const data = JSON.parse(fs.readFileSync(reportsPath, "utf8"));
    const tickerReports = data[req.params.ticker];
    if (tickerReports) {
      return res.json(tickerReports);
    }
  }

  res.json({ summary: "No report data cached locally." });
});

// ============ NEW: Earnings Calendar ============
app.get("/api/earnings-calendar", (req, res) => {
  const calPath = path.join(ROOT_DIR, "data/earnings_calendar.json");
  if (fs.existsSync(calPath)) {
    const data = JSON.parse(fs.readFileSync(calPath, "utf8"));
    return res.json(data);
  }

  // Return estimated earnings dates
  res.json({
    AAPL: { nextEarnings: "2026-04-30", type: "10-Q" },
    MSFT: { nextEarnings: "2026-04-22", type: "10-Q" },
    GOOGL: { nextEarnings: "2026-04-25", type: "10-Q" },
    AMZN: { nextEarnings: "2026-04-28", type: "10-Q" },
    NVDA: { nextEarnings: "2026-05-21", type: "10-Q" },
    META: { nextEarnings: "2026-04-23", type: "10-Q" },
    TSLA: { nextEarnings: "2026-04-19", type: "10-Q" },
    "BRK.B": { nextEarnings: "2026-05-03", type: "10-Q" },
    JPM: { nextEarnings: "2026-04-11", type: "10-Q" },
    GS: { nextEarnings: "2026-04-14", type: "10-Q" },
    BAC: { nextEarnings: "2026-04-15", type: "10-Q" },
    XOM: { nextEarnings: "2026-04-25", type: "10-Q" },
    CVX: { nextEarnings: "2026-04-25", type: "10-Q" },
    UNH: { nextEarnings: "2026-04-15", type: "10-Q" },
    LLY: { nextEarnings: "2026-04-24", type: "10-Q" },
    JNJ: { nextEarnings: "2026-04-15", type: "10-Q" },
    PG: { nextEarnings: "2026-04-18", type: "10-Q" },
    KO: { nextEarnings: "2026-04-22", type: "10-Q" },
    HD: { nextEarnings: "2026-05-13", type: "10-Q" },
    CAT: { nextEarnings: "2026-04-24", type: "10-Q" },
    BA: { nextEarnings: "2026-04-23", type: "10-Q" },
    INTC: { nextEarnings: "2026-04-24", type: "10-Q" },
    AMD: { nextEarnings: "2026-04-29", type: "10-Q" },
    NFLX: { nextEarnings: "2026-04-17", type: "10-Q" },
    MS: { nextEarnings: "2026-04-16", type: "10-Q" }
  });
});

// ============ NEW: FOMC Calendar ============
app.get("/api/fomc-calendar", (req, res) => {
  res.json({
    nextFOMC: {
      date: "2026-03-18",
      type: "Meeting"
    },
    upcoming: [
      { date: "2026-03-18", type: "Meeting" },
      { date: "2026-05-06", type: "Meeting" },
      { date: "2026-06-17", type: "Meeting" },
      { date: "2026-07-29", type: "Meeting" }
    ]
  });
});

// Get all data for dashboard (combined endpoint) - ALL DATA FROM D1
app.get("/api/dashboard/:date", async (req, res) => {
  const { date } = req.params;

  const result = {
    date,
    validation: null,
    macro: null,
    sentiment: null,
    news: null,
    press: null,
    whitehouse: null,
    dailyMacro: null,
    dailyNews: {},
    macroTrend: null,
    tickerTrends: {},
    reports: {},
    earningsCalendar: {},
    calendar: { nextFOMC: { date: "2026-03-18" } },
    verification_ai: null
  };

  // FETCH ALL DATA FROM D1 DATABASE

  // 1. Fetch validation/pipeline logs from D1
  const pipelineData = await fetchFromWorker(`/query/pipeline-validation?date=${date}`);
  if (pipelineData && pipelineData.summary) {
    result.validation = {
      summary: pipelineData.summary,
      validations: pipelineData.validations,
      logs: pipelineData.logs,
      logFile: `D1:${date}`
    };
    console.log(`[Dashboard] Loaded pipeline validation from D1`);
  }

  // 2. Fetch combined data (macro, sentiment, trends, etc.)
  const workerData = await fetchFromWorker("/query/all");
  if (workerData) {
    result.dailyMacro = workerData.dailyMacro;
    result.macroTrend = workerData.macroTrend;
    result.tickerTrends = workerData.tickerTrends || {};
    result.dailyNews = workerData.dailyNews || {};
    if (workerData.macro) result.macro = workerData.macro;
    if (workerData.sentiment) result.sentiment = workerData.sentiment;
    console.log("[Dashboard] Loaded combined data from D1");
  }

  // 3. Fetch press releases from D1
  const pressData = await fetchFromWorker(`/query/press?date=${date}`);
  if (pressData && Object.keys(pressData).length > 0) {
    result.press = pressData;
    console.log(`[Dashboard] Loaded ${Object.keys(pressData).length} tickers press from D1`);
  }

  // 4. Fetch whitehouse from D1
  const whData = await fetchFromWorker("/query/whitehouse");
  if (whData && whData.WhiteHouse) {
    result.whitehouse = whData;
    console.log(`[Dashboard] Loaded ${whData.WhiteHouse.length} whitehouse items from D1`);
  }

  // 5. Fetch news from D1
  const newsData = await fetchFromWorker("/query/news");
  if (newsData && Object.keys(newsData).length > 0) {
    result.news = newsData;
    console.log(`[Dashboard] Loaded news from D1`);
  }

  // 6. Fetch AI verification from D1
  const verificationData = await fetchFromWorker(`/query/verification?date=${date}`);
  if (verificationData && verificationData.results) {
    result.verification_ai = verificationData;
    console.log(`[Dashboard] Loaded ${verificationData.results.length} AI verification results from D1`);
  }

  // 7. Fetch reports from D1
  const reportsData = await fetchFromWorker("/query/reports");
  if (reportsData && Object.keys(reportsData).length > 0) {
    result.reports = reportsData;
  }

  // 8. Fetch earnings calendar from D1
  const calendarData = await fetchFromWorker("/query/earnings-calendar");
  if (calendarData) {
    result.earningsCalendar = calendarData;
  }

  // FALLBACK: Only if D1 is completely unavailable, use local files
  if (!result.validation && !result.macro) {
    console.log("[Dashboard] D1 unavailable, falling back to local files");

    // Load validation from local log
    const logDir = path.join(ROOT_DIR, "logs");
    if (fs.existsSync(logDir)) {
      const files = fs.readdirSync(logDir)
        .filter(f => f.startsWith(`ingest_${date}`) && f.endsWith(".json"))
        .sort()
        .reverse();

      if (files.length > 0) {
        result.validation = JSON.parse(fs.readFileSync(path.join(logDir, files[0]), "utf8"));
      }
    }

    // Load from local summary files
    const localPaths = {
      macro: "macro/macro_summary.json",
      sentiment: "sentiment/sentiment_summary.json",
      news: "news/news_summary.json",
      press: "press/AA_press_summary.json",
      whitehouse: "whitehouse/whitehouse_summary.json"
    };

    for (const [key, relPath] of Object.entries(localPaths)) {
      if (!result[key]) {
        const fullPath = path.join(ROOT_DIR, relPath);
        if (fs.existsSync(fullPath)) {
          try {
            result[key] = JSON.parse(fs.readFileSync(fullPath, "utf8"));
          } catch (err) {}
        }
      }
    }
  }

  res.json(result);
});

// Run validation check
app.post("/api/run-validation", async (req, res) => {
  try {
    const { runValidation } = await import("../validation/runner.js");
    const results = await runValidation({
      useAI: true,
      skipPress: false,
      skipNews: true
    });
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ AI CONTENT VALIDATION (Phase 4) ============

// Get validation targets (what can be validated)
app.get("/api/content-validation/targets", async (req, res) => {
  try {
    const { getValidationTargets } = await import("../validation/agents/content_validator.js");
    res.json({ targets: getValidationTargets() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validate specific content
app.post("/api/content-validation/validate", async (req, res) => {
  try {
    const { validateContent } = await import("../validation/agents/content_validator.js");
    const { summary, summaryId, summaryType, sources, useAI } = req.body;

    if (!summary) {
      return res.status(400).json({ error: "Summary text required" });
    }

    const result = await validateContent({
      summary,
      summaryId: summaryId || `manual-${Date.now()}`,
      summaryType: summaryType || "general",
      sources: sources || [],
      useAI: useAI !== false
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validate content from local data files
app.post("/api/content-validation/validate-local", async (req, res) => {
  try {
    const { validateContent } = await import("../validation/agents/content_validator.js");
    const { targetType, ticker, useAI } = req.body;

    // Load data based on target type
    let summary = "";
    let sources = [];
    let summaryId = "";

    if (targetType === "ticker-trend" && ticker) {
      // Load ticker trend from data/ticker_trends.json
      const trendsPath = path.join(ROOT_DIR, "data/ticker_trends.json");
      if (fs.existsSync(trendsPath)) {
        const trends = JSON.parse(fs.readFileSync(trendsPath, "utf8"));
        if (trends[ticker]) {
          summary = trends[ticker].summary;
          summaryId = `trend-${ticker}`;
        }
      }

      // Load reports as sources from data/reports.json
      const reportsPath = path.join(ROOT_DIR, "data/reports.json");
      if (fs.existsSync(reportsPath)) {
        const reports = JSON.parse(fs.readFileSync(reportsPath, "utf8"));
        if (reports[ticker]) {
          const tickerReports = Array.isArray(reports[ticker]) ? reports[ticker] : [reports[ticker]];
          sources = tickerReports.slice(0, 4).map((r, i) => ({
            id: `report-${ticker}-${i}`,
            text: r.summary || r.text || JSON.stringify(r)
          }));
        }
      }
    } else if (targetType === "daily-macro") {
      // Load daily macro summary
      const macroPath = path.join(ROOT_DIR, "data/daily_macro.json");
      if (fs.existsSync(macroPath)) {
        const macro = JSON.parse(fs.readFileSync(macroPath, "utf8"));
        summary = macro.summary;
        summaryId = macro.id || "daily-macro";
        // Source would be raw macro data
        if (macro.structure) {
          sources = macro.structure.map((s, i) => ({
            id: `macro-${s.type}-${i}`,
            text: `${s.type}: ${s.value || s.date || JSON.stringify(s)}`
          }));
        }
      }
    } else if (targetType === "macro-trend") {
      // Load macro trend summary
      const trendPath = path.join(ROOT_DIR, "data/macro_trend.json");
      if (fs.existsSync(trendPath)) {
        const trend = JSON.parse(fs.readFileSync(trendPath, "utf8"));
        summary = trend.summary;
        summaryId = trend.id || "macro-trend";
      }
    }

    if (!summary) {
      return res.status(404).json({ error: `No data found for ${targetType}${ticker ? ` / ${ticker}` : ""}` });
    }

    const result = await validateContent({
      summary,
      summaryId,
      summaryType: targetType,
      sources,
      useAI: useAI !== false
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get latest validation results (cached or from pipeline)
app.get("/api/content-validation/results", (req, res) => {
  // First try the manual results
  const resultsPath = path.join(ROOT_DIR, "data/validation_results.json");
  if (fs.existsSync(resultsPath)) {
    const data = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
    return res.json(data);
  }

  // Try to load from pipeline verification log (today's date)
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(ROOT_DIR, `logs/verification_${today}.json`);
  if (fs.existsSync(logPath)) {
    const pipelineData = JSON.parse(fs.readFileSync(logPath, "utf8"));
    return res.json({
      results: pipelineData.issues || [],
      summary: pipelineData,
      lastRun: today,
      source: "pipeline"
    });
  }

  res.json({ results: [], lastRun: null });
});

// Save validation results
app.post("/api/content-validation/save", (req, res) => {
  const { results } = req.body;
  const resultsPath = path.join(ROOT_DIR, "data/validation_results.json");

  const data = {
    results,
    lastRun: new Date().toISOString()
  };

  fs.writeFileSync(resultsPath, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

// Open URLs for monthly check
app.post("/api/open-urls", (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "URLs array required" });
  }

  const toOpen = urls.slice(0, 10);
  for (const url of toOpen) {
    open(url).catch(() => {});
  }

  res.json({ opened: toOpen.length });
});

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop");
});
