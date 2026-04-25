// Per-sector lede — GPT-4o-mini reads the sector's 3 blocks + stance and
// writes a 3–4 line summary that anchors the sector entity view.
// Deterministic fallback on API failure. No new numbers introduced.

import { callMiniText } from "../shared/openai.js";
import { validateLede } from "../shared/validate.js";

export async function runLede({ apiKey, sector, currentReading, identification, recommendation }) {
  try {
    const prompt = buildPrompt({ sector, currentReading, identification, recommendation });
    const text = await callMiniText({ apiKey, prompt, label: `sector-${sector}-lede`, maxTokens: 120 });
    const v = validateLede(text);
    if (v.ok) {
      return { ok: true, text: v.text, words: v.words, source: "gpt-4o-mini" };
    }
    console.warn(`[narrator:sector-${sector}-lede] validation failed: ${v.reason}; using fallback`);
  } catch (e) {
    console.warn(`[narrator:sector-${sector}-lede] API failure: ${e.message}; using fallback`);
  }
  return { ok: true, ...deterministic({ sector, identification, recommendation, currentReading }), source: "deterministic" };
}

function buildPrompt({ sector, currentReading, identification, recommendation }) {
  return [
    `You are writing the 3–4 line opening summary of a daily ${sector} sector note for a busy professional investor.`,
    ``,
    `STRICT RULES:`,
    `  1. Lead with the single most telling fact about ${sector} (stance + score, or the top identification bullet).`,
    `  2. One sentence of diagnosis (pull from identification top bullet).`,
    `  3. One sentence of tactical stance (pull from recommendation — name at least one ADD and one CUT ticker).`,
    `  4. End with the next dated trigger (pull from recommendation signposts).`,
    `  5. Max 45 words. No preamble. No hedging. No adjectives.`,
    `  6. Do NOT introduce any number or ticker not already in the note.`,
    `  7. Stay inside ${sector} — no cross-sector commentary.`,
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

function deterministic({ sector, identification, recommendation, currentReading }) {
  const key = identification.bullets?.[0]?.number || currentReading.lines?.[0] || `${sector} update`;
  const diag = identification.bullets?.[0]?.headline || `${sector} factor read`;
  const stance = recommendation.stance || "Stance pending.";
  const sp = recommendation.signposts?.[0];
  const next = sp ? `Next test: ${sp.dated_event}.` : "";
  const text = `${key}. ${diag}. ${stance} ${next}`.trim();
  const words = text.split(/\s+/).length;
  return { text, words };
}
