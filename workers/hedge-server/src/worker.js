// hedge-server: serves the v2 dashboard static HTML and proxies /api/* to portfolio-ingestor.
// Mapping: /api/<name>[?qs] → portfolio-ingestor /query/<name>[?qs] (1:1 for every v2 endpoint).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const queryPath = "/query/" + url.pathname.slice("/api/".length);
      const target = `https://internal${queryPath}${url.search}`;
      const init = {
        method: request.method,
        headers: request.headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      };
      try {
        const upstream = await env.PORTFOLIO_INGESTOR.fetch(new Request(target, init));
        return new Response(upstream.body, {
          status: upstream.status,
          headers: upstream.headers,
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: `Upstream proxy failed: ${err.message}`, path: url.pathname, source: "hedge-server" }),
          { status: 502, headers: { "content-type": "application/json" } }
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
};
