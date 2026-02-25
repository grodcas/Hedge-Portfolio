// validation/agents/fact_extractor.js
// Extracts discrete factual claims from AI-generated summaries
// Part of Phase 4: AI Processing Validation

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = "gpt-4o-mini";

/**
 * Extract factual claims from a summary
 * @param {string} summary - The AI-generated summary text
 * @param {string} summaryId - Unique identifier for tracking
 * @param {string} summaryType - Type: report, cluster, trend, news, press, macro
 * @returns {Promise<Object>} - Extracted facts with metadata
 */
async function extractFacts(summary, summaryId, summaryType = "general") {
  if (!summary || summary.length < 50) {
    return {
      summaryId,
      summaryType,
      facts: [],
      error: "Summary too short to extract facts"
    };
  }

  const prompt = `You are a fact extraction agent. Extract ALL verifiable factual claims from this ${summaryType} summary.

SUMMARY:
"""
${summary}
"""

For each fact, provide:
1. "claim" - The exact factual statement (quote or paraphrase closely)
2. "type" - "numeric" (contains specific numbers/percentages) or "qualitative" (descriptive without numbers)
3. "entities" - Key entities mentioned (company names, metrics, dates, etc.)
4. "verifiability" - "high" (specific number/date), "medium" (general trend), "low" (subjective interpretation)

IMPORTANT:
- Extract ONLY verifiable facts, NOT opinions or analysis
- Include ALL numbers, percentages, dates, and specific claims
- Be thorough - don't miss any factual statements

Respond with ONLY valid JSON (no markdown):
{
  "facts": [
    {
      "id": 1,
      "claim": "...",
      "type": "numeric|qualitative",
      "entities": ["entity1", "entity2"],
      "verifiability": "high|medium|low"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content?.trim();

    // Parse JSON response
    const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(jsonStr);

    return {
      summaryId,
      summaryType,
      facts: result.facts || [],
      factCount: result.facts?.length || 0,
      tokensUsed: response.usage?.total_tokens || 0,
      model: MODEL
    };
  } catch (err) {
    return {
      summaryId,
      summaryType,
      facts: [],
      error: err.message,
      rawResponse: err.rawResponse || null
    };
  }
}

/**
 * Extract facts from multiple summaries in batch
 * @param {Array} summaries - Array of {id, text, type}
 * @param {Function} onProgress - Optional callback (id, index, total)
 * @returns {Promise<Array>} - Array of extraction results
 */
async function extractFactsBatch(summaries, onProgress = null) {
  const results = [];

  for (let i = 0; i < summaries.length; i++) {
    const item = summaries[i];
    if (onProgress) onProgress(item.id, i, summaries.length);

    const result = await extractFacts(item.text, item.id, item.type);
    results.push(result);

    // Rate limiting delay
    await new Promise(r => setTimeout(r, 200));
  }

  return results;
}

/**
 * Quick fact extraction without AI (rule-based)
 * Extracts numbers, percentages, dates for pre-filtering
 */
function quickExtractFacts(text) {
  const facts = [];

  // Extract percentages
  const percentages = text.match(/\d+\.?\d*\s*%/g) || [];
  percentages.forEach((p, i) => {
    facts.push({
      id: `pct-${i}`,
      claim: p,
      type: "numeric",
      entities: [p],
      verifiability: "high",
      method: "regex"
    });
  });

  // Extract dollar amounts
  const dollars = text.match(/\$\d+\.?\d*\s*(billion|million|trillion|B|M|T|K)?/gi) || [];
  dollars.forEach((d, i) => {
    facts.push({
      id: `usd-${i}`,
      claim: d,
      type: "numeric",
      entities: [d],
      verifiability: "high",
      method: "regex"
    });
  });

  // Extract dates
  const dates = text.match(/\d{4}-\d{2}-\d{2}|Q[1-4]\s*\d{4}|FY\d{4}/g) || [];
  dates.forEach((d, i) => {
    facts.push({
      id: `date-${i}`,
      claim: d,
      type: "numeric",
      entities: [d],
      verifiability: "high",
      method: "regex"
    });
  });

  return {
    facts,
    factCount: facts.length,
    method: "quick"
  };
}

export {
  extractFacts,
  extractFactsBatch,
  quickExtractFacts
};
