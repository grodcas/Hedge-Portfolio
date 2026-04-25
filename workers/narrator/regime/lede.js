// Regime lede — GPT-4o-mini reads the three narrative blocks + top key
// metrics and writes a 3–4 line (≤45-word) summary suitable for the main
// card. No new numbers. Deterministic fallback on API failure.

import { callMiniText } from "../shared/openai.js";
import { validateLede } from "../shared/validate.js";

export async function runLede({ apiKey, currentReading, identification, recommendation, topMetrics }) {
  try {
    const prompt = buildPrompt({ currentReading, identification, recommendation, topMetrics });
    const text = await callMiniText({ apiKey, prompt, label: "regime-lede", maxTokens: 120 });
    const v = validateLede(text);
    if (v.ok) {
      return { ok: true, text: v.text, words: v.words, source: "gpt-4o-mini" };
    }
    // Fall through to deterministic
    console.warn(`[narrator:regime-lede] validation failed: ${v.reason}; using fallback`);
  } catch (e) {
    console.warn(`[narrator:regime-lede] API failure: ${e.message}; using fallback`);
  }
  return { ok: true, ...deterministic({ identification, recommendation, currentReading }), source: "deterministic" };
}

function buildPrompt({ currentReading, identification, recommendation, topMetrics }) {
  return [
    `You are writing the 3–4 line opening summary of a daily macro analyst note for a busy professional investor.`,
    ``,
    `STRICT RULES:`,
    `  1. Lead with the single most telling number from the note.`,
    `  2. One sentence of diagnosis (pull from identification).`,
    `  3. One sentence of stance (pull from recommendation).`,
    `  4. End with the next dated test / trigger (pull from recommendation signposts).`,
    `  5. Max 45 words. No preamble. No hedging. No adjectives.`,
    `  6. Do NOT introduce any number not already in the note.`,
    ``,
    `CURRENT READING:`,
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
    `TOP METRICS: ${topMetrics || ""}`,
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

function deterministic({ identification, recommendation, currentReading }) {
  const key = identification.bullets?.[0]?.number || currentReading.lines?.[0] || "Macro update";
  const diag = identification.bullets?.[0]?.headline || "regime conditions";
  const stance = recommendation.stance || "Stance pending.";
  const sp = recommendation.signposts?.[0];
  const next = sp ? `Next test: ${sp.dated_event}.` : "";
  const text = `${key}. ${diag}. ${stance} ${next}`.trim();
  const words = text.split(/\s+/).length;
  return { text, words };
}
