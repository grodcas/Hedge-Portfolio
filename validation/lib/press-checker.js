// validation/lib/press_checker.js - Press release validation
// Checks that press release parsers work correctly by reading health check results

import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { PORTFOLIO_TICKERS } from "../config.js";

const PRESS_JSON_PATH = "C:\\AI_agent\\HF\\press\\AA_press_releases_today.json";
const SUMMARY_JSON_PATH = "C:\\AI_agent\\HF\\press\\AA_press_summary.json";

/**
 * Load the press releases health check data
 */
function loadPressData() {
  try {
    if (!fs.existsSync(PRESS_JSON_PATH)) {
      return { error: "Press JSON file not found", data: null };
    }
    const raw = fs.readFileSync(PRESS_JSON_PATH, "utf-8");
    const data = JSON.parse(raw);
    return { error: null, data };
  } catch (err) {
    return { error: err.message, data: null };
  }
}

/**
 * Load the press summary data (contains rawContent for AI check)
 */
function loadPressSummary() {
  try {
    if (!fs.existsSync(SUMMARY_JSON_PATH)) return null;
    return JSON.parse(fs.readFileSync(SUMMARY_JSON_PATH, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Check if press data is fresh (from today)
 */
function isDataFresh(data) {
  if (!data?.date) return false;
  const today = new Date().toISOString().slice(0, 10);
  return data.date === today;
}

/**
 * AI check: is the extracted text clean readable news or garbage?
 * Sends a sample of rawContent to GPT to classify.
 * @param {string} text - Extracted text content
 * @param {string} ticker - Ticker for context
 * @returns {Promise<boolean>} - true if clean text, false if garbage
 */
async function aiTextQualityCheck(text, ticker) {
  if (!text || text.length < 50) return false;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // Send first 800 chars — enough to judge quality
  const sample = text.substring(0, 800);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      max_tokens: 20,
      messages: [{
        role: "user",
        content: `Is the following extracted text clean, readable news/press release content? Or is it garbage (HTML tags, hex codes, binary, random characters, cookie banners, navigation menus, or boilerplate-only with no actual news)?

Reply ONLY with "CLEAN" or "GARBAGE".

Text from ${ticker} press release:
---
${sample}
---`
      }]
    });

    const answer = response.choices[0]?.message?.content?.trim().toUpperCase() || "";
    return answer.includes("CLEAN");
  } catch {
    return null; // API error — don't fail the check, return null (unknown)
  }
}

/**
 * Check a single ticker's press parser health
 */
function checkTicker(ticker, pressData) {
  const healthCheck = pressData?.healthCheck?.[ticker];
  const error = pressData?.errors?.[ticker];

  // If ticker had a discovery error
  if (error) {
    return {
      ticker,
      checks: {
        discovery: false,
        content: false,
        fresh: isDataFresh(pressData),
        ai: null
      },
      latest: null,
      error,
      details: {
        discoveryError: error
      }
    };
  }

  // If no health check data for this ticker
  if (!healthCheck) {
    return {
      ticker,
      checks: {
        discovery: false,
        content: false,
        fresh: isDataFresh(pressData),
        ai: null
      },
      latest: null,
      error: "NO_DATA",
      details: {
        note: "Ticker not found in health check data"
      }
    };
  }

  return {
    ticker,
    checks: {
      discovery: healthCheck.discovery,
      content: healthCheck.content,
      fresh: isDataFresh(pressData),
      ai: null // Filled in by checkAllTickers when useAI=true
    },
    latest: healthCheck.latest?.title?.substring(0, 80) || null,
    latestDate: healthCheck.latest?.date || null,
    error: healthCheck.error,
    details: {
      textLength: healthCheck.textLength,
      url: healthCheck.latest?.url
    }
  };
}

/**
 * Check all tickers' press parsers
 */
async function checkAllTickers(useAI = false, onProgress = null) {
  const { error, data } = loadPressData();

  if (error) {
    // Return error state for all tickers
    return PORTFOLIO_TICKERS.map(ticker => ({
      ticker,
      checks: { discovery: false, content: false, fresh: false, ai: null },
      latest: null,
      error: error,
      details: { loadError: error }
    }));
  }

  // Load summary for AI checks
  const summary = useAI ? loadPressSummary() : null;

  const results = [];

  for (let i = 0; i < PORTFOLIO_TICKERS.length; i++) {
    const ticker = PORTFOLIO_TICKERS[i];
    if (onProgress) onProgress(ticker, i, PORTFOLIO_TICKERS.length);

    const result = checkTicker(ticker, data);

    // AI text quality check on rawContent
    if (useAI && result.checks.content && summary?.[ticker]?.[0]?.rawContent) {
      result.checks.ai = await aiTextQualityCheck(summary[ticker][0].rawContent, ticker);
      await new Promise(r => setTimeout(r, 200)); // Rate limit
    }

    results.push(result);
  }

  return results;
}

/**
 * Get summary stats
 */
function getSummary(results) {
  const total = results.length;
  const discoveryPassed = results.filter(r => r.checks.discovery).length;
  const contentPassed = results.filter(r => r.checks.content).length;
  const allPassed = results.filter(r => r.checks.discovery && r.checks.content).length;
  const isFresh = results.length > 0 && results[0].checks.fresh;

  const failed = results.filter(r => !r.checks.discovery || !r.checks.content);

  return {
    total,
    discoveryPassed,
    contentPassed,
    allPassed,
    isFresh,
    failed: failed.map(r => ({
      ticker: r.ticker,
      error: r.error,
      stage: !r.checks.discovery ? "discovery" : "content"
    }))
  };
}

export {
  checkTicker,
  checkAllTickers,
  loadPressData,
  isDataFresh,
  getSummary
};
