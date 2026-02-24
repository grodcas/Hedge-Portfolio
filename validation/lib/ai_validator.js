// validation/lib/ai_validator.js - AI-based article validation using o3-mini
// Validates if parsed text is a real article or garbage from bad parsing

import OpenAI from "openai";
import { VALIDATION_THRESHOLDS } from "../config.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = VALIDATION_THRESHOLDS.aiValidationModel || "o3-mini";

/**
 * Validate if text is a real article using o3-mini
 * @param {string} text - Text content to validate
 * @param {string} type - Type of content (news, press_release, policy)
 * @returns {Promise<Object>} - { valid, reason, confidence }
 */
async function validateArticleWithAI(text, type = "news") {
  if (!text || text.length < 50) {
    return { valid: false, reason: "Text too short", confidence: 1.0 };
  }

  // Truncate to save tokens
  const truncatedText = text.substring(0, 1500);

  const typeDescriptions = {
    news: "a news article from a financial publication (Bloomberg, WSJ, Reuters)",
    press_release: "a corporate press release or investor relations announcement",
    policy: "a government policy announcement or White House statement",
    sec: "an SEC filing or regulatory document"
  };

  const prompt = `You are validating parsed web content. Determine if this text is ${typeDescriptions[type] || "a legitimate article"} or if it's garbage from bad parsing (e.g., navigation menus, cookie notices, login forms, error pages, or random characters).

TEXT TO VALIDATE:
"""
${truncatedText}
"""

Respond with ONLY a JSON object (no markdown, no explanation):
{"valid": true/false, "reason": "brief explanation", "confidence": 0.0-1.0}

Examples of INVALID content:
- Navigation menus: "Home About Contact Login..."
- Cookie banners: "We use cookies to improve..."
- Error pages: "404 Page not found..."
- Login forms: "Enter your email Password..."
- Paywall text: "Subscribe to continue reading..."
- Random characters from encoding issues

Examples of VALID content:
- News articles with headlines, dates, and body text
- Press releases with company announcements
- Policy statements with official language`;

  try {
    // o3-mini doesn't support temperature parameter
    const requestParams = {
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 100
    };

    // Only add temperature for models that support it (not o3-mini, o1-mini, etc.)
    if (!MODEL.startsWith("o1") && !MODEL.startsWith("o3")) {
      requestParams.temperature = 0.1;
    }

    const response = await openai.chat.completions.create(requestParams);

    const content = response.choices[0]?.message?.content?.trim();

    // Parse JSON response
    try {
      // Remove any markdown code blocks if present
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const result = JSON.parse(jsonStr);

      return {
        valid: result.valid === true,
        reason: result.reason || "No reason provided",
        confidence: result.confidence || 0.5,
        model: MODEL,
        tokensUsed: response.usage?.total_tokens || 0
      };
    } catch (parseErr) {
      // If JSON parsing fails, try to extract valid/invalid from text
      const isValid = content.toLowerCase().includes('"valid": true') ||
                      content.toLowerCase().includes('"valid":true');
      return {
        valid: isValid,
        reason: "Could not parse AI response",
        confidence: 0.5,
        rawResponse: content
      };
    }
  } catch (err) {
    return {
      valid: false,
      reason: `AI error: ${err.message}`,
      confidence: 0,
      error: err.message
    };
  }
}

/**
 * Batch validate multiple articles
 * @param {Array} articles - Array of {id, text, type}
 * @param {Function} onProgress - Callback (id, index, total)
 * @returns {Promise<Array>} - Array of validation results
 */
async function validateBatch(articles, onProgress = null) {
  const results = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    if (onProgress) onProgress(article.id, i, articles.length);

    const result = await validateArticleWithAI(article.text, article.type);
    results.push({
      id: article.id,
      ...result
    });

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  return results;
}

/**
 * Quick validation without AI (rule-based)
 * Use this for pre-filtering before expensive AI calls
 */
function quickValidate(text) {
  if (!text) return { valid: false, reason: "No text" };
  if (text.length < 200) return { valid: false, reason: "Too short" };
  if (text.length > 100000) return { valid: false, reason: "Too long" };

  // Check for common garbage patterns
  const garbagePatterns = [
    /^(menu|navigation|home|about|contact)/i,
    /cookie\s*(policy|consent|notice)/i,
    /subscribe\s*(to|now|today)/i,
    /sign\s*(in|up|out)/i,
    /404|page\s*not\s*found/i,
    /error|exception|undefined/i,
    /^\s*[\{\[\<]/,  // Starts with JSON/HTML
    /[^\x00-\x7F]{10,}/  // Long sequences of non-ASCII
  ];

  for (const pattern of garbagePatterns) {
    if (pattern.test(text.substring(0, 500))) {
      return { valid: false, reason: `Matches garbage pattern: ${pattern.source}` };
    }
  }

  // Check for article-like structure
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 50);
  if (paragraphs.length < 2) {
    return { valid: false, reason: "No paragraph structure" };
  }

  // Check for dates (articles usually have dates)
  const hasDate = /\d{4}|January|February|March|April|May|June|July|August|September|October|November|December|\d{1,2}\/\d{1,2}/i.test(text);
  if (!hasDate) {
    return { valid: false, reason: "No dates found" };
  }

  return { valid: true, reason: "Passed quick validation" };
}

/**
 * Hybrid validation: quick rules first, then AI if needed
 */
async function hybridValidate(text, type = "news", forceAI = false) {
  // First do quick validation
  const quickResult = quickValidate(text);

  // If quick validation clearly fails, skip AI
  if (!quickResult.valid && !forceAI) {
    return { ...quickResult, method: "quick", aiSkipped: true };
  }

  // If quick validation passes or forceAI, use AI
  const aiResult = await validateArticleWithAI(text, type);
  return { ...aiResult, method: "ai", quickResult };
}

export {
  validateArticleWithAI,
  validateBatch,
  quickValidate,
  hybridValidate
};
