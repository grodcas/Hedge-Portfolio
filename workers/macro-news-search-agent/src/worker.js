export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/search-macro")
      return new Response("Not found", { status: 404 });

    const input = await req.json();
    const { layer, today } = input;
    if (!layer || !today)
      return new Response("layer and today required", { status: 400 });

    const prompt = buildPrompt(layer, input);
    const model = "gpt-5-mini";

    // Debug: check if API key is present
    if (!env.OPENAI_API_KEY) {
      console.error(`OPENAI_API_KEY not set for layer ${layer}`);
      return Response.json({ layer, events: [], sentiment: "neutral", magnitude: 0, _error: "no_api_key" });
    }

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const ai = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            tools: [{ type: "web_search_preview" }],
            input: prompt,
            text: {
              format: {
                type: "json_schema",
                name: "macro_layer_result",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    layer: { type: "string" },
                    events: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", description: "Short identifier e.g. NEWS1, NEWS2" },
                          date: { type: "string", description: "YYYY-MM-DD exact date" },
                          headline: { type: "string" },
                          summary: { type: "string", description: "200-400 chars" },
                          sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                          magnitude: { type: "number", description: "-1.0 to +1.0" },
                          sources: { type: "array", items: { type: "string" } },
                          confidence: { type: "string", enum: ["high", "medium", "low"], description: "Source cross-check confidence" }
                        },
                        required: ["id", "date", "headline", "summary", "sentiment", "magnitude", "sources", "confidence"],
                        additionalProperties: false
                      }
                    },
                    sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"], description: "Overall layer sentiment" },
                    magnitude: { type: "number", description: "Overall layer magnitude -1.0 to +1.0" }
                  },
                  required: ["layer", "events", "sentiment", "magnitude"],
                  additionalProperties: false
                }
              }
            }
          }),
        });

        if (!ai.ok) {
          const errBody = await ai.text();
          console.error(`OpenAI API error for ${layer} (${ai.status}): ${errBody.slice(0, 300)}`);
          if (ai.status === 429 && attempt < maxRetries) {
            const wait = (attempt + 1) * 3000;
            console.log(`Rate limited on ${layer}, retrying in ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(r => setTimeout(r, wait));
            continue;
          }
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          return Response.json({ layer, events: [], sentiment: "neutral", magnitude: 0 });
        }

        const j = await ai.json();
        let text = "";
        if (j.output) {
          for (const block of j.output) {
            if (block.type === "message") {
              for (const c of block.content) {
                if (c.type === "output_text") text = c.text;
              }
            }
          }
        }

        if (!text) {
          console.error(`Empty AI output for macro layer ${layer} (attempt ${attempt}):`, JSON.stringify(j).slice(0, 500));
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          return Response.json({ layer, events: [], sentiment: "neutral", magnitude: 0 });
        }

        const result = JSON.parse(text);
        result.layer = layer;
        console.log(`Macro search OK for ${layer}: ${result.events?.length || 0} events`);
        return Response.json(result);
      } catch (err) {
        console.error(`Macro search failed for ${layer} (attempt ${attempt}):`, err.message);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        return Response.json({ layer, events: [], sentiment: "neutral", magnitude: 0 });
      }
    }
  },
};

function buildPrompt(layer, input) {
  const { today, previous_summary } = input;
  const prevContext = previous_summary
    ? `\nPREVIOUS DAY'S MACRO SUMMARY (distinguish new from old):\n${previous_summary}\n`
    : "";

  switch (layer) {
    case "economic_calendar":
      return buildCalendarPrompt(input);
    case "geopolitics":
      return buildGeopoliticsPrompt(today, prevContext);
    case "regulatory_fiscal":
      return buildRegulatoryPrompt(today, prevContext);
    case "sector_pulse":
      return buildSectorPrompt(today, prevContext);
    case "the_wave":
      return buildWavePrompt(today, prevContext);
    default:
      return `Search for macro news for ${today}`;
  }
}

function buildCalendarPrompt(input) {
  const { today, calendar_events, macro_data, previous_summary } = input;
  const prevContext = previous_summary
    ? `\nPREVIOUS DAY'S SUMMARY (distinguish new from old):\n${previous_summary}\n`
    : "";

  const calendarBlock = calendar_events?.length
    ? `TODAY'S SCHEDULED RELEASES:\n${calendar_events.map(e => `- ${e.event}${e.notes ? ` (${e.notes})` : ""}`).join("\n")}`
    : "No major scheduled releases today.";

  const dataBlock = macro_data?.length
    ? `\nLATEST INDICATOR DATA FROM OUR SCRAPERS:\n${macro_data.map(d => `- ${d.type}: ${d.summary}`).join("\n")}`
    : "";

  return `
You are a macro-economic analyst. Search the internet for today's economic indicator releases and market reaction.

TODAY'S DATE: ${today}

${calendarBlock}
${dataBlock}
${prevContext}

YOUR TASK:
1. If there are scheduled releases today (CPI, PPI, Employment, GDP, FOMC), search for:
   - The ACTUAL NUMBER released (e.g., CPI came in at 3.2% vs 3.1% expected)
   - Whether it beat, met, or missed consensus expectations
   - Market reaction (stocks, bonds, dollar)
   - Analyst commentary on what it means for Fed policy
   - FOMC: search for the decision, dot plot changes, Powell's press conference tone
2. If no scheduled release today, search for:
   - Any Fed speakers (Waller, Bostic, Williams, etc.) and what they said
   - Jobless claims (weekly Thursday release)
   - Treasury auction results
   - Any surprise data releases

CRITICAL RULES:
- EXACT DATES on every event. Do not guess.
- CROSS-CHECK: cite at least 2 sources per event. Mark confidence as "high" only if 3+ sources agree.
- Separate each event clearly as NEWS1, NEWS2, NEWS3 etc.
- Sentiment: dovish surprise / growth beat = bullish. Hawkish surprise / contraction = bearish.

Respond in the required JSON format.
`.trim();
}

function buildGeopoliticsPrompt(today, prevContext) {
  return `
You are a geopolitical risk analyst focused on US market impact. Search the internet for today's most important geopolitical developments.

TODAY'S DATE: ${today}
${prevContext}

SEARCH FOR:
1. CONFLICTS & MILITARY: Ukraine-Russia, Middle East (Israel, Iran, Yemen/Houthis), Taiwan Strait tensions, North Korea. Any escalation or de-escalation.
2. STRATEGIC COMMERCE: Strait of Hormuz disruptions, Suez Canal, shipping routes with China, Panama Canal. Freight costs, rerouting.
3. TRADE WARS: US-China tariffs, EU trade disputes, sanctions enforcement, export controls (chips, oil). New announcements or retaliation.
4. DIPLOMACY: G7/G20 outcomes, bilateral summits, UN Security Council votes, NATO decisions.
5. SANCTIONS: New sanctions on Russia/Iran/China entities, enforcement changes, sanction evasion.

CRITICAL RULES:
- EXACT DATE of each development. When did this happen or was reported?
- CROSS-CHECK with at least 2 sources per event. Confidence = "high" only if 3+ agree.
- Only include events with ACTUAL or POTENTIAL US market impact.
- Sentiment is RISK-ON (bullish) vs RISK-OFF (bearish): de-escalation = bullish, escalation = bearish.
- If nothing significant happened today, return fewer events. Do NOT pad with routine news.
- Separate each event as NEWS1, NEWS2, NEWS3 etc.

Respond in the required JSON format.
`.trim();
}

function buildRegulatoryPrompt(today, prevContext) {
  return `
You are a regulatory and fiscal policy analyst focused on US market impact. Search the internet for today's most important regulatory and fiscal developments.

TODAY'S DATE: ${today}
${prevContext}

SEARCH FOR:
1. TAX POLICY: Corporate tax rate changes, capital gains proposals, tax reform bills, IRS enforcement.
2. REGULATION: SEC rule changes, FDA approval/rejection decisions, FTC antitrust actions, EPA rules, bank capital requirements, crypto regulation.
3. MONETARY POLICY (non-FOMC): Fed governor speeches, ECB/BOJ decisions that affect US markets, central bank coordination.
4. FISCAL POLICY: Government shutdown risk, debt ceiling negotiations, infrastructure spending bills, defense budget changes.
5. STATE-LEVEL: California AI regulation, Texas energy policy, state-level EV mandates, cannabis legalization affecting markets.

CRITICAL RULES:
- EXACT DATE of each regulatory action or announcement.
- CROSS-CHECK with at least 2 sources. Congressional votes need official record + news source.
- Focus on MARKET IMPACT: a tax cut proposal is bullish; new bank capital requirements are bearish for financials.
- Separate each event clearly as NEWS1, NEWS2, NEWS3 etc.
- If it's just "under discussion" vs "signed into law", note the STATUS clearly.

Respond in the required JSON format.
`.trim();
}

function buildSectorPrompt(today, prevContext) {
  return `
You are a sector rotation analyst. Search the internet for today's sector-level market developments.

TODAY'S DATE: ${today}
${prevContext}

ANALYZE THESE SECTORS (search for each):
1. TECHNOLOGY/AI: AI infrastructure spending, chip demand (NVIDIA, AMD, Intel), cloud earnings, Big Tech regulation, AI model releases. Semiconductor supply chain.
2. FINANCIALS: Yield curve changes, bank earnings, credit quality, IPO/M&A deal flow, insurance losses, crypto market impact on banks.
3. ENERGY: Oil price (WTI, Brent), OPEC+ decisions, US production data, natural gas, renewable energy policy, refining margins.
4. HEALTHCARE/PHARMA: Drug approvals/rejections (FDA), GLP-1/obesity drugs, Medicare/Medicaid policy, PBM reform, clinical trial results.
5. CONSUMER/RETAIL: Consumer spending data, retail earnings, housing market, auto sales, luxury vs discount trends, input cost inflation.
6. INDUSTRIALS/DEFENSE: Infrastructure spending, defense budgets, supply chain, manufacturing PMI, aerospace orders, construction.

CRITICAL RULES:
- EXACT DATE on every development.
- CROSS-CHECK: 2+ sources per event. Mark confidence accordingly.
- Assign per-event sentiment AND an overall sector sentiment.
- Cover at least 3-4 different sectors. Don't just focus on tech.
- Separate each event as NEWS1, NEWS2, NEWS3 etc.
- If a sector is quiet today, skip it. Don't force news.

Respond in the required JSON format.
`.trim();
}

function buildWavePrompt(today, prevContext) {
  return `
You are a cultural and trend analyst tracking the dominant narratives in financial media and popular news that influence markets.

TODAY'S DATE: ${today}
${prevContext}

YOUR TASK:
Search for the DOMINANT NARRATIVES and TRENDING STORIES that are shaping market sentiment right now. These are stories that:
- Are HEADLINES for 1-8 weeks before fading
- Create sustained market themes or sector rotations
- May not be "financial news" per se but affect investor psychology

EXAMPLES OF WAVE STORIES:
- AI bubble concerns / AI infrastructure buildout mania
- GLP-1 obesity drug revolution reshaping healthcare and food sectors
- Robotaxi regulation (bans, approvals)
- SpaceX booster landings / space commercialization
- Natural disasters (Florida floods, California fires) affecting insurance, construction
- Celebrity CEO controversies affecting stock (Musk, Zuckerberg)
- Major cultural events (Super Bowl, Olympics) affecting media/consumer stocks
- Crime/security stories (cartel arrests, cybersecurity breaches)
- Climate events (extreme heat, hurricanes) affecting energy, agriculture

SEARCH FOR:
1. What is THE DOMINANT NARRATIVE in financial media this week?
2. What trending story has CROSSED OVER from general news to market impact?
3. What story from last 2-4 weeks is still driving sector rotation?
4. Any NEW emerging narrative that could become the next wave?

CRITICAL RULES:
- EXACT DATE when the story broke or peaked.
- CROSS-CHECK: is this actually trending or just one outlet's hot take? 2+ sources required.
- The wave is NOT the same as daily news. It's the UNDERLYING THEME.
- Sentiment: risk-on narratives = bullish, fear narratives = bearish.
- Separate each narrative as NEWS1, NEWS2, NEWS3 etc.

Respond in the required JSON format.
`.trim();
}
