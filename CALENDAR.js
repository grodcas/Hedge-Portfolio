// calendar.js
import fs from "fs";

const macroCalendar = [
  // FOMC + SEP
  { event: "FOMC Meeting", date: "2026-01-28", timeET: "14:00", source: "Federal Reserve", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-03-18", timeET: "14:00", source: "Federal Reserve", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-04-29", timeET: "14:00", source: "Federal Reserve", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-06-17", timeET: "14:00", source: "Federal Reserve", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-07-29", timeET: "14:00", source: "Federal Reserve", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-09-16", timeET: "14:00", source: "Federal Reserve", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-10-28", timeET: "14:00", source: "Federal Reserve", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-12-09", timeET: "14:00", source: "Federal Reserve", notes: "Decision + Powell presser" },

  { event: "FOMC SEP", date: "2026-03-18", timeET: "14:00", source: "Federal Reserve", notes: "Summary of Economic Projections" },
  { event: "FOMC SEP", date: "2026-06-17", timeET: "14:00", source: "Federal Reserve", notes: "Summary of Economic Projections" },
  { event: "FOMC SEP", date: "2026-09-16", timeET: "14:00", source: "Federal Reserve", notes: "Summary of Economic Projections" },
  { event: "FOMC SEP", date: "2026-12-09", timeET: "14:00", source: "Federal Reserve", notes: "Summary of Economic Projections" },

  // CPI
  { event: "CPI", date: "2026-01-13", timeET: "08:30", source: "BLS" },
  { event: "CPI", date: "2026-02-11", timeET: "08:30", source: "BLS" },
  { event: "CPI", date: "2026-03-11", timeET: "08:30", source: "BLS" },
  { event: "CPI", date: "2026-04-10", timeET: "08:30", source: "BLS" },
  { event: "CPI", date: "2026-05-12", timeET: "08:30", source: "BLS" },
  { event: "CPI", date: "2026-06-10", timeET: "08:30", source: "BLS" },
  { event: "CPI", date: "2026-07-14", timeET: "08:30", source: "BLS" },
  { event: "CPI", date: "2026-08-12", timeET: "08:30", source: "BLS" },
  { event: "CPI", date: "2026-09-11", timeET: "08:30", source: "BLS" },
  { event: "CPI", date: "2026-10-14", timeET: "08:30", source: "BLS" },
  { event: "CPI", date: "2026-11-10", timeET: "08:30", source: "BLS" },
  { event: "CPI", date: "2026-12-10", timeET: "08:30", source: "BLS" },

  // PPI
  { event: "PPI", date: "2026-01-14", timeET: "08:30", source: "BLS" },
  { event: "PPI", date: "2026-02-12", timeET: "08:30", source: "BLS" },
  { event: "PPI", date: "2026-03-12", timeET: "08:30", source: "BLS" },
  { event: "PPI", date: "2026-04-14", timeET: "08:30", source: "BLS" },
  { event: "PPI", date: "2026-05-13", timeET: "08:30", source: "BLS" },
  { event: "PPI", date: "2026-06-11", timeET: "08:30", source: "BLS" },
  { event: "PPI", date: "2026-07-15", timeET: "08:30", source: "BLS" },
  { event: "PPI", date: "2026-08-13", timeET: "08:30", source: "BLS" },
  { event: "PPI", date: "2026-09-10", timeET: "08:30", source: "BLS" },
  { event: "PPI", date: "2026-10-15", timeET: "08:30", source: "BLS" },
  { event: "PPI", date: "2026-11-13", timeET: "08:30", source: "BLS" },
  { event: "PPI", date: "2026-12-15", timeET: "08:30", source: "BLS" },

  // Employment Situation (Non-Farm Payrolls)
  { event: "Employment Situation", date: "2026-01-09", timeET: "08:30", source: "BLS" },
  { event: "Employment Situation", date: "2026-02-06", timeET: "08:30", source: "BLS" },
  { event: "Employment Situation", date: "2026-03-06", timeET: "08:30", source: "BLS" },
  { event: "Employment Situation", date: "2026-04-03", timeET: "08:30", source: "BLS" },
  { event: "Employment Situation", date: "2026-05-08", timeET: "08:30", source: "BLS" },
  { event: "Employment Situation", date: "2026-06-05", timeET: "08:30", source: "BLS" },
  { event: "Employment Situation", date: "2026-07-02", timeET: "08:30", source: "BLS" },
  { event: "Employment Situation", date: "2026-08-07", timeET: "08:30", source: "BLS" },
  { event: "Employment Situation", date: "2026-09-04", timeET: "08:30", source: "BLS" },
  { event: "Employment Situation", date: "2026-10-02", timeET: "08:30", source: "BLS" },
  { event: "Employment Situation", date: "2026-11-06", timeET: "08:30", source: "BLS" },
  { event: "Employment Situation", date: "2026-12-04", timeET: "08:30", source: "BLS" },

  // PCE
  //{ event: "PCE", date: "2025-01-31", timeET: "08:30", source: "BEA" },

  // GDP (Advance)
  { event: "GDP Advance", date: "2026-01-29", timeET: "08:30", source: "BEA" },
  { event: "GDP Advance", date: "2026-04-30", timeET: "08:30", source: "BEA" },
  { event: "GDP Advance", date: "2026-07-30", timeET: "08:30", source: "BEA" },
  { event: "GDP Advance", date: "2026-10-29", timeET: "08:30", source: "BEA" },

  // Add others here manually
];

fs.writeFileSync("macro_calendar_2025.json", JSON.stringify(macroCalendar, null, 2));
console.log("Calendar saved to macro_calendar_2025.json");

AAPL: https://www.apple.com/chfr/newsroom/
MSFT: https://news.microsoft.com/source/tag/press-releases/
GOOGL: https://abc.xyz/investor/news/
AMZN: https://press.aboutamazon.com/press-release-archive
NVDA: https://nvidianews.nvidia.com/
META: https://investor.atmeta.com/investor-news/default.aspx
TSLA: https://ir.tesla.com/press
BRK,B: https://www.berkshirehathaway.com/news/2025news.html 
JPM: https://www.jpmorganchase.com/newsroom/press-releases
GS: https://www.goldmansachs.com/pressroom#press-releases
BAC:https://newsroom.bankofamerica.com/press-releases
XOM: https://corporate.exxonmobil.com/news/news-releases
CVX: https://chevroncorp.gcs-web.com/news-releases
UNH: https://www.unitedhealthgroup.com/newsroom/press-releases.html
LLY: https://www.lilly.com/news/press-releases
JNJ: https://www.jnj.com/media-center/press-releases
PG: https://us.pg.com/newsroom/
KO: https://investors.coca-colacompany.com/news-events/press-releases
HD: https://ir.homedepot.com/news-releases/2025
CAT: https://www.caterpillar.com/en/news/corporate-press-releases.html
BA: https://investors.boeing.com/investors/overview/default.aspx
INTC: https://newsroom.intel.com/news
AMD: https://ir.amd.com/news-events/press-releases
NFLX: https://ir.netflix.net/investor-news-and-events/financial-releases/default.aspx
MS: https://www.morganstanley.com/about-us-newsroom#-536583991-tab

reuters: https://www.reuters.com/markets
CNBC: https://www.cnbc.com/markets/
MarketWatch: https://www.marketwatch.com/latest-news
Yahoo: https://finance.yahoo.com/news/
INvesting: https://www.investing.com/news/
Seekingalpha: https://seekingalpha.com/market-news
FXStreet: https://www.fxstreet.com/news
guardian: https://www.theguardian.com/uk/business