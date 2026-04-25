/**
 * FOMC-STATEMENT-FETCHER — writes to MACRO_STATE_fomc
 *
 * Pulls the Fed's monetary-policy RSS, picks every "Federal Reserve issues
 * FOMC statement" item, fetches each statement's press-release page, and
 * writes one row per statement to MACRO_STATE_fomc. Idempotent on
 * (meeting_date, title) via hashed PK + ON CONFLICT DO UPDATE.
 *
 * Endpoints:
 *   GET /build    — scrape + write. Returns {ok, seen, inserted, rows[]}.
 *   GET /status   — last row snapshot from D1.
 *
 * Cron:
 *   Hourly. FOMC releases are rare (~8/year) but an hourly tick catches
 *   same-day updates from re-wording / corrections without extra cost.
 *
 * Parsing:
 *   - RSS is XML; we use small regexes rather than xml2js to avoid a
 *     node-polyfill dependency.
 *   - Statement page paragraphs live inside
 *     <div class="col-xs-12 col-sm-8 col-md-8">…<p>…</p>…</div>. We slice
 *     that block out with a non-greedy regex then extract every <p>…</p>.
 *   - User-Agent: set a browser UA. The Fed returns 403 to workers' default
 *     UA on some CDNs.
 */

const RSS_URL = "https://www.federalreserve.gov/feeds/press_monetary.xml";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/build") return Response.json(await build(env));
      if (url.pathname === "/status") return Response.json(await status(env));
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(build(env).catch((e) => console.error(`[fomc-fetcher] cron: ${e.message}`)));
  },
};

async function build(env) {
  const rss = await httpText(RSS_URL);
  const items = parseRssItems(rss);
  const statements = items.filter((it) =>
    /federal reserve issues fomc statement/i.test(it.title),
  );

  const rows = [];
  for (const it of statements) {
    try {
      const page = await httpText(it.link);
      const { paragraphs, decision_summary } = extractStatement(page);
      const statement_text = paragraphs.join("\n\n").trim();
      if (!statement_text) continue;

      const meeting_date = it.date;
      // Match macro/bootstrap_macro_state.js hash("FOMC", date) format so a
      // re-scrape of a date already present from the bootstrap seed
      // overwrites (via ON CONFLICT) instead of inserting a duplicate.
      const id = (await shortHash(`FOMC|${meeting_date}`)).slice(0, 32);
      await env.DB.prepare(
        `INSERT INTO MACRO_STATE_fomc
           (id, meeting_date, title, decision_summary, statement_text, source_url)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           decision_summary = excluded.decision_summary,
           statement_text   = excluded.statement_text,
           source_url       = excluded.source_url`,
      )
        .bind(id, meeting_date, it.title, decision_summary, statement_text, it.link)
        .run();

      rows.push({ meeting_date, title: it.title, len: statement_text.length });
    } catch (err) {
      rows.push({ meeting_date: it.date, title: it.title, error: err.message });
    }
  }

  return { ok: true, seen: items.length, statements: statements.length, inserted: rows.length, rows };
}

async function status(env) {
  const latest = await env.DB.prepare(
    `SELECT meeting_date, title, length(statement_text) AS len, source_url, created_at
       FROM MACRO_STATE_fomc ORDER BY meeting_date DESC LIMIT 5`,
  ).all();
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM MACRO_STATE_fomc`).first();
  return { ok: true, count: count?.n ?? 0, latest: latest.results || [] };
}

// ---------- HTTP + parsing helpers ----------

async function httpText(url) {
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return await res.text();
}

// Regex-parse <item>…</item> blocks. We only need title, link, pubDate.
// Links are wrapped in <![CDATA[…]]>; titles may or may not be.
function parseRssItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const title = unwrap(pick(block, /<title>([\s\S]*?)<\/title>/));
    const link = unwrap(pick(block, /<link>([\s\S]*?)<\/link>/));
    const pubDate = unwrap(pick(block, /<pubDate>([\s\S]*?)<\/pubDate>/));
    const date = toIsoDate(pubDate);
    if (title && link && date) items.push({ title, link, date });
  }
  return items;
}

function pick(s, re) {
  const m = re.exec(s);
  return m ? m[1] : "";
}
function unwrap(s) {
  const m = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(s);
  return (m ? m[1] : s).trim();
}
function toIsoDate(rfc) {
  if (!rfc) return null;
  const t = Date.parse(rfc);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

// Pull the statement body. Slice the col-xs-12 col-sm-8 col-md-8 block, then
// extract every <p>…</p>. Strip inline tags, decode a minimal set of entities.
function extractStatement(html) {
  const blockRe = /<div class="col-xs-12 col-sm-8 col-md-8">([\s\S]*?)<\/div>/;
  const blockMatch = blockRe.exec(html);
  const scope = blockMatch ? blockMatch[1] : html;

  const paragraphs = [];
  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = pRe.exec(scope)) !== null) {
    const txt = cleanText(m[1]);
    if (!txt) continue;
    // Drop the media-inquiries boilerplate and the implementation-note link.
    if (/^for media inquiries/i.test(txt)) continue;
    if (/^implementation note/i.test(txt)) continue;
    paragraphs.push(txt);
  }

  // decision_summary = the paragraph mentioning the federal funds target range
  // (that's where the rate action lives). Fallback: second paragraph.
  const rate = paragraphs.find((p) => /federal funds rate/i.test(p)) || paragraphs[1] || "";
  const decision_summary = rate.slice(0, 600);

  return { paragraphs, decision_summary };
}

function cleanText(s) {
  return s
    .replace(/<[^>]+>/g, "") // strip inline tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function shortHash(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
