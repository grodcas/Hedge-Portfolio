// dashboard/server.js - Local dashboard server (D1 DATABASE ONLY - NO LOCAL FILES)
import "dotenv/config";
import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import open from "open";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4200;

// Worker API base URL - ALL DATA COMES FROM HERE
const WORKER_API = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

// Helper to fetch from worker - throws error if fails (NO FALLBACK)
async function fetchFromWorker(endpoint) {
  const url = `${WORKER_API}${endpoint}`;
  console.log(`[D1] Fetching: ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`D1 API Error (${res.status}): ${errorText}`);
  }
  return await res.json();
}

// Helper to handle D1 fetch errors consistently
function handleD1Error(res, endpoint, error) {
  console.error(`[D1 ERROR] ${endpoint}: ${error.message}`);
  res.status(503).json({
    error: `Database unavailable: ${error.message}`,
    endpoint,
    source: "D1",
    hint: "Ensure the pipeline has been run to populate the database"
  });
}

app.use(express.json());
app.use(express.static(__dirname));

// ============ API ENDPOINTS (ALL FROM D1 DATABASE) ============

// Get list of available dates from pipeline logs
app.get("/api/dates", async (req, res) => {
  try {
    // The D1 database stores data with dates - we fetch pipeline validation to get available dates
    // Current limitation: D1 doesn't have a dedicated "list all dates" endpoint
    // So we return the current date and any date from pipeline validation
    const data = await fetchFromWorker("/query/pipeline-validation");

    let dates = [];
    if (data.date) {
      dates.push(data.date);
    }

    // Also try to get today's date if different
    const today = new Date().toISOString().slice(0, 10);
    if (!dates.includes(today)) {
      dates.push(today);
    }

    // Sort descending (most recent first)
    dates = [...new Set(dates)].sort().reverse();

    res.json({ dates, source: "D1", note: "Dates with pipeline data" });
  } catch (error) {
    // Return today's date - data may not exist yet
    const today = new Date().toISOString().slice(0, 10);
    res.json({
      dates: [today],
      source: "D1",
      note: "Run pipeline to populate data",
      error: error.message
    });
  }
});

// Get validation data for a specific date
app.get("/api/validation/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const data = await fetchFromWorker(`/query/pipeline-validation?date=${date}`);

    if (!data || (!data.summary && !data.validations)) {
      return res.status(404).json({
        error: "No validation data for this date",
        date,
        source: "D1"
      });
    }

    res.json({ ...data, source: "D1" });
  } catch (error) {
    handleD1Error(res, `/api/validation/${req.params.date}`, error);
  }
});

// Get macro data from D1
app.get("/api/macro/:date", async (req, res) => {
  try {
    const data = await fetchFromWorker("/query/macro");

    if (!data || !data.Macro || data.Macro.length === 0) {
      return res.status(404).json({
        error: "No macro data available",
        source: "D1",
        hint: "Run the pipeline to ingest macro data"
      });
    }

    res.json({ ...data, source: "D1" });
  } catch (error) {
    handleD1Error(res, `/api/macro/${req.params.date}`, error);
  }
});

// Get sentiment data from D1
app.get("/api/sentiment/:date", async (req, res) => {
  try {
    const data = await fetchFromWorker("/query/sentiment");

    if (!data || !data.Sentiment || data.Sentiment.length === 0) {
      return res.status(404).json({
        error: "No sentiment data available",
        source: "D1",
        hint: "Run the pipeline to ingest sentiment data"
      });
    }

    res.json({ ...data, source: "D1" });
  } catch (error) {
    handleD1Error(res, `/api/sentiment/${req.params.date}`, error);
  }
});

// Get news data from D1
app.get("/api/news/:date", async (req, res) => {
  try {
    const data = await fetchFromWorker("/query/news");

    if (!data || Object.keys(data).length === 0) {
      return res.status(404).json({
        error: "No news data available",
        source: "D1",
        hint: "Run the pipeline to ingest news data"
      });
    }

    res.json({ ...data, source: "D1" });
  } catch (error) {
    handleD1Error(res, `/api/news/${req.params.date}`, error);
  }
});

// Get press releases from D1
app.get("/api/press/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const data = await fetchFromWorker(`/query/press?date=${date}`);

    if (!data || Object.keys(data).length === 0) {
      return res.status(404).json({
        error: "No press data available for this date",
        date,
        source: "D1",
        hint: "Run the pipeline to ingest press releases"
      });
    }

    res.json({ ...data, source: "D1" });
  } catch (error) {
    handleD1Error(res, `/api/press/${req.params.date}`, error);
  }
});

// Get whitehouse data from D1
app.get("/api/whitehouse/:date", async (req, res) => {
  try {
    const data = await fetchFromWorker("/query/whitehouse");

    if (!data || !data.WhiteHouse || data.WhiteHouse.length === 0) {
      return res.status(404).json({
        error: "No whitehouse data available",
        source: "D1",
        hint: "Run the pipeline to ingest whitehouse data"
      });
    }

    res.json({ ...data, source: "D1" });
  } catch (error) {
    handleD1Error(res, `/api/whitehouse/${req.params.date}`, error);
  }
});

// Get daily macro from D1 (BETA_10_Daily_macro)
app.get("/api/daily-macro/:date", async (req, res) => {
  try {
    const data = await fetchFromWorker("/query/daily-macro");

    if (!data || !data.summary) {
      return res.status(404).json({
        error: "No daily macro summary available",
        source: "D1",
        hint: "Run the daily-macro-summarizer worker to generate"
      });
    }

    res.json({ ...data, source: "D1" });
  } catch (error) {
    handleD1Error(res, `/api/daily-macro/${req.params.date}`, error);
  }
});

// Get daily news from D1 (ALPHA_05_Daily_news)
app.get("/api/daily-news/:date", async (req, res) => {
  try {
    const data = await fetchFromWorker("/query/daily-news");

    if (!data || Object.keys(data).length === 0) {
      return res.status(404).json({
        error: "No daily news available",
        source: "D1",
        hint: "Run the pipeline to populate daily news"
      });
    }

    res.json({ ...data, source: "D1" });
  } catch (error) {
    handleD1Error(res, `/api/daily-news/${req.params.date}`, error);
  }
});

// Get macro trend from D1 (BETA_09_Trend)
app.get("/api/macro-trend/:date", async (req, res) => {
  try {
    const data = await fetchFromWorker("/query/macro-trend");

    if (!data || !data.summary) {
      return res.status(404).json({
        error: "No macro trend available",
        source: "D1",
        hint: "Run the beta-trend-builder worker to generate"
      });
    }

    res.json({ ...data, source: "D1" });
  } catch (error) {
    handleD1Error(res, `/api/macro-trend/${req.params.date}`, error);
  }
});

// Get ticker trends from D1 (ALPHA_04_Trends)
app.get("/api/ticker-trends", async (req, res) => {
  try {
    const data = await fetchFromWorker("/query/ticker-trends");

    if (!data || Object.keys(data).length === 0) {
      return res.status(404).json({
        error: "No ticker trends available",
        source: "D1",
        hint: "Run the pipeline to populate ticker trends"
      });
    }

    res.json({ ...data, source: "D1" });
  } catch (error) {
    handleD1Error(res, "/api/ticker-trends", error);
  }
});

// Get reports from D1 (ALPHA_01_REPORTS)
app.get("/api/reports/:ticker", async (req, res) => {
  try {
    const { ticker } = req.params;
    const data = await fetchFromWorker(`/query/reports?ticker=${ticker}`);

    if (!data || !data[ticker]) {
      return res.status(404).json({
        error: `No reports available for ${ticker}`,
        source: "D1",
        hint: "Run the pipeline to ingest SEC filings"
      });
    }

    res.json({ ...data[ticker], source: "D1" });
  } catch (error) {
    handleD1Error(res, `/api/reports/${req.params.ticker}`, error);
  }
});

// Get earnings calendar from D1 (inferred from ALPHA_01_Reports)
app.get("/api/earnings-calendar", async (req, res) => {
  try {
    const data = await fetchFromWorker("/query/earnings-calendar");

    if (!data || Object.keys(data).length === 0) {
      return res.status(404).json({
        error: "No earnings calendar available",
        source: "D1",
        hint: "Earnings calendar is inferred from SEC filings"
      });
    }

    res.json({ ...data, source: "D1" });
  } catch (error) {
    handleD1Error(res, "/api/earnings-calendar", error);
  }
});

// Get FOMC calendar - this can be static since FOMC dates are public
app.get("/api/fomc-calendar", (req, res) => {
  // FOMC dates are public and pre-announced
  res.json({
    nextFOMC: { date: "2026-03-18", type: "Meeting" },
    upcoming: [
      { date: "2026-03-18", type: "Meeting" },
      { date: "2026-05-06", type: "Meeting" },
      { date: "2026-06-17", type: "Meeting" },
      { date: "2026-07-29", type: "Meeting" }
    ],
    source: "static"
  });
});

// ============ MAIN DASHBOARD ENDPOINT (ALL DATA FROM D1) ============

app.get("/api/dashboard/:date", async (req, res) => {
  const { date } = req.params;
  console.log(`[Dashboard] Loading data for ${date} from D1...`);

  const result = {
    date,
    source: "D1",
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
    verification_ai: null,
    errors: [] // Track any fetch errors
  };

  // Fetch all data from D1 in parallel
  const fetches = [
    // 1. Pipeline validation
    fetchFromWorker(`/query/pipeline-validation?date=${date}`)
      .then(data => {
        if (data && (data.summary || data.validations)) {
          result.validation = {
            summary: data.summary,
            validations: data.validations,
            logs: data.logs,
            logFile: `D1:${date}`
          };
          console.log(`[D1] Loaded pipeline validation`);
        }
      })
      .catch(err => {
        result.errors.push({ endpoint: "pipeline-validation", error: err.message });
        console.error(`[D1 ERROR] pipeline-validation: ${err.message}`);
      }),

    // 2. Combined data (macro, sentiment, trends, etc.)
    fetchFromWorker("/query/all")
      .then(data => {
        if (data) {
          result.dailyMacro = data.dailyMacro || null;
          result.macroTrend = data.macroTrend || null;
          result.tickerTrends = data.tickerTrends || {};
          result.dailyNews = data.dailyNews || {};
          if (data.macro) result.macro = data.macro;
          if (data.sentiment) result.sentiment = data.sentiment;
          console.log("[D1] Loaded combined data");
        }
      })
      .catch(err => {
        result.errors.push({ endpoint: "all", error: err.message });
        console.error(`[D1 ERROR] all: ${err.message}`);
      }),

    // 3. Press releases
    fetchFromWorker(`/query/press?date=${date}`)
      .then(data => {
        if (data && Object.keys(data).length > 0) {
          result.press = data;
          console.log(`[D1] Loaded ${Object.keys(data).length} tickers press`);
        }
      })
      .catch(err => {
        result.errors.push({ endpoint: "press", error: err.message });
        console.error(`[D1 ERROR] press: ${err.message}`);
      }),

    // 4. Whitehouse
    fetchFromWorker("/query/whitehouse")
      .then(data => {
        if (data && data.WhiteHouse) {
          result.whitehouse = data;
          console.log(`[D1] Loaded ${data.WhiteHouse.length} whitehouse items`);
        }
      })
      .catch(err => {
        result.errors.push({ endpoint: "whitehouse", error: err.message });
        console.error(`[D1 ERROR] whitehouse: ${err.message}`);
      }),

    // 5. News
    fetchFromWorker("/query/news")
      .then(data => {
        if (data && Object.keys(data).length > 0) {
          result.news = data;
          console.log(`[D1] Loaded news`);
        }
      })
      .catch(err => {
        result.errors.push({ endpoint: "news", error: err.message });
        console.error(`[D1 ERROR] news: ${err.message}`);
      }),

    // 6. AI verification
    fetchFromWorker(`/query/verification?date=${date}`)
      .then(data => {
        if (data && data.results) {
          result.verification_ai = data;
          console.log(`[D1] Loaded ${data.results.length} AI verification results`);
        }
      })
      .catch(err => {
        result.errors.push({ endpoint: "verification", error: err.message });
        console.error(`[D1 ERROR] verification: ${err.message}`);
      }),

    // 7. Reports
    fetchFromWorker("/query/reports")
      .then(data => {
        if (data && Object.keys(data).length > 0) {
          result.reports = data;
          console.log(`[D1] Loaded reports for ${Object.keys(data).length} tickers`);
        }
      })
      .catch(err => {
        result.errors.push({ endpoint: "reports", error: err.message });
        console.error(`[D1 ERROR] reports: ${err.message}`);
      }),

    // 8. Earnings calendar
    fetchFromWorker("/query/earnings-calendar")
      .then(data => {
        if (data) {
          result.earningsCalendar = data;
          console.log(`[D1] Loaded earnings calendar`);
        }
      })
      .catch(err => {
        result.errors.push({ endpoint: "earnings-calendar", error: err.message });
        console.error(`[D1 ERROR] earnings-calendar: ${err.message}`);
      })
  ];

  // Wait for all fetches to complete
  await Promise.all(fetches);

  // Check if we got any data at all
  const hasData = result.validation || result.macro || result.press ||
                  result.news || result.dailyMacro || Object.keys(result.tickerTrends).length > 0;

  if (!hasData && result.errors.length > 0) {
    console.error(`[Dashboard] NO DATA AVAILABLE - All D1 fetches failed`);
    return res.status(503).json({
      error: "Database unavailable or empty",
      date,
      errors: result.errors,
      hint: "Run the pipeline to populate the database with data"
    });
  }

  // Log summary
  console.log(`[Dashboard] Loaded for ${date}: validation=${!!result.validation}, macro=${!!result.macro}, press=${!!result.press}, news=${!!result.news}, verification=${!!result.verification_ai}`);
  if (result.errors.length > 0) {
    console.log(`[Dashboard] Partial errors: ${result.errors.map(e => e.endpoint).join(', ')}`);
  }

  res.json(result);
});

// ============ AI CONTENT VALIDATION ENDPOINTS ============

// Get validation targets (static list of what can be validated)
app.get("/api/content-validation/targets", (req, res) => {
  res.json({
    targets: [
      { type: "daily-macro", name: "Daily Macro Summary" },
      { type: "macro-trend", name: "Weekly Macro Trend" },
      { type: "ticker-trend", name: "Ticker Trends", perTicker: true },
      { type: "report", name: "SEC Reports", perTicker: true },
      { type: "daily-news", name: "Daily News", perTicker: true }
    ],
    source: "static"
  });
});

// Validate specific content using AI
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

// Validate content from D1 data
app.post("/api/content-validation/validate-local", async (req, res) => {
  try {
    const { validateContent } = await import("../validation/agents/content_validator.js");
    const { targetType, ticker, useAI } = req.body;

    let summary = "";
    let sources = [];
    let summaryId = "";

    // Fetch data from D1 based on target type
    if (targetType === "ticker-trend" && ticker) {
      const trends = await fetchFromWorker("/query/ticker-trends");
      if (trends[ticker]) {
        summary = trends[ticker].summary;
        summaryId = `trend-${ticker}`;
      }

      const reports = await fetchFromWorker(`/query/reports?ticker=${ticker}`);
      if (reports[ticker]) {
        const tickerReports = Array.isArray(reports[ticker]) ? reports[ticker] : [reports[ticker]];
        sources = tickerReports.slice(0, 4).map((r, i) => ({
          id: `report-${ticker}-${i}`,
          text: r.summary || r.text || JSON.stringify(r)
        }));
      }
    } else if (targetType === "daily-macro") {
      const macro = await fetchFromWorker("/query/daily-macro");
      if (macro) {
        summary = macro.summary;
        summaryId = macro.id || "daily-macro";
        if (macro.structure) {
          sources = macro.structure.map((s, i) => ({
            id: `macro-${s.type}-${i}`,
            text: `${s.type}: ${s.value || s.date || JSON.stringify(s)}`
          }));
        }
      }
    } else if (targetType === "macro-trend") {
      const trend = await fetchFromWorker("/query/macro-trend");
      if (trend) {
        summary = trend.summary;
        summaryId = trend.id || "macro-trend";
      }
    }

    if (!summary) {
      return res.status(404).json({
        error: `No data found for ${targetType}${ticker ? ` / ${ticker}` : ""}`,
        source: "D1"
      });
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

// Get latest validation results from D1
app.get("/api/content-validation/results", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const data = await fetchFromWorker(`/query/verification?date=${today}`);

    if (data && data.results) {
      res.json({
        results: data.results,
        summary: {
          totalSummaries: data.results.length,
          verified: data.results.filter(r => r.score >= 80).length,
          contradicted: data.results.filter(r => r.score < 80).length,
          verificationRate: data.results.length > 0
            ? Math.round(data.results.reduce((sum, r) => sum + (r.score || 0), 0) / data.results.length)
            : 0
        },
        lastRun: data.date || today,
        source: "D1"
      });
    } else {
      res.json({
        results: [],
        lastRun: null,
        source: "D1",
        note: "No verification results in database"
      });
    }
  } catch (error) {
    handleD1Error(res, "/api/content-validation/results", error);
  }
});

// Save validation results - POST to D1
app.post("/api/content-validation/save", async (req, res) => {
  try {
    const { results } = req.body;

    // Post to D1 via worker
    const response = await fetch(`${WORKER_API}/ingest/verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results })
    });

    if (!response.ok) {
      throw new Error(`Failed to save to D1: ${response.status}`);
    }

    const data = await response.json();
    res.json({ success: true, ...data, source: "D1" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Open URLs for monthly check (client-side action)
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

// Run validation check (triggers pipeline validation)
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

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  Dashboard running at http://localhost:${PORT}`);
  console.log(`  Data source: D1 DATABASE ONLY`);
  console.log(`  Worker API: ${WORKER_API}`);
  console.log(`========================================\n`);
  console.log("Press Ctrl+C to stop");
});
