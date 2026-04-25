// Stock-landscape lede — GPT-4o-mini reads the 3 comparative blocks + top
// 3 picks and writes a 3–4 line summary for the Layer 3 main card.
// Deterministic fallback on API failure. No new numbers introduced.

import { callMiniText } from "../shared/openai.js";
import { validateLede } from "../shared/validate.js";

export async function runLede({ apiKey, currentReading, identification, recommendation, topPicks }) {
  try {
    const prompt = buildPrompt({ currentReading, identification, recommendation, topPicks });
    const text = await callMiniText({ apiKey, prompt, label: "stock-landscape-lede", maxTokens: 120 });
    const v = validateLede(text);
    if (v.ok) {
      return { ok: true, text: v.text, words: v.words, source: "gpt-4o-mini" };
    }
    console.warn(`[narrator:stock-landscape-lede] validation failed: ${v.reason}; using fallback`);
  } catch (e) {
    console.warn(`[narrator:stock-landscape-lede] API failure: ${e.message}; using fallback`);
  }
  return { ok: true, ...deterministic({ identification, recommendation, currentReading, topPicks }), source: "deterministic" };
}

function buildPrompt({ currentReading, identification, recommendation, topPicks }) {
  return [
    `You are writing the 3–4 line opening summary of a daily STOCK-PICKS note for a busy professional investor.`,
    ``,
    `STRICT RULES:`,
    `  1. Lead with the single most telling comparative fact (score spread, sector pattern, or a named headline from identification).`,
    `  2. One sentence of diagnosis (pull from identification top bullet).`,
    `  3. One sentence of picks (pull from recommendation — name at least the top 2 tickers and their conviction tiers).`,
    `  4. End with the next dated trigger (pull from recommendation signposts).`,
    `  5. Max 45 words. No preamble. No hedging. No adjectives.`,
    `  6. Do NOT introduce any number or ticker not already in the note.`,
    ``,
    `CURRENT COMPARATIVE READING:`,
    currentReading.text,
    ``,
    `IDENTIFICATION (top bullet):`,
    _bulletLine(identification.bullets?.[0]),
    ``,
    `RECOMMENDATION STANCE:`,
    recommendation.stance || "(no stance)",
    ``,
    `NEXT SIGNPOST:`,
    _signpostLine(recommendation.signposts?.[0]),
    ``,
    `TOP PICKS: ${topPicks || ""}`,
    ``,
    `Output: plain text, no JSON, no quotes. Just the 3–4 line summary.`,
  ].join("\n");
}

function _bulletLine(b) {
  if (!b) return "(no identification bullet)";
  return `${b.headline} — ${b.number} (${b.event}). ${b.interpretation}`;
}

function _signpostLine(s) {
  if (!s) return "(no signposts)";
  return `${s.dated_event}: ${s.trigger} → ${s.action}`;
}

function deterministic({ identification, recommendation, currentReading, topPicks }) {
  const key = currentReading.lines?.[0] || "Shortlist update";
  const diag = identification.bullets?.[0]?.headline || "cross-stock pattern";
  const stance = recommendation.stance || "Stance pending.";
  const sp = recommendation.signposts?.[0];
  const next = sp ? `Next test: ${sp.dated_event}.` : "";
  const text = `${key}. ${diag}. ${stance} ${next}`.trim();
  const words = text.split(/\s+/).length;
  return { text, words };
}
