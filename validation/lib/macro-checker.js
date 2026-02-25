// validation/lib/macro_checker.js - Macro indicator validation
// Checks URL validity, format consistency, and data integrity

import axios from "axios";
import * as cheerio from "cheerio";
import { MACRO_INDICATORS } from "../config.js";

const BLS_KEY = process.env.BLS_KEY;
const FRED_KEY = process.env.FRED_KEY;

/**
 * Check if a URL returns valid HTTP response
 * @param {string} url - URL to check
 * @param {Object} options - Request options
 * @returns {Promise<Object>} - { valid, statusCode, error }
 */
async function checkUrl(url, options = {}) {
  try {
    const response = await axios.get(url, {
      timeout: options.timeout || 10000,
      validateStatus: () => true,
      headers: options.headers || {},
      params: options.params || {}
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
 * Check BLS API response format
 * @param {Object} data - Response data
 * @returns {Object} - { valid, error }
 */
function checkBLSFormat(data) {
  if (!data) return { valid: false, error: "No data" };
  if (data.status !== "REQUEST_SUCCEEDED") {
    return { valid: false, error: `BLS status: ${data.status}` };
  }
  if (!data.Results?.series?.[0]?.data) {
    return { valid: false, error: "Missing series data" };
  }
  return { valid: true, error: null };
}

/**
 * Check FRED API response format
 * @param {Object} data - Response data
 * @returns {Object} - { valid, error }
 */
function checkFREDFormat(data) {
  if (!data) return { valid: false, error: "No data" };
  if (!data.observations || !Array.isArray(data.observations)) {
    return { valid: false, error: "Missing observations" };
  }
  if (data.observations.length === 0) {
    return { valid: false, error: "Empty observations" };
  }
  return { valid: true, error: null };
}

/**
 * Check CSV response format (UMich)
 * @param {string} data - CSV data
 * @returns {Object} - { valid, error }
 */
function checkCSVFormat(data) {
  if (!data || typeof data !== "string") {
    return { valid: false, error: "No data" };
  }
  const lines = data.split("\n").filter(l => l.trim());
  if (lines.length < 3) {
    return { valid: false, error: "Too few rows" };
  }
  return { valid: true, error: null };
}

/**
 * Check RSS/XML format (FOMC)
 * @param {string} data - XML data
 * @returns {Object} - { valid, error }
 */
function checkRSSFormat(data) {
  if (!data || typeof data !== "string") {
    return { valid: false, error: "No data" };
  }
  try {
    const $ = cheerio.load(data, { xmlMode: true });
    const items = $("item").length;
    if (items === 0) {
      return { valid: false, error: "No items in RSS" };
    }
    return { valid: true, error: null };
  } catch (err) {
    return { valid: false, error: "Invalid XML" };
  }
}

/**
 * Check if data value is within expected range
 * @param {number} value - Value to check
 * @param {Array} range - [min, max]
 * @returns {boolean}
 */
function isInRange(value, range) {
  if (!range || range.length !== 2) return true;
  const [min, max] = range;
  return value >= min && value <= max;
}

/**
 * Extract and validate data from BLS response
 * @param {Object} data - BLS response
 * @param {Array} expectedRange - [min, max]
 * @returns {Object} - { valid, value, error }
 */
function validateBLSData(data, expectedRange) {
  try {
    const latest = data.Results.series[0].data[0];
    const value = parseFloat(latest.value);

    if (isNaN(value)) {
      return { valid: false, value: null, error: "Non-numeric value" };
    }
    if (!isInRange(value, expectedRange)) {
      return { valid: false, value, error: `Out of range: ${value}` };
    }
    return { valid: true, value, error: null, date: `${latest.year}-${latest.period.replace("M", "")}` };
  } catch (err) {
    return { valid: false, value: null, error: err.message };
  }
}

/**
 * Extract and validate data from FRED response
 * @param {Object} data - FRED response
 * @param {Array} expectedRange - [min, max]
 * @returns {Object} - { valid, value, error }
 */
function validateFREDData(data, expectedRange) {
  try {
    const latest = data.observations[0];
    const value = parseFloat(latest.value);

    if (isNaN(value)) {
      return { valid: false, value: null, error: "Non-numeric value" };
    }
    // FRED values can be in millions, adjust range check
    return { valid: true, value, error: null, date: latest.date };
  } catch (err) {
    return { valid: false, value: null, error: err.message };
  }
}

/**
 * Check a single macro indicator
 * @param {string} indicatorKey - Key from MACRO_INDICATORS
 * @returns {Promise<Object>} - Validation result
 */
async function checkIndicator(indicatorKey) {
  const config = MACRO_INDICATORS[indicatorKey];
  if (!config) {
    return {
      indicator: indicatorKey,
      checks: { url: false, format: false, data: false },
      value: null,
      error: "Unknown indicator"
    };
  }

  let urlResult, formatResult, dataResult;
  let displayValue = "";

  switch (config.source) {
    case "BLS": {
      // Check BLS API
      const params = {
        seriesid: [config.seriesIds[0]],
        startyear: String(new Date().getFullYear() - 1),
        endyear: String(new Date().getFullYear()),
        registrationkey: BLS_KEY
      };

      try {
        const response = await axios.post(config.apiUrl, params, { timeout: 10000 });
        urlResult = { valid: response.status === 200, statusCode: response.status };
        formatResult = checkBLSFormat(response.data);
        if (formatResult.valid) {
          dataResult = validateBLSData(response.data, config.expectedRange);
          displayValue = dataResult.value ? `${dataResult.value} (${dataResult.date})` : "ERROR";
        } else {
          dataResult = { valid: false };
        }
      } catch (err) {
        urlResult = { valid: false, error: err.message };
        formatResult = { valid: false };
        dataResult = { valid: false };
        displayValue = `ERROR: ${err.message}`;
      }
      break;
    }

    case "FRED": {
      const params = {
        api_key: FRED_KEY,
        series_id: config.seriesId,
        file_type: "json",
        sort_order: "desc",
        limit: 2
      };

      urlResult = await checkUrl(config.apiUrl, { params });
      if (urlResult.valid) {
        formatResult = checkFREDFormat(urlResult.data);
        if (formatResult.valid) {
          dataResult = validateFREDData(urlResult.data, config.expectedRange);
          displayValue = dataResult.value ? `${(dataResult.value / 1000000).toFixed(2)}M (${dataResult.date})` : "ERROR";
        } else {
          dataResult = { valid: false };
        }
      } else {
        formatResult = { valid: false };
        dataResult = { valid: false };
        displayValue = `ERROR: ${urlResult.error}`;
      }
      break;
    }

    case "UMich": {
      urlResult = await checkUrl(config.apiUrl);
      if (urlResult.valid) {
        formatResult = checkCSVFormat(urlResult.data);
        if (formatResult.valid) {
          // Parse last data row for latest value
          // Filter out empty lines AND lines that are only commas
          const lines = urlResult.data.split("\n")
            .filter(l => l.trim() && l.replace(/,/g, "").trim());
          const lastLine = lines[lines.length - 1];
          const cols = lastLine.split(",");
          // Value is typically in col 4 (index column) or col 3
          const value = parseFloat(cols[4]) || parseFloat(cols[3]);
          dataResult = {
            valid: !isNaN(value) && isInRange(value, config.expectedRange),
            value
          };
          displayValue = dataResult.valid ? `${value}` : "INVALID";
        } else {
          dataResult = { valid: false };
        }
      } else {
        formatResult = { valid: false };
        dataResult = { valid: false };
        displayValue = `ERROR: ${urlResult.error}`;
      }
      break;
    }

    case "Federal Reserve": {
      urlResult = await checkUrl(config.apiUrl);
      if (urlResult.valid) {
        formatResult = checkRSSFormat(urlResult.data);
        if (formatResult.valid) {
          // Extract latest FOMC-related item (statement, minutes, or other)
          const $ = cheerio.load(urlResult.data, { xmlMode: true });
          const firstItem = $("item").first();
          const title = firstItem.find("title").text().trim();
          const pubDate = firstItem.find("pubDate").text().trim();
          // Accept any FOMC-related content (statements, minutes, discount rate, etc.)
          const lowerTitle = title.toLowerCase();
          const isValid = lowerTitle.includes("statement") ||
                          lowerTitle.includes("minutes") ||
                          lowerTitle.includes("fomc") ||
                          lowerTitle.includes("federal reserve") ||
                          lowerTitle.includes("discount rate");
          dataResult = { valid: isValid, value: title };
          displayValue = title ? `${title.substring(0, 40)}... (${pubDate.substring(0, 16)})` : "NO CONTENT";
        } else {
          dataResult = { valid: false };
        }
      } else {
        formatResult = { valid: false };
        dataResult = { valid: false };
        displayValue = `ERROR: ${urlResult.error}`;
      }
      break;
    }

    case "Yahoo Finance": {
      const url = `${config.apiUrl}${encodeURIComponent("^VIX")}?interval=1d&range=5d`;
      urlResult = await checkUrl(url, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (urlResult.valid) {
        const chart = urlResult.data?.chart?.result?.[0];
        formatResult = { valid: !!chart?.indicators?.quote?.[0]?.close };
        if (formatResult.valid) {
          const closes = chart.indicators.quote[0].close.filter(c => c != null);
          const latestVix = closes[closes.length - 1];
          dataResult = {
            valid: latestVix && isInRange(latestVix, config.expectedRange),
            value: latestVix
          };
          displayValue = `VIX: ${latestVix?.toFixed(2) || "N/A"}`;
        } else {
          dataResult = { valid: false };
        }
      } else {
        formatResult = { valid: false };
        dataResult = { valid: false };
        displayValue = `ERROR: ${urlResult.error}`;
      }
      break;
    }

    default:
      urlResult = { valid: false };
      formatResult = { valid: false };
      dataResult = { valid: false };
      displayValue = "Unknown source";
  }

  return {
    indicator: config.name,
    checks: {
      url: urlResult?.valid || false,
      format: formatResult?.valid || false,
      data: dataResult?.valid || false
    },
    value: displayValue,
    details: {
      urlStatus: urlResult?.statusCode,
      urlError: urlResult?.error,
      formatError: formatResult?.error,
      dataError: dataResult?.error,
      rawValue: dataResult?.value
    }
  };
}

/**
 * Check all macro indicators
 * @param {Function} onProgress - Callback (indicator, index, total)
 * @returns {Promise<Array>} - Array of validation results
 */
async function checkAllIndicators(onProgress = null) {
  const results = [];
  const keys = Object.keys(MACRO_INDICATORS);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (onProgress) onProgress(key, i, keys.length);

    const result = await checkIndicator(key);
    results.push(result);
  }

  return results;
}

export {
  checkIndicator,
  checkAllIndicators,
  checkUrl,
  checkBLSFormat,
  checkFREDFormat,
  checkCSVFormat,
  checkRSSFormat
};
