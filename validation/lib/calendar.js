// validation/lib/calendar.js - Economic and SEC calendar for validation
// Contains mockup SEC calendar (to be populated with real data later)

import fs from "fs";
import path from "path";

// Load macro calendar from existing file
function loadMacroCalendar() {
  try {
    const calendarPath = "C:\\AI_agent\\HF\\macro_calendar_2025.json";
    if (fs.existsSync(calendarPath)) {
      return JSON.parse(fs.readFileSync(calendarPath, "utf8"));
    }
  } catch (err) {
    console.error("Error loading macro calendar:", err.message);
  }

  // Fallback to inline calendar
  return [
    // FOMC
    { event: "FOMC Meeting", date: "2026-01-28", source: "Federal Reserve" },
    { event: "FOMC Meeting", date: "2026-03-18", source: "Federal Reserve" },
    { event: "FOMC Meeting", date: "2026-04-29", source: "Federal Reserve" },
    { event: "FOMC Meeting", date: "2026-06-17", source: "Federal Reserve" },

    // CPI
    { event: "CPI", date: "2026-01-13", source: "BLS" },
    { event: "CPI", date: "2026-02-11", source: "BLS" },
    { event: "CPI", date: "2026-02-21", source: "BLS" },  // Today for testing
    { event: "CPI", date: "2026-03-11", source: "BLS" },

    // PPI
    { event: "PPI", date: "2026-01-14", source: "BLS" },
    { event: "PPI", date: "2026-02-12", source: "BLS" },
    { event: "PPI", date: "2026-03-12", source: "BLS" },

    // Employment
    { event: "Employment Situation", date: "2026-01-09", source: "BLS" },
    { event: "Employment Situation", date: "2026-02-06", source: "BLS" },
    { event: "Employment Situation", date: "2026-03-06", source: "BLS" },

    // GDP
    { event: "GDP Advance", date: "2026-01-29", source: "BEA" },
    { event: "GDP Advance", date: "2026-04-30", source: "BEA" }
  ];
}

// SEC Filing Calendar (MOCKUP - to be replaced with real data)
// 10-K filings are due 60 days after fiscal year end for large accelerated filers
// 10-Q filings are due 40 days after quarter end
const SEC_CALENDAR_MOCKUP = [
  // Q4 2025 10-K filings (FY end Dec 31, due ~Feb 28)
  { ticker: "AAPL", type: "10-K", expectedDate: "2026-02-28", fiscalEnd: "2025-12-31" },
  { ticker: "MSFT", type: "10-Q", expectedDate: "2026-02-21", fiscalEnd: "2025-12-31" },  // Today for testing
  { ticker: "TSLA", type: "10-K", expectedDate: "2026-02-21", fiscalEnd: "2025-12-31" },  // Today for testing

  // Q1 2026 10-Q filings (quarter end Mar 31, due ~May 10)
  { ticker: "AAPL", type: "10-Q", expectedDate: "2026-05-10", fiscalEnd: "2026-03-31" },
  { ticker: "MSFT", type: "10-Q", expectedDate: "2026-05-10", fiscalEnd: "2026-03-31" },
  { ticker: "GOOGL", type: "10-Q", expectedDate: "2026-05-10", fiscalEnd: "2026-03-31" },

  // Add more as needed...
];

// AAII Sentiment Survey (every Thursday)
function getAAIIDates() {
  const dates = [];
  const start = new Date("2026-01-01");
  const end = new Date("2026-12-31");

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 4) { // Thursday
      dates.push({
        event: "AAII Sentiment",
        date: d.toISOString().slice(0, 10),
        source: "AAII"
      });
    }
  }
  return dates;
}

// COT Report (every Friday)
function getCOTDates() {
  const dates = [];
  const start = new Date("2026-01-01");
  const end = new Date("2026-12-31");

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 5) { // Friday
      dates.push({
        event: "COT Report",
        date: d.toISOString().slice(0, 10),
        source: "CFTC"
      });
    }
  }
  return dates;
}

/**
 * Get today's date in ISO format
 */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get calendar events for a specific date
 */
function getEventsForDate(date = null) {
  const targetDate = date || todayISO();
  const events = {
    macro: [],
    sec: [],
    sentiment: []
  };

  // Macro events
  const macroCalendar = loadMacroCalendar();
  for (const event of macroCalendar) {
    if (event.date === targetDate) {
      events.macro.push(event);
    }
  }

  // SEC events
  for (const filing of SEC_CALENDAR_MOCKUP) {
    if (filing.expectedDate === targetDate) {
      events.sec.push(filing);
    }
  }

  // Sentiment events (AAII on Thursday, COT on Friday)
  const dayOfWeek = new Date(targetDate).getDay();
  if (dayOfWeek === 4) {
    events.sentiment.push({ event: "AAII Sentiment", date: targetDate, source: "AAII" });
  }
  if (dayOfWeek === 5) {
    events.sentiment.push({ event: "COT Report", date: targetDate, source: "CFTC" });
  }

  return events;
}

/**
 * Check if a macro indicator has a release today
 */
function hasIndicatorRelease(indicator, date = null) {
  const targetDate = date || todayISO();
  const macroCalendar = loadMacroCalendar();

  // Map indicator names to calendar event names
  const indicatorMap = {
    "CPI": "CPI",
    "CPI Core": "CPI",
    "PPI": "PPI",
    "Employment": "Employment Situation",
    "Consumer Sentiment": "Consumer Sentiment",
    "FOMC": "FOMC Meeting",
    "Bank Reserves": null,  // Weekly, not on calendar
    "Inflation Expectations": null,
    "VIX/Gamma Regime": null  // Daily
  };

  const eventName = indicatorMap[indicator];
  if (!eventName) return false;

  return macroCalendar.some(e => e.event === eventName && e.date === targetDate);
}

/**
 * Check if a ticker has an expected SEC filing today
 */
function hasExpectedFiling(ticker, date = null) {
  const targetDate = date || todayISO();
  const filing = SEC_CALENDAR_MOCKUP.find(
    f => f.ticker === ticker && f.expectedDate === targetDate
  );
  return filing ? filing.type : null;
}

/**
 * Get all expected SEC filings for today
 */
function getTodaysSECExpectations(date = null) {
  const targetDate = date || todayISO();
  return SEC_CALENDAR_MOCKUP.filter(f => f.expectedDate === targetDate);
}

/**
 * Get summary of today's calendar events
 */
function getTodaysSummary(date = null) {
  const events = getEventsForDate(date);
  return {
    date: date || todayISO(),
    macroCount: events.macro.length,
    secCount: events.sec.length,
    sentimentCount: events.sentiment.length,
    macro: events.macro.map(e => e.event),
    sec: events.sec.map(e => `${e.ticker} ${e.type}`),
    sentiment: events.sentiment.map(e => e.event)
  };
}

/**
 * Update SEC calendar with new entry (for future use)
 */
function addSECFiling(ticker, type, expectedDate, fiscalEnd) {
  SEC_CALENDAR_MOCKUP.push({ ticker, type, expectedDate, fiscalEnd });
}

export {
  loadMacroCalendar,
  getEventsForDate,
  hasIndicatorRelease,
  hasExpectedFiling,
  getTodaysSECExpectations,
  getTodaysSummary,
  addSECFiling,
  SEC_CALENDAR_MOCKUP,
  todayISO
};
