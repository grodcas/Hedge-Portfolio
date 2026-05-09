// workers/_shared/openai-call.js
//
// Drop-in replacement for `fetch(...openai...)` in the snowflake workers
// that don't go through `_shared/llm.js`. Records the call to
// PROC_04_API_usage so the Validator tab's spend column reflects every
// OpenAI hit, not just the agent fleet's.
//
// Usage:
//   import { openaiFetch } from "../../_shared/openai-call.js";
//
//   // At the top of fetch(req, env) and scheduled(_event, env, ctx):
//   globalThis.__OAI_CTX = { env, caller: "this-worker-name" };
//
//   // Then anywhere downstream:
//   const res = await openaiFetch("https://api.openai.com/v1/chat/completions", init);
//
// We rely on globalThis (not threading env through) because these workers
// have bespoke OpenAI clients buried under multiple helper functions, and
// touching every caller would be invasive. Each worker handles one request
// at a time per isolate, so the global is safe for cost telemetry.

import { recordApiCall } from "./api-usage.js";

export async function openaiFetch(url, init) {
  const ctx = globalThis.__OAI_CTX || {};
  let ok = false;
  let model = "default";
  if (init?.body) {
    try { model = JSON.parse(init.body).model || "default"; } catch { /* keep default */ }
  }
  try {
    const res = await fetch(url, init);
    ok = res.ok;
    return res;
  } finally {
    if (ctx.env && ctx.caller) {
      try {
        await recordApiCall({
          env:      ctx.env,
          caller:   ctx.caller,
          api:      "openai",
          endpoint: model,
          calls:    1,
          ok,
        });
      } catch { /* swallow — telemetry must not break the call */ }
    }
  }
}
