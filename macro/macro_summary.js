import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import process from "process";
import { getFOMCStatement } from "./macro_scrap.js";

import {
  getCPI,
  getPPI,
  getEmployment,
  getFOMC,
  getBankReserves,
  getConsumerSentimentUMich,
  getInflationExpectations,
  getVIXTermStructure
} from "./macro_scrap.js";

// ---------- paths ----------
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
  return `${latest.year}-${monthFromBlsPeriod(latest.periodName)}-01`;
}

function simplePair(name, latest, previous) {
  return {
    [`previous ${name}`]: previous,
    [`current ${name}`]: latest,
    [`pct_change ${name}`]: pctChange(latest, previous)
  };
}

// ---------- main ----------
async function main() {
  const out = { Macro: [] };

  // CPI
  const cpi = await getCPI();
  {
    const latest = cpi.headline.latest;
    const prev = cpi.headline.previous;
    const date = makeBlsDate(latest);

    const summary = {
      ...simplePair("CPI Headline", Number(latest.value), Number(prev.value)),
      ...(cpi.core && simplePair(
        "CPI Core",
        Number(cpi.core.latest.value),
        Number(cpi.core.previous.value)
      )),
      ...(cpi.food && simplePair(
        "CPI Food",
        Number(cpi.food.latest.value),
        Number(cpi.food.previous.value)
      )),
      ...(cpi.shelter && simplePair(
        "CPI Shelter",
        Number(cpi.shelter.latest.value),
        Number(cpi.shelter.previous.value)
      )),
      ...(cpi.energy?.latest && cpi.energy?.previous && simplePair(
        "CPI Energy",
        Number(cpi.energy.latest.value),
        Number(cpi.energy.previous.value)
      ))
    };

    out.Macro.push({ heading: "CPI", date, summary });
  }

  // PPI
  const ppi = await getPPI();
  {
    const latest = ppi.finalDemand.latest;
    const prev = ppi.finalDemand.previous;
    const date = makeBlsDate(latest);

    const summary = {
      ...simplePair("PPI Final Demand", Number(latest.value), Number(prev.value)),
      ...(ppi.goods && simplePair(
        "PPI Goods",
        Number(ppi.goods.latest.value),
        Number(ppi.goods.previous.value)
      )),
      ...(ppi.services && simplePair(
        "PPI Services",
        Number(ppi.services.latest.value),
        Number(ppi.services.previous.value)
      ))
    };

    out.Macro.push({ heading: "PPI", date, summary });
  }

  // Employment
  const emp = await getEmployment();
  {
    const date = makeBlsDate(emp.payrolls.latest);

    const summary = {
      ...simplePair(
        "Nonfarm Payrolls",
        Number(emp.payrolls.latest.value),
        Number(emp.payrolls.previous.value)
      ),
      ...simplePair(
        "Unemployment Rate",
        Number(emp.unemploymentRate.latest.value),
        Number(emp.unemploymentRate.previous.value)
      )
    };

    out.Macro.push({ heading: "Employment", date, summary });
  }

  // Bank Reserves
  const reserves = await getBankReserves();
  if (reserves?.latest && reserves?.previous) {
    const summary = {
      "previous Bank Reserves": Number(reserves.previous.value),
      "current Bank Reserves": Number(reserves.latest.value),
      "pct_change Bank Reserves": pctChange(
        reserves.latest.value,
        reserves.previous.value
      )
    };

    out.Macro.push({
      heading: "Bank Reserves",
      date: reserves.latest.date,
      summary
    });
  }

  // Consumer Sentiment
  const cons = await getConsumerSentimentUMich();
  if (cons) {
    const summary = simplePair(
      "Consumer Sentiment",
      Number(cons.latest.value),
      Number(cons.previous.value)
    );

    out.Macro.push({
      heading: "Consumer Sentiment",
      date: cons.latest.date,
      summary
    });
  }

  // Inflation Expectations
  const infl = await getInflationExpectations();
  if (infl) {
    const summary = {
      ...simplePair(
        "1Y Inflation Expectations",
        infl.latest.oneYear,
        infl.previous.oneYear
      ),
      ...simplePair(
        "5Y Inflation Expectations",
        infl.latest.fiveYear,
        infl.previous.fiveYear
      )
    };

    out.Macro.push({
      heading: "Inflation Expectations",
      date: infl.latest.date,
      summary
    });
  }

  // Gamma Regime (VIX)
  const gamma = await getVIXTermStructure();
  if (gamma) {
    const summary = {
      "VIX9D": gamma.vix9d,
      "VIX": gamma.vix,
      "VIX3M": gamma.vix3m,
      "Gamma Regime": gamma.gammaRegime
    };

    out.Macro.push({
      heading: "Gamma Regime (VIX)",
      date: gamma.date,
      summary
    });
  }

  // FOMC (metadata only)
  // FOMC (raw statement, no AI)
  const fomc = await getFOMC();
  if (fomc?.link) {
    const statement = await getFOMCStatement(fomc.link);

    out.Macro.push({
      heading: "FOMC",
      date: fomc.date,
      summary: {
        title: fomc.title,
        paragraphs: statement.paragraphs || []
      }
    });
  }


  // write output
  fs.writeFileSync(
    path.join(__dirname, "macro_summary.json"),
    JSON.stringify(out, null, 2)
  );
}

main().catch(err => {
  console.error("Macro pipeline error:", err);
  process.exit(1);
});
