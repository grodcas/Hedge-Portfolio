import "dotenv/config";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";

import {
  getCPI,
  getPPI,
  getEmployment,
  getFOMC,
  getFOMCStatement,
  getBankReserves,
  getSkew,
  getGammaRegime_ETF,
  getConsumerSentimentUMich,
  getInflationExpectations,
  getVIXTermStructure       // ← ADD THIS

} from "./macro_scrap.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- helpers ----------

function pctChange(curr, prev) {
  const c = Number(curr);
  const p = Number(prev);
  if (!isFinite(c) || !isFinite(p) || p === 0) return null;
  return ((c - p) / p) * 100;
}

function monthFromBlsPeriod(periodName) {
  const map = {
    January: "01", February: "02", March: "03", April: "04",
    May: "05", June: "06", July: "07", August: "08",
    September: "09", October: "10", November: "11", December: "12"
  };
  return map[periodName] || "01";
}

function makeBlsDate(latest) {
  // monthly series: use first of month
  const y = latest.year;
  const m = monthFromBlsPeriod(latest.periodName);
  return `${y}-${m}-01`;
}

function normalizeTextDate(raw) {
  // For FOMC: "October 29, 2025" → "2025-10-29"
  if (!raw) return null;
  const parsed = Date.parse(raw + " UTC");
  if (isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

// ---------- OpenAI summarizers ----------

async function summarizeIndicator(heading, date, payload) {
  const prompt = `
You are a macro strategist. You receive recent US macro data.

You must produce ONE short paragraph summarizing the indicator "${heading}" for the date ${date}.

Rules:
- Be neutral, factual, and concise.
- Mention ONLY the most important values in numeric form (typically latest level and % change versus previous).
- Everything else can be described qualitatively.
- Do NOT list every sub-component unless they clearly matter.
- Draw a brief judgement on how this reading compares to recent history (tightening vs easing, hotter vs cooler, etc.), but no trading advice.

Data JSON:
${JSON.stringify(payload, null, 2)}
`;

  const r = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }]
  });

  return r.choices[0].message.content.trim();
}

async function summarizeFOMC(date, paragraphs) {
  const text = paragraphs.join("\n\n");
  const prompt = `
You are a macro strategist summarizing a FOMC statement.

Write a compact but detailed summary of this FOMC communication dated ${date}.

Rules:
- Keep it 2–4 short paragraphs.
- Highlight: rate decision (size and final range), forward guidance, balance of risks, description of growth/labor/inflation, balance sheet decisions, and the vote split (including any dissents).
- Keep the tone analytical but neutral; no trading advice, no predictions.

TEXT:
${text}
`;

  const r = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }]
  });

  return r.choices[0].message.content.trim();
}

// ---------- main pipeline ----------

async function main() {
  const out = { Macro: [] };

  // 1) CPI
  const cpi = await getCPI();
  {
    const latest = cpi.headline.latest;
    const prev = cpi.headline.previous;
    const date = makeBlsDate(latest);

    const payload = {
      headline: {
        latest: Number(latest.value),
        previous: Number(prev.value),
        pctChange: pctChange(latest.value, prev.value)
      },
      core: cpi.core ? {
        latest: Number(cpi.core.latest.value),
        previous: Number(cpi.core.previous.value),
        pctChange: pctChange(cpi.core.latest.value, cpi.core.previous.value)
      } : null,
      food: cpi.food ? {
        latest: Number(cpi.food.latest.value),
        previous: Number(cpi.food.previous.value),
        pctChange: pctChange(cpi.food.latest.value, cpi.food.previous.value)
      } : null,
      shelter: cpi.shelter ? {
        latest: Number(cpi.shelter.latest.value),
        previous: Number(cpi.shelter.previous.value),
        pctChange: pctChange(cpi.shelter.latest.value, cpi.shelter.previous.value)
      } : null,
      energy: cpi.energy && cpi.energy.latest && cpi.energy.previous ? {
        latest: Number(cpi.energy.latest.value),
        previous: Number(cpi.energy.previous.value),
        pctChange: pctChange(cpi.energy.latest.value, cpi.energy.previous.value)
      } : null
    };

    const summary = await summarizeIndicator("CPI", date, payload);
    out.Macro.push({ heading: "CPI", date, summary });
  }

  // 2) PPI
  const ppi = await getPPI();
  {
    const latest = ppi.finalDemand.latest;
    const prev = ppi.finalDemand.previous;
    const date = makeBlsDate(latest);

    const payload = {
      finalDemand: {
        latest: Number(latest.value),
        previous: Number(prev.value),
        pctChange: pctChange(latest.value, prev.value)
      },
      goods: ppi.goods ? {
        latest: Number(ppi.goods.latest.value),
        previous: Number(ppi.goods.previous.value),
        pctChange: pctChange(ppi.goods.latest.value, ppi.goods.previous.value)
      } : null,
      services: ppi.services ? {
        latest: Number(ppi.services.latest.value),
        previous: Number(ppi.services.previous.value),
        pctChange: pctChange(ppi.services.latest.value, ppi.services.previous.value)
      } : null
    };

    const summary = await summarizeIndicator("PPI", date, payload);
    out.Macro.push({ heading: "PPI", date, summary });
  }

  // 3) Employment
  const emp = await getEmployment();
  {
    const latest = emp.payrolls.latest;
    const prev = emp.payrolls.previous;
    const date = makeBlsDate(latest);

    const payload = {
      payrolls: {
        latest: Number(latest.value),
        previous: Number(prev.value),
        pctChange: pctChange(latest.value, prev.value)
      },
      unemploymentRate: {
        latest: Number(emp.unemploymentRate.latest.value),
        previous: Number(emp.unemploymentRate.previous.value),
        pctChange: pctChange(
          emp.unemploymentRate.latest.value,
          emp.unemploymentRate.previous.value
        )
      }
    };

    const summary = await summarizeIndicator("Employment", date, payload);
    out.Macro.push({ heading: "Employment", date, summary });
  }

  // 4) Bank reserves (Fed liquidity)
  const reserves = await getBankReserves();
  if (reserves && reserves.latest && reserves.previous) {
    const date = reserves.latest.date; // already YYYY-MM-DD
    const payload = {
      latest: {
        date: reserves.latest.date,
        value: Number(reserves.latest.value)
      },
      previous: {
        date: reserves.previous.date,
        value: Number(reserves.previous.value)
      },
      pctChange: pctChange(reserves.latest.value, reserves.previous.value)
    };

    const summary = await summarizeIndicator("Bank Reserves", date, payload);
    out.Macro.push({ heading: "Bank Reserves", date, summary });
  }



  // 6) Consumer Sentiment (UMich)
  const consSent = await getConsumerSentimentUMich();
  if (consSent) {
    const date = consSent.latest.date; // e.g. "November 2025"
    const payload = {
      latest: consSent.latest,
      previous: consSent.previous,
      pctChange: pctChange(consSent.latest.value, consSent.previous.value)
    };

    const summary = await summarizeIndicator("Consumer Sentiment", date, payload);
    out.Macro.push({ heading: "Consumer Sentiment", date, summary });
  }

  // 7) Inflation Expectations (UMich)
  const inflExp = await getInflationExpectations();
  if (inflExp) {
    const date = inflExp.latest.date;
    const payload = {
      latest: inflExp.latest,
      previous: inflExp.previous,
      oneYearPctChange: pctChange(
        inflExp.latest.oneYear,
        inflExp.previous.oneYear
      ),
      fiveYearPctChange: pctChange(
        inflExp.latest.fiveYear,
        inflExp.previous.fiveYear
      )
    };

    const summary = await summarizeIndicator("Inflation Expectations", date, payload);
    out.Macro.push({ heading: "Inflation Expectations", date, summary });
  }

  // 8) Gamma Regime (VIX Term Structure)
    const gamma = await getVIXTermStructure();

    if (gamma && gamma.vix) {
    const date = gamma.date;
    const payload = gamma; // { vix9d, vix, vix3m, gammaRegime }

    const summary = await summarizeIndicator(
        "Gamma Regime (VIX9D / VIX / VIX3M)",
        date,
        payload
    );

    out.Macro.push({
        heading: "Gamma Regime (VIX9D / VIX / VIX3M)",
        date,
        summary
    });
    }


    // 9) FOMC (special)
    const fomcMeta = await getFOMC();

    if (fomcMeta && fomcMeta.link) {
    const statement = await getFOMCStatement(fomcMeta.link);
    const paras = statement.paragraphs || [];

    // Use the RSS date (correct)
    const date = fomcMeta.date || null;

    const summary = await summarizeFOMC(date || "N/A", paras);

    out.Macro.push({
        heading: "FOMC",
        title: fomcMeta.title,
        date,
        summary
    });
    }

    // 9) FOMC (special) const fomcMeta = await getFOMC(); if (fomcMeta && fomcMeta.link) { const statement = await getFOMCStatement(fomcMeta.link); const paras = statement.paragraphs || []; let dateLine = paras[0] || null; // e.g. "October 29, 2025" const date = normalizeTextDate(dateLine) || null; const summary = await summarizeFOMC(date || "N/A", paras); out.Macro.push({ heading: "FOMC", date, summary }); }


  // write JSON
  fs.writeFileSync(
    path.join(__dirname, "macro_summary.json"),
    JSON.stringify(out, null, 2)
  );
}

main().catch(err => {
  console.error("Error in macro_summary:", err);
  process.exit(1);
});
