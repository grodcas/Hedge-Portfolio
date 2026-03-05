// validation/agents/hallucination-checker.js
// Simple hallucination detection - compares summary against source content
// Uses the SAME content that the summarization agent used

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = "gpt-4.1-mini";

/**
 * Check if a summary contains hallucinations compared to source content
 * @param {string} summary - The AI-generated summary
 * @param {string} sourceContent - The original content that was summarized
 * @param {string} summaryId - Identifier for tracking
 * @returns {Promise<Object>} - Verification result
 */
export async function checkHallucination(summary, sourceContent, summaryId) {
  if (!summary || !sourceContent) {
    return {
      summaryId,
      status: "ERROR",
      error: "Missing summary or source content",
      score: 0,
      issues: []
    };
  }

  // Truncate source content if too long (keep first 12000 chars)
  const truncatedSource = sourceContent.length > 12000
    ? sourceContent.substring(0, 12000) + "...[truncated]"
    : sourceContent;

  const prompt = `You are a fact-checking agent. Compare the SUMMARY against the SOURCE CONTENT. Extract the key factual claims from the summary and verify each one against the source.

A hallucination is when the summary contains information that is NOT present in or supported by the source content.

SOURCE CONTENT:
"""
${truncatedSource}
"""

SUMMARY:
"""
${summary}
"""

Analyze the summary and respond with ONLY valid JSON (no markdown):
{
  "hasHallucinations": true/false,
  "score": 0-100,  // 100 = no hallucinations, 0 = entirely hallucinated
  "verifiedFacts": [
    {
      "fact": "a specific factual claim from the summary that IS supported by source",
      "evidence": "brief quote or reference from source that confirms this fact"
    }
  ],
  "issues": [
    {
      "claim": "the specific claim from the summary",
      "problem": "why this is a hallucination (not found in source / contradicts source)"
    }
  ],
  "analysis": "Brief overall assessment"
}

IMPORTANT: Always populate "verifiedFacts" with the key claims you checked and confirmed, even when there are no hallucinations. This provides proof of what was validated.`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content?.trim();
    const result = JSON.parse(content);

    return {
      summaryId,
      status: result.hasHallucinations ? "FAIL" : "PASS",
      score: result.score || 0,
      hasHallucinations: result.hasHallucinations || false,
      issues: result.issues || [],
      verifiedFacts: result.verifiedFacts || [],
      analysis: result.analysis || "",
      tokensUsed: response.usage?.total_tokens || 0
    };
  } catch (err) {
    return {
      summaryId,
      status: "ERROR",
      error: err.message,
      score: 0,
      issues: []
    };
  }
}

/**
 * Check multiple summaries for hallucinations
 * @param {Array} items - Array of {summaryId, summary, sourceContent}
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} - Results and stats
 */
export async function checkHallucinationBatch(items, onProgress = null) {
  const results = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (onProgress) onProgress(item.summaryId, i, items.length);

    const result = await checkHallucination(
      item.summary,
      item.sourceContent,
      item.summaryId
    );

    results.push(result);

    // Rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  // Calculate stats
  const stats = {
    total: results.length,
    passed: results.filter(r => r.status === "PASS").length,
    failed: results.filter(r => r.status === "FAIL").length,
    errors: results.filter(r => r.status === "ERROR").length,
    averageScore: results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length)
      : 0
  };

  return { results, stats };
}

export default checkHallucination;
