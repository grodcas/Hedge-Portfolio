// Per-stock lede — GPT-4o-mini reads both horizons + current reading and
// writes a single 3-4 line summary. This lede is what shows in the stock
// shortlist hover, the Layer 3 ticker row, and the stock entity header.
// Deterministic fallback on API failure.

import { callMiniText } from "../shared/openai.js";
import { validateLede } from "../shared/validate.js";

export async function runLede({ apiKey, ticker, currentReading, identLong, identShort, recLong, recShort }) {
  try {
    const prompt = buildPrompt({ ticker, currentReading, identLong, identShort, recLong, recShort });
    const text = await callMiniText({ apiKey, prompt, label: `stock-${ticker}-lede`, maxTokens: 120 });
    const v = validateLede(text);
    if (v.ok) {
      return { ok: true, text: v.text, words: v.words, source: "gpt-4o-mini" };
    }
    console.warn(`[narrator:stock-${ticker}-lede] validation failed: ${v.reason}; using fallback`);
  } catch (e) {
    console.warn(`[narrator:stock-${ticker}-lede] API failure: ${e.message}; using fallback`);
  }
  return { ok: true, ...deterministic({ ticker, currentReading, identLong, identShort, recLong, recShort }), source: "deterministic" };
}

function buildPrompt({ ticker, currentReading, identLong, identShort, recLong, recShort }) {
  return [
    `You are writing the 3–4 line opening summary for ${ticker} in a professional investor's daily note.`,
    ``,
    `STRICT RULES:`,
    `  1. Lead with the single most telling fact (composite score, top factor, or a named catalyst/news from the blocks).`,
    `  2. One sentence of long-term read (pull from ident_long top bullet or rec_long stance).`,
    `  3. One sentence of tactical read (pull from ident_short top bullet or rec_short stance).`,
    `  4. End with the next dated trigger (pull from rec_short signposts — the 1-2wk horizon matters).`,
    `  5. Max 45 words. No preamble. No hedging. No adjectives.`,
    `  6. Do NOT introduce any number or fact not already in the blocks.`,
    `  7. Stay inside ${ticker} — no sector commentary, no peer tickers.`,
    ``,
    `CURRENT READING:`,
    currentReading.text,
    ``,
    `LONG-TERM IDENTIFICATION (top bullet):`,
    _bulletLine(identLong.bullets?.[0]),
    ``,
    `LONG-TERM STANCE:`,
    recLong.stance || "(no stance)",
    ``,
    `TACTICAL IDENTIFICATION (top bullet):`,
    _bulletLine(identShort.bullets?.[0]),
    ``,
    `TACTICAL STANCE:`,
    recShort.stance || "(no stance)",
    ``,
    `NEXT TACTICAL SIGNPOST:`,
    _signpostLine(recShort.signposts?.[0]),
    ``,
    `Output: plain text, no JSON, no quotes. Just the 3–4 line summary.`,
  ].join("\n");
}

function _bulletLine(b) {
  if (!b) return "(no bullet)";
  return `${b.headline} — ${b.number} (${b.event}). ${b.interpretation}`;
}

function _signpostLine(s) {
  if (!s) return "(no signposts)";
  return `${s.dated_event}: ${s.trigger} → ${s.action}`;
}

function deterministic({ ticker, currentReading, identLong, identShort, recLong, recShort }) {
  const key = currentReading.lines?.[0] || `${ticker} update`;
  const longRead = identLong.bullets?.[0]?.headline || recLong.stance || "long-term thesis pending";
  const shortRead = identShort.bullets?.[0]?.headline || recShort.stance || "tactical read pending";
  const sp = recShort.signposts?.[0];
  const next = sp ? `Next test: ${sp.dated_event}.` : "";
  const text = `${key}. Long-term: ${longRead}. Tactical: ${shortRead}. ${next}`.trim();
  const words = text.split(/\s+/).length;
  return { text, words };
}
