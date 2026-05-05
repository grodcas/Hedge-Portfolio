/**
 * MACRO-SIGNPOSTS-AGENT (M5) — forward-looking events that confirm/break thesis.
 *
 * Per [MAP_PIPELINE.md §M5]. Ordered list of upcoming events with one
 * sentence each: "what would confirm the thesis vs fire a tripwire."
 *
 * Inputs:
 *   - MACRO_STATE_calendar (next 21d, high-impact only — economic-calendar
 *     -fetcher populates this from Finnhub)
 *   - Thesis drivers + tripwires (BETA_10_Daily_macro.thesis_json)
 *
 * Output (validated):
 *   {
 *     events: [{
 *       date:          YYYY-MM-DD,
 *       country:       "US"|"EU"|...,
 *       event_code:    "CPI"|"NFP"|"FOMC"|...,
 *       event_label:   raw Finnhub name,
 *       touches:       [driver_name | tripwire_id, ...],   // why it matters
 *       what_to_watch: "<one sentence with thresholds + tie-back>"
 *     }],
 *     version, last_updated, input_fingerprint, regime_at_write
 *   }
 *
 * Writes BETA_10_Daily_macro.{signposts_json,_updated_at,_model}.
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";
const HORIZON_DAYS = 21;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
    try {
      const out = await build(env.DB, apiKey, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(db, apiKey, force) {
  const macroRow = await db.prepare(
    `SELECT id, regime, thesis_json,
            signposts_json, signposts_updated_at, creation_date
       FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC LIMIT 1`,
  ).first();
  if (!macroRow) throw new Error("no BETA_10_Daily_macro row");
  if (!macroRow.thesis_json) throw new Error("no thesis_json yet — fire macro-thesis-agent first");

  const thesis = JSON.parse(macroRow.thesis_json);

  const calRes = await db.prepare(
    `SELECT event_date, event_time, country, event_code, event_label,
            impact, consensus, prior, unit
       FROM MACRO_STATE_calendar
      WHERE event_date >= date('now')
        AND event_date <= date('now', ?)
        AND impact = 'high'
      ORDER BY event_date, event_time`,
  ).bind(`+${HORIZON_DAYS} days`).all();
  const events = calRes.results || [];

  const prevSignposts = macroRow.signposts_json ? safeJson(macroRow.signposts_json) : null;
  const prevVersion = Number.isInteger(prevSignposts?.version) ? prevSignposts.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    thesis_drivers:   thesis.drivers,
    thesis_tripwires: thesis.tripwires,
    regime: macroRow.regime,
    events: events.map(e => [e.event_date, e.country, e.event_code, e.consensus, e.prior]),
  }));

  if (!force && prevSignposts?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      version: prevVersion,
      signposts_updated_at: macroRow.signposts_updated_at,
    };
  }

  // No upcoming high-impact events at all → still write a "no signposts" row
  // so the dashboard shows the empty state cleanly + version increments.
  if (events.length === 0) {
    const now = new Date().toISOString();
    const empty = {
      events: [],
      version: prevVersion + 1,
      last_updated: now,
      input_fingerprint: fingerprint,
      regime_at_write: macroRow.regime ?? null,
      note: `no high-impact events in MACRO_STATE_calendar within ${HORIZON_DAYS}d`,
    };
    await db.prepare(
      `UPDATE BETA_10_Daily_macro
          SET signposts_json = ?, signposts_updated_at = ?, signposts_model = ?
        WHERE id = ?`,
    ).bind(JSON.stringify(empty), now, MODEL, macroRow.id).run();
    return { action: "wrote", macro_row_id: macroRow.id, version: empty.version, events_count: 0 };
  }

  const prompt = buildPrompt({
    regime:   macroRow.regime || "unclassified",
    thesis,
    events,
    prevSignposts,
  });

  const blob = await callLLM(apiKey, prompt, { model: MODEL });
  validateSignposts(blob, events);

  const now = new Date().toISOString();
  const signposts = {
    events:       blob.events,
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    regime_at_write: macroRow.regime ?? null,
  };

  await db.prepare(
    `UPDATE BETA_10_Daily_macro
        SET signposts_json = ?, signposts_updated_at = ?, signposts_model = ?
      WHERE id = ?`,
  ).bind(JSON.stringify(signposts), now, MODEL, macroRow.id).run();

  return {
    action: "wrote",
    macro_row_id: macroRow.id,
    version: signposts.version,
    events_count: signposts.events.length,
    signposts_updated_at: now,
  };
}

function buildPrompt({ regime, thesis, events, prevSignposts }) {
  const driversBlock = (thesis.drivers || []).map(d => `  - ${d.name}: ${d.rationale}`).join("\n") || "  (none)";
  const tripwiresBlock = (thesis.tripwires || []).map(t => `  - [${t.id}] ${t.condition} — currently: ${t.currently}`).join("\n") || "  (none)";
  const calendarBlock = events.map(e => {
    const cons = e.consensus ? `cons: ${e.consensus}${e.unit || ""}` : "cons: ?";
    const prior = e.prior ? `prior: ${e.prior}${e.unit || ""}` : "prior: ?";
    return `  ${e.event_date}${e.event_time ? "T" + e.event_time : ""}  [${e.country}]  ${e.event_code.padEnd(8)} ${e.event_label}   ${cons} | ${prior}`;
  }).join("\n");

  const prevBlock = prevSignposts?.events?.length
    ? prevSignposts.events.map(e => `  - ${e.date} ${e.event_code}: ${e.what_to_watch}`).join("\n")
    : "(no prior signposts)";

  return `You are a macro strategist building the forward-looking signposts board for the next ${HORIZON_DAYS} days. For each event, decide whether it touches a thesis driver or tripwire — drop the events that touch nothing.

REGIME
  Label: ${regime}

THESIS DRIVERS (the frames the market is using)
${driversBlock}

THESIS TRIPWIRES (measurable conditions that, if breached, would break the thesis)
${tripwiresBlock}

UPCOMING HIGH-IMPACT EVENTS (MACRO_STATE_calendar)
${calendarBlock}

PREVIOUS SIGNPOSTS (drift gradually — keep the same events when still relevant)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "events": [
    {
      "date":          "YYYY-MM-DD",
      "country":       "US|EU|UK|CN|JP|...",
      "event_code":    "<event_code copied from the calendar>",
      "event_label":   "<event_label copied from the calendar>",
      "touches":       ["<driver name OR tripwire id>", ...],
      "what_to_watch": "<one sentence: which threshold flips a driver/tripwire, with concrete numbers>"
    }
  ]
}

RULES
- One entry per event; preserve the date/code/label exactly as given (this is what the dashboard joins on).
- DROP events that don't touch any driver or tripwire — silence is more useful than noise.
- "touches" must reference EXACT driver names or tripwire ids from the lists above. Empty array → drop the event.
- "what_to_watch" must reference a NUMBER: a consensus level, a tripwire threshold, or a delta (e.g. "core monthly > 0.4% fires tripwire #2").
- Return at least 1 event if any of the listed events plausibly touches a driver or tripwire. If truly none touch, return events: [].
- Order by date ascending.`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validateSignposts(blob, calendar) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (!Array.isArray(blob.events)) throw new Error("invalid output: events not an array");
  const calKey = new Set(calendar.map(e => `${e.event_date}|${e.event_code}`));
  for (const e of blob.events) {
    if (typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date))
      throw new Error("invalid event: date must be YYYY-MM-DD");
    if (typeof e.event_code !== "string") throw new Error("invalid event: event_code missing");
    if (!calKey.has(`${e.date}|${e.event_code}`))
      throw new Error(`invalid event: ${e.date}/${e.event_code} not in MACRO_STATE_calendar window`);
    if (!Array.isArray(e.touches)) throw new Error("invalid event: touches must be an array");
    if (typeof e.what_to_watch !== "string" || e.what_to_watch.trim().length < 15)
      throw new Error("invalid event: what_to_watch missing or too short");
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
