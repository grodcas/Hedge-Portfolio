import { logCronRun } from "../../_shared/cron-log.js";
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
    ctx.waitUntil(
      logCronRun(env, "fomc-statement-fetcher", () => build(env))
        .catch((e) => console.error(`[fomc-fetcher] cron: ${e.message}`)),
    );
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
  // The Fed names SEP files by the rate-decision day (the second meeting day).
  // RSS pubDate of the press release matches that day. But callers occasionally
  // pass the press-conference / announcement day (off by ±1), so we try the
  // primary date first, then ±1 as a fallback before giving up.
  const tryDates = [meetingDate, addDays(meetingDate, -1), addDays(meetingDate, 1)];
  let res, url, html;
  for (const d of tryDates) {
    url = `https://www.federalreserve.gov/monetarypolicy/fomcprojtabl${d.replace(/-/g, "")}.htm`;
    res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
    if (res.ok) {
      html = await res.text();
      // Fed serves a 200-with-404-body for missing meetings; detect via the
      // "Page not found" h2 the templated 404 emits.
      if (!/<h2>\s*Page not found\s*<\/h2>/i.test(html)) break;
      html = null;
    }
  }
  if (!html) return { ok: true, skip: `no SEP page within ±1 day of ${meetingDate}` };

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

// SEP HTML structure (stable since 2017, when the Fed added classed cells):
//
//   ONE table at the top (class="pubtables") is the consolidated summary:
//     header row 1: <th>Variable</th> + <th colspan=4>Median</th> + ditto
//                   <th colspan=4>Central Tendency</th> + <th colspan=4>Range</th>
//     header row 2: 12 year sub-cells: 2026, 2027, 2028, "Longer run" repeated
//                   3× — once per stat-group.
//     body rows alternate: indicator row + a "December projection" sub-row
//                          (class includes "in1") which we skip.
//     indicators (top→bottom): Change in real GDP, Unemployment rate, PCE
//                              inflation, Core PCE inflation, then a memo
//                              divider, then Federal funds rate (= dot plot).
//     Median cells are a single number; CT and Range cells are "L–H" en-dash
//     spans (occasionally a single number when the range collapses).
//
// We emit one row per (indicator × year × stat). Range / central_tendency
// split into _low and _high (so the dashboard can render bands without
// re-parsing strings).
function parseSEP(html) {
  // The page also embeds per-indicator detail tables further down, all using
  // the same "pubtables" class — we only want the first, which carries the
  // summary used by the dashboard.
  const tableMatch = /<table[^>]*class="[^"]*pubtables[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!tableMatch) return [];
  const tbl = tableMatch[1];

  const indicatorMap = [
    [/change in real gdp/i, "GDP"],
    [/unemployment rate/i,  "UNEMPLOYMENT"],
    [/^pce inflation/i,     "PCE"],          // anchored — must not steal "Core PCE inflation"
    [/core pce inflation/i, "CORE_PCE"],
    [/federal funds rate/i, "FED_FUNDS"],
  ];

  // Year labels live in the second <tr> of <thead>.
  const headMatch = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(tbl);
  if (!headMatch) return [];
  const headerRows = [...headMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (headerRows.length < 2) return [];
  const yearCells = [...headerRows[1][1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)]
    .map((c) => cleanText(c[1]));
  // Stat groups partition the 12 columns evenly: 0..N-1 = median,
  // N..2N-1 = central_tendency, 2N..3N-1 = range.
  const yearsPerGroup = yearCells.length / 3;
  if (!Number.isInteger(yearsPerGroup) || yearsPerGroup === 0) return [];

  const out = [];
  const bodyMatch = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(tbl);
  const bodySrc = bodyMatch ? bodyMatch[1] : tbl;
  const bodyRows = [...bodySrc.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const r of bodyRows) {
    const rowSrc = r[1];

    // First <th> in the body row is the row stub. Skip "December projection"
    // sub-rows (class includes "in1") and the colspanned "Memo:" divider.
    const stubMatch = /<th\b([^>]*)>([\s\S]*?)<\/th>/i.exec(rowSrc);
    if (!stubMatch) continue;
    const stubAttrs = stubMatch[1];
    if (/\bin1\b/.test(stubAttrs)) continue;
    if (/\bcolspan="\d+"/i.test(stubAttrs)) continue;

    const label = cleanText(stubMatch[2]);
    let indicator = null;
    for (const [re, code] of indicatorMap) {
      if (re.test(label)) { indicator = code; break; }
    }
    if (!indicator) continue;

    const cells = [...rowSrc.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((c) => cleanText(c[1]));

    for (let i = 0; i < yearCells.length; i++) {
      const cell = cells[i];
      if (!cell) continue; // emptystub / collapsed cell (e.g., Core PCE Longer run)
      const year = yearCells[i];
      const groupIdx = Math.floor(i / yearsPerGroup);
      const baseStat = groupIdx === 0 ? "median" : groupIdx === 1 ? "central_tendency" : "range";

      if (baseStat === "median") {
        const v = parseFloat(cell);
        if (Number.isFinite(v)) out.push({ indicator, year, stat: baseStat, value: v, unit: "%" });
      } else {
        const rng = cell.match(/([0-9.]+)\s*(?:[–—\-]|to)\s*([0-9.]+)/);
        if (rng) {
          const lo = parseFloat(rng[1]);
          const hi = parseFloat(rng[2]);
          if (Number.isFinite(lo)) out.push({ indicator, year, stat: `${baseStat}_low`,  value: lo, unit: "%" });
          if (Number.isFinite(hi)) out.push({ indicator, year, stat: `${baseStat}_high`, value: hi, unit: "%" });
        } else {
          // Collapsed single value (e.g., PCE 2028 = "2.0" in CT and Range).
          const v = parseFloat(cell);
          if (Number.isFinite(v)) {
            out.push({ indicator, year, stat: `${baseStat}_low`,  value: v, unit: "%" });
            out.push({ indicator, year, stat: `${baseStat}_high`, value: v, unit: "%" });
          }
        }
      }
    }
  }
  return out;
}

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
