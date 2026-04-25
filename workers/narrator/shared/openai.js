// Thin wrapper around OpenAI Chat Completions for the narrator workers.
//
// Responsibilities:
//  - GPT-5 call (identification, recommendation) — JSON-mode, structured output
//  - GPT-4o-mini call (lede) — plain text output
//  - One retry on transient error; on second failure, throw so caller can use
//    the deterministic fallback path
//  - Cost/token logging per call (stdout — Cloudflare observability captures it)
//
// No state, no caching. Every call is explicit.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export async function callGPT5({ apiKey, prompt, label }) {
  return _callJson({
    apiKey,
    model: "gpt-5",
    prompt,
    label: label || "gpt-5",
    responseFormat: { type: "json_object" },
  });
}

export async function callMiniText({ apiKey, prompt, label, maxTokens = 200 }) {
  const started = Date.now();
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
        }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || "gpt-4o-mini error");
      const text = j.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("empty gpt-4o-mini output");
      _logCall({
        label: label || "gpt-4o-mini",
        model: "gpt-4o-mini",
        usage: j.usage,
        durationMs: Date.now() - started,
        attempt,
      });
      return text;
    } catch (e) {
      lastErr = e;
      if (attempt === 1) await _sleep(600);
    }
  }
  throw lastErr;
}

async function _callJson({ apiKey, model, prompt, label, responseFormat }) {
  const started = Date.now();
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(OPENAI_URL, {
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
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || `${model} error`);
      const text = j.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error(`empty ${model} output`);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error(`${model} returned non-JSON: ${text.slice(0, 200)}`);
      }
      _logCall({
        label,
        model,
        usage: j.usage,
        durationMs: Date.now() - started,
        attempt,
      });
      return parsed;
    } catch (e) {
      lastErr = e;
      if (attempt === 1) await _sleep(600);
    }
  }
  throw lastErr;
}

function _logCall({ label, model, usage, durationMs, attempt }) {
  const u = usage || {};
  console.log(
    `[narrator:${label}] model=${model} in=${u.prompt_tokens ?? "?"} out=${u.completion_tokens ?? "?"} total=${u.total_tokens ?? "?"} ms=${durationMs} attempt=${attempt}`
  );
}

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
