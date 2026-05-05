/**
 * Shared LLM caller for the Hedge-Portfolio agent fleet.
 *
 * This module is the canonical OpenAI client for every NEW agent landed in
 * MS-2 / MS-3. Existing snowflake LLM workers (operations-agent,
 * news-funnel-filter, macro-intelligence-builder, etc.) intentionally stay
 * on their own implementations — refactoring them is out of scope for this
 * sprint chain.
 *
 * Pattern lifted from `operations-agent/src/worker.js` (lines 229–244,
 * pinned as canonical in PRE_SPRINT_AUDIT §4):
 *   - /v1/chat/completions
 *   - response_format: { type: "json_object" }
 *   - JSON.parse on the assistant message text
 *
 * Plus the markdown-fence-stripping JSON parser from news-funnel-filter so
 * agents survive the occasional ```json … ``` wrap that gpt-5 emits despite
 * the response_format hint.
 *
 * Single retry on transient (HTTP 5xx / network / timeout). Any 4xx (auth,
 * quota, content policy) throws on the first attempt — retrying makes those
 * worse, not better.
 */

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-5";

/**
 * Call OpenAI and return parsed JSON.
 *
 * @param {string} apiKey  OpenAI API key.
 * @param {string} prompt  User-message content.
 * @param {object} [opts]
 * @param {string} [opts.model="gpt-5"]   Model id ("gpt-5" for synthesis,
 *                                         "gpt-5-mini" for tagging, etc.)
 * @param {object} [opts.responseFormat]  Override the response_format hint.
 *                                         Defaults to { type: "json_object" }.
 * @returns {Promise<any>}                 Parsed JSON from the assistant.
 */
export async function callLLM(apiKey, prompt, opts = {}) {
  if (!apiKey) throw new Error("callLLM: apiKey is required");
  if (!prompt) throw new Error("callLLM: prompt is required");

  const model = opts.model || DEFAULT_MODEL;
  const responseFormat = opts.responseFormat || { type: "json_object" };

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: responseFormat,
        }),
      });

      if (!res.ok) {
        const bodyText = await res.text();
        // Retry only on 5xx; 4xx (auth/quota/policy) is not transient.
        if (res.status >= 500 && attempt === 0) {
          lastErr = new Error(`HTTP ${res.status}: ${bodyText.slice(0, 200)}`);
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${bodyText.slice(0, 200)}`);
      }

      const j = await res.json();
      if (j.error) throw new Error(j.error.message || `${model} error`);
      const text = j.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error(`empty ${model} output`);
      return parseJsonFromResponse(text);
    } catch (err) {
      lastErr = err;
      // Network errors / aborts are transient on the first try.
      const transient = /timeout|network|fetch failed|aborted/i.test(err.message || "");
      if (attempt === 0 && transient) continue;
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Strict-then-tolerant JSON parser. Handles:
 *   - clean JSON (the happy path)
 *   - ```json ... ``` markdown fences
 *   - leading/trailing prose with an embedded {...} object
 *
 * Throws on hard parse failure rather than returning null; agents should
 * surface this as an error so a bad LLM payload doesn't get silently swallowed.
 */
export function parseJsonFromResponse(text) {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("parseJsonFromResponse: empty input");
  }
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        throw new Error("parseJsonFromResponse: invalid JSON inside braces");
      }
    }
    throw new Error("parseJsonFromResponse: no JSON object found");
  }
}
