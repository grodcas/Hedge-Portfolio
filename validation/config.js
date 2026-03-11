// validation/config.js - Configuration for validation system

export const PORTFOLIO_TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS"
];

// Ticker to CIK mapping for SEC EDGAR
export const TICKER_CIK = {
  AAPL: "0000320193",
  MSFT: "0000789019",
  GOOGL: "0001652044",
  AMZN: "0001018724",
  NVDA: "0001045810",
  META: "0001326801",
  TSLA: "0001318605",
  "BRK.B": "0001067983",
  JPM: "0000019617",
  GS: "0000886982",
  BAC: "0000070858",
  XOM: "0000034088",
  CVX: "0000093410",
  UNH: "0000731766",
  LLY: "0000059478",
  JNJ: "0000200406",
  PG: "0000080424",
  KO: "0000021344",
  HD: "0000354950",
  CAT: "0000018230",
  BA: "0000012927",
  INTC: "0000050863",
  AMD: "0000002488",
  NFLX: "0001065280",
  MS: "0000895421"
};

// Press release URLs for each ticker
export const PRESS_URLS = {
  AAPL: "https://www.apple.com/newsroom/",
  MSFT: "https://news.microsoft.com/source/tag/press-releases/",
  GOOGL: "https://abc.xyz/investor/news/",
  AMZN: "https://press.aboutamazon.com/press-release-archive",
  NVDA: "https://nvidianews.nvidia.com/",
  META: "https://investor.atmeta.com/investor-news/default.aspx",
  TSLA: "https://ir.tesla.com/press",
  "BRK.B": "https://www.berkshirehathaway.com/news/2025news.html",
  JPM: "https://www.jpmorganchase.com/newsroom/press-releases",
  GS: "https://www.goldmansachs.com/pressroom#press-releases",
  BAC: "https://newsroom.bankofamerica.com/press-releases",
  XOM: "https://corporate.exxonmobil.com/news/news-releases",
  CVX: "https://chevroncorp.gcs-web.com/news-releases",
  UNH: "https://www.unitedhealthgroup.com/newsroom/press-releases.html",
  LLY: "https://www.lilly.com/news/press-releases",
  JNJ: "https://www.jnj.com/media-center/press-releases",
  PG: "https://us.pg.com/newsroom/",
  KO: "https://investors.coca-colacompany.com/news-events/press-releases",
  HD: "https://ir.homedepot.com/news-releases/2025",
  CAT: "https://www.caterpillar.com/en/news/corporate-press-releases.html",
  BA: "https://investors.boeing.com/investors/overview/default.aspx",
  INTC: "https://newsroom.intel.com/news",
  AMD: "https://ir.amd.com/news-events/press-releases",
  NFLX: "https://ir.netflix.net/investor-news-and-events/financial-releases/default.aspx",
  MS: "https://www.morganstanley.com/about-us-newsroom"
};

// Macro indicator configurations
export const MACRO_INDICATORS = {
  CPI: {
    name: "CPI",
    source: "BLS",
    apiUrl: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
    seriesIds: ["CUUR0000SA0", "CUUR0000SA0L1E", "CUUR0000SE", "CUUR0000SAF112", "CUUR0000SAH1"],
    expectedRange: [100, 500]
  },
  PPI: {
    name: "PPI",
    source: "BLS",
    apiUrl: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
    seriesIds: ["WPSFD4", "WPUFD4", "WPUFD49104"],
    expectedRange: [100, 300]
  },
  Employment: {
    name: "Employment",
    source: "BLS",
    apiUrl: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
    seriesIds: ["CES0000000001", "LNS14000000"],
    expectedRange: [0, 200000]
  },
  BankReserves: {
    name: "Bank Reserves",
    source: "FRED",
    apiUrl: "https://api.stlouisfed.org/fred/series/observations",
    seriesId: "WRESBAL",
    expectedRange: [1000000, 10000000],
    displayUnit: "millions"
  },
  InterestRates: {
    name: "Interest Rates",
    source: "FRED",
    apiUrl: "https://api.stlouisfed.org/fred/series/observations",
    seriesId: "DFF",
    expectedRange: [0, 15],
    displayUnit: "percent"
  },
  ConsumerSentiment: {
    name: "Consumer Sentiment",
    source: "UMich",
    apiUrl: "https://www.sca.isr.umich.edu/files/tbcics.csv",
    expectedRange: [50, 120]
  },
  InflationExpectations: {
    name: "Inflation Expectations",
    source: "UMich",
    apiUrl: "https://www.sca.isr.umich.edu/files/tbcpx1px5.csv",
    expectedRange: [0, 10]
  },
  FOMC: {
    name: "FOMC",
    source: "Federal Reserve",
    apiUrl: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    expectedRange: null
  },
  VIX: {
    name: "VIX/Gamma Regime",
    source: "Yahoo Finance",
    apiUrl: "https://query1.finance.yahoo.com/v8/finance/chart/",
    expectedRange: [10, 80]
  }
};

// Sentiment indicator configurations
export const SENTIMENT_INDICATORS = {
  PutCall: {
    name: "Put/Call Ratios",
    source: "CBOE",
    url: "https://www.cboe.com/us/options/market_statistics/daily/",
    expectedRange: [0.3, 2.0]
  },
  AAII: {
    name: "AAII Sentiment",
    source: "AAII",
    url: "https://www.aaii.com/sentiment-survey",
    localFile: "C:\\AI_agent\\HF\\sentiment\\AAII.mhtml",
    expectedRange: [0, 100]
  },
  COT: {
    name: "COT Futures",
    source: "CFTC",
    url: "https://www.cftc.gov/dea/newcot/FinFutWk.txt",
    expectedRange: null
  }
};

// White House / FOMC sources
export const POLICY_SOURCES = {
  WhiteHouse: {
    name: "White House",
    url: "https://www.whitehouse.gov/news/"
  },
  FOMC: {
    name: "FOMC Statement",
    url: "https://www.federalreserve.gov/monetarypolicy.htm"
  },
  FedMinutes: {
    name: "Fed Minutes",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
  }
};

// News sources (manually downloaded)
export const NEWS_SOURCES = {
  Bloomberg: {
    name: "Bloomberg",
    folder: "C:\\AI_agent\\HF\\news\\BLOOMBERG\\files"
  },
  WSJ: {
    name: "WSJ",
    folder: "C:\\AI_agent\\HF\\news\\WSJ\\files"
  },
  Reuters: {
    name: "Reuters",
    folder: "C:\\AI_agent\\HF\\news\\REUTERS\\files"
  }
};

// Validation thresholds
export const VALIDATION_THRESHOLDS = {
  minArticleLength: 200,
  maxArticleLength: 100000,
  minParagraphs: 2,
  httpTimeout: 10000,
  aiValidationModel: "o3-mini"
};

// SEC filing types to track
export const SEC_FILING_TYPES = ["10-K", "10-Q", "8-K", "4"];
