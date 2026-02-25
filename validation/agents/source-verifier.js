// validation/agents/source_verifier.js
// Verifies extracted facts against source documents
// Part of Phase 4: AI Processing Validation

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = "gpt-4o-mini";

/**
 * Verify a single fact against source text
 * @param {Object} fact - The fact object from fact_extractor
 * @param {string} sourceText - The original source document text
 * @param {string} sourceId - Identifier for the source document
 * @returns {Promise<Object>} - Verification result
 */
async function verifyFact(fact, sourceText, sourceId) {
  if (!fact?.claim || !sourceText) {
    return {
      factId: fact?.id,
      claim: fact?.claim,
      status: "ERROR",
      confidence: 0,
      error: "Missing fact or source text"
    };
  }

  // Truncate source if too long (keep first 8000 chars for context)
  const truncatedSource = sourceText.length > 8000
    ? sourceText.substring(0, 8000) + "\n...[truncated]..."
    : sourceText;

  const prompt = `You are a fact verification agent. Verify if this claim is supported by the source document.

CLAIM TO VERIFY:
"${fact.claim}"

SOURCE DOCUMENT:
"""
${truncatedSource}
"""

Determine if the claim is:
1. VERIFIED - Source explicitly states this or equivalent
2. PARTIALLY_VERIFIED - Source implies this but not exact match
3. NOT_FOUND - Source does not mention this claim
4. CONTRADICTED - Source states something different

Respond with ONLY valid JSON (no markdown):
{
  "status": "VERIFIED|PARTIALLY_VERIFIED|NOT_FOUND|CONTRADICTED",
  "confidence": 0.0-1.0,
  "sourceQuote": "exact quote from source if found, or null",
  "explanation": "brief explanation of your determination"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content?.trim();
    const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(jsonStr);

    return {
      factId: fact.id,
      claim: fact.claim,
      status: result.status || "ERROR",
      confidence: result.confidence || 0,
      source: {
        documentId: sourceId,
        quote: result.sourceQuote || null
      },
      explanation: result.explanation || null,
      tokensUsed: response.usage?.total_tokens || 0
    };
  } catch (err) {
    return {
      factId: fact.id,
      claim: fact.claim,
      status: "ERROR",
      confidence: 0,
      error: err.message
    };
  }
}

/**
 * Verify all facts from a summary against source documents
 * @param {Object} extractedFacts - Output from fact_extractor
 * @param {Array} sources - Array of {id, text} source documents
 * @param {Function} onProgress - Optional callback (factId, index, total)
 * @returns {Promise<Object>} - Complete verification report
 */
async function verifyAllFacts(extractedFacts, sources, onProgress = null) {
  const { summaryId, facts } = extractedFacts;

  if (!facts || facts.length === 0) {
    return {
      summaryId,
      verificationResults: [],
      summaryScore: {
        totalFacts: 0,
        verified: 0,
        partiallyVerified: 0,
        notFound: 0,
        contradicted: 0,
        verificationRate: 1.0
      }
    };
  }

  // Combine all source texts for verification
  const combinedSource = sources.map(s => `[Source: ${s.id}]\n${s.text}`).join("\n\n---\n\n");
  const sourceIds = sources.map(s => s.id).join(", ");

  const verificationResults = [];

  for (let i = 0; i < facts.length; i++) {
    const fact = facts[i];
    if (onProgress) onProgress(fact.id, i, facts.length);

    const result = await verifyFact(fact, combinedSource, sourceIds);
    verificationResults.push(result);

    // Rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // Calculate summary score
  const counts = {
    verified: verificationResults.filter(r => r.status === "VERIFIED").length,
    partiallyVerified: verificationResults.filter(r => r.status === "PARTIALLY_VERIFIED").length,
    notFound: verificationResults.filter(r => r.status === "NOT_FOUND").length,
    contradicted: verificationResults.filter(r => r.status === "CONTRADICTED").length,
    error: verificationResults.filter(r => r.status === "ERROR").length
  };

  const totalVerifiable = facts.length - counts.error;
  const verificationRate = totalVerifiable > 0
    ? (counts.verified + counts.partiallyVerified * 0.5) / totalVerifiable
    : 0;

  return {
    summaryId,
    verificationResults,
    summaryScore: {
      totalFacts: facts.length,
      ...counts,
      verificationRate: Math.round(verificationRate * 100) / 100
    },
    issues: verificationResults.filter(r =>
      r.status === "NOT_FOUND" || r.status === "CONTRADICTED"
    )
  };
}

/**
 * Quick verification without AI (string matching)
 * Useful for pre-filtering before expensive AI calls
 */
function quickVerify(fact, sourceText) {
  if (!fact?.claim || !sourceText) {
    return { status: "ERROR", confidence: 0 };
  }

  const claimLower = fact.claim.toLowerCase();
  const sourceLower = sourceText.toLowerCase();

  // Extract key terms from claim
  const terms = claimLower
    .replace(/[^\w\s\d.%$]/g, "")
    .split(/\s+/)
    .filter(t => t.length > 2);

  // Check how many terms appear in source
  const foundTerms = terms.filter(t => sourceLower.includes(t));
  const matchRate = terms.length > 0 ? foundTerms.length / terms.length : 0;

  // Check for exact numbers/percentages
  const numbers = fact.claim.match(/\d+\.?\d*/g) || [];
  const foundNumbers = numbers.filter(n => sourceText.includes(n));
  const numberMatchRate = numbers.length > 0 ? foundNumbers.length / numbers.length : 1;

  const combinedScore = (matchRate * 0.6) + (numberMatchRate * 0.4);

  if (combinedScore >= 0.8) {
    return { status: "LIKELY_VERIFIED", confidence: combinedScore, method: "quick" };
  } else if (combinedScore >= 0.5) {
    return { status: "NEEDS_AI_CHECK", confidence: combinedScore, method: "quick" };
  } else {
    return { status: "LIKELY_NOT_FOUND", confidence: combinedScore, method: "quick" };
  }
}

/**
 * Generate a validation report for dashboard display
 */
function generateValidationReport(verificationResult) {
  const { summaryId, summaryScore, issues } = verificationResult;

  const scorePercent = Math.round(summaryScore.verificationRate * 100);
  const status = scorePercent >= 90 ? "PASS"
    : scorePercent >= 70 ? "WARNING"
    : "FAIL";

  return {
    summaryId,
    status,
    score: `${scorePercent}%`,
    summary: {
      total: summaryScore.totalFacts,
      verified: summaryScore.verified,
      partial: summaryScore.partiallyVerified,
      notFound: summaryScore.notFound,
      contradicted: summaryScore.contradicted
    },
    issues: issues.map(i => ({
      claim: i.claim,
      status: i.status,
      explanation: i.explanation
    })),
    timestamp: new Date().toISOString()
  };
}

export {
  verifyFact,
  verifyAllFacts,
  quickVerify,
  generateValidationReport
};
