// Economic calendar (hardcoded 2026)
const CALENDAR = [
  { event: "FOMC Meeting", date: "2026-01-28", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-03-18", notes: "Decision + Powell presser + SEP" },
  { event: "FOMC Meeting", date: "2026-04-29", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-06-17", notes: "Decision + Powell presser + SEP" },
  { event: "FOMC Meeting", date: "2026-07-29", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-09-16", notes: "Decision + Powell presser + SEP" },
  { event: "FOMC Meeting", date: "2026-10-28", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-12-09", notes: "Decision + Powell presser + SEP" },
  { event: "CPI", date: "2026-01-13" }, { event: "CPI", date: "2026-02-11" },
  { event: "CPI", date: "2026-03-11" }, { event: "CPI", date: "2026-04-10" },
  { event: "CPI", date: "2026-05-12" }, { event: "CPI", date: "2026-06-10" },
  { event: "CPI", date: "2026-07-14" }, { event: "CPI", date: "2026-08-12" },
  { event: "CPI", date: "2026-09-11" }, { event: "CPI", date: "2026-10-14" },
  { event: "CPI", date: "2026-11-10" }, { event: "CPI", date: "2026-12-10" },
  { event: "PPI", date: "2026-01-14" }, { event: "PPI", date: "2026-02-12" },
  { event: "PPI", date: "2026-03-12" }, { event: "PPI", date: "2026-04-14" },
  { event: "PPI", date: "2026-05-13" }, { event: "PPI", date: "2026-06-11" },
  { event: "PPI", date: "2026-07-15" }, { event: "PPI", date: "2026-08-13" },
  { event: "PPI", date: "2026-09-10" }, { event: "PPI", date: "2026-10-15" },
  { event: "PPI", date: "2026-11-13" }, { event: "PPI", date: "2026-12-15" },
  { event: "Employment Situation", date: "2026-01-09" }, { event: "Employment Situation", date: "2026-02-06" },
  { event: "Employment Situation", date: "2026-03-06" }, { event: "Employment Situation", date: "2026-04-03" },
  { event: "Employment Situation", date: "2026-05-08" }, { event: "Employment Situation", date: "2026-06-05" },
  { event: "Employment Situation", date: "2026-07-02" }, { event: "Employment Situation", date: "2026-08-07" },
  { event: "Employment Situation", date: "2026-09-04" }, { event: "Employment Situation", date: "2026-10-02" },
  { event: "Employment Situation", date: "2026-11-06" }, { event: "Employment Situation", date: "2026-12-04" },
  { event: "GDP Advance", date: "2026-01-29" }, { event: "GDP Advance", date: "2026-04-30" },
  { event: "GDP Advance", date: "2026-07-30" }, { event: "GDP Advance", date: "2026-10-29" },
];

const LAYERS = [
  "economic_calendar",
  "geopolitics",
  "regulatory_fiscal",
  "sector_pulse",
  "the_wave"
];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-macro-news")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    // --------------------------------------------------
    // 1) Get today's calendar events for Layer 1
    // --------------------------------------------------
    const todayEvents = CALENDAR.filter(e => e.date === today);

    // Get existing macro data from scraper for context
    const { results: macroData } = await db.prepare(`
      SELECT type, summary FROM BETA_03_Macro
      WHERE date >= ? ORDER BY date DESC LIMIT 20
    `).bind(today).all();

    // Get previous macro news for context
    const prevMacro = await db.prepare(`
      SELECT summary FROM BETA_11_Macro_news
      WHERE date < ? ORDER BY date DESC LIMIT 1
    `).bind(today).first();

    // --------------------------------------------------
    // 2) Fire 5 layer searches in PARALLEL
    // --------------------------------------------------
    console.log("Macro: searching 5 layers in parallel...");

    const layerInputs = {
      economic_calendar: {
        layer: "economic_calendar",
        today,
        calendar_events: todayEvents,
        macro_data: macroData,
        previous_summary: prevMacro?.summary || null
      },
      geopolitics: {
        layer: "geopolitics",
        today,
        previous_summary: prevMacro?.summary || null
      },
      regulatory_fiscal: {
        layer: "regulatory_fiscal",
        today,
        previous_summary: prevMacro?.summary || null
      },
      sector_pulse: {
        layer: "sector_pulse",
        today,
        previous_summary: prevMacro?.summary || null
      },
      the_wave: {
        layer: "the_wave",
        today,
        previous_summary: prevMacro?.summary || null
      }
    };

    const searchResults = await Promise.allSettled(
      LAYERS.map(async (layer, i) => {
        // Stagger starts by 500ms to avoid OpenAI rate limiting
        if (i > 0) await new Promise(r => setTimeout(r, i * 500));
        try {
          const res = await env.MACRO_NEWS_SEARCH.fetch("https://internal/search-macro", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(layerInputs[layer])
          });
          if (!res.ok) {
            const errText = await res.text();
            console.error(`Macro search failed for ${layer}: ${res.status} - ${errText.slice(0, 200)}`);
            return { layer, events: [], sentiment: "neutral", magnitude: 0 };
          }
          return await res.json();
        } catch (err) {
          console.error(`Macro search error for ${layer}:`, err.message);
          return { layer, events: [], sentiment: "neutral", magnitude: 0 };
        }
      })
    );

    const allResults = searchResults.map((r, i) =>
      r.status === "fulfilled" ? r.value : { layer: LAYERS[i], events: [], sentiment: "neutral", magnitude: 0 }
    );

    for (const [i, r] of searchResults.entries()) {
      const layer = LAYERS[i];
      if (r.status === "fulfilled") {
        console.log(`Layer ${layer}: ${r.value.events?.length || 0} events, sentiment=${r.value.sentiment}`);
      } else {
        console.error(`Layer ${layer}: REJECTED - ${r.reason}`);
      }
    }
    console.log(`Macro: all 5 layers done`);

    // --------------------------------------------------
    // 3) Curator synthesizes all 5 layers
    // --------------------------------------------------
    console.log("Macro: curating...");

    let curated;
    try {
      const curatorRes = await env.MACRO_NEWS_CURATOR.fetch("https://internal/curate-macro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layers: allResults, today })
      });
      if (!curatorRes.ok) {
        console.error(`Macro curator failed: ${curatorRes.status}`);
        curated = fallback(allResults, today);
      } else {
        curated = await curatorRes.json();
      }
    } catch (err) {
      console.error("Macro curator error:", err.message);
      curated = fallback(allResults, today);
    }

    console.log(`Macro curator done: overall sentiment ${curated.overall_sentiment} (${curated.overall_magnitude})`);

    // --------------------------------------------------
    // 4) Write to BETA_11_Macro_news
    // --------------------------------------------------
    const id = await shortHash(`macro-news|${today}`);

    await db.prepare(`
      INSERT INTO BETA_11_Macro_news
        (id, date, layer_calendar, layer_geopolitics, layer_regulatory, layer_sectors, layer_wave,
         summary, overall_sentiment, overall_magnitude, sector_sentiments, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        layer_calendar = excluded.layer_calendar,
        layer_geopolitics = excluded.layer_geopolitics,
        layer_regulatory = excluded.layer_regulatory,
        layer_sectors = excluded.layer_sectors,
        layer_wave = excluded.layer_wave,
        summary = excluded.summary,
        overall_sentiment = excluded.overall_sentiment,
        overall_magnitude = excluded.overall_magnitude,
        sector_sentiments = excluded.sector_sentiments,
        created_at = excluded.created_at
    `).bind(
      id,
      today,
      JSON.stringify(allResults.find(r => r.layer === "economic_calendar")),
      JSON.stringify(allResults.find(r => r.layer === "geopolitics")),
      JSON.stringify(allResults.find(r => r.layer === "regulatory_fiscal")),
      JSON.stringify(allResults.find(r => r.layer === "sector_pulse")),
      JSON.stringify(allResults.find(r => r.layer === "the_wave")),
      curated.summary,
      curated.overall_sentiment,
      curated.overall_magnitude,
      JSON.stringify(curated.sector_sentiments || {}),
      now
    ).run();

    return Response.json({
      ok: true,
      layers: allResults.map(r => ({ layer: r.layer, events: r.events?.length || 0, sentiment: r.sentiment, magnitude: r.magnitude })),
      overall_sentiment: curated.overall_sentiment,
      overall_magnitude: curated.overall_magnitude
    });
  },
};

function fallback(allResults, today) {
  return {
    summary: allResults.map(r => `[${r.layer}] ${r.events?.map(e => e.headline).join("; ") || "No data"}`).join("\n"),
    overall_sentiment: "neutral",
    overall_magnitude: 0,
    sector_sentiments: {}
  };
}

async function shortHash(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
