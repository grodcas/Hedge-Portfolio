/**
 * FOMC-STATEMENT-FETCHER — writes to MACRO_STATE_fomc + FOMC_PROJECTIONS
 *
 * Pulls the Fed's monetary-policy RSS, picks every "Federal Reserve issues
 * FOMC statement" item, fetches each statement's press-release page, and
 * writes one row per statement to MACRO_STATE_fomc. Idempotent on
 * (meeting_date, title) via hashed PK + ON CONFLICT DO UPDATE.
 *
 * For projection meetings (March / June / Sept / Dec — 4× year), this worker
 * also fetches the Summary of Economic Projections (SEP) HTML table from
 *   https://www.federalreserve.gov/monetarypolicy/fomcprojtabl{YYYYMMDD}.htm
 * and writes per-year median + central-tendency rows into FOMC_PROJECTIONS.
 * The SEP table contains the dot plot (under "Appropriate federal funds rate")
 * plus GDP / Unemployment / PCE / Core PCE projections.
 *
 * Endpoints:
 *   GET /build       — scrape + write. Returns {ok, seen, inserted, rows[]}.
 *   GET /projections?meeting=YYYY-MM-DD — force-refetch projections for one meeting.
 *   GET /status      — last row snapshot from D1.
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
 *   - SEP table cells follow a Fed-published structure that has been stable
 *     since 2014. Parser is permissive — if the structure changes, projections
 *     for that meeting are logged + skipped rather than guessed.
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
      if (url.pathname === "/projections") {
        const meeting = url.searchParams.get("meeting");
        if (!meeting) return Response.json({ ok: false, error: "meeting=YYYY-MM-DD required" }, { status: 400 });
        return Response.json(await fetchAndWriteProjections(env, meeting));
      }
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

      // Projection meetings only — March, June, September, December.
      const month = parseInt(meeting_date.slice(5, 7), 10);
      if ([3, 6, 9, 12].includes(month)) {
        try {
          const proj = await fetchAndWriteProjections(env, meeting_date);
          rows[rows.length - 1].projections = proj;
        } catch (err) {
          // Projections are best-effort; log + continue. Statement row is already written.
          console.warn(`[fomc-fetcher] projections for ${meeting_date}: ${err.message}`);
          rows[rows.length - 1].projections_error = err.message;
        }
      }
    } catch (err) {
      rows.push({ meeting_date: it.date, title: it.title, error: err.message });
    }
  }

  return { ok: true, seen: items.length, statements: statements.length, inserted: rows.length, rows };
}

// ----------- SEP / dot-plot projections -----------
// One row per (meeting × indicator × year × stat) into FOMC_PROJECTIONS.
// Returns a brief summary so /build can echo what was extracted.
async function fetchAndWriteProjections(env, meetingDate) {
  const dateCompact = meetingDate.replace(/-/g, ""); // YYYYMMDD
  const url = `https://www.federalreserve.gov/monetarypolicy/fomcprojtabl${dateCompact}.htm`;

  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (res.status === 404) return { ok: true, skip: "no SEP page (likely a non-projection meeting)" };
  if (!res.ok) throw new Error(`SEP page → HTTP ${res.status}`);
  const html = await res.text();

  const projections = parseSEP(html);
  if (projections.length === 0) {
    throw new Error("SEP page fetched but no projection rows extracted — table structure may have changed");
  }

  let inserted = 0;
  for (const p of projections) {
    const id = await shortHash(`SEP|${meetingDate}|${p.indicator}|${p.year}|${p.stat}`);
    await env.DB.prepare(
      `INSERT INTO FOMC_PROJECTIONS
         (id, meeting_date, indicator, year, stat, value, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         value = excluded.value,
         unit  = excluded.unit`,
    )
      .bind(id, meetingDate, p.indicator, p.year, p.stat, p.value, p.unit || "%")
      .run();
    inserted++;
  }

  return { ok: true, url, rows: projections.length, inserted };
}

// SEP HTML structure (stable since 2014):
//   First table is "Economic projections … percent change"
//   Rows per indicator (Change in real GDP, Unemployment rate, PCE inflation,
//                       Core PCE inflation), each with sub-rows for years
//                       (current, +1, +2, +3, Longer run) and stats
//                       (Median, Central tendency, Range).
//   A separate table covers "Appropriate target federal funds rate at year-end"
//   — that's the dot plot's median / range.
//
// Parser strategy: pull every <table> with a recognisable indicator label,
// then walk rows. Permissive — if a row doesn't match the expected shape, skip.
function parseSEP(html) {
  const out = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;

  const indicatorMap = [
    [/change in real gdp/i,            "GDP",            "%"],
    [/unemployment rate/i,             "UNEMPLOYMENT",   "%"],
    [/pce inflation/i,                 "PCE",            "%"],
    [/core pce inflation/i,            "CORE_PCE",       "%"],
    [/appropriate.*federal funds rate/i, "FED_FUNDS",    "%"],
  ];

  let m;
  while ((m = tableRe.exec(html)) !== null) {
    const tbl = m[1];

    // Identify the indicator from a leading <caption> or first heading text.
    let indicator = null, unit = "%";
    for (const [re, code, u] of indicatorMap) {
      if (re.test(tbl.slice(0, 1000))) { indicator = code; unit = u; break; }
    }
    if (!indicator) continue;

    // Header row carries year labels (e.g., 2026, 2027, 2028, Longer run).
    const headerMatch = /<thead[\s\S]*?<\/thead>/i.exec(tbl);
    const headerSrc = headerMatch ? headerMatch[0] : tbl.slice(0, 1500);
    const yearLabels = [];
    const yearReHdr = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let h;
    while ((h = yearReHdr.exec(headerSrc)) !== null) {
      const txt = cleanText(h[1]);
      if (/^20\d{2}$/.test(txt) || /longer run/i.test(txt)) yearLabels.push(txt);
    }
    if (yearLabels.length === 0) continue;

    // Body rows: row label is the stat (Median / Central tendency / Range).
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let r;
    while ((r = rowRe.exec(tbl)) !== null) {
      const rowSrc = r[1];
      const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      const cells = [];
      let c;
      while ((c = cellRe.exec(rowSrc)) !== null) cells.push(cleanText(c[1]));
      if (cells.length < 2) continue;

      const label = cells[0].toLowerCase();
      let stat = null;
      if (/median/.test(label)) stat = "median";
      else if (/central tendency/.test(label)) stat = "central_tendency";
      else if (/range/.test(label)) stat = "range";
      if (!stat) continue;

      // Cells [1..yearLabels.length] correspond to year columns.
      // For "Median" rows, value is a single number per year.
      // For "Central tendency" / "Range", value is "low–high" or "low–high".
      for (let i = 0; i < yearLabels.length; i++) {
        const cell = cells[i + 1];
        if (!cell) continue;
        if (stat === "median") {
          const v = parseFloat(cell);
          if (Number.isFinite(v)) out.push({ indicator, year: yearLabels[i], stat, value: v, unit });
        } else {
          // Range / central tendency = "L–H" or "L to H"
          const rng = cell.match(/([0-9.]+)\s*(?:[–—\-]|to)\s*([0-9.]+)/);
          if (rng) {
            const lo = parseFloat(rng[1]);
            const hi = parseFloat(rng[2]);
            if (Number.isFinite(lo)) out.push({ indicator, year: yearLabels[i], stat: `${stat}_low`, value: lo, unit });
            if (Number.isFinite(hi)) out.push({ indicator, year: yearLabels[i], stat: `${stat}_high`, value: hi, unit });
          }
        }
      }
    }
  }
  return out;
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
