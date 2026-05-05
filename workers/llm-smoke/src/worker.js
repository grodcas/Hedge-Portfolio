/**
 * LLM-SMOKE — verification harness for `workers/_shared/llm.js`.
 *
 * Sole purpose: prove the shared module wires up cleanly and returns parsed
 * JSON for a trivial prompt. The MS-2/MS-3 narrative agents copy this same
 * import path. No cron — manual /smoke only.
 */

import { callLLM } from "../../_shared/llm.js";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/smoke") return new Response("Not found", { status: 404 });

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
    }

    try {
      const result = await callLLM(
        apiKey,
        `Return exactly this JSON and nothing else: {"smoke":"ok","message":"shared llm.js wired"}`,
        { model: "gpt-5-mini" },
      );
      return Response.json({ ok: true, result });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};
