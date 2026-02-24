// validation/lib/policy_checker.js - White House and FOMC validation
// Checks URL, format, text quality for policy announcements

import axios from "axios";
import * as cheerio from "cheerio";
import { POLICY_SOURCES, VALIDATION_THRESHOLDS } from "../config.js";
import { validateArticleWithAI, quickValidate } from "./ai_validator.js";
import { hasIndicatorRelease } from "./calendar.js";

/**
 * Check if a URL returns valid HTTP response
 */
async function checkUrl(url, options = {}) {
  try {
    const response = await axios.get(url, {
      timeout: options.timeout || 15000,
      validateStatus: () => true,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...options.headers
      }
    });

    return {
      valid: response.status >= 200 && response.status < 400,
      statusCode: response.status,
      data: response.data,
      error: null
    };
  } catch (err) {
    return {
      valid: false,
      statusCode: null,
      data: null,
      error: err.message
    };
  }
}

/**
 * Check White House page format
 */
function checkWhiteHouseFormat(html) {
  if (!html || typeof html !== "string") {
    return { valid: false, error: "No HTML" };
  }

  try {
    const $ = cheerio.load(html);

    // Check for news/press structure
    const hasNews = $(".wp-block-post").length > 0 ||
                    $("article").length > 0 ||
                    $(".news-item").length > 0;

    if (!hasNews) {
      return { valid: false, error: "No news structure found" };
    }

    // Check for dates
    const hasDate = html.includes("2026") || html.includes("2025");
    if (!hasDate) {
      return { valid: false, error: "No recent dates found" };
    }

    return { valid: true, error: null };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Check FOMC/Fed page format
 */
function checkFOMCFormat(data) {
  if (!data || typeof data !== "string") {
    return { valid: false, error: "No data" };
  }

  // Check if it's XML (RSS feed)
  if (data.includes("<rss") || data.includes("<feed") || data.includes("<item")) {
    try {
      const $ = cheerio.load(data, { xmlMode: true });
      const items = $("item").length;
      if (items === 0) {
        return { valid: false, error: "No items in RSS" };
      }
      return { valid: true, error: null, isRSS: true };
    } catch (err) {
      return { valid: false, error: "Invalid XML" };
    }
  }

  // Check if it's HTML
  try {
    const $ = cheerio.load(data);
    const hasContent = $("p").length > 5 || $("article").length > 0;
    if (!hasContent) {
      return { valid: false, error: "No content structure" };
    }
    return { valid: true, error: null, isRSS: false };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Extract text content from policy page
 */
function extractText(html, source) {
  if (!html) return { valid: false, text: null, error: "No HTML" };

  try {
    const $ = cheerio.load(html);
    let text = "";

    if (source === "WhiteHouse") {
      // White House specific selectors
      $(".wp-block-post").each((_, el) => {
        const title = $(el).find("h2, h3, .title").text().trim();
        const date = $(el).find("time, .date").text().trim();
        if (title) text += `${title} (${date})\n`;
      });

      // Fallback to article content
      if (text.length < 100) {
        $("article, .entry-content, .post-content").each((_, el) => {
          text += $(el).text().trim() + "\n";
        });
      }
    } else {
      // FOMC RSS
      const isRSS = html.includes("<item");
      if (isRSS) {
        const $xml = cheerio.load(html, { xmlMode: true });
        $xml("item").each((_, el) => {
          const title = $xml(el).find("title").text().trim();
          const pubDate = $xml(el).find("pubDate").text().trim();
          if (title) text += `${title} (${pubDate})\n`;
        });
      } else {
        $("p, article").each((_, el) => {
          text += $(el).text().trim() + "\n";
        });
      }
    }

    text = text.trim();

    if (text.length < 50) {
      return { valid: false, text, error: "Text too short" };
    }

    return { valid: true, text, error: null };
  } catch (err) {
    return { valid: false, text: null, error: err.message };
  }
}

/**
 * Extract latest item (title, date, first sentence)
 */
function extractLatest(html, source) {
  if (!html) return null;

  try {
    const $ = cheerio.load(html, { xmlMode: source !== "WhiteHouse" });

    if (source === "WhiteHouse") {
      const firstPost = $(".wp-block-post").first();
      if (firstPost.length) {
        return {
          title: firstPost.find("h2, h3, .title").first().text().trim(),
          date: firstPost.find("time, .date").first().text().trim(),
          link: firstPost.find("a").first().attr("href")
        };
      }
    } else {
      // RSS feed
      const firstItem = $("item").first();
      if (firstItem.length) {
        const title = firstItem.find("title").text().trim();
        const pubDate = firstItem.find("pubDate").text().trim();
        const link = firstItem.find("link").text().trim();

        return {
          title,
          date: pubDate,
          link
        };
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Check a single policy source
 */
async function checkSource(sourceKey, useAI = true) {
  const config = POLICY_SOURCES[sourceKey];
  if (!config) {
    return {
      source: sourceKey,
      checks: { url: false, format: false, text: false, ai: false },
      latest: null,
      error: "Unknown source"
    };
  }

  // Check calendar for FOMC
  const calendarFlag = sourceKey === "FOMC" ? hasIndicatorRelease("FOMC") : false;

  // Check URL
  const urlResult = await checkUrl(config.url);

  // Check format
  let formatResult = { valid: false };
  if (urlResult.valid) {
    if (sourceKey === "WhiteHouse") {
      formatResult = checkWhiteHouseFormat(urlResult.data);
    } else {
      formatResult = checkFOMCFormat(urlResult.data);
    }
  }

  // Extract text
  let textResult = { valid: false };
  if (formatResult.valid) {
    textResult = extractText(urlResult.data, sourceKey);
  }

  // AI validation
  let aiResult = { valid: true, skipped: true };
  if (useAI && textResult.valid) {
    const quickResult = quickValidate(textResult.text);
    if (quickResult.valid) {
      aiResult = await validateArticleWithAI(textResult.text, "policy");
    } else {
      aiResult = { valid: false, reason: quickResult.reason };
    }
  }

  // Extract latest
  const latest = formatResult.valid ? extractLatest(urlResult.data, sourceKey) : null;

  return {
    source: config.name,
    sourceKey,
    calendarFlag,
    checks: {
      url: urlResult.valid,
      format: formatResult.valid,
      text: textResult.valid,
      ai: aiResult.valid
    },
    latest,
    details: {
      urlStatus: urlResult.statusCode,
      urlError: urlResult.error,
      formatError: formatResult.error,
      textError: textResult.error,
      aiError: aiResult.error,
      aiReason: aiResult.reason
    }
  };
}

/**
 * Check all policy sources
 */
async function checkAllSources(useAI = true, onProgress = null) {
  const results = [];
  const keys = Object.keys(POLICY_SOURCES);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (onProgress) onProgress(key, i, keys.length);

    const result = await checkSource(key, useAI);
    results.push(result);
  }

  return results;
}

/**
 * Get summary stats
 */
function getSummary(results) {
  const total = results.length;
  const passed = results.filter(r =>
    r.checks.url && r.checks.format && r.checks.text && r.checks.ai
  ).length;
  const failed = results.filter(r =>
    !r.checks.url || !r.checks.format || !r.checks.text || !r.checks.ai
  ).map(r => r.source);

  return { total, passed, failed };
}

export {
  checkSource,
  checkAllSources,
  checkUrl,
  checkWhiteHouseFormat,
  checkFOMCFormat,
  extractText,
  extractLatest,
  getSummary
};
