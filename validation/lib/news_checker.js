// validation/lib/news_checker.js - News article validation
// Validates manually downloaded news HTML files

import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { NEWS_SOURCES, VALIDATION_THRESHOLDS, PORTFOLIO_TICKERS } from "../config.js";
import { validateArticleWithAI, quickValidate } from "./ai_validator.js";

/**
 * Check if HTML file exists and is valid
 */
function checkHtmlFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: "File not found" };
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");

    if (content.length < 100) {
      return { valid: false, error: "File too small" };
    }

    // Check for basic HTML structure
    const hasHtml = content.includes("<html") || content.includes("<HTML") ||
                    content.includes("<!DOCTYPE") || content.includes("<!doctype");
    if (!hasHtml) {
      return { valid: false, error: "Not valid HTML" };
    }

    return { valid: true, content, error: null };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Extract article text from HTML based on source
 */
function extractText(html, source) {
  if (!html) return { valid: false, text: null, error: "No HTML" };

  try {
    const $ = cheerio.load(html);
    let text = "";

    // Source-specific selectors
    const selectors = {
      Bloomberg: [
        'p[data-component="paragraph"]',
        "article p",
        ".body-content p"
      ],
      WSJ: [
        'p[data-type="paragraph"]',
        "article p",
        ".article-content p"
      ],
      Reuters: [
        'div[data-testid^="paragraph-"]',
        "article p",
        ".article-body p"
      ]
    };

    const sourceSelectors = selectors[source] || ["p", "article"];

    for (const selector of sourceSelectors) {
      $(selector).each((_, el) => {
        const t = $(el).text().trim();
        if (t.length > 20) text += t + "\n\n";
      });
      if (text.length > 200) break;
    }

    // Fallback: get all paragraphs
    if (text.length < 200) {
      $("p").each((_, el) => {
        const t = $(el).text().trim();
        if (t.length > 30) text += t + "\n\n";
      });
    }

    text = text.trim();

    if (text.length < VALIDATION_THRESHOLDS.minArticleLength) {
      return { valid: false, text, error: `Text too short: ${text.length} chars` };
    }

    return { valid: true, text, error: null };
  } catch (err) {
    return { valid: false, text: null, error: err.message };
  }
}

/**
 * Validate text quality (no random chars, proper structure)
 */
function validateText(text) {
  if (!text) return { valid: false, error: "No text" };

  // Check for encoding issues (high ratio of non-ASCII)
  const nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length;
  const ratio = nonAscii / text.length;
  if (ratio > 0.2) {
    return { valid: false, error: `High non-ASCII ratio: ${(ratio * 100).toFixed(1)}%` };
  }

  // Check for null/undefined strings
  if (text.includes("undefined") || text.includes("null")) {
    return { valid: false, error: "Contains undefined/null" };
  }

  // Check paragraph structure
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 50);
  if (paragraphs.length < VALIDATION_THRESHOLDS.minParagraphs) {
    return { valid: false, error: `Too few paragraphs: ${paragraphs.length}` };
  }

  // Check it's not just navigation
  const navKeywords = ["menu", "subscribe", "sign in", "cookie", "privacy"];
  const firstPara = text.substring(0, 300).toLowerCase();
  const navHits = navKeywords.filter(k => firstPara.includes(k)).length;
  if (navHits >= 3) {
    return { valid: false, error: "Looks like navigation/boilerplate" };
  }

  return { valid: true, error: null };
}

/**
 * Detect which portfolio tickers are mentioned in text
 */
function detectTickers(text) {
  if (!text) return [];

  const mentioned = [];
  const upperText = text.toUpperCase();

  for (const ticker of PORTFOLIO_TICKERS) {
    // Check for ticker symbol (with word boundaries)
    const tickerPattern = new RegExp(`\\b${ticker.replace(".", "\\.")}\\b`);
    if (tickerPattern.test(upperText)) {
      mentioned.push(ticker);
    }
  }

  // Also check for company names
  const companyMap = {
    "APPLE": "AAPL",
    "MICROSOFT": "MSFT",
    "GOOGLE": "GOOGL",
    "ALPHABET": "GOOGL",
    "AMAZON": "AMZN",
    "NVIDIA": "NVDA",
    "META": "META",
    "FACEBOOK": "META",
    "TESLA": "TSLA",
    "BERKSHIRE": "BRK.B",
    "JPMORGAN": "JPM",
    "GOLDMAN": "GS",
    "BANK OF AMERICA": "BAC",
    "EXXON": "XOM",
    "CHEVRON": "CVX",
    "UNITEDHEALTH": "UNH",
    "ELI LILLY": "LLY",
    "JOHNSON & JOHNSON": "JNJ",
    "PROCTER": "PG",
    "COCA-COLA": "KO",
    "HOME DEPOT": "HD",
    "CATERPILLAR": "CAT",
    "BOEING": "BA",
    "INTEL": "INTC",
    "AMD": "AMD",
    "NETFLIX": "NFLX",
    "MORGAN STANLEY": "MS"
  };

  for (const [name, ticker] of Object.entries(companyMap)) {
    if (upperText.includes(name) && !mentioned.includes(ticker)) {
      mentioned.push(ticker);
    }
  }

  return mentioned;
}

/**
 * Check a single news article file
 */
async function checkArticle(filePath, source, useAI = true) {
  const fileName = path.basename(filePath);

  // Check HTML file
  const htmlResult = checkHtmlFile(filePath);
  if (!htmlResult.valid) {
    return {
      file: fileName,
      checks: { html: false, text: false, ai: false },
      tickers: [],
      error: htmlResult.error
    };
  }

  // Extract text
  const textResult = extractText(htmlResult.content, source);
  if (!textResult.valid) {
    return {
      file: fileName,
      checks: { html: true, text: false, ai: false },
      tickers: [],
      error: textResult.error
    };
  }

  // Validate text quality
  const textValidation = validateText(textResult.text);
  if (!textValidation.valid) {
    return {
      file: fileName,
      checks: { html: true, text: false, ai: false },
      tickers: [],
      error: textValidation.error
    };
  }

  // AI validation
  let aiResult = { valid: true, skipped: true };
  if (useAI) {
    // First do quick validation
    const quickResult = quickValidate(textResult.text);
    if (!quickResult.valid) {
      aiResult = { valid: false, reason: quickResult.reason };
    } else {
      // Then AI validation
      aiResult = await validateArticleWithAI(textResult.text, "news");
    }
  }

  // Detect tickers
  const tickers = detectTickers(textResult.text);

  return {
    file: fileName,
    checks: {
      html: true,
      text: true,
      ai: aiResult.valid
    },
    tickers,
    textLength: textResult.text.length,
    aiReason: aiResult.reason,
    error: null
  };
}

/**
 * Check all articles in a source folder
 */
async function checkSource(source, useAI = true, onProgress = null) {
  const config = NEWS_SOURCES[source];
  if (!config) {
    return {
      source,
      checks: { html: false, text: false, aiPass: 0, aiTotal: 0 },
      articles: [],
      tickers: [],
      error: "Unknown source"
    };
  }

  const folder = config.folder;
  if (!fs.existsSync(folder)) {
    return {
      source,
      checks: { html: false, text: false, aiPass: 0, aiTotal: 0 },
      articles: [],
      tickers: [],
      error: "Folder not found"
    };
  }

  // Get HTML files
  const files = fs.readdirSync(folder)
    .filter(f => f.endsWith(".html") || f.endsWith(".htm"))
    .map(f => path.join(folder, f));

  if (files.length === 0) {
    return {
      source,
      checks: { html: false, text: false, aiPass: 0, aiTotal: 0 },
      articles: [],
      tickers: [],
      error: "No HTML files found"
    };
  }

  const results = [];
  const allTickers = new Set();
  let htmlPass = 0;
  let textPass = 0;
  let aiPass = 0;

  for (let i = 0; i < files.length; i++) {
    if (onProgress) onProgress(path.basename(files[i]), i, files.length);

    const result = await checkArticle(files[i], source, useAI);
    results.push(result);

    if (result.checks.html) htmlPass++;
    if (result.checks.text) textPass++;
    if (result.checks.ai) aiPass++;
    result.tickers.forEach(t => allTickers.add(t));
  }

  return {
    source,
    checks: {
      html: htmlPass === files.length,
      text: textPass === files.length,
      aiPass,
      aiTotal: files.length
    },
    articleCount: files.length,
    articles: results,
    tickers: Array.from(allTickers),
    failedArticles: results.filter(r => !r.checks.ai).map(r => ({
      file: r.file,
      reason: r.aiReason || r.error
    }))
  };
}

/**
 * Check all news sources
 */
async function checkAllSources(useAI = true, onProgress = null) {
  const results = [];
  const sources = Object.keys(NEWS_SOURCES);

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (onProgress) onProgress(source, i, sources.length);

    const result = await checkSource(source, useAI);
    results.push(result);
  }

  return results;
}

/**
 * Get summary stats
 */
function getSummary(results) {
  let totalArticles = 0;
  let htmlPassed = 0;
  let textPassed = 0;
  let aiPassed = 0;
  const allTickers = new Set();
  const failed = [];

  for (const source of results) {
    totalArticles += source.articleCount || 0;
    if (source.checks.html) htmlPassed += source.articleCount;
    if (source.checks.text) textPassed += source.articleCount;
    aiPassed += source.checks.aiPass || 0;
    source.tickers?.forEach(t => allTickers.add(t));
    if (source.failedArticles) {
      failed.push(...source.failedArticles.map(f => ({
        source: source.source,
        ...f
      })));
    }
  }

  return {
    totalArticles,
    htmlPassed,
    textPassed,
    aiPassed,
    tickers: Array.from(allTickers),
    failed
  };
}

export {
  checkArticle,
  checkSource,
  checkAllSources,
  checkHtmlFile,
  extractText,
  validateText,
  detectTickers,
  getSummary
};
