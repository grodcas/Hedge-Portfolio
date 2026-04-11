// validation/lib/news-funnel-checker.js - News funnel pipeline validation
// Validates the output stored in BETA_12_News_digest (D1) after the funnel runs.
// Checks: URL validity, LLM output coherence, API response quality.

import { PORTFOLIO_TICKERS } from "../config.js";

/**
 * Validate a single URL string — must be well-formed http(s)
 */
function isValidUrl(str) {
  if (!str || typeof str !== "string") return false;
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Check gatherer output (Stage 1) — API responses are valid
 */
function checkGathererOutput(gathered) {
  if (!gathered || !gathered.ok) {
    return { valid: false, error: "Gatherer returned not ok or empty", details: {} };
  }

  const stats = gathered.stats || {};
  const headlines = gathered.headlines || {};

  const rssTickerCount = stats.rss_ticker_headlines || 0;
  const rssMacroCount = stats.rss_macro_headlines || 0;
  const finnhubCount = stats.finnhub_headlines || 0;
  const totalDedup = stats.total_after_dedup || 0;

  // RSS should return something for most tickers
  const rssOk = rssTickerCount > 0;
  // Finnhub should return some headlines
  const finnhubOk = finnhubCount > 0;
  // After dedup we should have a reasonable number
  const dedupOk = totalDedup >= 10;

  // Check URL validity on a sample of headlines
  const urlChecks = { total: 0, valid: 0, invalid: [] };

  for (const t of (headlines.ticker || [])) {
    for (const item of (t.items || []).slice(0, 3)) {
      urlChecks.total++;
      if (isValidUrl(item.url)) {
        urlChecks.valid++;
      } else {
        urlChecks.invalid.push({ ticker: t.ticker, title: item.title?.slice(0, 60), url: item.url });
      }
    }
  }
  for (const m of (headlines.macro || [])) {
    for (const item of (m.items || []).slice(0, 2)) {
      urlChecks.total++;
      if (isValidUrl(item.url)) {
        urlChecks.valid++;
      } else {
        urlChecks.invalid.push({ category: m.category, title: item.title?.slice(0, 60), url: item.url });
      }
    }
  }

  const urlsOk = urlChecks.total === 0 || (urlChecks.valid / urlChecks.total) >= 0.8;

  return {
    valid: rssOk && finnhubOk && dedupOk && urlsOk,
    checks: {
      rss_returned_data: rssOk,
      finnhub_returned_data: finnhubOk,
      dedup_reasonable: dedupOk,
      urls_valid: urlsOk,
    },
    details: {
      rss_ticker_headlines: rssTickerCount,
      rss_macro_headlines: rssMacroCount,
      finnhub_headlines: finnhubCount,
      total_after_dedup: totalDedup,
      urls_checked: urlChecks.total,
      urls_valid: urlChecks.valid,
      urls_invalid: urlChecks.invalid.slice(0, 5),
    },
  };
}

/**
 * Check filter output (Stage 2) — LLM produced sensible results
 */
function checkFilterOutput(filtered) {
  if (!filtered || !filtered.ok) {
    return { valid: false, error: "Filter returned not ok or empty", details: {} };
  }

  const tickerNews = filtered.ticker_news || [];
  const macroNews = filtered.macro_news || [];

  // LLM should return entries for most tickers
  const tickersWithNews = tickerNews.filter(t => (t.headlines || []).length > 0).length;
  const tickerCoverage = tickersWithNews / PORTFOLIO_TICKERS.length;
  const tickerCoverageOk = tickerCoverage >= 0.5; // at least half the tickers got news

  // Macro should have ~10 items
  const macroCount = macroNews.length;
  const macroCountOk = macroCount >= 5;

  // LLM coherence: check that selected headlines have required fields
  const llmCoherence = { total: 0, valid: 0, issues: [] };

  for (const t of tickerNews) {
    for (const h of (t.headlines || [])) {
      llmCoherence.total++;
      const hasTitle = typeof h.title === "string" && h.title.length > 5;
      const hasRank = typeof h.rank === "number" && h.rank >= 1;
      const hasSentiment = ["bullish", "bearish", "neutral"].includes(h.sentiment);
      const hasRelevance = typeof h.relevance === "string" && h.relevance.length > 5;

      if (hasTitle && hasRank && hasSentiment && hasRelevance) {
        llmCoherence.valid++;
      } else {
        const missing = [];
        if (!hasTitle) missing.push("title");
        if (!hasRank) missing.push("rank");
        if (!hasSentiment) missing.push("sentiment");
        if (!hasRelevance) missing.push("relevance");
        llmCoherence.issues.push({ ticker: t.ticker, title: h.title?.slice(0, 40), missing });
      }
    }
  }

  for (const m of macroNews) {
    llmCoherence.total++;
    const hasTitle = typeof m.title === "string" && m.title.length > 5;
    const hasCategory = typeof m.category === "string" && m.category.length > 0;
    const hasSentiment = ["bullish", "bearish", "neutral"].includes(m.sentiment);
    const hasImpact = typeof m.portfolio_impact === "string" && m.portfolio_impact.length > 5;

    if (hasTitle && hasCategory && hasSentiment && hasImpact) {
      llmCoherence.valid++;
    } else {
      const missing = [];
      if (!hasTitle) missing.push("title");
      if (!hasCategory) missing.push("category");
      if (!hasSentiment) missing.push("sentiment");
      if (!hasImpact) missing.push("portfolio_impact");
      llmCoherence.issues.push({ macro: true, title: m.title?.slice(0, 40), missing });
    }
  }

  const llmOk = llmCoherence.total === 0 || (llmCoherence.valid / llmCoherence.total) >= 0.8;

  return {
    valid: tickerCoverageOk && macroCountOk && llmOk,
    checks: {
      ticker_coverage_ok: tickerCoverageOk,
      macro_count_ok: macroCountOk,
      llm_output_coherent: llmOk,
    },
    details: {
      tickers_with_news: tickersWithNews,
      ticker_coverage_pct: Math.round(tickerCoverage * 100),
      macro_headlines: macroCount,
      llm_fields_checked: llmCoherence.total,
      llm_fields_valid: llmCoherence.valid,
      llm_issues: llmCoherence.issues.slice(0, 5),
    },
  };
}

/**
 * Check orchestrator output (full pipeline) — final D1 write stats
 */
function checkOrchestratorOutput(result) {
  if (!result || !result.ok) {
    return { valid: false, error: "Orchestrator returned not ok or empty", details: {} };
  }

  const stages = result.stages || {};
  const gathered = stages.gathered || 0;
  const filteredTicker = stages.filtered_ticker || 0;
  const filteredMacro = stages.filtered_macro || 0;
  const summarized = stages.summarized || 0;
  const written = stages.written || 0;

  // Pipeline should not lose everything between stages
  const gatherOk = gathered >= 10;
  const filterOk = (filteredTicker + filteredMacro) >= 10;
  const summaryOk = summarized >= 10;
  const writeOk = written >= 10;
  // Written should match summarized
  const consistentOk = written === summarized;

  return {
    valid: gatherOk && filterOk && summaryOk && writeOk && consistentOk,
    checks: {
      gather_produced_data: gatherOk,
      filter_produced_data: filterOk,
      summaries_generated: summaryOk,
      rows_written: writeOk,
      write_matches_summary: consistentOk,
    },
    details: {
      gathered,
      filtered_ticker: filteredTicker,
      filtered_macro: filteredMacro,
      summarized,
      written,
    },
  };
}

/**
 * Run all news funnel checks against a pipeline result object.
 * Accepts either:
 *   - Full stage outputs: { gathered, filtered, orchestrator }
 *   - Just orchestrator summary: { orchestrator }
 */
function checkNewsFunnel(data = {}) {
  const results = {
    gatherer: data.gathered ? checkGathererOutput(data.gathered) : null,
    filter: data.filtered ? checkFilterOutput(data.filtered) : null,
    orchestrator: data.orchestrator ? checkOrchestratorOutput(data.orchestrator) : null,
  };

  const ran = Object.values(results).filter(r => r !== null);
  const passed = ran.filter(r => r.valid).length;

  return {
    checks: results,
    passed,
    total: ran.length,
    allPassed: passed === ran.length,
  };
}

/**
 * Summary for logging
 */
function getSummary(result) {
  if (!result) return { passed: 0, total: 0, allPassed: false, issues: [] };

  const issues = [];
  for (const [stage, check] of Object.entries(result.checks || {})) {
    if (!check || check.valid) continue;
    if (check.error) {
      issues.push(`${stage}: ${check.error}`);
    } else {
      const failed = Object.entries(check.checks || {}).filter(([, v]) => !v).map(([k]) => k);
      issues.push(`${stage}: failed [${failed.join(", ")}]`);
    }
  }

  return {
    passed: result.passed,
    total: result.total,
    allPassed: result.allPassed,
    issues,
  };
}

export {
  checkNewsFunnel,
  checkGathererOutput,
  checkFilterOutput,
  checkOrchestratorOutput,
  getSummary,
  isValidUrl,
};
