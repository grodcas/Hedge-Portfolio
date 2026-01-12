import axios from "axios";
import * as cheerio from "cheerio";

process.env.BLS_KEY = "5020b06502a044f590f39b44b811d6a8";
process.env.BEA_KEY = "616BA15B-71E7-4988-868B-6B80FD60CA34";
process.env.FRED_KEY= "4fd8718af3c6399e5ed4c0da85f52574";
process.env.POLYGON_KEY="lzQLINbEzmuTnIzaqpxHOjTLmYSatVj4";

function normalizeMonthYear(monthCol, yearCol) {
  const cleanMonth = monthCol.replace(" (P)", "");
  const m = MONTHS.indexOf(cleanMonth) + 1;
  const monthNum = String(m).padStart(2, "0");
  return `${yearCol}-${monthNum}-01`;
}


// ----------- BLS GENERIC FETCHER -----------
async function bls(seriesId) {
  const body = {
    seriesid: [seriesId],
    startyear: "2024",
    endyear: "2026",
    registrationkey: BLS_KEY
  };

  const { data } = await axios.post(
    "https://api.bls.gov/publicAPI/v2/timeseries/data/",
    body
  );

  if (!data.Results || !data.Results.series || !data.Results.series[0]) {
    console.log("BLS ERROR:", seriesId, data);
    throw new Error("BLS returned no data");
  }

  const s = data.Results.series[0].data;
  return { latest: s[0], previous: s[1] };
}

// -------------------- CPI --------------------
async function getCPI() {
  return {
    headline: await bls("CUUR0000SA0"),
    core: await bls("CUUR0000SA0L1E"),
    energy: await bls("CUUR0000SE"),
    food: await bls("CUUR0000SAF112"),
    shelter: await bls("CUUR0000SAH1")
  };
}

// -------------------- PPI --------------------
async function getPPI() {
  return {
    finalDemand: await bls("WPSFD4"),
    goods: await bls("WPUFD4"),
    services: await bls("WPUFD49104")
  };
}

// ---------------- EMPLOYMENT -----------------
async function getEmployment() {
  return {
    payrolls: await bls("CES0000000001"),
    unemploymentRate: await bls("LNS14000000")
  };
}

// -------------------- GDP (BEA) --------------
async function getGDP2() {
  const url = "https://api.stlouisfed.org/fred/series/observations";

  const params = {
    api_key: FRED_KEY,
    series_id: "A191RL1Q225SBEA",
    file_type: "json",
    sort_order: "desc",
    limit: 2
  };

  const { data } = await axios.get(url, { params });

  if (!data || !data.observations || data.observations.length === 0) {
    console.log("FRED ERROR:", data);
    return null;
  }

  return {
    latest: data.observations[0],     // most recent quarter
    previous: data.observations[1]   // quarter before
  };
}

// -------------------- BANK RESERVES (FED) --------------
async function getBankReserves() {
  const url = "https://api.stlouisfed.org/fred/series/observations";

  const params = {
    api_key: FRED_KEY,
    series_id: "WRESBAL",   // Reserve Balances With Federal Reserve Banks
    file_type: "json",
    sort_order: "desc",
    limit: 2
  };

  const { data } = await axios.get(url, { params });

  if (!data || !data.observations || data.observations.length === 0) {
    console.log("FRED ERROR (reserves):", data);
    return null;
  }

  return {
    latest: data.observations[0],      // most recent weekly value
    previous: data.observations[1]     // week before
  };
}


// -------------------- FOMC STATEMENT (RSS) -------------
async function getFOMC() {
  const url = "https://www.federalreserve.gov/feeds/press_monetary.xml";
  const { data } = await axios.get(url);
  const $ = cheerio.load(data, { xmlMode: true });

  let selected = null;

  $("item").each((i, el) => {
    const title = $(el).find("title").text().trim().toLowerCase();

    // SELECT ONLY FOMC STATEMENTS, not minutes
    if (title.includes("statement")) {
      selected = $(el);
      return false; // stop loop at first match
    }
  });

  if (!selected) return null;

  const title = selected.find("title").text().trim();
  const link = selected.find("link").text().trim();
  const pubDateRaw = selected.find("pubDate").text().trim();

  let date = null;
  if (pubDateRaw) {
    const parsed = Date.parse(pubDateRaw);
    if (!isNaN(parsed)) {
      date = new Date(parsed).toISOString().split("T")[0];
    }
  }

  return { title, link, date };
}


async function getFOMCStatement(rssUrl) {
  // 1. Get FOMC RSS (easiest way to find latest link)
 

  // 3. Load the FOMC page
  const html = await axios.get(rssUrl);
  const $ = cheerio.load(html.data);

  // 4. Extract ONLY the main policy paragraphs
  // They live inside:  <div class="col-xs-12 col-sm-8 col-md-8">
  const container = $(".col-xs-12.col-sm-8.col-md-8");

  let paragraphs = [];
  container.find("p").each((i, el) => {
    const txt = $(el).text().trim();
    if (txt.length > 0) paragraphs.push(txt);
  });

  return {
    paragraphs
  };
}


// -------------------- CBOE SKEW --------------------
async function getSkew() {
  const url = "https://cdn.cboe.com/api/global/us_indices/daily_skew_values.csv";

  const csv = await axios.get(url).then(r => r.data);
  const lines = csv.trim().split("\n");
  const last = lines[lines.length - 1].split(",");

  return {
    date: last[0],
    skew: parseFloat(last[1])
  };
}




async function getVIXTermStructure() {
  const symbols = {
    vix: "^VIX",
    vix3m: "^VIX3M",
    vix9d: "^VIX9D"
  };

  const results = {};

  for (const [key, symbol] of Object.entries(symbols)) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;

      const { data } = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });

      const chart = data.chart?.result?.[0];
      if (!chart) {
        results[key] = null;
        continue;
      }

      const timestamps = chart.timestamp;
      const closes = chart.indicators?.quote?.[0]?.close;

      if (!timestamps || !closes) {
        results[key] = null;
        continue;
      }

      let latestClose = null;
      let latestDate = null;

      // get last non-null close
      for (let i = closes.length - 1; i >= 0; i--) {
        if (closes[i] != null) {
          latestClose = closes[i];
          latestDate = new Date(timestamps[i] * 1000).toISOString().split("T")[0];
          break;
        }
      }

      results[key] = {
        date: latestDate,
        close: latestClose
      };

    } catch (err) {
      console.error("VIX fetch error for", key, err.message);
      results[key] = null;
    }
  }

  // compute gamma regime
  const vix = results.vix?.close;
  const vix3m = results.vix3m?.close;

  let regime = "UNKNOWN";
  if (vix && vix3m) {
    regime = vix3m > vix ? "POSITIVE" : "NEGATIVE";
  }

  const finalDate =
    results.vix?.date ||
    results.vix3m?.date ||
    results.vix9d?.date ||
    new Date().toISOString().split("T")[0];

  return {
    date: finalDate,
    vix9d: results.vix9d?.close || null,
    vix: results.vix?.close || null,
    vix3m: results.vix3m?.close || null,
    gammaRegime: regime
  };
}



async function getGammaRegime_ETF() {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const params = { apiKey: POLYGON_KEY };

  const [vixyRes, vixmRes] = await Promise.all([
    axios.get(`https://api.polygon.io/v2/aggs/ticker/VIXY/range/1/day/${yesterday}/${today}`, { params }),
    axios.get(`https://api.polygon.io/v2/aggs/ticker/VIXM/range/1/day/${yesterday}/${today}`, { params })
  ]);

  const vixy = vixyRes.data.results?.[0]?.c;  // short vol
  const vixm = vixmRes.data.results?.[0]?.c;  // mid vol

  const regime =
    vixy && vixm
      ? (vixm > vixy ? "POSITIVE" : "NEGATIVE")
      : "UNKNOWN";

  return { vixy, vixm, regime };
}






const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

async function getConsumerSentimentUMich() {
  const url = "https://www.sca.isr.umich.edu/files/tbcics.csv";

  const { data } = await axios.get(url);

  const lines = data.split(/\r?\n/).map(l => l.trim());

  const rows = [];

  for (const line of lines) {
    if (!line) continue;

    const cols = line.split(",");

    const monthCol = cols[0]?.trim();
    const yearCol  = cols[1]?.trim();

    // keep only lines whose first column starts with a month
    const monthName = monthCol.replace(" (P)", ""); // remove preliminary marker

    if (!MONTHS.includes(monthName)) continue;

    // value is ALWAYS on column index 4 in your samples
    const valStr = cols[4]?.trim();
    const value = parseFloat(valStr);

    if (Number.isNaN(value)) continue;

    rows.push({
      date: normalizeMonthYear(monthCol, yearCol),
      value
    });
  }

  if (rows.length < 2) {
    console.log("UMich ERROR (ICS): not enough rows", rows);
    return null;
  }

  return {
    latest: rows[rows.length - 1],
    previous: rows[rows.length - 2],
  };
}

export async function getInflationExpectations() {
  const url = "https://www.sca.isr.umich.edu/files/tbcpx1px5.csv";

  const { data } = await axios.get(url);

  const lines = data.split(/\r?\n/).map(l => l.trim());

  const rows = [];

  for (const line of lines) {
    if (!line) continue;

    const cols = line.split(",");

    const monthCol = cols[0]?.trim();
    const yearCol  = cols[1]?.trim();

    // remove (P) from month when checking validity
    const monthName = monthCol.replace(" (P)", "");

    if (!MONTHS.includes(monthName)) continue;

    // Extract values:
    const oneYrStr = cols[3]?.trim();
    const fiveYrStr = cols[5]?.trim();

    const oneYr = parseFloat(oneYrStr);
    const fiveYr = parseFloat(fiveYrStr);

    // Skip if both empty or NaN
    if (Number.isNaN(oneYr) && Number.isNaN(fiveYr)) continue;

    rows.push({
      date: normalizeMonthYear(monthCol, yearCol),
      oneYear: oneYr,
      fiveYear: fiveYr
    });
  }

  if (rows.length < 2) {
    console.log("UMich ERROR (Inflation Expectations): not enough rows", rows);
    return null;
  }

  return {
    latest: rows[rows.length - 1],
    previous: rows[rows.length - 2]
  };
}
// test
// getConsumerSentimentUMich().then(console.log).catch(console.error);

export {
  getCPI,
  getPPI,
  getEmployment,
  getFOMC,
  getFOMCStatement,
  getBankReserves,      // <-- THIS ONE FIXES YOUR ERROR
  getSkew,
  getGammaRegime_ETF,
  getConsumerSentimentUMich,
  getVIXTermStructure
};

// -------------------- RUN ALL -----------------
(async () => {
  //console.log("CPI:", await getCPI());
  //console.log("PPI:", await getPPI());
  //console.log("EMPLOYMENT:", await getEmployment());
  //console.log("GDP:", await getGDP()); DOES NOT WORK
  //console.log("FOMC:", await getFOMC());
  //console.log(await getFOMCStatement("https://www.federalreserve.gov/newsevents/pressreleases/monetary20251029a.htm"));
  //console.log(await getBankReserves())
  //console.log("GAMMA:", await getGammaRegime_ETF());
  //console.log("GAMMA:", await   getVIXTermStructure());

  //console.log("Cons_Sent:", await getConsumerSentimentUMich());
  //console.log("Inflat_Exp:", await getInflationExpectations());


})();
