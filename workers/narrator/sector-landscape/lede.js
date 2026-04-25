// Sector-landscape lede — GPT-4o-mini reads the 3 comparative blocks + top
// stance_scores and writes a 3–4 line summary for the Layer 2 main card.
// Deterministic fallback on API failure. No new numbers introduced.

import { callMiniText } from "../shared/openai.js";
import { validateLede } from "../shared/validate.js";

export async function runLede({ apiKey, currentReading, identification, recommendation, topSectors }) {
  try {
    const prompt = buildPrompt({ currentReading, identification, recommendation, topSectors });
    const text = await callMiniText({ apiKey, prompt, label: "sector-landscape-lede", maxTokens: 120 });
    const v = validateLede(text);
    if (v.ok) {
      return { ok: true, text: v.text, words: v.words, source: "gpt-4o-mini" };
    }
    console.warn(`[narrator:sector-landscape-lede] validation failed: ${v.reason}; using fallback`);
  } catch (e) {
    console.warn(`[narrator:sector-landscape-lede] API failure: ${e.message}; using fallback`);
  }
  return { ok: true, ...deterministic({ identification, recommendation, currentReading }), source: "deterministic" };
}

function buildPrompt({ currentReading, identification, recommendation, topSectors }) {
  return [
    `You are writing the 3–4 line opening summary of a daily SECTOR-ROTATION note for a busy professional investor.`,
    ``,
    `STRICT RULES:`,
    `  1. Lead with the single most telling comparative fact (widest spread, biggest divergence, or a named pattern from the identification).`,
    `  2. One sentence of diagnosis (pull from identification top bullet).`,
    `  3. One sentence of rotation stance (pull from recommendation — name at least one ADD and one CUT sector).`,
    `  4. End with the next dated trigger (pull from recommendation signposts).`,
    `  5. Max 45 words. No preamble. No hedging. No adjectives.`,
    `  6. Do NOT introduce any number or sector not already in the note.`,
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
    `TOP SECTORS: ${topSectors || ""}`,
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
  const key = identification.bullets?.[0]?.number || currentReading.lines?.[0] || "Sector rotation update";
  const diag = identification.bullets?.[0]?.headline || "cross-sector divergence";
  const stance = recommendation.stance || "Stance pending.";
  const sp = recommendation.signposts?.[0];
  const next = sp ? `Next test: ${sp.dated_event}.` : "";
  const text = `${key}. ${diag}. ${stance} ${next}`.trim();
  const words = text.split(/\s+/).length;
  return { text, words };
}
