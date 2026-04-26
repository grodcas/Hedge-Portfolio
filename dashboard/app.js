/* ============================================================
   MOCK DATA
   ============================================================ */
const DATA = {
  regime: {
    label: 'Late-cycle · Cautious-bullish',
    signals: [
      { label: '10Y Yield',    value: '4.18%',  trend: 'neutral', ref: 'indicator:10Y Yield' },
      { label: 'Core CPI YoY', value: '3.2%',   trend: 'bearish', ref: 'indicator:Core CPI YoY' },
      { label: 'GDP Nowcast',  value: '+1.4%',  trend: 'bearish', ref: 'indicator:GDP Nowcast' },
      { label: 'HY Spread',    value: '318bps', trend: 'neutral', ref: 'indicator:HY Spread' }
    ],
    netExposure: 62,
    styleTilts: [
      { name: 'Quality',  score:  0.72 },
      { name: 'Low vol',  score:  0.48 },
      { name: 'Growth',   score: -0.35 },
      { name: 'Value',    score:  0.12 },
      { name: 'Momentum', score: -0.05 }
    ]
  },

  // Backend sector names — 8 D1-canonical sectors matching SECTOR_FACTORS_daily.
  // UI display goes through SECTOR_DISPLAY below (e.g. ConsDisc → "Discretionary").
  sectors: [
    { name: 'Healthcare',    regime: 0.82, earn:  0.55, val:  0.10, rs:  0.62, stance: 'OW', weight: 20 },
    { name: 'Staples',       regime: 0.76, earn:  0.20, val: -0.25, rs:  0.48, stance: 'OW', weight: 15 },
    { name: 'Finance',       regime: 0.12, earn:  0.40, val:  0.55, rs:  0.08, stance: 'EW', weight: 13 },
    { name: 'Industrial',    regime: 0.05, earn:  0.25, val:  0.05, rs: -0.08, stance: 'EW', weight:  9 },
    { name: 'Energy',        regime: 0.28, earn: -0.15, val:  0.70, rs:  0.22, stance: 'EW', weight:  7 },
    { name: 'Communication', regime:-0.22, earn:  0.35, val: -0.20, rs:  0.15, stance: 'UW', weight:  8 },
    { name: 'Technology',    regime:-0.45, earn:  0.50, val: -0.70, rs:  0.10, stance: 'UW', weight: 20 },
    { name: 'ConsDisc',      regime:-0.55, earn: -0.05, val: -0.55, rs: -0.32, stance: 'UW', weight:  8 }
  ],

  // 8 SPDR sector ETFs matching the D1 sector set.
  rrgPoints: [
    { t: 'XLV',  x: 103.5, y: 101.8, color: 'var(--green)',  size: 8 },
    { t: 'XLP',  x: 102.1, y: 100.6, color: 'var(--green)',  size: 7 },
    { t: 'XLF',  x:  99.7, y: 101.1, color: 'var(--blue)',   size: 6 },
    { t: 'XLI',  x:  99.2, y: 100.3, color: 'var(--blue)',   size: 5 },
    { t: 'XLE',  x: 101.8, y:  98.4, color: 'var(--yellow)', size: 5 },
    { t: 'XLC',  x:  98.3, y:  99.8, color: 'var(--red)',    size: 5 },
    { t: 'XLK',  x:  98.5, y:  98.7, color: 'var(--red)',    size: 8 },
    { t: 'XLY',  x:  97.4, y:  98.3, color: 'var(--red)',    size: 5 }
  ],

  stockShortlist: {
    Healthcare: [
      { ticker: 'UNH',  score: 0.78, rev:  3.2, val: 'cheap', days: 14, conv: 5, spark: [0.2,0.3,0.35,0.28,0.4,0.5,0.55,0.6,0.58,0.65,0.7,0.72,0.78] },
      { ticker: 'LLY',  score: 0.62, rev:  5.1, val: 'exp',   days:  7, conv: 4, spark: [0.5,0.48,0.55,0.6,0.58,0.62,0.68,0.72,0.7,0.68,0.65,0.6,0.62] },
      { ticker: 'ABBV', score: 0.54, rev:  1.8, val: 'fair',  days: 22, conv: 4, spark: [0.3,0.35,0.4,0.42,0.45,0.5,0.52,0.5,0.48,0.5,0.52,0.54,0.54] },
      { ticker: 'TMO',  score: 0.41, rev:  0.5, val: 'fair',  days: 41, conv: 3, spark: [0.2,0.25,0.3,0.28,0.35,0.4,0.42,0.38,0.4,0.42,0.4,0.41,0.41] }
    ],
    Staples: [
      { ticker: 'KO',   score: 0.58, rev:  0.8, val: 'fair',  days: 28, conv: 4, spark: [0.2,0.3,0.35,0.4,0.42,0.45,0.5,0.52,0.55,0.53,0.56,0.58,0.58] },
      { ticker: 'PG',   score: 0.49, rev:  1.2, val: 'fair',  days: 52, conv: 3, spark: [0.3,0.32,0.35,0.38,0.4,0.42,0.44,0.46,0.47,0.48,0.49,0.49,0.49] },
      { ticker: 'COST', score: 0.35, rev:  2.4, val: 'exp',   days:  9, conv: 3, spark: [0.4,0.42,0.4,0.38,0.35,0.32,0.3,0.32,0.34,0.33,0.35,0.36,0.35] }
    ],
    Finance: [
      { ticker: 'JPM',  score: 0.55, rev:  1.5, val: 'fair',  days: 38, conv: 4, spark: [0.3,0.32,0.35,0.4,0.42,0.45,0.48,0.5,0.52,0.54,0.55,0.55,0.55] },
      { ticker: 'GS',   score: 0.42, rev:  2.1, val: 'cheap', days: 25, conv: 3, spark: [0.25,0.28,0.3,0.33,0.36,0.38,0.4,0.41,0.42,0.43,0.42,0.42,0.42] },
      { ticker: 'BRK.B',score: 0.48, rev:  0.4, val: 'fair',  days: 60, conv: 4, spark: [0.3,0.32,0.36,0.4,0.42,0.44,0.46,0.47,0.47,0.48,0.48,0.48,0.48] }
    ]
  },

  // Ticker weights — 8 D1 sectors, SPDR convention (ticker → sector via SECTOR_BUCKET).
  weights: [
    { ticker: 'UNH',   sector: 'Healthcare',    current: 4.5, target: 5.0 },
    { ticker: 'LLY',   sector: 'Healthcare',    current: 3.5, target: 4.0 },
    { ticker: 'ABBV',  sector: 'Healthcare',    current: 2.5, target: 3.5 },
    { ticker: 'TMO',   sector: 'Healthcare',    current: 2.0, target: 2.5 },
    { ticker: 'KO',    sector: 'Staples',       current: 3.0, target: 4.0 },
    { ticker: 'PG',    sector: 'Staples',       current: 3.0, target: 3.5 },
    { ticker: 'COST',  sector: 'Staples',       current: 2.5, target: 2.0 },
    { ticker: 'JPM',   sector: 'Finance',       current: 4.0, target: 3.5 },
    { ticker: 'GS',    sector: 'Finance',       current: 2.5, target: 2.5 },
    { ticker: 'BRK.B', sector: 'Finance',       current: 3.0, target: 3.0 },
    { ticker: 'CAT',   sector: 'Industrial',    current: 2.5, target: 2.5 },
    { ticker: 'BA',    sector: 'Industrial',    current: 1.5, target: 2.0 },
    { ticker: 'XOM',   sector: 'Energy',        current: 3.0, target: 2.5 },
    { ticker: 'CVX',   sector: 'Energy',        current: 2.0, target: 2.0 },
    { ticker: 'MSFT',  sector: 'Technology',    current: 6.0, target: 3.5 },
    { ticker: 'NVDA',  sector: 'Technology',    current: 5.0, target: 2.0 },
    { ticker: 'AAPL',  sector: 'Technology',    current: 4.0, target: 3.0 },
    { ticker: 'AMZN',  sector: 'ConsDisc',      current: 3.5, target: 1.5 },
    { ticker: 'HD',    sector: 'ConsDisc',      current: 2.0, target: 2.0 },
    { ticker: 'TSLA',  sector: 'ConsDisc',      current: 1.5, target: 1.0 },
    { ticker: 'GOOGL', sector: 'Communication', current: 3.0, target: 2.0 },
    { ticker: 'META',  sector: 'Communication', current: 2.5, target: 2.0 },
    { ticker: 'NFLX',  sector: 'Communication', current: 2.0, target: 1.5 }
  ],

  // 8 D1-canonical sector → color. Used by pie/bar charts and sector chips.
  sectorColors: {
    Healthcare:    'var(--green)',
    Staples:       'var(--blue)',
    Finance:       'var(--yellow)',
    Industrial:    'var(--orange)',
    Energy:        'var(--red)',
    Communication: 'var(--cyan)',
    Technology:    'var(--purple)',
    ConsDisc:      'var(--pink)'
  },

  kpis: [
    { label: 'Net Exposure',   value: '61.5%', delta: '−0.5 target', cls: 'down' },
    { label: 'Gross Exposure', value: '74.2%', delta: '+2.1% 30d',   cls: 'up' },
    { label: 'Positions',      value: '16',    delta: '−2 30d',       cls: 'down' },
    { label: 'Cash %',         value: '25.8%', delta: 'dry powder',   cls: '' },
    { label: 'Vol (ann.)',     value: '11.4%', delta: 'tgt 12%',       cls: '' },
    { label: '1d P&L',         value: '+0.32%', delta: '+£3,984',      cls: 'up' }
  ],

  decisionTrail: {
    ticker: 'UNH',
    weight: 5.0,
    steps: [
      { kind: 'Regime', text: 'Late-cycle + decel growth → defensive tilt, OW quality.' },
      { kind: 'Sector', text: 'Healthcare scored +0.82 regime fit, +0.55 earnings momentum → <strong>OW 18%</strong>.' },
      { kind: 'Stock',  text: 'UNH ranks #1 in HC: revisions <strong>+3.2%</strong>, cheap vs peers, earnings in 14d.' },
      { kind: 'Size',   text: 'Conviction 5/5, low book correlation, high liquidity → <strong>5.0% of NAV</strong>.' }
    ]
  },

  attribution: [
    { label: 'Regime call', value: 145, color: 'var(--green)' },
    { label: 'Sector tilt', value:  82, color: 'var(--green)' },
    { label: 'Stock picks', value: -34, color: 'var(--red)' },
    { label: 'Sizing',      value:  22, color: 'var(--green)' }
  ],

  calibration: [
    { conv: 1, expected: 0.20, actual: 0.18, n:  8 },
    { conv: 2, expected: 0.35, actual: 0.33, n: 14 },
    { conv: 3, expected: 0.50, actual: 0.48, n: 22 },
    { conv: 4, expected: 0.65, actual: 0.71, n: 16 },
    { conv: 5, expected: 0.80, actual: 0.72, n:  9 }
  ],

  recentTrades: [
    { action: 'BUY',   ticker: 'LLY',  note: 'Mounjaro uptake + EU approval',  pnl:  8.2 },
    { action: 'SELL',  ticker: 'NVDA', note: 'Trimmed on rich valuation',      pnl:  4.1 },
    { action: 'SHORT', ticker: 'TSLA', note: 'Demand signals weakening',        pnl: -3.6 },
    { action: 'BUY',   ticker: 'KO',   note: 'Defensive ballast add',           pnl:  2.1 },
    { action: 'SELL',  ticker: 'META', note: 'Earnings printed, taking gains',  pnl:  6.4 },
    { action: 'BUY',   ticker: 'UNH',  note: 'MCR cycle bottoming',             pnl:  5.8 },
    { action: 'SHORT', ticker: 'XOM',  note: 'Crude glut thesis',               pnl: -1.2 },
    { action: 'BUY',   ticker: 'ABBV', note: 'Humira overhang priced in',       pnl:  3.5 },
    { action: 'SELL',  ticker: 'AMZN', note: 'AWS deceleration',                pnl: -2.8 },
    { action: 'BUY',   ticker: 'PG',   note: 'FX tailwind + pricing power',     pnl:  1.9 }
  ],

  // Open positions — 8 D1 sectors, SPDR convention. `weight` lines up with weights[].current above.
  positions: [
    { ticker: 'UNH',   sector: 'Healthcare',    qty: 160,  cost: 485.20, price: 512.80, weight: 4.5, unrlzPnl:  5.7, dayPnl:  0.45, daysHeld:  23 },
    { ticker: 'LLY',   sector: 'Healthcare',    qty:  80,  cost: 735.50, price: 792.10, weight: 3.5, unrlzPnl:  7.7, dayPnl:  1.12, daysHeld:  48 },
    { ticker: 'ABBV',  sector: 'Healthcare',    qty: 260,  cost: 158.80, price: 168.20, weight: 2.5, unrlzPnl:  5.9, dayPnl: -0.28, daysHeld:  31 },
    { ticker: 'TMO',   sector: 'Healthcare',    qty:  65,  cost: 552.10, price: 548.90, weight: 2.0, unrlzPnl: -0.6, dayPnl:  0.08, daysHeld:  15 },
    { ticker: 'KO',    sector: 'Staples',       qty: 640,  cost:  62.40, price:  64.10, weight: 3.0, unrlzPnl:  2.7, dayPnl:  0.22, daysHeld:  52 },
    { ticker: 'PG',    sector: 'Staples',       qty: 250,  cost: 161.20, price: 163.90, weight: 3.0, unrlzPnl:  1.7, dayPnl:  0.05, daysHeld:  42 },
    { ticker: 'COST',  sector: 'Staples',       qty:  30,  cost: 735.00, price: 718.40, weight: 2.5, unrlzPnl: -2.3, dayPnl: -0.48, daysHeld:  18 },
    { ticker: 'JPM',   sector: 'Finance',       qty: 180,  cost: 218.00, price: 222.40, weight: 4.0, unrlzPnl:  2.0, dayPnl:  0.38, daysHeld:  67 },
    { ticker: 'GS',    sector: 'Finance',       qty:  60,  cost: 485.70, price: 501.30, weight: 2.5, unrlzPnl:  3.2, dayPnl:  0.18, daysHeld:  44 },
    { ticker: 'BRK.B', sector: 'Finance',       qty: 120,  cost: 412.10, price: 429.80, weight: 3.0, unrlzPnl:  4.3, dayPnl:  0.22, daysHeld:  72 },
    { ticker: 'CAT',   sector: 'Industrial',    qty:  80,  cost: 372.50, price: 368.20, weight: 2.5, unrlzPnl: -1.2, dayPnl: -0.22, daysHeld:  41 },
    { ticker: 'BA',    sector: 'Industrial',    qty:  90,  cost: 218.40, price: 211.70, weight: 1.5, unrlzPnl: -3.1, dayPnl: -0.42, daysHeld:  27 },
    { ticker: 'XOM',   sector: 'Energy',        qty: 240,  cost: 114.80, price: 118.60, weight: 3.0, unrlzPnl:  3.3, dayPnl:  0.62, daysHeld:  22 },
    { ticker: 'CVX',   sector: 'Energy',        qty: 160,  cost: 155.20, price: 160.80, weight: 2.0, unrlzPnl:  3.6, dayPnl:  0.41, daysHeld:  33 },
    { ticker: 'MSFT',  sector: 'Technology',    qty:  92,  cost: 412.00, price: 428.50, weight: 6.0, unrlzPnl:  4.0, dayPnl:  0.55, daysHeld:  84 },
    { ticker: 'NVDA',  sector: 'Technology',    qty:  48,  cost: 875.20, price: 932.40, weight: 5.0, unrlzPnl:  6.5, dayPnl:  1.84, daysHeld: 102 },
    { ticker: 'AAPL',  sector: 'Technology',    qty: 140,  cost: 218.40, price: 224.60, weight: 4.0, unrlzPnl:  2.8, dayPnl:  0.31, daysHeld:  56 },
    { ticker: 'AMZN',  sector: 'ConsDisc',      qty: 110,  cost: 178.30, price: 172.80, weight: 3.5, unrlzPnl: -3.1, dayPnl: -0.75, daysHeld:  38 },
    { ticker: 'HD',    sector: 'ConsDisc',      qty:  50,  cost: 382.90, price: 391.40, weight: 2.0, unrlzPnl:  2.2, dayPnl:  0.28, daysHeld:  29 },
    { ticker: 'TSLA',  sector: 'ConsDisc',      qty:  70,  cost: 252.60, price: 241.10, weight: 1.5, unrlzPnl: -4.6, dayPnl: -1.12, daysHeld:  19 },
    { ticker: 'GOOGL', sector: 'Communication', qty: 150,  cost: 152.40, price: 158.70, weight: 3.0, unrlzPnl:  4.1, dayPnl:  0.31, daysHeld:  45 },
    { ticker: 'META',  sector: 'Communication', qty:  55,  cost: 488.20, price: 501.40, weight: 2.5, unrlzPnl:  2.7, dayPnl:  0.62, daysHeld:  39 },
    { ticker: 'NFLX',  sector: 'Communication', qty:  45,  cost: 612.30, price: 628.90, weight: 2.0, unrlzPnl:  2.7, dayPnl:  0.41, daysHeld:  51 }
  ],

  // Empty stub. Filled by bootstrapMacroIndicators() from /api/indicator-history.
  // Empty initial render = "data not yet loaded" rather than fake authoritative numbers.
  macroIndicators: [],

  news: [
    { title: 'UnitedHealth beats Q1 EPS, raises guidance on MCR improvement',      src: 'Reuters',    date: '08:12', tickers: ['UNH'],        sent: 'pos', score:  0.82, mat: 8 },
    { title: 'Fed minutes: "patient" stance, no cuts priced before July',          src: 'Bloomberg',  date: '07:45', tickers: ['SPY','XLF'],  sent: 'neu', score:  0.05, mat: 6 },
    { title: 'Lilly secures EU approval for weight-loss indication',               src: 'FT',         date: '07:30', tickers: ['LLY','NVO'],  sent: 'pos', score:  0.74, mat: 9 },
    { title: 'Tesla vehicle deliveries miss consensus, Q1 gross margin compresses', src: 'WSJ',        date: '06:55', tickers: ['TSLA'],       sent: 'neg', score: -0.68, mat: 8 },
    { title: 'NVIDIA rumoured next-gen chip delay by one quarter',                  src: 'Bloomberg',  date: '06:20', tickers: ['NVDA','AMD'], sent: 'neg', score: -0.42, mat: 7 },
    { title: 'Apple reported to scale back Vision Pro production targets',          src: 'Nikkei',     date: '06:02', tickers: ['AAPL'],       sent: 'neg', score: -0.31, mat: 5 },
    { title: 'JPMorgan beats on NII, raises FY guidance',                           src: 'Reuters',    date: '05:45', tickers: ['JPM','BAC'],  sent: 'pos', score:  0.58, mat: 7 },
    { title: 'Saudi Arabia extends voluntary production cut into Q3',               src: 'Reuters',    date: '05:10', tickers: ['XOM','CVX'],  sent: 'pos', score:  0.35, mat: 5 }
  ],

  topDrivers: [
    { ticker: 'UNH',  move: '+3.4%', reason: 'EPS beat + guidance raise' },
    { ticker: 'TSLA', move: '−5.8%', reason: 'Delivery miss' },
    { ticker: 'LLY',  move: '+2.1%', reason: 'EU approval catalyst' },
    { ticker: 'NVDA', move: '−1.8%', reason: 'Chip delay rumour' },
    { ticker: 'XOM',  move: '+1.2%', reason: 'OPEC+ cut extension' }
  ],

  feeds: [
    { name: 'PRICE_01_Daily',          source: 'yfinance',            last: '08:04:52',   age: '3m',    status: 'ok',    notes: '—' },
    { name: 'FUND_01_Fundamentals',    source: 'yfinance',            last: '07:00:00',   age: '1h7m',  status: 'ok',    notes: 'daily refresh' },
    { name: 'FUND_02_Earnings',        source: 'Alpha Vantage',       last: '2026-04-12', age: '5d',    status: 'stale', notes: 'next EPS cycle tomorrow' },
    { name: 'BETA_12_News_digest',     source: 'RSS aggregator',      last: '08:00:12',   age: '8m',    status: 'ok',    notes: '—' },
    { name: 'BETA_10_Daily_macro',     source: 'FRED+BEA+BLS',        last: '06:00:00',   age: '2h5m',  status: 'ok',    notes: 'scheduled' },
    { name: 'ALPHA_01_Reports',        source: 'EDGAR',               last: '04:12:00',   age: '3h53m', status: 'ok',    notes: '—' },
    { name: 'ALPHA_03_Press',          source: 'company IRs',         last: '07:48:00',   age: '20m',   status: 'ok',    notes: '—' },
    { name: 'SIGNAL_01_Assessment',    source: 'assessment-engine',   last: '07:15:00',   age: '53m',   status: 'ok',    notes: 'daily batch' },
    { name: 'SIGNAL_02_Probability',   source: 'probability-engine',  last: '07:20:00',   age: '48m',   status: 'ok',    notes: '—' },
    { name: 'SIGNAL_03_Consensus',     source: 'consensus-validator', last: '07:22:00',   age: '46m',   status: 'ok',    notes: '—' },
    { name: 'SIGNAL_04_Attributions',  source: 'event-attribution',   last: '07:30:00',   age: '38m',   status: 'ok',    notes: '—' },
    { name: 'TICKER_TREND_long',       source: 'ticker-trend-long',   last: '2026-04-15', age: '2d',    status: 'ok',    notes: 'event-driven' },
    { name: 'TICKER_TREND_short',      source: 'ticker-trend-short',  last: '06:40:00',   age: '1h28m', status: 'ok',    notes: '—' },
    { name: 'OPERATION_01_Signals',    source: 'operations-agent',    last: '07:45:00',   age: '23m',   status: 'ok',    notes: '—' },
    { name: 'MOVER_EXPLANATIONS',      source: 'big-movers-why',      last: '2026-04-15', age: '2d',    status: 'error', notes: 'LLM timeout' },
    { name: 'REBALANCE_01',            source: 'wealth-distribution', last: '07:50:00',   age: '18m',   status: 'ok',    notes: '—' }
  ],

  anomalies: [
    { time: '07:55',      sev: 'high', source: 'MOVER_EXPLANATIONS',  msg: 'LLM timeout after 3 retries — no explanations generated for 2026-04-17' },
    { time: '06:12',      sev: 'med',  source: 'FUND_02_Earnings',    msg: 'TSLA EPS estimate field missing (null) · 3rd occurrence this week' },
    { time: '04:45',      sev: 'low',  source: 'BETA_12_News_digest', msg: 'Sentiment disagreement on NVDA headline (haiku +0.3 vs lexicon −0.4)' },
    { time: '2026-04-16', sev: 'med',  source: 'PRICE_01_Daily',      msg: 'TSLA intraday gap (>10%) triggered outlier flag' },
    { time: '2026-04-16', sev: 'low',  source: 'SIGNAL_03_Consensus', msg: 'AMZN consensus missed_factors includes "AWS growth decel"' }
  ],

  monthlyCheck: [
    { label: 'Macro indicators verified (CPI, GDP, Rates)',  status: 'done',    date: '2026-04-12' },
    { label: 'Press release URLs resolvable',                 status: 'done',    date: '2026-04-14' },
    { label: 'FOMC minutes verified & summarized',            status: 'done',    date: '2026-04-15' },
    { label: 'EDGAR filings cross-checked with vendor data',  status: 'pending', date: 'due 2026-04-22' },
    { label: 'Ticker trend LLM outputs spot-audit (5 names)', status: 'pending', date: 'due 2026-04-25' },
    { label: 'Monthly P&L reconciliation vs broker',          status: 'pending', date: 'due 2026-04-30' },
    { label: 'Signal calibration review (conviction levels)', status: 'pending', date: 'due 2026-04-28' }
  ]
};

/* ============================================================
   BACKEND DATA WIRING (Sprint 4)
   Fetches /api/stock-factors, /api/sector-factors, /api/sector-trends,
   /api/ticker-trends and replaces DATA stubs + ENTITIES entries.
   ============================================================ */

// Backend sector bucket (STOCK_FACTORS.sector / SECTOR_FACTORS.sector) →
// user-facing display name used throughout the mockup UI.
const SECTOR_DISPLAY = {
  Technology:    'Technology',
  ConsDisc:      'Discretionary',
  Communication: 'Comm Svcs',
  Finance:       'Financials',
  Energy:        'Energy',
  Healthcare:    'Healthcare',
  Staples:       'Staples',
  Industrial:    'Industrials',
};

const SECTOR_ETF = {
  Technology: 'XLK', ConsDisc: 'XLY', Communication: 'XLC', Finance: 'XLF',
  Energy: 'XLE', Healthcare: 'XLV', Staples: 'XLP', Industrial: 'XLI',
};

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

function escapeHTML(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showPortfolioError(message) {
  const container = document.getElementById('tabView');
  if (!container || document.getElementById('portfolio-error-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'portfolio-error-banner';
  banner.style.cssText = 'background:rgba(248,81,73,0.12);border:1px solid var(--red);color:var(--red);padding:8px 12px;margin:8px;border-radius:6px;font-size:12px;';
  banner.textContent = `Backend data unavailable — showing stub data. ${message}`;
  container.prepend(banner);
}

// Small inline pill that surfaces a "data unavailable" state on a specific
// panel when its bootstrap returned no rows. Replaces the silent fallback
// that left a panel's hardcoded stub data looking authoritative.
function setDataUnavailable(elOrId, opts = {}) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  const label = opts.label || 'data unavailable';
  const existing = el.querySelector(':scope > .data-unavailable-pill');
  if (opts.clear) { if (existing) existing.remove(); return; }
  if (existing) return;
  const pill = document.createElement('div');
  pill.className = 'data-unavailable-pill';
  pill.textContent = label;
  pill.style.cssText = 'position:absolute;top:6px;right:6px;z-index:5;background:rgba(248,81,73,0.12);color:var(--red);border:1px solid var(--red);font-size:9px;padding:2px 6px;border-radius:3px;letter-spacing:0.5px;font-family:ui-monospace,monospace;text-transform:uppercase;pointer-events:none;';
  const cs = getComputedStyle(el);
  if (cs.position === 'static') el.style.position = 'relative';
  el.appendChild(pill);
}

// --- SECTOR_FACTORS_daily row → DATA.sectors shape ---
// Backend: {sector, regime_fit, earn_momentum, valuation_sigma, rel_strength_13w,
//           stance, stance_score, fwd_pe_sector, rs_ratio, rs_momentum, ...}
// UI shape: {name, regime, earn, val, rs, stance, weight, _raw}
function transformSectors(apiRows, rebalanceMap) {
  // Pass nulls through — renderer shows "—" for them. Converting to 0
  // would fake "flat" readings for factors that genuinely have no data.
  return apiRows.map(r => ({
    name:   SECTOR_DISPLAY[r.sector] || r.sector,
    regime: r.regime_fit,
    earn:   r.earn_momentum,
    val:    r.valuation_sigma,
    rs:     r.rel_strength_13w,
    stance: r.stance || 'EW',
    weight: rebalanceMap?.[r.sector] ?? (100 / apiRows.length),
    _bucket: r.sector,
    _raw: r,
  }));
}

// --- SECTOR_FACTORS rows → DATA.rrgPoints ---
function transformRRG(apiRows) {
  const pts = [];
  for (const r of apiRows) {
    if (r.rs_ratio == null || r.rs_momentum == null) continue;
    const etf = SECTOR_ETF[r.sector];
    const color = (r.rs_ratio >= 100 && r.rs_momentum >= 100) ? 'var(--green)'
                : (r.rs_ratio < 100 && r.rs_momentum >= 100) ? 'var(--blue)'
                : (r.rs_ratio >= 100 && r.rs_momentum < 100) ? 'var(--yellow)'
                : 'var(--red)';
    pts.push({ t: etf || r.sector, x: r.rs_ratio, y: r.rs_momentum, color, size: 6 });
  }
  return pts;
}

// --- STOCK_FACTORS_daily rows → DATA.stockShortlist keyed by display sector ---
// Each stock emits the 9 standard factor fields. The render function reads
// these new names directly.
function transformStockShortlist(apiRows) {
  const out = {};
  for (const r of apiRows) {
    const disp = SECTOR_DISPLAY[r.sector] || r.sector || 'Other';
    (out[disp] ||= []).push({
      ticker:           r.ticker,
      fwd_pe:           r.fwd_pe,
      rel_pe_sigma:     r.rel_pe_sigma,
      eps_rev_4w:       r.eps_rev_4w,
      rev_breadth_4w:   r.rev_breadth_4w,
      sue:              r.sue,
      mom_12_1:         r.mom_12_1,
      rs_vs_sector_3m:  r.rs_vs_sector_3m,
      piotroski_f:      r.piotroski_f,
      days_to_catalyst: r.days_to_catalyst,
    });
  }
  return out;
}

// Sprint 8: Layer 5 attribution waterfall + calibration.
// Both endpoints return [] today (insufficient history / no closed trades);
// the render functions show honest empty-state messages.
async function bootstrapLayer5() {
  try {
    const [attr, calib] = await Promise.all([
      fetchJSON('/api/attribution').catch(() => []),
      fetchJSON('/api/calibration').catch(() => []),
    ]);
    DATA.attribution = Array.isArray(attr) ? attr : [];
    DATA.calibration = Array.isArray(calib) ? calib : [];
    renderWaterfall();
    renderCalibration();
  } catch (err) {
    console.warn('[L5] bootstrap failed:', err);
  }
}

// Sprint 8: weighted-avg style tilts from /api/stock-factors × /api/positions.
// Quality/Growth/Value/Momentum computable today; Low vol deferred (needs 60d
// of per-ticker vol). Factors with all-null inputs render as "—".
async function bootstrapStyleTilts() {
  try {
    const [stockFactors, positions, vols] = await Promise.all([
      fetchJSON('/api/stock-factors').catch(() => []),
      fetchJSON('/api/positions').catch(() => []),
      fetchJSON('/api/returns-vol?days=60').catch(() => ({})),
    ]);
    if (!Array.isArray(positions) || positions.length === 0) return;

    const factorByTicker = Object.fromEntries((stockFactors || []).map(r => [r.ticker, r]));
    const totalWeight = positions.reduce((a, p) => a + (p.weight_pct || 0), 0);
    if (totalWeight <= 0) return;

    const clip = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

    function weightedAvg(extract) {
      let wSum = 0, vSum = 0;
      for (const p of positions) {
        const f = factorByTicker[p.ticker];
        if (!f) continue;
        const val = extract(f);
        if (val == null || !Number.isFinite(val)) continue;
        const w = (p.weight_pct || 0) / totalWeight;
        wSum += w;
        vSum += w * val;
      }
      return wSum > 0 ? vSum / wSum : null;
    }

    // Low vol: portfolio-weighted average daily-return stdev. Scale to tilt range.
    // Typical single-stock daily vol ≈ 0.015 (1.5%). Map 0.010 → +1, 0.030 → -1.
    let lowVolRaw = null;
    if (vols && typeof vols === 'object' && Object.keys(vols).length > 0) {
      let wSum = 0, vSum = 0;
      for (const p of positions) {
        const v = vols[p.ticker];
        if (v == null || !Number.isFinite(v)) continue;
        const w = (p.weight_pct || 0) / totalWeight;
        wSum += w;
        vSum += w * v;
      }
      if (wSum > 0) {
        const avgVol = vSum / wSum;            // e.g. 0.018
        lowVolRaw = (0.020 - avgVol) / 0.010;  // 0.010 → +1, 0.030 → -1
      }
    }

    const tilts = [
      { name: 'Quality',  raw: weightedAvg(f => f.piotroski_f != null ? (f.piotroski_f / 9 - 0.5) * 2 : null) },
      { name: 'Low vol',  raw: lowVolRaw },
      { name: 'Growth',   raw: weightedAvg(f => f.eps_rev_4w) },
      { name: 'Value',    raw: weightedAvg(f => f.rel_pe_sigma != null ? -f.rel_pe_sigma / 2 : null) },
      { name: 'Momentum', raw: weightedAvg(f => f.mom_12_1) },
    ];
    DATA.regime.styleTilts = tilts.map(t => ({
      name: t.name,
      score: t.raw == null ? null : Math.round(clip(t.raw) * 100) / 100,
    }));
    renderTilts();
  } catch (err) {
    console.warn('[style-tilts] bootstrap failed:', err);
  }
}

// Sprint 7 Phase B: compose DATA.decisionTrail for the ticker with the
// largest |current - target| weight gap (biggest rebalance candidate).
async function bootstrapDecisionTrail() {
  try {
    if (!Array.isArray(DATA.weights) || DATA.weights.length === 0) return;
    // Pick focus ticker: largest |current - target| gap (most needs trimming/adding)
    let focus = DATA.weights[0];
    let maxGap = 0;
    for (const w of DATA.weights) {
      const gap = Math.abs((w.current ?? 0) - (w.target ?? 4));
      if (gap > maxGap) { maxGap = gap; focus = w; }
    }
    const reverseBucket = Object.fromEntries(
      Object.entries(SECTOR_DISPLAY).map(([b, d]) => [d, b])
    );
    const backendBucket = reverseBucket[focus.sector] || focus.sector;

    const [macro, sectorFactors, stockFactors] = await Promise.all([
      fetchJSON(`/api/daily-macro/${todayISO()}`).catch(() => null),
      fetchJSON(`/api/sector-factors?sector=${encodeURIComponent(backendBucket)}`).catch(() => []),
      fetchJSON(`/api/stock-factors?ticker=${encodeURIComponent(focus.ticker)}`).catch(() => ({})),
    ]);

    const steps = [];

    // Regime step
    let regimeText = 'Regime data unavailable.';
    if (macro?.summary) {
      try {
        const s = typeof macro.summary === 'string' ? JSON.parse(macro.summary) : macro.summary;
        const regime = s.trend?.regime?.replace(/_/g, ' ') || 'unknown';
        const action = s.recommendation?.action?.replace(/_/g, ' ') || 'hold';
        regimeText = `Regime: <strong>${escapeHTML(regime)}</strong>. Book action: <strong>${escapeHTML(action)}</strong>.`;
      } catch {}
    }
    steps.push({ kind: 'Regime', text: regimeText });

    // Sector step
    let sectorText = `${focus.sector} sector data unavailable.`;
    const sec = Array.isArray(sectorFactors) ? sectorFactors[0] : sectorFactors;
    if (sec?.stance) {
      const stanceUpper = String(sec.stance).toUpperCase();
      const rsStr = sec.rs_ratio != null ? ` RS-ratio ${sec.rs_ratio.toFixed(1)},` : '';
      const scoreStr = sec.stance_score != null ? ` stance score ${sec.stance_score.toFixed(2)}` : '';
      sectorText = `${focus.sector}:${rsStr}${scoreStr} → <strong>${escapeHTML(stanceUpper)}</strong>.`;
    }
    steps.push({ kind: 'Sector', text: sectorText });

    // Stock step — pick top 2 non-null factors
    let stockText = `${focus.ticker} factor data unavailable.`;
    const sf = Array.isArray(stockFactors) ? stockFactors[0] : stockFactors;
    if (sf) {
      const highlights = [];
      if (sf.mom_12_1 != null) highlights.push(`12-1 Mom ${(sf.mom_12_1 * 100).toFixed(1)}%`);
      if (sf.sue != null) highlights.push(`SUE ${sf.sue.toFixed(1)}σ`);
      if (sf.rs_vs_sector_3m != null) highlights.push(`3m RS ${(sf.rs_vs_sector_3m * 100).toFixed(1)}%`);
      if (sf.eps_rev_4w != null) highlights.push(`EPS rev ${(sf.eps_rev_4w * 100).toFixed(1)}%`);
      const top = highlights.slice(0, 2).join(', ');
      stockText = top
        ? `${focus.ticker} factors: ${top}.`
        : `${focus.ticker} factors still accumulating.`;
    }
    steps.push({ kind: 'Stock', text: stockText });

    // Size step — rebalance recommendation
    const delta = (focus.target ?? 4) - (focus.current ?? 0);
    const action = delta > 0.5 ? `ADD <strong>${delta.toFixed(1)}%</strong>` :
                   delta < -0.5 ? `TRIM <strong>${Math.abs(delta).toFixed(1)}%</strong>` :
                   'AT TARGET';
    const sizeText = `Current ${(focus.current ?? 0).toFixed(1)}%, target ${(focus.target ?? 4).toFixed(1)}% → ${action}.`;
    steps.push({ kind: 'Size', text: sizeText });

    DATA.decisionTrail = {
      ticker: focus.ticker,
      weight: focus.target ?? 4,
      steps,
    };
    renderDecisionTrail();
  } catch (err) {
    console.warn('[decision-trail] bootstrap failed:', err);
  }
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

// Sprint 7 Phase B: closed-trades panel (Layer 5 bottom).
async function bootstrapClosedTrades() {
  try {
    const rows = await fetchJSON('/api/trades/closed?limit=10');
    if (Array.isArray(rows)) {
      DATA.recentTrades = rows.map(r => ({
        action: r.action,
        ticker: r.ticker,
        note: r.note,
        pnl: r.pnl,
      }));
      renderTrades();
      // Empty state: render an explicit placeholder so the panel isn't silently blank.
      if (rows.length === 0) {
        const host = document.getElementById('tradesList');
        if (host) host.innerHTML =
          '<div class="trades-empty" style="padding:16px;color:var(--text-3);font-size:12px;">No closed trades yet — panel populates as sells are logged.</div>';
      }
    }
  } catch (err) {
    console.warn('[closed-trades] bootstrap failed:', err);
  }
}

// Sprint 7: Layer 4 — wire KPI strip + weight chart from /api/nav + /api/positions.
// Decision trail stays stubbed; full wiring in S7.12.
async function bootstrapLayer4() {
  try {
    const [navRows, positions, targets, stockFactors] = await Promise.all([
      fetchJSON('/api/nav?limit=30').catch(() => []),
      fetchJSON('/api/positions').catch(() => []),
      fetchJSON('/api/portfolio-targets').catch(() => ({})),
      fetchJSON('/api/stock-factors').catch(() => []),
    ]);

    // Build ticker → display sector from stock-factors
    const sectorByTicker = {};
    for (const r of (stockFactors || [])) {
      const disp = SECTOR_DISPLAY[r.sector] || r.sector || 'Other';
      sectorByTicker[r.ticker] = disp;
    }

    if (Array.isArray(navRows) && navRows.length > 0) {
      const cur = navRows[navRows.length - 1];
      const netExpPct = cur.net_value > 0 ? (cur.gross_long - cur.gross_short) / cur.net_value * 100 : 0;
      const grossExpPct = cur.net_value > 0 ? (cur.gross_long + cur.gross_short) / cur.net_value * 100 : 0;
      const cashPct = cur.net_value > 0 ? cur.cash / cur.net_value * 100 : 0;
      const dayPnl = cur.day_pnl_pct;
      DATA.kpis = [
        { label: 'Net Exposure',   value: `${netExpPct.toFixed(1)}%`,   delta: '',              cls: '' },
        { label: 'Gross Exposure', value: `${grossExpPct.toFixed(1)}%`, delta: '',              cls: '' },
        { label: 'Positions',      value: String(cur.positions_count),  delta: '',              cls: '' },
        { label: 'Cash %',         value: `${cashPct.toFixed(1)}%`,     delta: '',              cls: '' },
        { label: '1d P&L',         value: dayPnl != null ? `${dayPnl > 0 ? '+' : ''}${dayPnl.toFixed(2)}%` : '—',
                                   delta: cur.day_pnl_usd != null ? `$${Math.abs(cur.day_pnl_usd).toFixed(0)}` : '',
                                   cls: dayPnl != null ? (dayPnl > 0 ? 'up' : dayPnl < 0 ? 'down' : '') : '' },
        { label: 'NAV',            value: `$${(cur.net_value / 1_000_000).toFixed(2)}M`, delta: '', cls: '' },
      ];
      renderKPIs();
    }

    if (Array.isArray(positions) && positions.length > 0) {
      DATA.weights = positions.map(p => ({
        ticker: p.ticker,
        sector: sectorByTicker[p.ticker] || 'Other',
        current: p.weight_pct ?? 0,
        target: targets?.[p.ticker]?.target_pct ?? 4.0,
      }));
      renderWeightChart();
    }

    // Chain: decision trail depends on DATA.weights being populated.
    bootstrapDecisionTrail();
    // Layer 5 closed trades can run in parallel.
    bootstrapClosedTrades();
    // Sprint 8: Layer 1 style tilts (needs positions + stock factors).
    bootstrapStyleTilts();
    // Sprint 8: Layer 5 attribution + calibration panels.
    bootstrapLayer5();
  } catch (err) {
    console.warn('[L4] bootstrap failed:', err);
  }
}

// Layer 1 (partial): replace the 4 hardcoded signal chips with real indicator
// values from /api/indicator-history. Gauge + style-tilts stay stubbed until
// a trade ledger exists.
async function bootstrapRegimeSignals() {
  // Sprint 7: also hydrate the net-exposure gauge from /api/nav.
  try {
    const navRows = await fetchJSON('/api/nav?limit=1').catch(() => []);
    if (Array.isArray(navRows) && navRows.length > 0) {
      const cur = navRows[navRows.length - 1];
      if (cur.net_value > 0) {
        const netExp = (cur.gross_long - cur.gross_short) / cur.net_value * 100;
        DATA.regime.netExposure = Math.max(0, Math.min(100, Math.round(netExp)));
        renderGauge();
      }
    }
  } catch { /* non-fatal */ }

  // Sprint 8: replace the hardcoded Layer 1 verdict + lede with text derived
  // from /api/daily-macro. Keeps the stub as fallback on any error.
  try {
    const today = todayISO();
    const macro = await fetchJSON(`/api/daily-macro/${today}`).catch(() => null);
    const summary = macro?.summary;
    const s = typeof summary === 'string' ? JSON.parse(summary) : summary;
    if (s?.trend?.regime) {
      const humanRegime = String(s.trend.regime).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const headline = s.recommendation?.headline || '';
      const verdictEl = document.querySelector('#layer1 .layer-verdict');
      if (verdictEl) {
        verdictEl.innerHTML = headline
          ? `${escapeHTML(humanRegime)} — <span class="sub">${escapeHTML(headline)}</span>`
          : escapeHTML(humanRegime);
      }

      const driver = s.trend?.drivers?.[0]?.text || '';
      const narrative = s.trend?.narrative?.[0]?.text || '';
      const action = s.recommendation?.action?.replace(/_/g, ' ') || '';
      const confidence = typeof s.confidence === 'number'
        ? ` Confidence ${(s.confidence * 100).toFixed(0)}%.`
        : '';
      const ledeParts = [];
      if (driver) ledeParts.push(escapeHTML(driver));
      if (narrative) ledeParts.push(escapeHTML(narrative));
      if (action) ledeParts.push(`Book stance: <strong>${escapeHTML(action)}</strong>.${confidence}`);
      const ledeEl = document.querySelector('#layer1 .layer-lede');
      if (ledeEl && ledeParts.length > 0) {
        ledeEl.innerHTML = ledeParts.join(' ');
      }
    }
  } catch { /* non-fatal */ }

  // Sprint 1: overlay the regime narrative lede on top of the daily-macro
  // lede. When the narrator has written a fresh lede, it takes priority.
  // Same row also feeds the Macro tab hero lede — single source, no drift.
  try {
    const n = await fetchRegimeNarrative();
    if (n?.lede) {
      const layer1Lede = document.querySelector('#layer1 .layer-lede');
      if (layer1Lede) layer1Lede.innerHTML = escapeHTML(n.lede);
      const macroHeroLede = document.querySelector('.macro-big-lede');
      if (macroHeroLede) macroHeroLede.innerHTML = escapeHTML(n.lede);
    }
  } catch { /* non-fatal */ }

  // Sprint 2: overlay the sector-landscape comparative lede on Layer 2's
  // `.layer-lede` when narrative data is available. Kept alongside the regime
  // overlay so both refresh on the same bootstrap pass.
  try {
    const sl = await fetchSectorLandscapeNarrative();
    if (sl?.lede) {
      const layer2Lede = document.querySelector('#layer2 .layer-lede');
      if (layer2Lede) layer2Lede.innerHTML = escapeHTML(sl.lede);
    }
  } catch { /* non-fatal */ }

  // Sprint 4: overlay the stock-landscape comparative lede + top-pick verdict
  // on Layer 3. Verdict cites the top-score ticker from numeric_snapshot.
  try {
    const stl = await fetchStockLandscapeNarrative();
    if (stl?.lede) {
      const layer3Lede = document.querySelector('#layer3 .layer-lede');
      if (layer3Lede) layer3Lede.innerHTML = escapeHTML(stl.lede);
      const snap = stl.currentReading?.numeric_snapshot_at_write || {};
      const scores = snap.scores || {};
      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      const top = sorted[0];
      if (top) {
        const verdictEl = document.querySelector('#layer3 .layer-verdict');
        if (verdictEl) {
          verdictEl.innerHTML = `${sorted.length} names shortlisted — top pick <span class="sub pos">${escapeHTML(top[0])}</span> (score ${top[1].toFixed(2)})`;
        }
      }
    }
  } catch { /* non-fatal */ }

  try {
    const rows = await fetchJSON('/api/indicator-history');
    if (!Array.isArray(rows) || rows.length === 0) return;
    const byCode = Object.fromEntries(rows.map(r => [r.indicator_code, r]));

    // For rates + inflation: rising = hawkish/bearish for equities, falling = dovish/bullish.
    const signalFromRates = (code, label, unitFmt) => {
      const r = byCode[code];
      if (!r || r.value == null) return null;
      const delta = r.prior != null ? r.value - r.prior : 0;
      const pctChange = r.prior ? Math.abs(delta / r.prior) : 0;
      let trend = 'neutral';
      if (pctChange >= 0.005) trend = delta > 0 ? 'bearish' : 'bullish';
      return { label, value: unitFmt(r.value), trend, ref: `indicator:${label}` };
    };

    const pct = v => `${v.toFixed(2)}%`;
    const signals = [
      signalFromRates('DGS10', '10Y Yield', pct),
      signalFromRates('DGS2',  '2Y Yield',  pct),
      signalFromRates('CPI_CORE', 'Core CPI', v => v.toFixed(1)),
      signalFromRates('FEDFUNDS', 'Fed Funds', pct),
    ].filter(Boolean);

    const regimeHost = document.getElementById('regimeSignals');
    if (signals.length > 0) {
      DATA.regime.signals = signals;
      renderRegimeSignals();
      if (regimeHost) setDataUnavailable(regimeHost, { clear: true });
    } else if (regimeHost) {
      setDataUnavailable(regimeHost, { label: 'no indicator data in D1' });
    }
  } catch (err) {
    console.warn('[regime] signals bootstrap failed:', err);
    const regimeHost = document.getElementById('regimeSignals');
    if (regimeHost) setDataUnavailable(regimeHost, { label: 'indicator fetch failed' });
  }
}

// PM tab: replace hardcoded DATA.positions + DATA.navCurve with live data
// from /api/positions (POSITION_01_Daily) and /api/nav (NAV_01_Daily).
// SPY benchmark line on the NAV chart pulls from /api/ticker-history/SPY.
async function bootstrapPMTab() {
  try {
    const [positions, navRows, stockFactors, spyHistory] = await Promise.all([
      fetchJSON('/api/positions').catch(() => []),
      fetchJSON('/api/nav?limit=180').catch(() => []),
      fetchJSON('/api/stock-factors').catch(() => []),
      fetchJSON('/api/ticker-history/SPY?range=180').catch(() => null),
    ]);

    const sectorByTicker = {};
    for (const r of (stockFactors || [])) {
      sectorByTicker[r.ticker] = SECTOR_DISPLAY[r.sector] || r.sector || 'Other';
    }

    const pmTableHost = document.getElementById('pmTable')?.parentElement;
    const pmNavHost = document.getElementById('pmNavSvg')?.parentElement;
    if (!Array.isArray(positions) || positions.length === 0) {
      if (pmTableHost) setDataUnavailable(pmTableHost, { label: 'no positions in D1' });
    } else if (pmTableHost) {
      setDataUnavailable(pmTableHost, { clear: true });
    }
    if (!Array.isArray(navRows) || navRows.length === 0) {
      if (pmNavHost) setDataUnavailable(pmNavHost, { label: 'no NAV history in D1' });
    } else if (pmNavHost) {
      setDataUnavailable(pmNavHost, { clear: true });
    }

    if (Array.isArray(positions) && positions.length > 0) {
      DATA.positions = positions.map(p => {
        const cost = Number(p.avg_cost) || 0;
        const qty = Number(p.qty) || 0;
        const baseCost = qty * cost;
        const unrlzUsd = Number(p.unrlz_pnl_usd) || 0;
        const unrlzPct = baseCost > 0 ? (unrlzUsd / baseCost) * 100 : 0;
        return {
          ticker: p.ticker,
          sector: sectorByTicker[p.ticker] || 'Other',
          qty,
          cost,
          price: Number(p.market_price) || 0,
          weight: Number(p.weight_pct) || 0,
          unrlzPnl: unrlzPct,
          dayPnl: Number(p.day_pnl_pct) || 0,
          daysHeld: 0, // POSITION_01_Daily doesn't track holding period; could derive from TRADE_01_Ledger
        };
      });
      renderPMTable();
    }

    if (Array.isArray(navRows) && navRows.length > 0) {
      const spyMap = {};
      const spyData = spyHistory?.prices || [];
      for (const s of spyData) spyMap[s.date] = Number(s.close) || 0;
      DATA.navCurve = navRows
        .map(n => ({
          date: n.date,
          nav: Number(n.net_value) || 0,
          spy: spyMap[n.date] || 0,
        }))
        .filter(d => d.nav > 0);
      // No SPY overlap → flatline the dashed benchmark on NAV so the chart still draws.
      if (DATA.navCurve.length > 0 && !DATA.navCurve.some(d => d.spy > 0)) {
        DATA.navCurve = DATA.navCurve.map(d => ({ ...d, spy: d.nav }));
      }
      if (DATA.navCurve.length > 0) renderPMNav();
    }
  } catch (err) {
    console.warn('[PM] bootstrap failed:', err);
  }
}

// News tab: replace hardcoded DATA.news + DATA.topDrivers with live data
// from /api/news-digest/{today} (BETA_12_News_digest) and /api/movers
// (MOVER_EXPLANATIONS_daily). Both endpoints fall back to latest available
// date server-side, so this works even on weekends/holidays.
async function bootstrapNewsTab() {
  const today = todayISO();
  try {
    const [digest, movers] = await Promise.all([
      fetchJSON(`/api/news-digest/${today}`).catch(() => null),
      fetchJSON('/api/movers').catch(() => []),
    ]);

    const newsHost = document.getElementById('newsStream')?.parentElement;
    const moversHost = document.getElementById('topDrivers')?.parentElement;
    if (!digest) {
      if (newsHost) setDataUnavailable(newsHost, { label: 'no news digest in D1' });
    } else if (newsHost) {
      setDataUnavailable(newsHost, { clear: true });
    }
    if (!Array.isArray(movers) || movers.length === 0) {
      if (moversHost) setDataUnavailable(moversHost, { label: 'no movers in D1' });
    } else if (moversHost) {
      setDataUnavailable(moversHost, { clear: true });
    }

    if (digest) {
      const sentMap = (s) => s === 'bullish' ? 'pos' : s === 'bearish' ? 'neg' : 'neu';
      const items = [];
      for (const h of (digest.macro_headlines || [])) {
        const mag = Number(h.magnitude) || 0;
        items.push({
          title: h.title || '',
          src: h.source || 'news',
          date: digest.date || '',
          tickers: [],
          sent: sentMap(h.sentiment),
          score: mag,
          mat: Math.max(1, Math.round(Math.abs(mag) * 10)),
        });
      }
      for (const [ticker, rows] of Object.entries(digest.ticker_headlines || {})) {
        for (const h of (rows || [])) {
          const mag = Number(h.magnitude) || 0;
          items.push({
            title: h.title || '',
            src: h.source || 'news',
            date: digest.date || '',
            tickers: [ticker],
            sent: sentMap(h.sentiment),
            score: mag,
            mat: Math.max(1, Math.round(Math.abs(mag) * 10)),
          });
        }
      }
      items.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
      if (items.length > 0) {
        DATA.news = items.slice(0, 12);
        renderNewsStream();
      }
    }

    if (Array.isArray(movers) && movers.length > 0) {
      const sorted = [...movers].sort((a, b) => Math.abs(Number(b.move_pct) || 0) - Math.abs(Number(a.move_pct) || 0));
      DATA.topDrivers = sorted.slice(0, 5).map(m => {
        const pct = Number(m.move_pct) || 0;
        return {
          ticker: m.ticker,
          move: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
          reason: m.thesis || m.headline || '—',
        };
      });
      renderTopDrivers();
    }
  } catch (err) {
    console.warn('[news] bootstrap failed:', err);
  }
}

// Regime detail 12-indicator board: hydrate DATA.macroIndicators from
// /api/indicator-history (MACRO_STATE_indicators, written daily by the
// macro-state-fetcher worker). Codes that the worker doesn't cover yet
// (curve is derived from DGS10-DGS2; GDP/HY/oil/etc. simply omitted)
// fall through and the board only shows what's actually fresh.
async function bootstrapMacroIndicators() {
  try {
    const rows = await fetchJSON('/api/indicator-history').catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return;
    const byCode = {};
    for (const r of rows) byCode[r.indicator_code] = r;

    const pct = (v) => `${v.toFixed(2)}%`;
    const bps = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}bps`;
    const idx = (v) => v.toFixed(1);
    const idxDelta = (d) => `${d > 0 ? '+' : ''}${d.toFixed(2)}`;
    const k = (v) => `${v.toFixed(0)}k`;
    const kDelta = (d) => `${d > 0 ? '+' : ''}${d.toFixed(0)}k`;
    const trendOf = (delta, prior, threshold = 0.005) => {
      if (delta === 0 || prior == null) return 'flat';
      const rel = prior !== 0 ? Math.abs(delta / prior) : Math.abs(delta);
      if (rel < threshold) return 'flat';
      return delta > 0 ? 'up' : 'down';
    };

    const fmt = (label, code, valFmt, deltaFmt, threshold) => {
      const r = byCode[code];
      if (!r) return null;
      const val = Number(r.value);
      const prior = r.prior != null ? Number(r.prior) : null;
      const delta = prior != null ? val - prior : 0;
      return {
        label,
        val: valFmt(val),
        chg: prior != null ? deltaFmt(delta) : '—',
        trend: trendOf(delta, prior, threshold),
        spark: [],
      };
    };

    const board = [];
    const pushIf = (e) => e && board.push(e);

    pushIf(fmt('10Y Yield',    'DGS10',    pct, bps));
    pushIf(fmt('2Y Yield',     'DGS2',     pct, bps));
    // Derived: curve spread (2s10s) in bps.
    if (byCode.DGS10 && byCode.DGS2) {
      const curve = (Number(byCode.DGS10.value) - Number(byCode.DGS2.value)) * 100;
      const hasPrior = byCode.DGS10.prior != null && byCode.DGS2.prior != null;
      const priorCurve = hasPrior
        ? (Number(byCode.DGS10.prior) - Number(byCode.DGS2.prior)) * 100
        : null;
      const delta = priorCurve != null ? curve - priorCurve : 0;
      board.push({
        label: 'Curve (2s10s)',
        val: `${curve >= 0 ? '+' : ''}${curve.toFixed(0)}bps`,
        chg: priorCurve != null ? `${delta > 0 ? '+' : ''}${delta.toFixed(0)}bps` : '—',
        trend: Math.abs(delta) < 1 ? 'flat' : delta > 0 ? 'up' : 'down',
        spark: [],
      });
    }
    pushIf(fmt('Core CPI',     'CPI_CORE', idx, idxDelta, 0.001));
    pushIf(fmt('CPI Headline', 'CPI_HEADLINE', idx, idxDelta, 0.001));
    pushIf(fmt('Fed Funds',    'FEDFUNDS', pct, bps));
    pushIf(fmt('NFP',          'NFP',      k,   kDelta));
    pushIf(fmt('Unemployment', 'UNEMP',    pct, bps));

    if (board.length > 0) {
      DATA.macroIndicators = board;
      // Only re-render if the regime detail view (where the board lives) is
      // currently mounted. Otherwise the next openEntity() will pick it up.
      if (document.getElementById('macroIndicators')) {
        renderMacroIndicators();
      }
    }
  } catch (err) {
    console.warn('[macroIndicators] bootstrap failed:', err);
  }
}

// Calendar tab: rolling 6-week grid (~14 days back, ~28 days forward).
// Sources: /api/earnings-calendar (Finnhub via portfolio-ingestor),
// /api/fomc-calendar (hardcoded schedule), /api/calendar (MACRO_STATE_calendar
// — CPI/NFP/PMI/etc., populated by economic-calendar-fetcher worker).
const CAL_DAYS_BACK = 14;
const CAL_DAYS_FORWARD = 28;

function calendarRangeISO() {
  const today = new Date();
  const from = new Date(today.getTime() - CAL_DAYS_BACK * 86400000);
  const to = new Date(today.getTime() + CAL_DAYS_FORWARD * 86400000);
  return {
    fromISO: from.toISOString().slice(0, 10),
    toISO:   to.toISOString().slice(0, 10),
  };
}

async function bootstrapCalendar() {
  const { fromISO, toISO } = calendarRangeISO();
  const events = [];
  try {
    const [earn, fomc, macro] = await Promise.all([
      fetchJSON('/api/earnings-calendar').catch(() => null),
      fetchJSON('/api/fomc-calendar').catch(() => null),
      fetchJSON(`/api/calendar?from=${fromISO}&to=${toISO}`).catch(() => []),
    ]);

    // Earnings: shape {TICKER: {nextEarnings, type, lastFiling}}
    if (earn && typeof earn === 'object') {
      for (const [ticker, info] of Object.entries(earn)) {
        if (ticker === 'source' || !info?.nextEarnings) continue;
        events.push({
          date: info.nextEarnings,
          type: 'earn',
          title: `${ticker} earnings`,
          sub: info.type || '',
          impact: 'medium',
        });
      }
    }

    // FOMC: shape {nextFOMC, upcoming: [{date, type}]}
    for (const f of (fomc?.upcoming || [])) {
      if (!f?.date) continue;
      events.push({
        date: f.date,
        type: 'fomc',
        title: `FOMC ${f.type || 'Meeting'}`,
        sub: '',
        impact: 'high',
      });
    }

    // Macro: shape [{event_date, event_code, event_label, impact}]
    for (const m of (Array.isArray(macro) ? macro : [])) {
      if (!m?.event_date) continue;
      events.push({
        date: m.event_date,
        type: 'macro',
        title: m.event_code || 'Macro',
        sub: m.event_label || '',
        impact: m.impact || 'medium',
      });
    }
  } catch (err) {
    console.warn('[calendar] bootstrap failed:', err);
  }
  // Filter to range, dedupe (FOMC may appear in both /fomc-calendar and /calendar via "FOMC" code)
  const inRange = events.filter(e => e.date >= fromISO && e.date <= toISO);
  const seen = new Set();
  DATA.calendarEvents = inRange.filter(e => {
    const k = `${e.date}|${e.type}|${e.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  renderCalendar();
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  const events = DATA.calendarEvents || [];
  const eventsByDate = {};
  for (const e of events) (eventsByDate[e.date] ||= []).push(e);

  const today = new Date();
  const todayISOStr = today.toISOString().slice(0, 10);
  const start = new Date(today.getTime() - CAL_DAYS_BACK * 86400000);
  // Snap grid start to the Monday of that week. JS getDay(): Sun=0, Mon=1, ..., Sat=6.
  const dow = start.getDay();
  const offsetToMonday = dow === 0 ? -6 : 1 - dow; // Sun → -6, Mon → 0, Tue → -1, ...
  const gridStart = new Date(start.getTime() + offsetToMonday * 86400000);

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const dayNum = d.getDate();
    const month = d.toLocaleString('en-US', { month: 'short' });
    const isToday = iso === todayISOStr;
    const isPast = iso < todayISOStr;
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isMonthStart = dayNum === 1 || i === 0;

    const dayEvents = (eventsByDate[iso] || [])
      .sort((a, b) => (a.impact === 'high' ? -1 : 1) - (b.impact === 'high' ? -1 : 1));

    const eventsHTML = dayEvents.slice(0, 4).map(e => {
      const cls = `calendar-event ${e.type}${e.impact === 'high' ? ' high' : ''}`;
      const label = e.title;
      const titleAttr = e.sub ? `${escapeHTML(e.title)} — ${escapeHTML(e.sub)}` : escapeHTML(e.title);
      return `<div class="${cls}" title="${titleAttr}">${escapeHTML(label)}</div>`;
    }).join('');
    const overflow = dayEvents.length > 4 ? `<div class="calendar-event" style="border-left-color:var(--text-3);color:var(--text-3);">+${dayEvents.length - 4} more</div>` : '';

    const classes = ['calendar-day'];
    if (isPast) classes.push('past');
    if (isToday) classes.push('today');
    if (isWeekend) classes.push('weekend');

    const numLabel = isMonthStart
      ? `<span class="calendar-day-num month-start">${month} ${dayNum}</span>`
      : `<span class="calendar-day-num">${dayNum}</span>`;
    const todayPill = isToday ? '<span class="today-pill">today</span>' : '';

    cells.push(`<div class="${classes.join(' ')}">
      <div>${numLabel}${todayPill}</div>
      ${eventsHTML}${overflow}
    </div>`);
  }
  grid.innerHTML = cells.join('');
}

// Entrypoint: loads API data and replaces Layer 2 + Layer 3 stubs in place,
// then re-renders those widgets. Graceful fallback to stubs on any fetch fail.
async function bootstrapPortfolioTab() {
  try {
    const [sectorFactors, stockFactors] = await Promise.all([
      fetchJSON('/api/sector-factors').catch(() => null),
      fetchJSON('/api/stock-factors').catch(() => null),
    ]);
    let sectorDataAvailable = false;
    let stockDataAvailable = false;
    if (Array.isArray(sectorFactors) && sectorFactors.length > 0) {
      DATA.sectors = transformSectors(sectorFactors, null);
      DATA.rrgPoints = transformRRG(sectorFactors);
      sectorDataAvailable = true;
    }
    if (Array.isArray(stockFactors) && stockFactors.length > 0) {
      DATA.stockShortlist = transformStockShortlist(stockFactors);
      stockDataAvailable = true;
    }
    if (!sectorDataAvailable || !stockDataAvailable) {
      showPortfolioError(`sector=${sectorDataAvailable} stock=${stockDataAvailable}`);
    }
    // Re-render Layer 2 + Layer 3 with fresh data
    renderSectorTable();
    renderRRG();
    renderAllocBar();
    renderStockGroups();
    renderScatter();
  } catch (e) {
    console.error('[bootstrap] portfolio tab failed:', e);
    showPortfolioError(e.message);
  }
}

/* NAV curve */
DATA.navCurve = (() => {
  const arr = []; let v = 1000000, sp = 4800;
  for (let i = 0; i < 126; i++) {
    v *= 1 + (Math.random() - 0.46) * 0.018;
    sp *= 1 + (Math.random() - 0.48) * 0.012;
    arr.push({ i, nav: v, spy: sp });
  }
  return arr;
})();

/* Release summaries — FOMC / CPI / NFP / GDP. Still consumed by the regime
   entity view's `indicatorReleaseSection` until that's wired to a real source. */
DATA.releases = [
  {
    id: 'fomc-mar',
    type: 'FOMC Minutes',
    date: '2026-04-10',
    daysAgo: 8,
    lede: 'March FOMC minutes confirmed a <span class="hi-neu">patient</span> stance: committee sees no urgency to cut while inflation runs above 3%, but a majority pencils in <strong>1–2 cuts by year-end</strong>. Tone was incrementally dovish on labor-market softening; hawkish on services inflation.',
    bullets: [
      '<strong>Rate path:</strong> 7 of 12 members see the first cut in Q3; 3 see Q4; 2 see no cut in 2026.',
      '<strong>Inflation read:</strong> "Greater confidence" in disinflation needed before cutting — shelter and services the sticky components.',
      '<strong>Labor market:</strong> Characterized as "moderately tight but cooling" — wage growth decelerating for 5 consecutive months.',
      '<strong>Balance sheet:</strong> QT taper unchanged; runoff cap stays at $25B/mo Treasuries, $35B/mo MBS.',
      '<strong>Risks flagged:</strong> Commercial real-estate stress (regional banks), geopolitical oil shocks, consumer-credit delinquency uptick.'
    ]
  },
  {
    id: 'cpi-mar',
    type: 'CPI (March)',
    date: '2026-04-15',
    daysAgo: 3,
    lede: 'Core CPI printed <strong>3.2% YoY</strong> (in-line) and <strong>0.3% MoM</strong> (in-line). Headline disinflation continues slowly; <span class="hi-neu">shelter remains the sticky component</span> at 4.8% YoY. Market-implied Fed path unchanged — still one cut by July.',
    bullets: [
      '<strong>Headline CPI:</strong> 3.4% YoY vs 3.4% est · 0.2% MoM vs 0.3% est.',
      '<strong>Core CPI:</strong> 3.2% YoY · unchanged from Feb. 6-month annualized core running at 3.0%.',
      '<strong>Shelter:</strong> 4.8% YoY — still 180bps above pre-COVID average; rent-of-primary-residence decelerating.',
      '<strong>Services ex-housing (supercore):</strong> 4.1% YoY · the Fed\'s preferred read · essentially flat 6 months running.',
      '<strong>Goods deflation:</strong> Core goods −0.4% YoY for 4th straight month — offsetting services stickiness.'
    ]
  },
  {
    id: 'nfp-mar',
    type: 'NFP (March)',
    date: '2026-04-05',
    daysAgo: 13,
    lede: 'March payrolls came in at <strong>+218k</strong> vs +190k est — a <span class="hi-pos">modest beat</span>. Unemployment ticked up to <strong>3.9%</strong> on labor-force expansion. Wage growth continues to cool at <strong>3.8% YoY</strong>. Net read: economy resilient but not re-accelerating — consistent with late-cycle soft-landing path.',
    bullets: [
      '<strong>Payrolls:</strong> +218k vs +190k est · prior month revised −15k to +260k.',
      '<strong>Unemployment:</strong> 3.9% (up from 3.8%) · labor-force participation +0.1% to 62.7%.',
      '<strong>Wages:</strong> AHE +0.3% MoM, 3.8% YoY · cooling trend intact (peak was 5.9% in 2022).',
      '<strong>Hours worked:</strong> 34.3 (flat) — no canary of demand weakening.',
      '<strong>Sector mix:</strong> Health +72k (still the engine), Government +41k, Leisure +35k, Manufacturing −8k.'
    ]
  },
  {
    id: 'unh-q1',
    type: 'UNH Q1 Earnings',
    date: '2026-04-17',
    daysAgo: 0,
    lede: 'UnitedHealth <span class="hi-pos">beat</span> Q1 at $6.91 vs $6.76 est and <strong>raised FY guidance</strong>. Medical Cost Ratio came in at <strong>83.2%</strong> — 70bp inside expectations — suggesting the MCR cycle is bottoming. This materially strengthens the Healthcare-OW / UNH-top-pick thesis that drives Layer 2 + Layer 3.',
    bullets: [
      '<strong>EPS:</strong> $6.91 · beat by 2.2% · 4th consecutive beat.',
      '<strong>Revenue:</strong> $99.8B vs $99.3B est · +8.4% YoY.',
      '<strong>Medical Cost Ratio:</strong> 83.2% vs 83.9% est · improvement visible for 2nd straight quarter — thesis confirmation.',
      '<strong>Optum Health:</strong> Revenue +12% · membership +3.1M YoY · margin expansion of 40bp.',
      '<strong>Guidance:</strong> FY EPS raised to $27.90–$28.20 from $27.50–$28.00 · reflects MCR normalization plus Optum leverage.'
    ]
  }
];

/* ============================================================
   ENTITY PROFILES — Bloomberg DES/FA style
   Full-screen pages for stocks / sectors / indicators
   ============================================================ */
const ENTITIES = {};

/* ---------- STOCK ENTITIES ----------
 * Sprint 9: all 25 profiles are skeletons. At entity-open time,
 * openEntity(kind='stock') fetches:
 *   - narrative (lede + long/tactical blocks + numeric snapshot)  →  thesis / business / snapshot
 *   - /api/stock-profile (FUND_01/02, ALPHA_01, STOCK_FACTORS, BETA_12)  →  epsHistory / filings / peers / catalysts / news
 * No hand-curated mock data anywhere. Missing sections render empty-state.
 */
ENTITIES['stock:UNH']   = _makeStockSkeleton('UNH',   'UnitedHealth Group',                'Healthcare');
ENTITIES['stock:LLY']   = _makeStockSkeleton('LLY',   'Eli Lilly and Company',             'Healthcare');
ENTITIES['stock:NVDA']  = _makeStockSkeleton('NVDA',  'NVIDIA Corporation',                'Technology');
ENTITIES['stock:MSFT']  = _makeStockSkeleton('MSFT',  'Microsoft Corporation',             'Technology');
ENTITIES['stock:KO']    = _makeStockSkeleton('KO',    'The Coca-Cola Company',             'Staples');

function _makeStockSkeleton(ticker, name, sector) {
  return {
    kind: 'stock',
    ticker,
    name,
    snap: { price: 'n/a', chg: 'n/a', chgCls: '', position: 'Narrative loading' },
    upLevel: { label: `Why ${ticker}: ${sector} sector (Layer 2)`, key: `sector:${sector}` },
    thesis: `${ticker} narrative loading…`,
    business: `${name} — company profile pending D1 wiring.`,
    snapshot: [],
    financials: { revenue: [], margin: [], eps: [], fcf: [] },
    epsHistory: [],
    filings: [],
    peers: { headers: [], rows: [] },
    catalysts: [],
    risks: [],
    news: []
  };
}

ENTITIES['stock:AAPL']  = _makeStockSkeleton('AAPL',  'Apple Inc.',                        'Technology');
ENTITIES['stock:GOOGL'] = _makeStockSkeleton('GOOGL', 'Alphabet Inc.',                     'Communication');
ENTITIES['stock:AMZN']  = _makeStockSkeleton('AMZN',  'Amazon.com Inc.',                   'ConsDisc');
ENTITIES['stock:META']  = _makeStockSkeleton('META',  'Meta Platforms Inc.',               'Communication');
ENTITIES['stock:TSLA']  = _makeStockSkeleton('TSLA',  'Tesla Inc.',                        'ConsDisc');
ENTITIES['stock:BRK.B'] = _makeStockSkeleton('BRK.B', 'Berkshire Hathaway Inc. (Class B)', 'Finance');
ENTITIES['stock:JPM']   = _makeStockSkeleton('JPM',   'JPMorgan Chase & Co.',              'Finance');
ENTITIES['stock:GS']    = _makeStockSkeleton('GS',    'Goldman Sachs Group Inc.',          'Finance');
ENTITIES['stock:BAC']   = _makeStockSkeleton('BAC',   'Bank of America Corp.',             'Finance');
ENTITIES['stock:MS']    = _makeStockSkeleton('MS',    'Morgan Stanley',                    'Finance');
ENTITIES['stock:XOM']   = _makeStockSkeleton('XOM',   'Exxon Mobil Corp.',                 'Energy');
ENTITIES['stock:CVX']   = _makeStockSkeleton('CVX',   'Chevron Corp.',                     'Energy');
ENTITIES['stock:JNJ']   = _makeStockSkeleton('JNJ',   'Johnson & Johnson',                 'Healthcare');
ENTITIES['stock:PG']    = _makeStockSkeleton('PG',    'Procter & Gamble Co.',              'Staples');
ENTITIES['stock:HD']    = _makeStockSkeleton('HD',    'The Home Depot Inc.',               'ConsDisc');
ENTITIES['stock:CAT']   = _makeStockSkeleton('CAT',   'Caterpillar Inc.',                  'Industrial');
ENTITIES['stock:BA']    = _makeStockSkeleton('BA',    'The Boeing Company',                'Industrial');
ENTITIES['stock:INTC']  = _makeStockSkeleton('INTC',  'Intel Corp.',                       'Technology');
ENTITIES['stock:AMD']   = _makeStockSkeleton('AMD',   'Advanced Micro Devices Inc.',       'Technology');
ENTITIES['stock:NFLX']  = _makeStockSkeleton('NFLX',  'Netflix Inc.',                      'Communication');

/* ---------- SECTOR ENTITIES ----------
 * Sprint 3: each sector profile is a skeleton. At entity-open time,
 * openEntity() fetches the per-sector narrative (entity_type='sector',
 * entity_id=<sector>) and overlays:
 *   - thesis    ← narrative lede
 *   - business  ← 3-block (current_reading + identification + recommendation)
 *   - snapshot  ← buildSectorSnapshot() from numeric_snapshot_at_write
 *   - drivers   ← killed (subsumed by identification bullets)
 *   - risks     ← killed (subsumed by recommendation signposts)
 * If narrative fetch fails, the fallback values below render as-is.
 * Other sections (composition, peers, news, catalysts) are follow-up work —
 * they'll move from static fallbacks to D1 when the per-sector data wiring
 * lands in a later sprint.
 */
ENTITIES['sector:Healthcare'] = {
  kind: 'sector',
  ticker: 'Healthcare',
  name: 'S&P 500 Healthcare',
  snap: { price: 'Sector weight', chg: 'Stance pending', chgCls: '', position: 'Narrative loading' },
  upLevel: { label: 'Why Healthcare: Late-cycle regime (Layer 1)', key: 'indicator:Regime' },
  thesis: 'Healthcare sector narrative loading…',
  business: '<strong>~13% of S&P 500 · defensive growth sector</strong>. Sub-industries: managed care (UNH, ELV, CI), pharma (JNJ, MRK, LLY), biotech (REGN, VRTX), medtech (TMO, MDL, ABT), tools (DHR, TMO), services (HCA, UNH/Optum).',
  snapshot: [],
  drivers: [],
  composition: [
    { ticker: 'UNH',  name: 'UnitedHealth',        weight: 5.0, delta: '+3.0', score: 0.78, ref: 'stock:UNH' },
    { ticker: 'LLY',  name: 'Eli Lilly',            weight: 4.0, delta: '+0.5', score: 0.62, ref: 'stock:LLY' },
    { ticker: 'ABBV', name: 'AbbVie',               weight: 3.5, delta: '+1.0', score: 0.54, ref: null },
    { ticker: 'TMO',  name: 'Thermo Fisher',        weight: 2.5, delta: '+0.5', score: 0.41, ref: null },
    { ticker: 'JNJ',  name: 'Johnson & Johnson',    weight: 0,   delta: '—',    score: 0.22, ref: null },
    { ticker: 'MRK',  name: 'Merck',                weight: 0,   delta: '—',    score: 0.18, ref: null }
  ],
  catalysts: [
    { date: '2026-04-28', tone: 'good', text: '<strong>LLY Q1 earnings</strong> — Mounjaro volumes tell.' },
    { date: '2026-05-08', tone: 'neu',  text: '<strong>ABBV Q1 earnings</strong> — Rinvoq trajectory.' },
    { date: '2026-05-15', tone: 'neu',  text: '<strong>CMS Medicare Advantage rates</strong> — sector-level implication.' },
    { date: '2026-06-01', tone: 'neu',  text: '<strong>ASCO 2026 conference</strong> — oncology pipeline updates.' }
  ],
  risks: [],
  news: [],
  peersTable: {
    headers: ['Ticker', 'Mkt Cap', 'P/E fwd', 'Rev YoY', 'Op mgn', 'In book'],
    rows: [
      { name: 'UNH',  ref: 'stock:UNH',  inBook: true,  cells: ['$478B', '18.4x', '+8.4%', '8.9%',  '5.0%'] },
      { name: 'LLY',  ref: 'stock:LLY',  inBook: true,  cells: ['$752B', '54.2x', '+26%',  '33.4%', '4.0%'] },
      { name: 'ABBV', ref: null,         inBook: true,  cells: ['$315B', '15.1x', '+6%',   '31.2%', '3.5%'] },
      { name: 'TMO',  ref: null,         inBook: true,  cells: ['$218B', '22.4x', '+4%',   '23.5%', '2.5%'] },
      { name: 'JNJ',  ref: null,         inBook: false, cells: ['$392B', '15.3x', '+5%',   '27.9%', '—']   },
      { name: 'MRK',  ref: null,         inBook: false, cells: ['$315B', '14.8x', '+7%',   '31.2%', '—']   },
      { name: 'ELV',  ref: null,         inBook: false, cells: ['$125B', '15.1x', '+4.2%', '6.1%',  '—']   },
      { name: 'CI',   ref: null,         inBook: false, cells: ['$98B',  '13.8x', '+5.9%', '5.8%',  '—']   }
    ]
  },
  trendNews: [],
  trendPeriod: 'Current regime window'
};

ENTITIES['sector:Technology'] = {
  kind: 'sector',
  ticker: 'Technology',
  name: 'S&P 500 Technology',
  snap: { price: 'Sector weight', chg: 'Stance pending', chgCls: '', position: 'Narrative loading' },
  upLevel: { label: 'Why Technology: Late-cycle regime (Layer 1)', key: 'indicator:Regime' },
  thesis: 'Technology sector narrative loading…',
  business: '<strong>~29% of S&P 500 · the index</strong>. Sub-industries: software (MSFT, CRM, NOW), semis (NVDA, AMD, AVGO), services (IBM, ACN), hardware (AAPL, DELL). Post-2018 reclass: GOOGL, META, NFLX now sit in Communication (XLC).',
  snapshot: [],
  drivers: [],
  composition: [
    { ticker: 'MSFT', name: 'Microsoft',    weight: 3.5, delta: '−2.5', score: 0.38, ref: 'stock:MSFT' },
    { ticker: 'NVDA', name: 'NVIDIA',       weight: 2.0, delta: '−3.0', score: 0.22, ref: 'stock:NVDA' },
    { ticker: 'AAPL', name: 'Apple',        weight: 0,   delta: '—',    score: 0.05, ref: null },
    { ticker: 'AMD',  name: 'AMD',          weight: 0,   delta: '—',    score:-0.10, ref: null },
    { ticker: 'ORCL', name: 'Oracle',       weight: 0,   delta: '—',    score: 0.15, ref: null }
  ],
  catalysts: [
    { date: '2026-04-24', tone: 'neu', text: '<strong>Alphabet Q1</strong> — Cloud growth the read-through.' },
    { date: '2026-04-25', tone: 'neu', text: '<strong>Microsoft FQ3</strong> — Azure + Copilot.' },
    { date: '2026-05-22', tone: 'neu', text: '<strong>NVIDIA Q1</strong> — Blackwell ramp detail.' }
  ],
  risks: [],
  news: [],
  peersTable: {
    headers: ['Ticker', 'Mkt Cap', 'P/E fwd', 'Rev YoY', 'Op mgn', 'In book'],
    rows: [
      { name: 'MSFT',  ref: 'stock:MSFT', inBook: true,  cells: ['$3.1T',  '32.1x', '+14%', '44.1%', '3.5%'] },
      { name: 'NVDA',  ref: 'stock:NVDA', inBook: true,  cells: ['$2.3T',  '36.4x', '+23%', '58.2%', '4.0%'] },
      { name: 'AAPL',  ref: null,         inBook: false, cells: ['$2.9T',  '28.7x', '+5%',  '30.1%', '—']   },
      { name: 'GOOGL', ref: null,         inBook: false, cells: ['$2.2T',  '21.3x', '+13%', '33.8%', '2.0%'] },
      { name: 'AMZN',  ref: null,         inBook: false, cells: ['$1.95T', '38.5x', '+12%', '10.8%', '1.5%'] },
      { name: 'AVGO',  ref: null,         inBook: false, cells: ['$780B',  '31.5x', '+42%', '45.8%', '—']   },
      { name: 'AMD',   ref: null,         inBook: false, cells: ['$258B',  '38.2x', '+14%', '22.1%', '—']   },
      { name: 'ORCL',  ref: null,         inBook: false, cells: ['$355B',  '22.7x', '+8%',  '33.2%', '—']   }
    ]
  },
  trendNews: [],
  trendPeriod: 'Current regime window'
};

ENTITIES['sector:Staples'] = {
  kind: 'sector',
  ticker: 'Staples',
  name: 'S&P 500 Consumer Staples',
  snap: { price: 'Sector weight', chg: 'Stance pending', chgCls: '', position: 'Narrative loading' },
  upLevel: { label: 'Why Staples: Late-cycle regime (Layer 1)', key: 'indicator:Regime' },
  thesis: 'Staples sector narrative loading…',
  business: '<strong>~6% of S&P 500 · defensive</strong>. Sub-industries: beverages (KO, PEP), HPC (PG, CL), food (HSY, KHC), retail (COST, WMT, TGT), tobacco (MO, PM).',
  snapshot: [],
  drivers: [],
  composition: [
    { ticker: 'KO',   name: 'Coca-Cola',  weight: 4.0, delta: '+1.0', score: 0.58, ref: 'stock:KO' },
    { ticker: 'PG',   name: 'Procter & Gamble', weight: 3.5, delta: '+0.5', score: 0.49, ref: null },
    { ticker: 'COST', name: 'Costco',     weight: 2.0, delta: '−0.5', score: 0.35, ref: null },
    { ticker: 'PEP',  name: 'PepsiCo',    weight: 0,   delta: '—',    score: 0.28, ref: null },
    { ticker: 'WMT',  name: 'Walmart',    weight: 0,   delta: '—',    score: 0.22, ref: null }
  ],
  catalysts: [
    { date: '2026-04-23', tone: 'neu', text: '<strong>PEP Q1 earnings</strong> — read-through for KO.' },
    { date: '2026-04-30', tone: 'neu', text: '<strong>KO Q1 earnings</strong> — organic trajectory.' },
    { date: '2026-05-07', tone: 'neu', text: '<strong>COST April sales update</strong> — traffic signal.' }
  ],
  risks: [],
  news: [],
  peersTable: {
    headers: ['Ticker', 'Mkt Cap', 'P/E fwd', 'Rev YoY', 'Op mgn', 'In book'],
    rows: [
      { name: 'KO',   ref: 'stock:KO', inBook: true,  cells: ['$278B', '22.3x', '+6%', '29.8%', '4.0%'] },
      { name: 'PG',   ref: null,       inBook: true,  cells: ['$395B', '24.5x', '+4%', '23.1%', '3.5%'] },
      { name: 'COST', ref: null,       inBook: true,  cells: ['$310B', '45.2x', '+7%', '3.4%',  '2.0%'] },
      { name: 'PEP',  ref: null,       inBook: false, cells: ['$242B', '19.8x', '+3%', '15.2%', '—']   },
      { name: 'WMT',  ref: null,       inBook: false, cells: ['$620B', '28.4x', '+5%', '4.1%',  '—']   },
      { name: 'MNST', ref: null,       inBook: false, cells: ['$58B',  '29.1x', '+4%', '28.9%', '—']   },
      { name: 'KDP',  ref: null,       inBook: false, cells: ['$44B',  '16.5x', '+4%', '22.8%', '—']   },
      { name: 'CL',   ref: null,       inBook: false, cells: ['$75B',  '23.8x', '+3%', '21.4%', '—']   }
    ]
  },
  trendNews: [],
  trendPeriod: 'Current regime window'
};

// Renamed from sector:Financials per D1 canonical naming. UI displays
// "Financials" via SECTOR_DISPLAY.
ENTITIES['sector:Finance'] = {
  kind: 'sector',
  ticker: 'Financials',
  name: 'S&P 500 Financials',
  snap: { price: 'Sector weight', chg: 'Stance pending', chgCls: '', position: 'Narrative loading' },
  upLevel: { label: 'Why Finance: Curve + credit (Layer 1)', key: 'indicator:Regime' },
  thesis: 'Finance sector narrative loading…',
  business: '<strong>~13% of S&P 500</strong>. Sub-industries: large banks (JPM, BAC, C), regional banks, capital markets (GS, MS), insurance (PGR, BRK), exchanges (ICE, CME).',
  snapshot: [],
  drivers: [],
  composition: [],
  catalysts: [],
  risks: [],
  news: [],
  peersTable: { headers: [], rows: [] },
  trendNews: [],
  trendPeriod: 'Current regime window'
};

// Sprint 3 new profiles — minimal skeletons. composition/peers/news will
// be wired to D1 in a follow-up; narrative overlay provides the main content.
ENTITIES['sector:Communication'] = {
  kind: 'sector',
  ticker: 'Communication',
  name: 'S&P 500 Communication Services',
  snap: { price: 'Sector weight', chg: 'Stance pending', chgCls: '', position: 'Narrative loading' },
  upLevel: { label: 'Why Communication: Late-cycle regime (Layer 1)', key: 'indicator:Regime' },
  thesis: 'Communication sector narrative loading…',
  business: '<strong>~9% of S&P 500 · XLC</strong>. Sub-industries: interactive media (GOOGL, META), entertainment (NFLX, DIS), telecom (T, VZ). Post-2018 GICS reclass moved GOOGL, META, NFLX out of Technology into this sector.',
  snapshot: [],
  drivers: [],
  composition: [],
  catalysts: [],
  risks: [],
  news: [],
  peersTable: { headers: [], rows: [] },
  trendNews: [],
  trendPeriod: 'Current regime window'
};

ENTITIES['sector:ConsDisc'] = {
  kind: 'sector',
  ticker: 'Discretionary',
  name: 'S&P 500 Consumer Discretionary',
  snap: { price: 'Sector weight', chg: 'Stance pending', chgCls: '', position: 'Narrative loading' },
  upLevel: { label: 'Why ConsDisc: Late-cycle regime (Layer 1)', key: 'indicator:Regime' },
  thesis: 'Consumer Discretionary sector narrative loading…',
  business: '<strong>~11% of S&P 500 · XLY</strong>. Sub-industries: internet retail (AMZN), autos (TSLA, F, GM), home improvement (HD, LOW), restaurants (MCD, SBUX), apparel (NKE, LULU). Highly cyclical — typically underperforms in late-cycle.',
  snapshot: [],
  drivers: [],
  composition: [],
  catalysts: [],
  risks: [],
  news: [],
  peersTable: { headers: [], rows: [] },
  trendNews: [],
  trendPeriod: 'Current regime window'
};

ENTITIES['sector:Energy'] = {
  kind: 'sector',
  ticker: 'Energy',
  name: 'S&P 500 Energy',
  snap: { price: 'Sector weight', chg: 'Stance pending', chgCls: '', position: 'Narrative loading' },
  upLevel: { label: 'Why Energy: Late-cycle regime (Layer 1)', key: 'indicator:Regime' },
  thesis: 'Energy sector narrative loading…',
  business: '<strong>~4% of S&P 500 · XLE</strong>. Sub-industries: integrated majors (XOM, CVX), E&P (EOG, COP), refiners (MPC, VLO), services (SLB, HAL). Crude price + capital-discipline balance drive the multiple.',
  snapshot: [],
  drivers: [],
  composition: [],
  catalysts: [],
  risks: [],
  news: [],
  peersTable: { headers: [], rows: [] },
  trendNews: [],
  trendPeriod: 'Current regime window'
};

ENTITIES['sector:Industrial'] = {
  kind: 'sector',
  ticker: 'Industrials',
  name: 'S&P 500 Industrials',
  snap: { price: 'Sector weight', chg: 'Stance pending', chgCls: '', position: 'Narrative loading' },
  upLevel: { label: 'Why Industrial: Late-cycle regime (Layer 1)', key: 'indicator:Regime' },
  thesis: 'Industrial sector narrative loading…',
  business: '<strong>~8% of S&P 500 · XLI</strong>. Sub-industries: aerospace/defence (BA, RTX, LMT), capital goods (CAT, DE, HON), transports (UNP, UPS), machinery (DE, PH). Cyclically tied to capex + global PMI.',
  snapshot: [],
  drivers: [],
  composition: [],
  catalysts: [],
  risks: [],
  news: [],
  peersTable: { headers: [], rows: [] },
  trendNews: [],
  trendPeriod: 'Current regime window'
};

/* ---------- INDICATOR ENTITIES ---------- */
// Sprint 2: comparative-sector landscape entity. Renders the 3-block narrative
// (current_reading + comparative identification bullets + rotation stance +
// signposts) inside the indicator page shell. The snapshot grid is populated
// from the narrative's numeric_snapshot_at_write so there is no hand-curated
// text. Layer 2 footer routes here via data-open="landscape:sector".
ENTITIES['landscape:sector'] = {
  kind: 'indicator',
  ticker: 'Sectors',
  name: 'Cross-sector landscape',
  snap: { price: 'Comparative view', chg: 'across all sectors', chgCls: '', position: 'Feeds Layer 2' },
  upLevel: null,
  thesis: 'Comparative sector commentary loads when the narrative is available.',
  business: 'Loading…',
  snapshot: [],
  drivers: [],
  risks: [],
  recentRelease: null,
  trajectory: []
};

// Sprint 4: comparative stock landscape entity. Renders the 3-block narrative
// inside the indicator page shell. Snapshot grid populated from the shortlist
// numeric_snapshot_at_write (top score, spread, sector coverage). Layer 3
// footer routes here via data-open="landscape:stock".
ENTITIES['landscape:stock'] = {
  kind: 'indicator',
  ticker: 'Shortlist',
  name: 'Cross-stock landscape',
  snap: { price: 'Comparative view', chg: 'top-N shortlist', chgCls: '', position: 'Feeds Layer 3' },
  upLevel: null,
  thesis: 'Comparative stock commentary loads when the narrative is available.',
  business: 'Loading…',
  snapshot: [],
  drivers: [],
  risks: [],
  recentRelease: null,
  trajectory: []
};

ENTITIES['indicator:Regime'] = {
  kind: 'indicator',
  ticker: 'Regime',
  name: 'Macro regime classifier',
  snap: { price: 'Late-cycle · Cautious-bullish', chg: '0.81 confidence', chgCls: 'up', position: 'Feeds Layer 1' },
  upLevel: null,
  thesis: 'The regime label is the <strong>single most important input</strong> to the book. 5-state classifier maps growth × inflation × Fed × credit signals. Current read: <span class="hi-neu">late-cycle, cautious-bullish</span> — growth decelerating but positive, Fed on hold, inflation sticky, credit contained. Regime has been stable 62 days · next test FOMC 2026-05-02.',
  business: 'The classifier reads 6 macro signals into a 5-state grid: early-cycle bull / mid-cycle bull / late-cycle cautious / recession / reflation. Transition probabilities estimated from 50 years of monthly data. Calibration holds within ±5% in out-of-sample testing.',
  snapshot: [
    { k: 'Current',       v: 'Late-c',    ctx: '62 days',             cls: '' },
    { k: 'Confidence',    v: '0.81',      ctx: 'high',                cls: 'good' },
    { k: 'Prev regime',   v: 'Mid-cycle', ctx: '→ since 2026-02-14',  cls: '' },
    { k: 'Next test',     v: '2026-05-02', ctx: 'FOMC',               cls: '' },
    { k: 'GDP nowcast',   v: '+1.4%',     ctx: 'decel',               cls: 'bad' },
    { k: 'Core CPI',      v: '3.2%',      ctx: 'sticky',              cls: 'bad' },
    { k: 'Fed path',      v: '1 cut',     ctx: 'July±',               cls: '' },
    { k: 'HY spread',     v: '318bp',     ctx: 'contained',           cls: 'good' }
  ],
  trajectory: [
    {y:'2024-01', v:'Early-c'}, {y:'2024-07', v:'Mid-c'},
    {y:'2024-10', v:'Mid-c'}, {y:'2025-02', v:'Mid-c'},
    {y:'2025-07', v:'Mid-c'}, {y:'2025-10', v:'Mid-c'},
    {y:'2026-02', v:'Late-c'}, {y:'2026-04', v:'Late-c'}
  ],
  recentRelease: 'fomc-mar',
  drivers: [
    '<strong>Growth signal:</strong> GDP nowcast +1.4%, decelerating from +2.2% six months ago.',
    '<strong>Inflation signal:</strong> Core CPI sticky at 3.2%, shelter remains 4.8%.',
    '<strong>Fed signal:</strong> "Patient" stance, market pricing 1 cut by July.',
    '<strong>Credit signal:</strong> HY at 318bp — benign.',
    '<strong>Curve signal:</strong> 2s10s inverted at −34bp — classic late-cycle.'
  ],
  risks: [
    'Reflation re-open: CPI rebound above 3.5% would re-open "higher for longer" regime.',
    'Hard landing: GDP print below +0.5% would flip to recession classification.',
    'Credit event: HY spread widen past 500bp would trigger risk-off recession classification.',
    'Fed surprise: mid-2026 rate path accelerates — flips to reflation risk.'
  ]
};

ENTITIES['indicator:Core CPI YoY'] = {
  kind: 'indicator',
  ticker: 'Core CPI YoY',
  name: 'Core Consumer Price Index',
  snap: { price: '3.2%', chg: '−0.1pp', chgCls: 'down', position: 'Late-cycle input' },
  upLevel: { label: 'Feeds Regime classifier', key: 'indicator:Regime' },
  thesis: 'Core CPI at <strong>3.2% YoY</strong> — <span class="hi-neu">sticky in the low-3s</span>. The sticky component is <strong>shelter at 4.8%</strong> plus supercore services at 4.1%. Goods deflation (−0.4%) partially offsets. Fed needs sub-3% reading for multiple cuts. Most recent release: March CPI on 2026-04-15.',
  business: 'Measures US consumer price inflation excluding food and energy. Released monthly by BLS. Composed of ~40% housing/shelter, 25% services ex-housing, 20% food, 15% other. Fed prefers PCE but CPI is the market-moving print.',
  snapshot: [
    { k: 'Current',       v: '3.2%',    ctx: 'Mar 2026',            cls: 'bad' },
    { k: 'Prior',         v: '3.3%',    ctx: 'Feb 2026',            cls: '' },
    { k: 'Headline CPI',  v: '3.4%',    ctx: '+0.2% MoM',           cls: '' },
    { k: '6m ann.',       v: '3.0%',    ctx: 'improving',           cls: 'good' },
    { k: 'Shelter YoY',   v: '4.8%',    ctx: 'sticky',              cls: 'bad' },
    { k: 'Supercore',     v: '4.1%',    ctx: 'Fed\'s focus',         cls: 'bad' },
    { k: 'Goods YoY',     v: '−0.4%',   ctx: 'deflation',           cls: 'good' },
    { k: 'Next release',  v: '2026-05-13', ctx: 'April CPI',        cls: '' }
  ],
  trajectory: [
    {y:'24-07', v:3.3}, {y:'24-08', v:3.2}, {y:'24-09', v:3.3},
    {y:'24-10', v:3.3}, {y:'24-11', v:3.3}, {y:'24-12', v:3.2},
    {y:'25-01', v:3.3}, {y:'25-02', v:3.1}, {y:'25-03', v:2.8},
    {y:'25-04', v:2.8}, {y:'25-05', v:2.7}, {y:'25-06', v:2.9},
    {y:'25-07', v:3.0}, {y:'25-08', v:3.2}, {y:'25-09', v:3.1},
    {y:'25-10', v:3.3}, {y:'25-11', v:3.4}, {y:'25-12', v:3.3},
    {y:'26-01', v:3.4}, {y:'26-02', v:3.3}, {y:'26-03', v:3.2}
  ],
  recentRelease: 'cpi-mar',
  drivers: [
    '<strong>Shelter:</strong> 180bp above pre-COVID avg; rent disinflation in real-time data (Zillow) not yet in CPI.',
    '<strong>Services supercore:</strong> 4.1% YoY — wage-driven · cooling but slowly.',
    '<strong>Goods deflation:</strong> Core goods −0.4% YoY for 4th straight month — global supply chains normalized.',
    '<strong>Wages:</strong> AHE at 3.8% YoY — cooling; historically consistent with 2.5% core CPI.',
    '<strong>Commodities:</strong> Oil, food stable; no immediate upside surprise.'
  ],
  risks: [
    'Shelter re-acceleration if housing market tightens.',
    'Wage rebound if labor market re-tightens.',
    'Oil shock from Iran/geopolitical re-escalation.',
    'Dollar weakness passing through import prices.',
    'Reflation catalysts: tax stimulus, supply-chain break.'
  ]
};

ENTITIES['indicator:10Y Yield'] = {
  kind: 'indicator',
  ticker: '10Y Yield',
  name: 'US Treasury 10-Year Yield',
  snap: { price: '4.18%', chg: '−3bp', chgCls: 'up', position: 'Duration proxy' },
  upLevel: { label: 'Feeds Regime classifier', key: 'indicator:Regime' },
  thesis: '10Y at <strong>4.18%</strong> — trading <span class="hi-neu">in a 4.10–4.30 range</span> for 6 weeks. Decomposition: real yield ~2.0%, inflation breakeven ~2.18%. Duration sensitivity for the book modest (−2% 1yr drawdown for +100bp); Healthcare/Staples have slight positive correlation via discount-rate relief.',
  business: 'Benchmark US Treasury rate. Two-factor model: (real rate = growth/term-premium proxy) + (breakeven = inflation expectations). Watched for: Fed reaction, duration positioning, risk-asset discount rate.',
  snapshot: [
    { k: 'Level',         v: '4.18%',   ctx: '6w range',           cls: '' },
    { k: '1d change',     v: '−3bp',    ctx: '',                    cls: 'good' },
    { k: 'Real yield',    v: '2.00%',   ctx: 'restrictive',         cls: '' },
    { k: 'Breakeven',     v: '2.18%',   ctx: 'below 2020–22 peak',  cls: 'good' },
    { k: '2s10s',         v: '−34bp',   ctx: 'inverted',            cls: 'bad' },
    { k: 'YTD range',     v: '3.92–4.48', ctx: '',                   cls: '' },
    { k: 'Auction demand',v: '2.6x',    ctx: 'healthy',             cls: 'good' },
    { k: 'Foreign buy',   v: 'net +',   ctx: 'Japan + EU',          cls: 'good' }
  ],
  trajectory: [
    {y:'24-04', v:4.42}, {y:'24-07', v:4.20}, {y:'24-10', v:4.28},
    {y:'25-01', v:4.62}, {y:'25-04', v:4.38}, {y:'25-07', v:4.25},
    {y:'25-10', v:4.55}, {y:'26-01', v:4.48}, {y:'26-04', v:4.18}
  ],
  recentRelease: null,
  drivers: [
    '<strong>Fed policy rate:</strong> 5.25% · expected 1 cut by July.',
    '<strong>Term premium:</strong> 35bp · still compressed; 20y avg is 60bp.',
    '<strong>Inflation expectations:</strong> 5y5y forward at 2.45% — well-anchored.',
    '<strong>Fiscal supply:</strong> Treasury issuance elevated but well-absorbed at quarterly refunding.',
    '<strong>Flight-to-quality:</strong> Risk-off bids 10Y; correlation with equities back to negative.'
  ],
  risks: [
    'Reflation print: any 3.5%+ CPI re-opens 4.50+ yields.',
    'Supply shock: refunding announcement larger than expected.',
    'Fed hawkish pivot: minutes or dot-plot surprise.',
    'Foreign demand rollover: Japan yield curve control exit accelerates.',
    'Fiscal narrative: deficit trajectory spurring term-premium widening.'
  ]
};

ENTITIES['indicator:GDP Nowcast'] = {
  kind: 'indicator',
  ticker: 'GDP Nowcast',
  name: 'Atlanta Fed GDPNow',
  snap: { price: '+1.4%', chg: '−0.3pp', chgCls: 'down', position: 'Growth signal' },
  upLevel: { label: 'Feeds Regime classifier', key: 'indicator:Regime' },
  thesis: 'GDP nowcast at <strong>+1.4%</strong> Q1 · <span class="hi-neg">decelerating</span> from +2.2% 6 months ago. Consistent with late-cycle diagnosis: growth is positive but below trend (~2.0%). Below +0.5% flips to recession-risk regime; above +2.0% re-opens mid-cycle reflation.',
  business: 'Atlanta Fed high-frequency GDP estimate, updated weekly as source data arrives. Built from PCE, residential/non-residential investment, government, trade, inventories. Historically within ±0.5pp of BEA advance release.',
  snapshot: [
    { k: 'Current Q1',    v: '+1.4%',   ctx: 'below trend',         cls: 'bad' },
    { k: 'Prior Q4',      v: '+2.1%',   ctx: 'decelerated',         cls: '' },
    { k: 'Trend',         v: '+2.0%',   ctx: 'long-term avg',       cls: '' },
    { k: 'Consumption',   v: '+1.8%',   ctx: 'main driver',         cls: '' },
    { k: 'Investment',    v: '+0.3%',   ctx: 'weak',                cls: 'bad' },
    { k: 'Inventories',   v: '−0.4pp',  ctx: 'destock',             cls: 'bad' },
    { k: 'Trade',         v: '+0.1pp',  ctx: 'small +',             cls: '' },
    { k: 'Next advance',  v: '2026-04-25', ctx: 'BEA release',      cls: '' }
  ],
  trajectory: [
    {y:'24-Q2', v:2.8}, {y:'24-Q3', v:3.1}, {y:'24-Q4', v:2.4},
    {y:'25-Q1', v:1.9}, {y:'25-Q2', v:2.2}, {y:'25-Q3', v:2.4},
    {y:'25-Q4', v:2.1}, {y:'26-Q1', v:1.4}
  ],
  recentRelease: 'nfp-mar',
  drivers: [
    '<strong>Consumption:</strong> Services resilient; goods flat; luxury softening.',
    '<strong>Investment:</strong> Non-res capex slowed; residential still weak.',
    '<strong>Inventories:</strong> Destocking cycle — drag of 0.4pp.',
    '<strong>Government:</strong> Fiscal boost fading from 2024 peaks.',
    '<strong>Trade:</strong> Exports weaker on DXY strength.'
  ],
  risks: [
    'Consumer pullback on credit-card delinquencies (up 12%+ YoY).',
    'Capex recession if Tech AI capex decelerates suddenly.',
    'Government shutdown/fiscal cliff risk post-election.',
    'Trade escalation: tariff announcements in Q3.',
    'Inventory bottom: could flip from drag to boost.'
  ]
};

/* ============================================================
   PROVENANCE DB — small popover, number-click only
   ============================================================ */
const PROV = {
  'nav': {
    title: 'NAV', value: '£1,243,820', valCls: '',
    definition: 'Total portfolio value, marked to market close + unrealized P&L on open positions.',
    asOf: '2026-04-17 08:05 UTC',
    producedBy: 'valuation-engine · broker recon',
    inputs: [
      { name: 'Cash balance (broker)', val: '£320,700' },
      { name: 'Long positions MV',     val: '£931,400' },
      { name: 'Short positions MV',    val: '−£8,280' },
      { name: 'Settled P&L',           val: '+£3,984' }
    ],
    sources: [
      { title: 'Broker statement (IBKR)', date: '08:04' },
      { title: 'Price feed (yfinance)',    date: '08:05' }
    ]
  },
  'ytd': {
    title: 'YTD Return', value: '+8.6%', valCls: 'good',
    definition: 'Year-to-date time-weighted return, net of fees & slippage.',
    asOf: '2026-04-17 08:05 UTC',
    producedBy: 'return-engine · GIPS methodology',
    inputs: [
      { name: 'Starting NAV (2026-01-01)', val: '£1,145,000' },
      { name: 'Net contributions',          val: '£0' },
      { name: 'TW return',                  val: '+8.63%' },
      { name: 'Benchmark SPY',              val: '+5.23%' },
      { name: 'Alpha vs SPY',               val: '+340bp' }
    ]
  },
  'regime-label': {
    title: 'Regime Classification', value: 'Late-cycle · Cautious-bullish', valCls: 'warn',
    definition: '5-state classifier mapping growth × inflation × Fed × credit into a regime.',
    asOf: '2026-04-17 06:00 UTC',
    producedBy: 'regime-classifier v2.1 · Sonnet 4.6',
    inputs: [
      { name: 'GDP Nowcast',    val: '+1.4%' },
      { name: 'Core CPI YoY',   val: '3.2%' },
      { name: 'Fed stance',     val: 'hold' },
      { name: 'HY spread',      val: '318bp' },
      { name: '2s10s curve',    val: '−34bp' },
      { name: 'VIX',            val: '16.4' }
    ],
    sources: [
      { title: 'Atlanta Fed GDPNow', date: '2026-04-16' },
      { title: 'BLS CPI March',       date: '2026-04-15' },
      { title: 'FOMC minutes',        date: '2026-04-10' }
    ]
  },
  'net-exposure': {
    title: 'Net Exposure', value: '62%', valCls: 'warn',
    definition: '(Gross long − Gross short) / Gross exposure. Target 55–70% for late-cycle regime.',
    asOf: '2026-04-17 08:05 UTC',
    producedBy: 'portfolio-analytics',
    inputs: [
      { name: 'Long MV',       val: '£931,400' },
      { name: 'Short MV',      val: '£8,280' },
      { name: 'Gross',         val: '£939,680' },
      { name: 'Net',           val: '£923,120' }
    ]
  },
  'sector-ranking': {
    title: 'Sector Ranking', value: 'HC / Stap / Util top', valCls: 'good',
    definition: 'Regime-fit composite of 5 factors per sector, normalized.',
    asOf: '2026-04-17 07:20 UTC',
    producedBy: 'sector-engine v1.4',
    inputs: [
      { name: 'Regime fit weight',     val: '40%' },
      { name: 'Earn momentum weight',  val: '25%' },
      { name: 'Valuation weight',      val: '20%' },
      { name: 'Rel strength weight',   val: '10%' },
      { name: 'Flow weight',           val:  '5%' }
    ]
  },
  'stock-selection': {
    title: 'Stock Shortlist', value: '9 names', valCls: '',
    definition: 'Top names per OW sector: revisions × valuation × catalyst-proximity × conviction.',
    asOf: '2026-04-17 07:30 UTC',
    producedBy: 'stock-ranker v1.1',
    inputs: [
      { name: 'Universe (OW sectors)', val: '~110 names' },
      { name: 'Revisions filter',      val: '>+1% 30d' },
      { name: 'Valuation filter',      val: '<+1σ' },
      { name: 'Liquidity filter',      val: '>$500M ADV' }
    ]
  },
  'weights': {
    title: 'Target Weights', value: '16 names · net 61.5%', valCls: '',
    definition: 'Final book weights from Kelly-capped sizing on shortlist.',
    asOf: '2026-04-17 07:50 UTC',
    producedBy: 'wealth-distribution v1.2',
    inputs: [
      { name: 'Max single-name',  val: '5.0%' },
      { name: 'Max single-sector', val: '22%' },
      { name: 'Min cash',          val: '20%' },
      { name: 'Net exposure cap',  val: '70%' }
    ]
  },
  'feedback': {
    title: 'Layer Attribution', value: '+215bp 30d', valCls: 'good',
    definition: 'Brinson-style decomposition of 30d alpha by funnel layer.',
    asOf: '2026-04-17 07:30 UTC',
    producedBy: 'attribution-engine',
    inputs: [
      { name: 'Regime call',   val: '+145bp' },
      { name: 'Sector tilt',   val: '+82bp' },
      { name: 'Stock picks',   val: '−34bp' },
      { name: 'Sizing',        val: '+22bp' }
    ]
  },
  'pm-nav': { title: 'NAV', value: '£1,243,820', valCls: '', definition: 'Marked-to-market.', asOf: '08:05', producedBy: 'valuation' },
  'pm-mtd': { title: 'MTD Return', value: '+2.4%', valCls: 'good', definition: 'Month-to-date TW return.', asOf: '08:05', producedBy: 'return-engine' },
  'pm-ytd': { title: 'YTD Return', value: '+8.6%', valCls: 'good', definition: 'Year-to-date TW return.', asOf: '08:05', producedBy: 'return-engine' },
  'pm-dd':  { title: 'Max Drawdown', value: '−4.2%', valCls: 'bad', definition: 'Largest peak-to-trough loss.', asOf: '08:05', producedBy: 'risk-engine' },
  'pm-sharpe': { title: 'Sharpe (6m)', value: '1.42', valCls: 'good', definition: '(Ann. ret − rf) / ann. vol.', asOf: '08:05', producedBy: 'risk-engine' },
  'pm-vol': { title: 'Volatility', value: '11.4%', valCls: '', definition: 'Ann. std dev of daily returns (126d).', asOf: '08:05', producedBy: 'risk-engine' },
  'pm-navcurve': { title: 'NAV Curve', value: '+24.4% 6m', valCls: 'good', definition: 'Cumulative return, 6-month window.', asOf: '08:05', producedBy: 'return-engine' },
  'pm-attribution': { title: 'Attribution', value: '+215bp 30d', valCls: 'good', definition: 'Brinson 30d decomposition.', asOf: '07:30', producedBy: 'attribution-engine' },
  'pm-drawdown': { title: 'Drawdown', value: '−4.2%', valCls: 'bad', definition: '6m drawdown series.', asOf: '08:05', producedBy: 'risk-engine' },
  'pm-positions': { title: 'Positions', value: '16 open', valCls: '', definition: 'Open book — longs and shorts.', asOf: '08:05', producedBy: 'position-keeper' },
  'pm-attr': { title: '30d Attribution', value: '+215bp', valCls: 'good', definition: 'Brinson breakdown.', asOf: '07:30', producedBy: 'attribution-engine' },
  'scatter': { title: 'Revisions × Valuation', value: '—', valCls: '', definition: 'Scatter of OW-sector shortlist.', asOf: '07:30', producedBy: 'stock-engine' },
  'rrg': { title: 'Relative Rotation', value: '—', valCls: '', definition: 'JdK-style rotation map, 12w.', asOf: '07:00', producedBy: 'rs-engine' },
  'sector-weights': { title: 'Sector Weights', value: '—', valCls: '', definition: 'Current weight bar.', asOf: '07:50', producedBy: 'portfolio-analytics' },
  'attribution': { title: 'Attribution (bps)', value: '+215 30d', valCls: 'good', definition: 'Brinson decomposition.', asOf: '07:30', producedBy: 'attribution-engine' },
  'calibration': { title: 'Conviction Calibration', value: 'Level 5 low', valCls: 'warn', definition: 'Actual vs expected hit rate by conviction.', asOf: '07:30', producedBy: 'signal-engine' },
  'closed-ideas': { title: 'Closed Ideas', value: '7/10 winners', valCls: 'good', definition: 'Last 10 closed trades.', asOf: '08:00', producedBy: 'position-keeper' },
  'freshness': { title: 'Data Freshness', value: '14/16 OK', valCls: 'good', definition: 'Feed health snapshot.', asOf: '08:05', producedBy: 'pipeline-monitor' },
  'news-stream': { title: 'News Stream', value: '8 items', valCls: '', definition: 'Filtered by sector overlap, materiality.', asOf: '08:12', producedBy: 'news-agent' },
  'top-drivers': { title: 'Top Movers', value: 'UNH, TSLA, LLY', valCls: '', definition: 'Largest |1d move|.', asOf: '08:00', producedBy: 'market-data' },
  'clusters': { title: 'Narrative Clusters', value: '7 topics', valCls: '', definition: 'Topic-model clustering of 7d news.', asOf: '06:00', producedBy: 'topic-engine' },
  'macro-indicators': { title: 'Macro Indicators', value: '12 signals', valCls: '', definition: 'Core macro dashboard.', asOf: '06:00', producedBy: 'macro-engine' },
  'scenarios': { title: 'Scenarios', value: '5 paths', valCls: '', definition: 'Sensitivity to regime perturbations.', asOf: '07:30', producedBy: 'scenario-engine' },
  'freshness-table': { title: 'Feed Health', value: '14/16 OK', valCls: 'good', definition: 'All ingestion pipelines.', asOf: '08:05', producedBy: 'pipeline-monitor' },
  'anomalies': { title: 'Anomalies', value: '5 (48h)', valCls: 'warn', definition: 'Detected irregularities.', asOf: '08:05', producedBy: 'anomaly-detector' },
  'monthly-check': { title: 'Monthly Validation', value: '68%', valCls: '', definition: 'Monthly audit progress.', asOf: '08:00', producedBy: 'validator' },
  'style-tilts': { title: 'Style Tilts', value: 'Q+ V+ G−', valCls: 'good', definition: 'Book exposure by factor.', asOf: '07:50', producedBy: 'portfolio-analytics' }
};

/* Generate provenance history chart data */
function _provHist(n, seed) {
  const arr = []; let v = seed || 50;
  for (let i = 0; i < n; i++) { v += (Math.random() - 0.5) * 6; arr.push(v); }
  return arr;
}
Object.keys(PROV).forEach(k => { PROV[k].history = _provHist(30, 50); });

/* ============================================================
   APP STATE + ROUTING
   ============================================================ */
const appState = {
  tab: 'portfolio',
  entity: null,        // { kind, id } or null
  entitySub: 'overview'
};

function switchTab(tabId) {
  appState.tab = tabId;
  appState.entity = null;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
  document.getElementById('tabView').classList.remove('hidden');
  document.getElementById('entityView').classList.add('hidden');
  document.querySelector('.main-content').scrollTop = 0;
}

// Reverse of SECTOR_DISPLAY: display-name → backend-bucket.
const BACKEND_SECTOR = (() => {
  const out = {};
  if (typeof SECTOR_DISPLAY !== 'undefined') {
    for (const [bucket, disp] of Object.entries(SECTOR_DISPLAY)) out[disp] = bucket;
  }
  return out;
})();

// Cache for API-fetched entity overrides so re-opens are instant.
const ENTITY_API_CACHE = {};

async function fetchSectorTrendOverride(displayName) {
  if (ENTITY_API_CACHE[`sector:${displayName}`]) return ENTITY_API_CACHE[`sector:${displayName}`];
  const backend = BACKEND_SECTOR[displayName] || displayName;
  try {
    const data = await fetchJSON(`/api/sector-trends?sector=${encodeURIComponent(backend)}`);
    const longRow = data?.long?.[0];
    const shortRow = data?.short?.[0];
    if (!longRow) return null;
    const result = {
      thesis: longRow.thesis,
      longRegime: longRow.regime,
      longScore: longRow.score,
      shortThesis: shortRow?.thesis,
      shortTrigger: shortRow?.trigger,
      shortTriggerDetail: shortRow?.trigger_detail,
    };
    ENTITY_API_CACHE[`sector:${displayName}`] = result;
    return result;
  } catch (e) {
    console.warn(`[entity] sector ${displayName} fetch failed:`, e.message);
    return null;
  }
}

async function fetchTickerTrendOverride(ticker) {
  if (ENTITY_API_CACHE[`stock:${ticker}`]) return ENTITY_API_CACHE[`stock:${ticker}`];
  try {
    const data = await fetchJSON(`/api/ticker-trends?ticker=${encodeURIComponent(ticker)}`);
    const longRow = data?.long?.[0];
    const shortRow = data?.short?.[0];
    if (!longRow) return null;
    const result = {
      thesis: longRow.thesis,
      longRegime: longRow.regime,
      longScore: longRow.score,
      shortThesis: shortRow?.thesis,
      shortTrigger: shortRow?.trigger,
      shortTriggerDetail: shortRow?.trigger_detail,
    };
    ENTITY_API_CACHE[`stock:${ticker}`] = result;
    return result;
  } catch (e) {
    console.warn(`[entity] ticker ${ticker} fetch failed:`, e.message);
    return null;
  }
}

// Sprint 1: regime narrative from NARRATIVE_01_Content. Cached for the
// session; flip a ?force=1 on the worker to refresh. Returns null on any
// failure so callers can fall back to the legacy thesis/drivers/risks.
async function fetchRegimeNarrative() {
  if (ENTITY_API_CACHE['narrative:regime']) return ENTITY_API_CACHE['narrative:regime'];
  try {
    const data = await fetchJSON('/api/narrative?entity_type=regime');
    const f = data?.fields || {};
    if (!f.current_reading && !f.identification && !f.recommendation && !f.lede) return null;
    const result = {
      lede: f.lede?.content?.text || null,
      currentReading: f.current_reading?.content || null,
      identification: f.identification?.content || null,
      recommendation: f.recommendation?.content || null,
      date: f.identification?.date || f.lede?.date || null,
      confirmedAt: f.lede?.last_confirmed_at || null,
    };
    ENTITY_API_CACHE['narrative:regime'] = result;
    return result;
  } catch (e) {
    console.warn('[entity] regime narrative fetch failed:', e.message);
    return null;
  }
}

// Sprint 3: individual-sector narrative. Same row shape as regime + landscape,
// scoped by entity_id=<sector>. Per-sector caching via entKey so multiple
// sectors opened in a session all hit cache on second open.
async function fetchSectorNarrative(sector) {
  const key = `narrative:sector:${sector}`;
  if (ENTITY_API_CACHE[key]) return ENTITY_API_CACHE[key];
  try {
    const data = await fetchJSON(`/api/narrative?entity_type=sector&entity_id=${encodeURIComponent(sector)}`);
    const f = data?.fields || {};
    if (!f.current_reading && !f.identification && !f.recommendation && !f.lede) return null;
    const result = {
      lede: f.lede?.content?.text || null,
      currentReading: f.current_reading?.content || null,
      identification: f.identification?.content || null,
      recommendation: f.recommendation?.content || null,
      date: f.identification?.date || f.lede?.date || null,
      confirmedAt: f.lede?.last_confirmed_at || null,
    };
    ENTITY_API_CACHE[key] = result;
    return result;
  } catch (e) {
    console.warn(`[entity] sector narrative fetch failed (${sector}):`, e.message);
    return null;
  }
}

// Sprint 5: per-stock narrative (6 fields: current_reading, ident_long,
// ident_short, rec_long, rec_short, lede). Session-cached per ticker.
async function fetchStockNarrative(ticker) {
  const key = `narrative:stock:${ticker}`;
  if (ENTITY_API_CACHE[key]) return ENTITY_API_CACHE[key];
  try {
    const data = await fetchJSON(`/api/narrative?entity_type=stock&entity_id=${encodeURIComponent(ticker)}`);
    const f = data?.fields || {};
    if (!f.current_reading && !f.ident_long && !f.ident_short && !f.rec_long && !f.rec_short && !f.lede) return null;
    const result = {
      lede: f.lede?.content?.text || null,
      currentReading: f.current_reading?.content || null,
      identLong:  f.ident_long?.content  || null,
      identShort: f.ident_short?.content || null,
      recLong:    f.rec_long?.content    || null,
      recShort:   f.rec_short?.content   || null,
      date: f.ident_long?.date || f.lede?.date || null,
      confirmedAt: f.lede?.last_confirmed_at || null,
    };
    ENTITY_API_CACHE[key] = result;
    return result;
  } catch (e) {
    console.warn(`[entity] stock narrative fetch failed (${ticker}):`, e.message);
    return null;
  }
}

// ======================================================================
// Sprint 9: rich-data profile fetchers for stock + sector entity views.
// Shape the raw D1 bundle into the ENTITIES[...] fields the renderers
// already expect (epsHistory, filings, peers, catalysts, news, composition,
// peersTable). Session-cached per key — openEntity overlays the result.
// Narrative still owns thesis / business / snapshot; this adds everything
// else. On missing/empty data the fields stay empty so renderers fall
// back to empty-state placeholders.
// ======================================================================

// Short "25Q1" style label from a period string like "2025-Q1", "2025-03-31", etc.
function _shortQuarter(period) {
  if (!period) return '';
  const m = String(period).match(/(\d{4})[-Q]?(\d{1,2})/);
  if (!m) return String(period);
  const y = m[1].slice(2);
  const q = m[2];
  if (q.length <= 1 || (q.length === 2 && Number(q) <= 4)) return `${y}Q${Number(q)}`;
  // fall back: map month → quarter
  const mon = Number(q);
  const qn = mon <= 3 ? 1 : mon <= 6 ? 2 : mon <= 9 ? 3 : 4;
  return `${y}Q${qn}`;
}

function _fmtPct(x, digits = 1) {
  if (x == null || !isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}
function _fmtNum(x, digits = 2) {
  if (x == null || !isFinite(x)) return '—';
  return Number(x).toFixed(digits);
}
function _sentTag(s) {
  if (s === 'bullish') return 'pos';
  if (s === 'bearish') return 'neg';
  return 'neu';
}

async function fetchStockProfile(ticker) {
  const key = `profile:stock:${ticker}`;
  if (ENTITY_API_CACHE[key]) return ENTITY_API_CACHE[key];
  try {
    const data = await fetchJSON(`/api/stock-profile/${encodeURIComponent(ticker)}`);
    if (!data || !data.ticker) return null;

    // EPS history: API returns chronological. Map to {q, est, act, beat}.
    const epsHistory = (data.epsHistory || []).map(r => ({
      q: _shortQuarter(r.period),
      est: r.estimate != null ? Number(r.estimate) : null,
      act: r.actual != null ? Number(r.actual) : null,
      beat: r.estimate != null && r.actual != null ? Number(r.actual) >= Number(r.estimate) : false,
    }));

    // Filings: summary lives in ALPHA_01_Reports.summary (qk-report-summarizer
    // writes plain-text or HTML). Render it as the lede; keep bullets empty
    // until the summarizer splits them out.
    const filings = (data.filings || []).map(f => ({
      type: f.type,
      title: `${f.type} filing`,
      date: f.date,
      period: '',
      lede: f.summary || '',
      bullets: [],
    }));

    // Peers: same-sector rows from STOCK_FACTORS_daily. Columns chosen to
    // mirror the factor view rather than the old fabricated FA columns.
    const peerHeaders = ['Ticker', 'Fwd P/E', 'EPS rev 4w', 'RS 3m', 'Piotroski', 'In book'];
    const peerRows = (data.peers || []).map(p => {
      const inBook = (DATA?.weights || []).some(w => w.ticker === p.ticker);
      return {
        name: p.ticker,
        ref: `stock:${p.ticker}`,
        me: p.ticker === ticker,
        inBook,
        cells: [
          _fmtNum(p.fwd_pe, 1) + 'x',
          _fmtPct(p.eps_rev_4w, 2),
          _fmtPct(p.rs_vs_sector_3m, 2),
          p.piotroski_f != null ? String(p.piotroski_f) : '—',
          inBook ? '✓' : '—',
        ],
      };
    });
    // Legacy shape variants of the peers block used by UNH etc — flatten cols
    // into direct props so the old renderer (that reads row.marketCap/pe/...)
    // still works; the new renderer will prefer `cells`.
    const peers = { headers: peerHeaders, rows: peerRows };

    const catalysts = (data.catalysts || []).map(c => ({
      date: c.report_date,
      tone: 'neu',
      text: `<strong>${c.period || 'Upcoming earnings'}</strong>${c.estimate != null ? ` · est ${_fmtNum(c.estimate, 2)}` : ''}`,
    }));

    const news = (data.news || []).map(n => ({
      title: n.title,
      src: n.source || 'news',
      date: n.date,
      sent: _sentTag(n.sentiment),
      score: n.magnitude != null ? Number(n.magnitude) : 0,
    }));

    const result = {
      sector: data.sector || null,
      fundamentals: data.fundamentals || null,
      factors: data.factors || null,
      epsHistory,
      filings,
      peers,
      catalysts,
      news,
    };
    ENTITY_API_CACHE[key] = result;
    return result;
  } catch (e) {
    console.warn(`[entity] stock profile fetch failed (${ticker}):`, e.message);
    return null;
  }
}

// ======================================================================
// Sprint 12: valuation curves. Three lines on the stock entity view
// (price, short fair value, long fair value) over a 6–12 month window.
// Short curve is price-blind (event-driven tactical).
// Long curve is bimonthly + structural-event driven, with explicit
// anchor-independence constraint in the LLM prompt.
// ======================================================================
async function fetchValuationCurve(ticker, days = 365) {
  const key = `valuation:${ticker}:${days}`;
  if (ENTITY_API_CACHE[key]) return ENTITY_API_CACHE[key];
  try {
    const data = await fetchJSON(`/api/valuation-curve/${encodeURIComponent(ticker)}?days=${days}`);
    if (!data || !data.ticker) return null;
    ENTITY_API_CACHE[key] = data;
    return data;
  } catch (e) {
    console.warn(`[entity] valuation curve fetch failed (${ticker}):`, e.message);
    return null;
  }
}

async function fetchSectorProfile(sector) {
  const key = `profile:sector:${sector}`;
  if (ENTITY_API_CACHE[key]) return ENTITY_API_CACHE[key];
  try {
    const data = await fetchJSON(`/api/sector-profile/${encodeURIComponent(sector)}`);
    if (!data || !data.sector) return null;

    // Composition: join with DATA.weights for in-book weight + delta, with
    // DATA for company names. Unknown tickers still render with factor data.
    const weightsByTicker = Object.fromEntries((DATA?.weights || []).map(w => [w.ticker, w]));
    const composition = (data.composition || []).map(c => {
      const w = weightsByTicker[c.ticker];
      return {
        ticker: c.ticker,
        name: c.ticker, // no name table in D1; ticker is the anchor
        weight: w ? Number(w.current) : 0,
        delta: w ? (Number(w.target) - Number(w.current)).toFixed(1) : '—',
        score: c.score != null ? Number(c.score) : null,
        ref: `stock:${c.ticker}`,
      };
    });

    // Other sectors: drop the current sector; map to peer-table shape.
    const peerHeaders = ['Sector', 'Stance', 'Fwd P/E', 'Regime fit', 'RS 13w', 'In book'];
    const peersTable = {
      headers: peerHeaders,
      rows: (data.peers || [])
        .filter(p => p.sector !== sector)
        .map(p => ({
          name: p.sector,
          ref: `sector:${p.sector}`,
          inBook: true, // all 8 sectors are in the universe
          cells: [
            p.stance || '—',
            _fmtNum(p.fwd_pe_sector, 1) + 'x',
            _fmtNum(p.regime_fit, 2),
            _fmtNum(p.rel_strength_13w, 2),
            '✓',
          ],
        })),
    };

    const catalysts = (data.catalysts || []).map(c => ({
      date: c.report_date,
      tone: 'neu',
      text: `<strong>${c.ticker} ${c.period || ''}</strong>${c.estimate != null ? ` · est ${_fmtNum(c.estimate, 2)}` : ''}`,
    }));

    const news = (data.news || []).map(n => ({
      title: `${n.ticker ? `[${n.ticker}] ` : ''}${n.title}`,
      src: n.source || 'news',
      date: n.date,
      sent: _sentTag(n.sentiment),
      score: n.magnitude != null ? Number(n.magnitude) : 0,
    }));

    const result = { composition, peersTable, catalysts, news };
    ENTITY_API_CACHE[key] = result;
    return result;
  } catch (e) {
    console.warn(`[entity] sector profile fetch failed (${sector}):`, e.message);
    return null;
  }
}

// Sprint 4: stock-landscape narrative. Same row shape, entity_type='stock_landscape'.
async function fetchStockLandscapeNarrative() {
  if (ENTITY_API_CACHE['narrative:stock_landscape']) return ENTITY_API_CACHE['narrative:stock_landscape'];
  try {
    const data = await fetchJSON('/api/narrative?entity_type=stock_landscape');
    const f = data?.fields || {};
    if (!f.current_reading && !f.identification && !f.recommendation && !f.lede) return null;
    const result = {
      lede: f.lede?.content?.text || null,
      currentReading: f.current_reading?.content || null,
      identification: f.identification?.content || null,
      recommendation: f.recommendation?.content || null,
      date: f.identification?.date || f.lede?.date || null,
      confirmedAt: f.lede?.last_confirmed_at || null,
    };
    ENTITY_API_CACHE['narrative:stock_landscape'] = result;
    return result;
  } catch (e) {
    console.warn('[entity] stock-landscape narrative fetch failed:', e.message);
    return null;
  }
}

// Sprint 2: sector-landscape narrative. Same row shape as regime (the 4
// narrative fields), different entity_type. The 3-block renderer is shared
// — its HTML contract is identical for any landscape/regime surface.
async function fetchSectorLandscapeNarrative() {
  if (ENTITY_API_CACHE['narrative:sector_landscape']) return ENTITY_API_CACHE['narrative:sector_landscape'];
  try {
    const data = await fetchJSON('/api/narrative?entity_type=sector_landscape');
    const f = data?.fields || {};
    if (!f.current_reading && !f.identification && !f.recommendation && !f.lede) return null;
    const result = {
      lede: f.lede?.content?.text || null,
      currentReading: f.current_reading?.content || null,
      identification: f.identification?.content || null,
      recommendation: f.recommendation?.content || null,
      date: f.identification?.date || f.lede?.date || null,
      confirmedAt: f.lede?.last_confirmed_at || null,
    };
    ENTITY_API_CACHE['narrative:sector_landscape'] = result;
    return result;
  } catch (e) {
    console.warn('[entity] sector-landscape narrative fetch failed:', e.message);
    return null;
  }
}

// Build a snapshot grid from the landscape numeric_snapshot — shows the 3-4
// most movement-relevant facts on the entity page (widest spread, top/bottom
// stance scores, regime context). No hand-curated values.
function buildLandscapeSnapshot(n) {
  const snap = n?.currentReading?.numeric_snapshot_at_write || {};
  const scores = snap.stance_scores || {};
  const labels = snap.stance_labels || {};
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const bot = sorted[sorted.length - 1];
  const cells = [];
  if (top) cells.push({ k: 'Top stance',    v: top[0], ctx: `${labels[top[0]] || '—'} · score ${top[1].toFixed(2)}`, cls: 'good' });
  if (bot) cells.push({ k: 'Bottom stance', v: bot[0], ctx: `${labels[bot[0]] || '—'} · score ${bot[1].toFixed(2)}`, cls: 'bad' });
  if (snap.widest_spread != null) cells.push({ k: 'Widest spread', v: snap.widest_spread.toFixed(2), ctx: 'top − bottom stance score', cls: '' });
  if (snap.regime_label) cells.push({ k: 'Regime',        v: snap.regime_label, ctx: 'from macro classifier', cls: '' });
  return cells;
}

// Sprint 4: snapshot grid for the stock landscape. Reads shortlist scores
// + probabilities from numeric_snapshot_at_write and surfaces the 4 most
// informative comparative cells (top/bottom score, spread, n stocks).
function buildStockLandscapeSnapshot(n) {
  const snap = n?.currentReading?.numeric_snapshot_at_write || {};
  const tickers = snap.shortlist_tickers || [];
  const scores = snap.scores || {};
  const probs = snap.probabilities || {};
  const cells = [];
  if (tickers.length) cells.push({ k: 'Shortlist size', v: String(tickers.length), ctx: 'top-N by composite score', cls: '' });
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const bot = sorted[sorted.length - 1];
  if (top) cells.push({ k: 'Top pick',    v: top[0], ctx: `score ${top[1].toFixed(2)}`, cls: 'good' });
  if (bot) cells.push({ k: 'Bottom pick', v: bot[0], ctx: `score ${bot[1].toFixed(2)}`, cls: 'bad' });
  if (top && bot) {
    const spread = (top[1] - bot[1]).toFixed(2);
    cells.push({ k: 'Score spread', v: spread, ctx: 'top − bottom', cls: '' });
  }
  // Strongest p_favorable across shortlist.
  const probEntries = Object.entries(probs).filter(([, p]) => p?.favorable != null);
  if (probEntries.length) {
    const bestProb = probEntries.sort((a, b) => b[1].favorable - a[1].favorable)[0];
    cells.push({ k: 'Highest p(fav)', v: bestProb[0], ctx: `${(bestProb[1].favorable * 100).toFixed(0)}%`, cls: 'good' });
  }
  return cells;
}

// Sprint 5: snapshot grid for individual-stock profiles. Reads the
// numeric_snapshot_at_write from the ident_long row — composite score +
// p_favorable + a count of positive/negative factor signs.
function buildStockSnapshot(n) {
  const snap = n?.identLong?.numeric_snapshot_at_write
    || n?.currentReading?.numeric_snapshot_at_write || {};
  const cells = [];
  const fmt = (v, p) => (v == null || !Number.isFinite(Number(v))) ? 'n/a' : Number(v).toFixed(p);
  const pct = (v) => (v == null || !Number.isFinite(Number(v))) ? 'n/a' : `${(Number(v) * 100).toFixed(0)}%`;
  if (snap.score != null) cells.push({ k: 'Composite score', v: fmt(snap.score, 2), ctx: 'SIGNAL_01_Assessment', cls: snap.score > 0 ? 'good' : snap.score < 0 ? 'bad' : '' });
  if (snap.p_favorable != null) cells.push({ k: 'P(favorable)', v: pct(snap.p_favorable), ctx: 'SIGNAL_02_Probability', cls: snap.p_favorable > 0.5 ? 'good' : 'bad' });
  const signs = snap.factor_signs || {};
  const pos = Object.values(signs).filter((v) => v > 0).length;
  const neg = Object.values(signs).filter((v) => v < 0).length;
  const neu = Object.values(signs).filter((v) => v === 0).length;
  const total = pos + neg + neu;
  if (total) cells.push({ k: 'Factor signs', v: `${pos}+ / ${neg}− / ${neu}·`, ctx: `${total} factors`, cls: pos > neg ? 'good' : neg > pos ? 'bad' : '' });
  if (snap.latest_earnings_date) cells.push({ k: 'Last earnings', v: snap.latest_earnings_date, ctx: 'FUND_02_Earnings', cls: '' });
  return cells;
}

// Sprint 5: render the stock narrative as two tabs (Long-term / Tactical).
// Each tab shows current_reading (shared) + identification bullets + recommendation
// stance + signposts for that horizon. Click handlers attached post-render by
// bindStockNarrativeTabs().
function renderStockNarrativeTabs(n) {
  if (!n) return '';
  const cr = n.currentReading?.text || '';
  const tabHtml = (label, ident, rec) => {
    const bulletsHtml = (ident?.bullets || []).map(b => `
      <div class="regime-bullet">
        <div class="regime-bullet-headline">${escapeHTML(b.headline || '')}</div>
        <div class="regime-bullet-body">
          <span class="regime-bullet-number">${escapeHTML(b.number || '')}</span>
          <span class="regime-bullet-event"> · ${escapeHTML(b.event || '')}</span>
        </div>
        <div class="regime-bullet-interp"><em>Interpretation:</em> ${escapeHTML(b.interpretation || '')}</div>
        ${b.source ? `<div class="regime-bullet-source">source: ${escapeHTML(b.source.table || '')}/${escapeHTML(b.source.id || '')}</div>` : ''}
      </div>
    `).join('');
    const signpostsHtml = (rec?.signposts || []).map(s => `
      <div class="regime-signpost">
        <div class="regime-signpost-event">${escapeHTML(s.dated_event || '')} — ${escapeHTML(s.trigger || '')}</div>
        <div class="regime-signpost-detail">threshold: ${escapeHTML(s.threshold || '')}</div>
        <div class="regime-signpost-action">action: <strong>${escapeHTML(s.action || '')}</strong></div>
      </div>
    `).join('');
    const missing = (ident?.missing_factors || []).length
      ? `<div class="regime-missing"><em>Factors not in input:</em> ${(ident.missing_factors || []).map(m => escapeHTML(m)).join('; ')}</div>`
      : '';
    return `
      <div class="ep-section">
        <div class="ep-section-title">${label} — What's driving ${n._ticker || 'this stock'}</div>
        ${bulletsHtml || '<div class="regime-empty">No identification bullets available.</div>'}
        ${missing}
      </div>
      <div class="ep-section">
        <div class="ep-section-title">${label} — Stance</div>
        <div class="regime-stance">${escapeHTML(rec?.stance || '')}</div>
        ${signpostsHtml}
      </div>
    `;
  };
  return `
    <div class="ep-section">
      <div class="ep-section-title">Current reading</div>
      <div class="regime-current-reading">${escapeHTML(cr)}</div>
    </div>
    <div class="stock-nar-tabs">
      <div class="stock-nar-tabhead">
        <button class="stock-nar-tab active" data-stock-tab="long">Long-term view</button>
        <button class="stock-nar-tab" data-stock-tab="short">Tactical (1–2 wk)</button>
      </div>
      <div class="stock-nar-body stock-nar-long">
        ${tabHtml('Long-term', n.identLong, n.recLong)}
      </div>
      <div class="stock-nar-body stock-nar-short" style="display:none">
        ${tabHtml('Tactical', n.identShort, n.recShort)}
      </div>
    </div>
  `;
}

function bindStockNarrativeTabs() {
  const tabs = document.querySelectorAll('.stock-nar-tab');
  if (!tabs.length) return;
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const which = btn.getAttribute('data-stock-tab');
      document.querySelectorAll('.stock-nar-tab').forEach(b => b.classList.toggle('active', b === btn));
      const longEl = document.querySelector('.stock-nar-long');
      const shortEl = document.querySelector('.stock-nar-short');
      if (longEl) longEl.style.display = which === 'long' ? '' : 'none';
      if (shortEl) shortEl.style.display = which === 'short' ? '' : 'none';
    });
  });
}

// Sprint 3: snapshot grid for individual-sector profiles. Reads
// numeric_snapshot_at_write (written by narrator-sector), surfacing the 4
// factor values that drive the stance. No hand-curated values.
function buildSectorSnapshot(n) {
  const snap = n?.currentReading?.numeric_snapshot_at_write || {};
  const cells = [];
  const fmt = (v, p) => (v == null || !Number.isFinite(Number(v))) ? 'n/a' : Number(v).toFixed(p);
  const signed = (v, p) => (v == null || !Number.isFinite(Number(v))) ? 'n/a' : (Number(v) >= 0 ? '+' : '') + Number(v).toFixed(p);
  const cls = (v, goodHi = true) => {
    if (v == null) return '';
    return (goodHi ? v > 0 : v < 0) ? 'good' : (goodHi ? v < 0 : v > 0) ? 'bad' : '';
  };
  if (snap.stance_score != null) cells.push({ k: 'Stance score',    v: signed(snap.stance_score, 2),    ctx: `stance ${snap.stance || 'n/a'}`,   cls: cls(snap.stance_score, true) });
  if (snap.regime_fit != null)   cells.push({ k: 'Regime fit',      v: signed(snap.regime_fit, 2),      ctx: 'vs late-cycle regime',           cls: cls(snap.regime_fit, true) });
  if (snap.earn_momentum != null)cells.push({ k: 'Earn momentum',   v: signed(snap.earn_momentum, 2),   ctx: 'EPS revisions trend',            cls: cls(snap.earn_momentum, true) });
  if (snap.valuation_sigma != null) cells.push({ k: 'Valuation σ',  v: signed(snap.valuation_sigma, 2), ctx: 'fwd P/E vs history',             cls: cls(snap.valuation_sigma, false) });
  if (snap.rel_strength_13w != null) cells.push({ k: 'Rel strength 13w', v: fmt((snap.rel_strength_13w || 0) * 100, 1) + 'pp', ctx: 'vs SPY trailing', cls: cls(snap.rel_strength_13w, true) });
  if (snap.top_3_tickers?.length)cells.push({ k: 'Top tickers',     v: snap.top_3_tickers.slice(0,3).join(' · '), ctx: 'by composite score', cls: 'good' });
  return cells;
}

// Render the 3-block narrative for any narrative entity — Regime, sector
// landscape, or (future) stock landscape. Section titles adapt per surface
// per NARRATIVE_BUILD_PLAN.md "Adapt vocabulary per surface".
function renderRegimeNarrativeBlocks(n, surface = 'regime') {
  if (!n) return '';
  const cr = n.currentReading?.text || '';
  const ident = n.identification || {};
  const rec = n.recommendation || {};
  const titles = {
    regime:           { id: "What's driving the regime",     rec: 'How to position' },
    sector_landscape: { id: 'What separates the sectors',    rec: 'Rotation stance' },
    stock_landscape:  { id: 'What separates the shortlist',  rec: 'Ranked picks (top 3)' },
    sector:           { id: "What's driving this sector",    rec: 'Tactical stance' },
  }[surface] || { id: "What's driving it", rec: 'How to position' };
  const bulletsHtml = (ident.bullets || []).map(b => `
    <div class="regime-bullet">
      <div class="regime-bullet-headline">${escapeHTML(b.headline || '')}</div>
      <div class="regime-bullet-body">
        <span class="regime-bullet-number">${escapeHTML(b.number || '')}</span>
        <span class="regime-bullet-event"> · ${escapeHTML(b.event || '')}</span>
      </div>
      <div class="regime-bullet-interp"><em>Interpretation:</em> ${escapeHTML(b.interpretation || '')}</div>
      ${b.source ? `<div class="regime-bullet-source">source: ${escapeHTML(b.source.table || '')}/${escapeHTML(b.source.id || '')}</div>` : ''}
    </div>
  `).join('');
  const signpostsHtml = (rec.signposts || []).map(s => `
    <div class="regime-signpost">
      <div class="regime-signpost-event">${escapeHTML(s.dated_event || '')} — ${escapeHTML(s.trigger || '')}</div>
      <div class="regime-signpost-detail">threshold: ${escapeHTML(s.threshold || '')}</div>
      <div class="regime-signpost-action">action: <strong>${escapeHTML(s.action || '')}</strong></div>
    </div>
  `).join('');
  const missing = (ident.missing_factors || []).length
    ? `<div class="regime-missing"><em>Factors not in input:</em> ${(ident.missing_factors || []).map(m => escapeHTML(m)).join('; ')}</div>`
    : '';
  return `
    <div class="ep-section">
      <div class="ep-section-title">Current reading</div>
      <div class="regime-current-reading">${escapeHTML(cr)}</div>
    </div>
    <div class="ep-section">
      <div class="ep-section-title">${titles.id}</div>
      ${bulletsHtml || '<div class="regime-empty">No identification bullets available.</div>'}
      ${missing}
    </div>
    <div class="ep-section">
      <div class="ep-section-title">${titles.rec}</div>
      <div class="regime-stance">${escapeHTML(rec.stance || '')}</div>
      ${signpostsHtml}
    </div>
  `;
}

async function openEntity(key) {
  const [kind, ...idParts] = key.split(':');
  const id = idParts.join(':');
  const entKey = `${kind}:${id}`;
  if (!ENTITIES[entKey]) {
    console.warn('No entity profile for', entKey);
    return;
  }
  // Apply API override for thesis/regime/score where possible. Preserves
  // everything else in the stub (business, snapshot, drivers, peers, etc.).
  // Null safety: if override fails, stub thesis renders as-is.
  let override = null;
  if (kind === 'sector') {
    // Sprint 3: pull per-sector narrative (current reading + identification +
    // recommendation + lede). Overlay the 3-block onto the entity profile.
    // Sprint 9: in parallel, pull the rich-data profile (composition, peers,
    // news, catalysts) from D1 and merge. Narrative owns thesis/business/
    // snapshot; profile owns every other section.
    // Trend override still runs below for long-term / tactical composition.
    const [n, prof] = await Promise.all([
      fetchSectorNarrative(id),
      fetchSectorProfile(id),
    ]);
    if (n) {
      const blocks = renderRegimeNarrativeBlocks(n, 'sector');
      ENTITIES[entKey] = {
        ...ENTITIES[entKey],
        thesis: n.lede ? `<strong>${escapeHTML(n.lede)}</strong>` : ENTITIES[entKey].thesis,
        business: blocks,
        drivers: [],
        risks: [],
        snapshot: buildSectorSnapshot(n),
        _sectorNarrative: n,
      };
    }
    if (prof) {
      ENTITIES[entKey] = {
        ...ENTITIES[entKey],
        composition: prof.composition.length ? prof.composition : ENTITIES[entKey].composition,
        peersTable: prof.peersTable.rows.length ? prof.peersTable : ENTITIES[entKey].peersTable,
        catalysts: prof.catalysts.length ? prof.catalysts : ENTITIES[entKey].catalysts,
        news: prof.news,
        _sectorProfile: prof,
      };
    }
    override = await fetchSectorTrendOverride(id);
  } else if (kind === 'stock') {
    // Sprint 5: pull per-stock narrative (long + tactical horizons).
    // Sprint 9: also pull rich-data profile (epsHistory, filings, peers, ...).
    // Sprint 12: also pull valuation curves (price + short fair + long fair)
    //            for the overlay chart on the stock page.
    // Narrative owns thesis/business/snapshot; profile owns other sections;
    // valuation owns the price/fair-value overlay chart.
    const [n, prof, valuation] = await Promise.all([
      fetchStockNarrative(id),
      fetchStockProfile(id),
      fetchValuationCurve(id),
    ]);
    if (n) {
      n._ticker = id;
      const blocks = renderStockNarrativeTabs(n);
      ENTITIES[entKey] = {
        ...ENTITIES[entKey],
        thesis: n.lede ? `<strong>${escapeHTML(n.lede)}</strong>` : ENTITIES[entKey].thesis,
        business: blocks,
        drivers: [],
        risks: [],
        snapshot: buildStockSnapshot(n),
        _stockNarrative: n,
      };
    }
    if (prof) {
      ENTITIES[entKey] = {
        ...ENTITIES[entKey],
        epsHistory: prof.epsHistory,
        filings: prof.filings,
        peers: prof.peers.rows.length ? prof.peers : ENTITIES[entKey].peers,
        catalysts: prof.catalysts.length ? prof.catalysts : ENTITIES[entKey].catalysts,
        news: prof.news,
        _stockProfile: prof,
      };
    }
    if (valuation) {
      ENTITIES[entKey] = {
        ...ENTITIES[entKey],
        _valuation: valuation,
      };
    }
    override = await fetchTickerTrendOverride(id);
  } else if (kind === 'indicator' && id === 'Regime') {
    // Sprint 1: pull regime narrative and replace thesis/business/drivers
    // with the 3-block structure.
    const n = await fetchRegimeNarrative();
    if (n) {
      const blocks = renderRegimeNarrativeBlocks(n, 'regime');
      ENTITIES[entKey] = {
        ...ENTITIES[entKey],
        thesis: n.lede ? `<strong>${escapeHTML(n.lede)}</strong>` : ENTITIES[entKey].thesis,
        business: blocks,        // 3-block HTML rendered where "What this indicator measures" used to live
        drivers: [],              // killed: subsumed by identification
        risks: [],                // killed: subsumed by recommendation signposts
        _regimeNarrative: n,
      };
    }
  } else if (kind === 'landscape' && id === 'sector') {
    // Sprint 2: pull sector-landscape narrative and overlay 3 comparative blocks.
    const n = await fetchSectorLandscapeNarrative();
    if (n) {
      const blocks = renderRegimeNarrativeBlocks(n, 'sector_landscape');
      ENTITIES[entKey] = {
        ...ENTITIES[entKey],
        thesis: n.lede ? `<strong>${escapeHTML(n.lede)}</strong>` : ENTITIES[entKey].thesis,
        business: blocks,
        drivers: [],
        risks: [],
        snapshot: buildLandscapeSnapshot(n),
        _landscapeNarrative: n,
      };
    }
  } else if (kind === 'landscape' && id === 'stock') {
    // Sprint 4: pull stock-landscape narrative and overlay 3 comparative blocks.
    const n = await fetchStockLandscapeNarrative();
    if (n) {
      const blocks = renderRegimeNarrativeBlocks(n, 'stock_landscape');
      ENTITIES[entKey] = {
        ...ENTITIES[entKey],
        thesis: n.lede ? `<strong>${escapeHTML(n.lede)}</strong>` : ENTITIES[entKey].thesis,
        business: blocks,
        drivers: [],
        risks: [],
        snapshot: buildStockLandscapeSnapshot(n),
        _stockLandscapeNarrative: n,
      };
    }
  }
  if (override?.thesis) {
    // Compose long + tactical into a single thesis HTML blob the existing
    // renderer can consume. API thesis is plain text — safe to inline.
    let composed = `<strong>Long-term view:</strong> ${escapeHTML(override.thesis)}`;
    if (override.shortThesis) {
      const trig = override.shortTrigger
        ? ` <span style="color:var(--text-3)">(trigger: ${escapeHTML(override.shortTrigger)}${override.shortTriggerDetail ? " — " + escapeHTML(override.shortTriggerDetail) : ""})</span>`
        : "";
      composed += `<div style="margin-top:8px"><strong>Tactical (1–2 wk):</strong> ${escapeHTML(override.shortThesis)}${trig}</div>`;
    }
    ENTITIES[entKey] = {
      ...ENTITIES[entKey],
      thesis: composed,
      _apiOverride: override,
    };
  }
  appState.entity = { kind, id, key: entKey };
  appState.entitySub = 'overview';
  renderEntityView();
  document.getElementById('tabView').classList.add('hidden');
  document.getElementById('entityView').classList.remove('hidden');
  document.querySelector('.main-content').scrollTop = 0;
}

function closeEntity() {
  appState.entity = null;
  document.getElementById('entityView').classList.add('hidden');
  document.getElementById('tabView').classList.remove('hidden');
}

/* ============================================================
   PROVENANCE POPOVER
   ============================================================ */
function showProvPopover(key, anchorEl) {
  const prov = PROV[key];
  if (!prov) return;
  const pop = document.getElementById('provPopover');
  const backdrop = document.getElementById('provBackdrop');
  const histSvg = prov.history ? renderSpark(prov.history, '100%', 50, 'var(--blue)') : '';

  let inputsHtml = '';
  if (prov.inputs && prov.inputs.length) {
    inputsHtml = `
      <div class="prov-pop-sect">
        <div class="st">Inputs</div>
        ${prov.inputs.map(i => `
          <div class="prov-input">
            <span class="iname">${i.name}</span>
            <span class="ival">${i.val}</span>
          </div>
        `).join('')}
      </div>
    `;
  }
  let sourcesHtml = '';
  if (prov.sources && prov.sources.length) {
    sourcesHtml = `
      <div class="prov-pop-sect">
        <div class="st">Sources</div>
        ${prov.sources.map(s => `
          <div class="prov-source">
            <span class="ico">📄</span>
            <span class="title">${s.title}</span>
            <span class="date">${s.date}</span>
          </div>
        `).join('')}
      </div>
    `;
  }
  let histHtml = '';
  if (prov.history) {
    histHtml = `
      <div class="prov-pop-sect">
        <div class="st">History · last 30d</div>
        <svg class="prov-hist-svg" viewBox="0 0 200 50" preserveAspectRatio="none">${histSvg}</svg>
      </div>
    `;
  }

  pop.innerHTML = `
    <div class="prov-pop-head">
      <div class="t">${prov.title}</div>
      <button class="prov-pop-close" id="provClose">×</button>
    </div>
    <div class="prov-pop-value">
      <div class="val ${prov.valCls || ''}">${prov.value}</div>
      <div class="def">${prov.definition || ''}</div>
    </div>
    <div class="prov-pop-sect">
      <div class="prov-meta-row"><span class="k">As of</span><span class="v">${prov.asOf || '—'}</span></div>
      <div class="prov-meta-row"><span class="k">Produced by</span><span class="v">${prov.producedBy || '—'}</span></div>
    </div>
    ${inputsHtml}
    ${sourcesHtml}
    ${histHtml}
  `;

  // Position: anchored to the clicked element, preferring right side
  pop.classList.remove('hidden');
  backdrop.classList.remove('hidden');
  const rect = anchorEl.getBoundingClientRect();
  const popW = 320, popH = pop.offsetHeight;
  let left = rect.right + 8;
  if (left + popW > window.innerWidth - 10) {
    left = Math.max(10, rect.left - popW - 8);
  }
  let top = rect.top;
  if (top + popH > window.innerHeight - 10) {
    top = Math.max(10, window.innerHeight - popH - 10);
  }
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';

  document.getElementById('provClose').addEventListener('click', hideProvPopover);
}

function hideProvPopover() {
  document.getElementById('provPopover').classList.add('hidden');
  document.getElementById('provBackdrop').classList.add('hidden');
}

/* Helper to build a sparkline path */
function renderSpark(arr, w, h, color) {
  if (!arr || !arr.length) return '';
  const mn = Math.min(...arr), mx = Math.max(...arr);
  const rng = mx - mn || 1;
  const W = typeof w === 'number' ? w : 200;
  const pts = arr.map((v, i) => {
    const x = (i / (arr.length - 1)) * W;
    const y = h - 2 - ((v - mn) / rng) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`;
}


/* ============================================================
   ENTITY VIEW RENDERER (full-screen stock/sector/indicator page)
   ============================================================ */
function renderEntityView() {
  const ent = appState.entity;
  if (!ent) return;
  const data = ENTITIES[ent.key];
  const container = document.getElementById('entityView');

  const kindTag = ent.kind.toUpperCase();
  const upLinkHtml = data.upLevel
    ? `<button class="ep-uplink" data-open="${data.upLevel.key}">${data.upLevel.label}</button>`
    : '';

  let bodyHtml;
  if      (data.kind === 'stock')     bodyHtml = renderStockPage(data);
  else if (data.kind === 'sector')    bodyHtml = renderSectorPage(data);
  else                                bodyHtml = renderIndicatorPage(data);

  container.innerHTML = `
    <div class="ep-topbar">
      <button class="ep-back" id="epBack">Back to ${appState.tab}</button>
      <div class="ep-title-block">
        <div class="ep-title-row">
          <span class="ep-ticker">${data.ticker}</span>
          <span class="ep-name">${data.name}</span>
          <span class="ep-kind-tag">${kindTag}</span>
        </div>
        <div class="ep-snap">
          <span class="px">${data.snap.price}</span>
          <span class="chg ${data.snap.chgCls || ''}">${data.snap.chg}</span>
          <span class="pos">${data.snap.position}</span>
        </div>
      </div>
      ${upLinkHtml}
    </div>
    <div id="epBody">${bodyHtml}</div>
  `;

  document.getElementById('epBack').addEventListener('click', closeEntity);
  drawEntityCharts(data);
  bindStockNarrativeTabs();
  // Regime detail view migrated panels: 12-indicator board + latest events.
  // Both depend on data already populated by bootstrapCalendar / hardcoded
  // DATA.macroIndicators (board source upgrade tracked in audit).
  if (data.kind === 'indicator' && data.ticker === 'Regime') {
    if (typeof renderMacroIndicators === 'function' && document.getElementById('macroIndicators')) {
      renderMacroIndicators();
    }
    renderRegimeLatestEvents();
  }
}

function renderStockPage(d) {
  return `
    ${stockOverviewSection(d)}
    <div class="ep-divider"><span>Valuation curves vs price</span></div>
    ${stockValuationCurveSection(d)}
    <div class="ep-divider"><span>Financials</span></div>
    ${stockFinancialsSection(d)}
    <div class="ep-divider"><span>SEC Filings &amp; Press Releases</span></div>
    ${stockFilingsSection(d)}
    <div class="ep-divider"><span>Same-sector peers</span></div>
    ${stockPeersSection(d)}
    <div class="ep-divider"><span>News in this trend period</span></div>
    ${trendNewsSection(d)}
  `;
}

// Sprint 12: 3-line overlay — price + short fair + long fair. The long
// curve is a step function (flat between reviews). Click a review dot to
// see the rationale. Empty-state caption when data is thin.
function stockValuationCurveSection(d) {
  const v = d._valuation;
  if (!v || !v.price_history || v.price_history.length === 0) {
    return `<div class="ep-section"><div class="ep-section-title">Valuation curves</div>
              <div class="ep-business" style="color:var(--text-3)">No valuation history yet — long curve bootstraps on first review.</div>
            </div>`;
  }

  const latestLong = v.long_curve && v.long_curve.length
    ? v.long_curve[v.long_curve.length - 1]
    : null;
  const latestShort = v.short_curve && v.short_curve.length
    ? v.short_curve[v.short_curve.length - 1]
    : null;
  const latestPrice = v.price_history[v.price_history.length - 1]?.close;

  const longLine = latestLong
    ? `<div class="val-kpi">
         <div class="k">Long fair</div>
         <div class="v">$${Number(latestLong.fair_value).toFixed(2)}</div>
         <div class="ctx ${latestLong.deviation_pct > 0 ? 'good' : 'bad'}">
           ${latestLong.deviation_pct > 0 ? '+' : ''}${Number(latestLong.deviation_pct).toFixed(1)}% vs market
         </div>
       </div>`
    : `<div class="val-kpi"><div class="k">Long fair</div><div class="v">—</div><div class="ctx">pending review</div></div>`;
  const shortLine = latestShort
    ? `<div class="val-kpi">
         <div class="k">Short fair</div>
         <div class="v">$${Number(latestShort.fair_value).toFixed(2)}</div>
         <div class="ctx">${latestShort.adjustment_pct != null ? (latestShort.adjustment_pct > 0 ? '+' : '') + Number(latestShort.adjustment_pct).toFixed(1) + '% vs baseline' : 'baseline'}</div>
       </div>`
    : `<div class="val-kpi"><div class="k">Short fair</div><div class="v">—</div><div class="ctx">no recent events</div></div>`;
  const priceLine = latestPrice != null
    ? `<div class="val-kpi">
         <div class="k">Market</div>
         <div class="v">$${Number(latestPrice).toFixed(2)}</div>
         <div class="ctx">latest close</div>
       </div>`
    : '';

  const rationale = latestLong?.rationale
    ? `<div class="val-rationale">
         <div class="val-r-head">Latest long review · ${latestLong.as_of?.slice(0,10) || ''} · trigger: ${latestLong.trigger_reason || 'manual'}</div>
         <div class="val-r-body">${escapeHTML(latestLong.rationale)}</div>
       </div>`
    : '';

  return `
    <div class="ep-section">
      <div class="val-kpi-row">${priceLine}${shortLine}${longLine}</div>
      <svg class="ep-fin-svg val-chart-svg" id="valCurveSvg" viewBox="0 0 720 260" preserveAspectRatio="none"></svg>
      <div class="val-legend">
        <span class="leg-dot" style="background:var(--blue)"></span> Stock price
        <span class="leg-dot" style="background:var(--green)"></span> Long fair value (step — reviewed on events)
        <span class="leg-dot" style="background:var(--yellow)"></span> Short fair value (event-driven)
      </div>
      ${rationale}
    </div>
  `;
}

// Sprint 9: renders peers.headers / peers.rows (populated by fetchStockProfile
// from STOCK_FACTORS_daily rows in the same sector). Empty-state when rows==0.
function stockPeersSection(d) {
  const table = d.peers;
  if (!table || !Array.isArray(table.rows) || table.rows.length === 0) {
    return `<div class="ep-section"><div class="ep-section-title">Peers</div>
              <div class="ep-business" style="color:var(--text-3)">No same-sector peer data available.</div>
            </div>`;
  }
  const { headers = [], rows = [] } = table;
  return `
    <div class="ep-section">
      <div class="ep-section-title">Same-sector peers <span class="note">· factor-level · click ticker to open profile</span></div>
      <table class="peers-table">
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map(r => {
            const nameCell = r.ref ? `<td data-open="${r.ref}">${r.name}</td>` : `<td>${r.name}</td>`;
            const cells = (r.cells || []).map(c => `<td>${c}</td>`).join('');
            const rowCls = r.me ? 'me' : (r.inBook ? 'in-book' : '');
            return `<tr class="${rowCls}">${nameCell}${cells}</tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderSectorPage(d) {
  return `
    <div class="sector-page-layout">
      <div class="sector-main">
        <div class="ep-thesis">${d.thesis}</div>
        <div class="ep-section">
          <div class="ep-section-title">Sector definition</div>
          <div class="ep-business">${d.business}</div>
        </div>
        <div class="ep-section">
          <div class="ep-section-title">Key metrics</div>
          <div class="ep-snapshot-grid">
            ${d.snapshot.map(s => `
              <div class="ep-snap-cell">
                <div class="k">${s.k}</div>
                <div class="v ${s.cls}">${s.v}</div>
                <div class="ctx">${s.ctx || ''}</div>
              </div>
            `).join('')}
          </div>
        </div>
        ${sectorDriversSection(d)}
        ${sectorCatalystsSection(d)}
        ${sectorPeersSection(d)}
        <div class="ep-divider"><span>News in this trend period</span></div>
        ${trendNewsSection(d)}
      </div>
      <aside class="sector-side">
        ${sectorCompositionSide(d)}
      </aside>
    </div>
  `;
}

function renderIndicatorPage(d) {
  return `
    <div class="ep-thesis">${d.thesis}</div>
    <div class="ep-section">
      <div class="ep-section-title">What this indicator measures</div>
      <div class="ep-business">${d.business}</div>
    </div>
    <div class="ep-section">
      <div class="ep-section-title">Current reading</div>
      <div class="ep-snapshot-grid">
        ${d.snapshot.map(s => `
          <div class="ep-snap-cell">
            <div class="k">${s.k}</div>
            <div class="v ${s.cls}">${s.v}</div>
            <div class="ctx">${s.ctx || ''}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ${regimeExtraSections(d)}
    ${sectorDriversSection(d)}
    ${indicatorReleaseSection(d)}
    ${indicatorHistorySection(d)}
  `;
}

// Sections only shown when opening the Regime indicator: the 12-indicator
// macro board (migrated from the dropped Macro tab) and a "latest releases
// & events" mini-list pulled from DATA.calendarEvents.
function regimeExtraSections(d) {
  if (d.kind !== 'indicator' || d.ticker !== 'Regime') return '';
  return `
    <div class="ep-section">
      <div class="ep-section-title">Macro indicator board</div>
      <div class="macro-indicators-grid" id="macroIndicators"></div>
    </div>
    <div class="ep-section">
      <div class="ep-section-title">Latest releases &amp; upcoming events</div>
      <div id="regimeLatestEvents" class="event-calendar"></div>
    </div>
  `;
}

// Renders into #regimeLatestEvents (inside the regime detail view). Pulls
// from DATA.calendarEvents, which is populated by bootstrapCalendar(). Shows
// 4 most-recent past + 4 closest upcoming, sorted chronologically.
function renderRegimeLatestEvents() {
  const host = document.getElementById('regimeLatestEvents');
  if (!host) return;
  const events = DATA.calendarEvents || [];
  if (events.length === 0) {
    host.innerHTML = '<div style="color:var(--text-3);font-size:0.75rem;padding:8px 4px;">No event data — calendar bootstrap returned empty.</div>';
    return;
  }
  const todayISOStr = new Date().toISOString().slice(0, 10);
  const past = events.filter(e => e.date < todayISOStr).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const upcoming = events.filter(e => e.date >= todayISOStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const merged = [...past.reverse(), ...upcoming];
  host.innerHTML = merged.map(e => {
    const cls = e.type === 'fomc' ? 'fomc' : e.type === 'earn' ? 'earn' : 'macro';
    const upcomingPill = e.date >= todayISOStr ? '<span style="color:var(--blue);font-size:0.6rem;margin-left:6px;">upcoming</span>' : '';
    return `<div class="event-card">
      <div class="event-date">${escapeHTML(e.date)}</div>
      <div class="event-body">
        <div class="event-title">${escapeHTML(e.title)}${upcomingPill}</div>
        ${e.sub ? `<div class="event-sub" style="color:var(--text-3);font-size:0.7rem;">${escapeHTML(e.sub)}</div>` : ''}
      </div>
      <div class="event-tag ${cls}">${e.type}</div>
    </div>`;
  }).join('');
}

/* ---------- section helpers (composed into *Page renderers above) ---------- */

function stockOverviewSection(d) {
  const epsBarsHtml = d.epsHistory.map(q => {
    if (q.act === null) {
      return `<div class="ep-eps-bar"><div class="bar-est" style="height:${(q.est/Math.max(...d.epsHistory.filter(x=>x.act!==null).map(x=>x.act)))*100}%"></div><div class="qlab">${q.q}</div></div>`;
    }
    const max = Math.max(...d.epsHistory.filter(x => x.act !== null).map(x => Math.max(x.est, x.act)));
    const estPct = (q.est / max) * 100;
    const actPct = (q.act / max) * 100;
    return `<div class="ep-eps-bar ${q.beat ? '' : 'miss'}">
      <div class="bar-est" style="height:${estPct}%"></div>
      <div class="bar-act" style="height:${actPct}%"></div>
      <div class="qlab">${q.q}</div>
    </div>`;
  }).join('');
  return `
    <div class="ep-thesis">${d.thesis}</div>
    <div class="ep-section">
      <div class="ep-section-title">Business</div>
      <div class="ep-business">${d.business}</div>
    </div>
    <div class="ep-section">
      <div class="ep-section-title">Key metrics <span class="note">· latest quarter</span></div>
      <div class="ep-snapshot-grid">
        ${d.snapshot.map(s => `
          <div class="ep-snap-cell">
            <div class="k">${s.k}</div>
            <div class="v ${s.cls}">${s.v}</div>
            <div class="ctx">${s.ctx || ''}</div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="ep-grid-2">
      <div class="ep-section">
        <div class="ep-section-title">Catalysts</div>
        ${d.catalysts.map(c => `
          <div class="ep-catalyst">
            <span class="dot ${c.tone}"></span>
            <span class="date">${c.date}</span>
            <span class="text">${c.text}</span>
          </div>
        `).join('')}
      </div>
      <div class="ep-section">
        <div class="ep-section-title">Risks</div>
        ${d.risks.map(r => `<div class="ep-risk">${r}</div>`).join('')}
      </div>
    </div>
    <div class="ep-section">
      <div class="ep-section-title">EPS beats vs estimates <span class="note">· last 9 quarters</span></div>
      <div class="ep-eps-bars">${epsBarsHtml}</div>
    </div>
  `;
}

function stockFinancialsSection(d) {
  return `
    <div class="ep-section">
      <div class="ep-section-title">Financial history <span class="note">· last 6 fiscal years</span></div>
      <div class="ep-fin-grid">
        <div class="ep-fin-chart">
          <div class="title">Revenue ($B)</div>
          <div class="sub">FY20 → FY25</div>
          <svg class="ep-fin-svg" id="finRevSvg" viewBox="0 0 300 140" preserveAspectRatio="none"></svg>
        </div>
        <div class="ep-fin-chart">
          <div class="title">Operating margin (%)</div>
          <div class="sub">FY20 → FY25</div>
          <svg class="ep-fin-svg" id="finMgnSvg" viewBox="0 0 300 140" preserveAspectRatio="none"></svg>
        </div>
        <div class="ep-fin-chart">
          <div class="title">EPS ($)</div>
          <div class="sub">FY20 → FY25</div>
          <svg class="ep-fin-svg" id="finEpsSvg" viewBox="0 0 300 140" preserveAspectRatio="none"></svg>
        </div>
        <div class="ep-fin-chart">
          <div class="title">Free cash flow ($B)</div>
          <div class="sub">FY20 → FY25</div>
          <svg class="ep-fin-svg" id="finFcfSvg" viewBox="0 0 300 140" preserveAspectRatio="none"></svg>
        </div>
      </div>
    </div>
    <div class="ep-section">
      <div class="ep-section-title">Annual data table</div>
      <table class="ep-fin-table">
        <thead><tr><th>Year</th>${d.financials.revenue.map(r => `<th>${r.y}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><td>Revenue ($B)</td>${d.financials.revenue.map(r => `<td>${r.v}</td>`).join('')}</tr>
          <tr><td>Op margin (%)</td>${d.financials.margin.map(r => `<td>${r.v}</td>`).join('')}</tr>
          <tr><td>EPS ($)</td>${d.financials.eps.map(r => `<td>${r.v}</td>`).join('')}</tr>
          <tr><td>FCF ($B)</td>${d.financials.fcf.map(r => `<td>${r.v}</td>`).join('')}</tr>
        </tbody>
      </table>
    </div>
  `;
}

function stockFilingsSection(d) {
  return `
    <div class="ep-section">
      <div class="ep-section-title">SEC filings <span class="note">· summarized · lede + bullets per filing</span></div>
      ${d.filings.map(f => `
        <div class="filing-card">
          <div class="filing-head">
            <span class="filing-type">${f.type}</span>
            <span class="filing-title">${f.title}</span>
            <span class="filing-meta">${f.date} · ${f.period}</span>
          </div>
          <div class="filing-lede">${f.lede}</div>
          <ul class="filing-bullets">
            ${f.bullets.map(b => `<li>${b}</li>`).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
  `;
}

function sectorDriversSection(d) {
  const drivers = d.drivers || [];
  const risks = d.risks || [];
  if (!drivers.length && !risks.length) return '';
  return `
    ${drivers.length ? `<div class="ep-section">
      <div class="ep-section-title">Structural &amp; cyclical drivers</div>
      ${drivers.map(dr => `<div class="ep-catalyst"><span class="dot neu"></span><span class="date">driver</span><span class="text">${dr}</span></div>`).join('')}
    </div>` : ''}
    ${risks.length ? `<div class="ep-section">
      <div class="ep-section-title">Risk vectors</div>
      ${risks.map(r => `<div class="ep-risk">${r}</div>`).join('')}
    </div>` : ''}
  `;
}

function sectorCatalystsSection(d) {
  const catalysts = d.catalysts || [];
  if (!catalysts.length) return '';
  return `
    <div class="ep-section">
      <div class="ep-section-title">Upcoming catalysts</div>
      ${catalysts.map(c => `
        <div class="ep-catalyst">
          <span class="dot ${c.tone}"></span>
          <span class="date">${c.date}</span>
          <span class="text">${c.text}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function sectorPeersSection(d) {
  if (!d.peersTable) return '';
  const { headers, rows } = d.peersTable;
  return `
    <div class="ep-section">
      <div class="ep-section-title">Peer comparison <span class="note">· book holdings highlighted · click ticker to open profile</span></div>
      <table class="peers-table">
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map(r => {
            const nameCell = r.ref ? `<td data-open="${r.ref}">${r.name}</td>` : `<td>${r.name}</td>`;
            const cells = (r.cells || []).map(c => `<td>${c}</td>`).join('');
            return `<tr class="${r.inBook ? 'me' : ''}">${nameCell}${cells}</tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function sectorCompositionSide(d) {
  const items = d.composition || [];
  if (!items.length) return '';
  return `
    <div class="side-panel">
      <div class="side-panel-title">Book composition</div>
      <div class="side-panel-sub">${items.filter(c => c.weight > 0).length} holdings · click for profile</div>
      <div class="side-comp-head">
        <span>Ticker</span><span>Wt</span><span>Score</span>
      </div>
      ${items.map(c => `
        <div class="side-comp-row" ${c.ref ? `data-open="${c.ref}"` : ''}>
          <span class="tk">${c.ticker}</span>
          <span class="wt ${c.weight > 0 ? '' : 'dim'}">${c.weight > 0 ? c.weight.toFixed(1) + '%' : '—'}</span>
          <span class="sc">${c.score.toFixed(2)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function indicatorHistorySection(d) {
  if (!d.trajectory || !d.trajectory.length) return '';
  const isCategorical = typeof d.trajectory[0].v === 'string';
  const title = isCategorical ? 'Regime transitions' : d.name;
  const sub = isCategorical
    ? `${d.trajectory.length} snapshots · colored by regime state`
    : `${d.trajectory.length} observations · values on Y, time on X`;
  const chartHeight = isCategorical ? 220 : 200;
  return `
    <div class="ep-section">
      <div class="ep-section-title">Long-term history</div>
      <div class="ep-fin-chart">
        <div class="title">${title}</div>
        <div class="sub">${sub}</div>
        <svg class="ep-fin-svg" id="indHistSvg" preserveAspectRatio="none" style="height:${chartHeight}px"></svg>
      </div>
    </div>
  `;
}

function indicatorReleaseSection(d) {
  const rel = DATA.releases.find(r => r.id === d.recentRelease);
  if (!rel) return '';
  return `
    <div class="ep-section">
      <div class="ep-section-title">Most recent release <span class="note">· summarized</span></div>
      <div class="release-card" style="margin:0;">
        <div class="release-card-head">
          <h4>${rel.type}</h4>
          <span class="meta">${rel.date} · ${rel.daysAgo === 0 ? 'today' : rel.daysAgo + 'd ago'}</span>
        </div>
        <div class="release-lede">${rel.lede}</div>
        <ul class="release-bullets">
          ${rel.bullets.map(b => `<li>${b}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}

function trendNewsSection(d) {
  const items = (d.trendNews && d.trendNews.length) ? d.trendNews : (d.news || []);
  const window = d.trendPeriod || defaultTrendWindow(d);
  if (!items.length) {
    return `<div class="ep-business" style="text-align:center;padding:24px;color:var(--text-3);">No news items tagged to this trend period yet.</div>`;
  }
  return `
    <div class="ep-section">
      <div class="trend-news-head">
        <div class="trend-window">
          <span class="lbl">Trend window</span>
          <span class="val">${window}</span>
        </div>
        <div class="trend-explain">Only news items that helped shape the current ${d.kind} trend — not the raw daily stream.</div>
      </div>
      ${items.map(n => `
        <div class="news-item">
          <div class="news-item-head">
            <div class="news-item-title">${n.title}</div>
            <span class="news-sentiment ${n.sent}">${n.sent === 'pos' ? '+' : n.sent === 'neg' ? '−' : '•'} ${Math.abs(n.score).toFixed(2)}</span>
          </div>
          <div class="news-item-meta">
            <span>${n.src}</span>
            <span>·</span>
            <span>${n.date}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function defaultTrendWindow(d) {
  if (d.kind === 'stock')     return 'Since thesis opened · ~30–90d';
  if (d.kind === 'sector')    return 'Current regime window · since 2026-02-14';
  return 'Since last regime transition · 62d';
}

function drawEntityCharts(d) {
  // Called once per entity page render — draw every chart that's on the page.
  if (d.kind === 'stock') {
    drawLineChart('finRevSvg', d.financials.revenue, 'var(--green)');
    drawLineChart('finMgnSvg', d.financials.margin,  'var(--blue)');
    drawLineChart('finEpsSvg', d.financials.eps,     'var(--yellow)');
    drawLineChart('finFcfSvg', d.financials.fcf,     'var(--cyan)');
    if (d._valuation) drawValuationCurve('valCurveSvg', d._valuation);
  } else if (d.kind === 'indicator' && d.trajectory && d.trajectory.length) {
    const isCategorical = typeof d.trajectory[0].v === 'string';
    if (isCategorical) drawRegimeTimeline('indHistSvg', d.trajectory);
    else               drawLineChartWide('indHistSvg', d.trajectory, 'var(--blue)');
  }
}

function drawLineChartWide(id, series, color) {
  const svg = document.getElementById(id);
  if (!svg) return;
  const W = 600, H = 200, pad = 28;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const vals = series.map(s => s.v);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const rng = mx - mn || 1;
  const pts = series.map((s, i) => {
    const x = pad + (i / (series.length - 1)) * (W - 2*pad);
    const y = H - pad - ((s.v - mn) / rng) * (H - 2*pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePts = pts.join(' ');
  const areaPts = `${pad},${H-pad} ${linePts} ${W-pad},${H-pad}`;
  // Y-axis ticks at min / mid / max
  const yTicks = [mn, (mn+mx)/2, mx].map(v => {
    const y = H - pad - ((v - mn) / rng) * (H - 2*pad);
    return `
      <line x1="${pad}" y1="${y.toFixed(1)}" x2="${W-pad}" y2="${y.toFixed(1)}" stroke="var(--bg-3)" stroke-dasharray="1,4"/>
      <text x="${pad-4}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--text-3)" font-family="ui-monospace">${v.toFixed(2)}</text>
    `;
  }).join('');
  // X-axis labels: first, ~25%, ~50%, ~75%, last
  const stride = Math.max(1, Math.floor(series.length / 5));
  const xLabels = series.map((s, i) => {
    if (i % stride !== 0 && i !== series.length - 1) return '';
    const x = pad + (i / (series.length - 1)) * (W - 2*pad);
    return `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="var(--text-3)" font-size="9" font-family="ui-monospace">${s.y}</text>`;
  }).join('');
  const valDots = series.map((s, i) => {
    const x = pad + (i / (series.length - 1)) * (W - 2*pad);
    const y = H - pad - ((s.v - mn) / rng) * (H - 2*pad);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}"/>`;
  }).join('');
  const last = series[series.length - 1];
  const lx = pad + (W - 2*pad);
  const ly = H - pad - ((last.v - mn) / rng) * (H - 2*pad);
  svg.innerHTML = `
    ${yTicks}
    <polygon points="${areaPts}" fill="${color}" fill-opacity="0.14"/>
    <polyline points="${linePts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${valDots}
    ${xLabels}
    <text x="${(lx-6).toFixed(1)}" y="${(ly-8).toFixed(1)}" text-anchor="end" font-size="10" fill="${color}" font-weight="600" font-family="ui-monospace">${last.v}</text>
  `;
}

// Sprint 12: valuation-curve overlay — 3 lines (price, short, long) on a
// shared time axis. Long curve is a step function (flat between reviews).
// Short curve is a thin polyline connecting event-triggered points.
// Review dates get filled dots.
function drawValuationCurve(id, data) {
  const svg = document.getElementById(id);
  if (!svg) return;
  const price = data.price_history || [];
  if (!price.length) { svg.innerHTML = ''; return; }

  const W = 720, H = 260, pad = 40;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Time axis — discrete trading days from price_history; dates → x position.
  const firstDate = new Date(price[0].date).getTime();
  const lastDate  = new Date(price[price.length - 1].date).getTime();
  const dateSpan  = Math.max(1, lastDate - firstDate);
  const xOf = (iso) => pad + ((new Date(iso).getTime() - firstDate) / dateSpan) * (W - 2*pad);

  // Y axis — combine price + all fair values to a common range.
  const vals = [...price.map(p => p.close)];
  (data.long_curve || []).forEach(r => vals.push(r.fair_value));
  (data.short_curve || []).forEach(r => vals.push(r.fair_value));
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const rng = (mx - mn) || 1;
  const pad_v = rng * 0.08;
  const yOf = (v) => H - pad - ((v - (mn - pad_v)) / (rng + 2*pad_v)) * (H - 2*pad);

  // Price line.
  const pricePts = price.map(p => `${xOf(p.date).toFixed(1)},${yOf(p.close).toFixed(1)}`).join(' ');

  // Long curve = step function. Extend the latest value out to the right edge
  // so the visible long-fair line spans to "today".
  const longPts = [];
  const longDots = [];
  const longs = (data.long_curve || []).slice().sort((a, b) => a.as_of.localeCompare(b.as_of));
  for (let i = 0; i < longs.length; i++) {
    const r = longs[i];
    const x1 = xOf(r.as_of);
    const y  = yOf(r.fair_value);
    const x2 = i < longs.length - 1 ? xOf(longs[i+1].as_of) : xOf(price[price.length - 1].date);
    longPts.push(`M${x1.toFixed(1)},${y.toFixed(1)} L${x2.toFixed(1)},${y.toFixed(1)}`);
    longDots.push(`<circle cx="${x1.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="var(--green)" stroke="var(--bg-0)" stroke-width="1.5"/>`);
  }

  // Short curve = simple polyline through event-triggered points.
  const shorts = (data.short_curve || []).slice().sort((a, b) => a.as_of.localeCompare(b.as_of));
  const shortPts = shorts.map(r => `${xOf(r.as_of).toFixed(1)},${yOf(r.fair_value).toFixed(1)}`).join(' ');

  // Y-ticks at min/mid/max of VALUES (not y-pixels).
  const yTickVals = [mn, (mn+mx)/2, mx];
  const yTicks = yTickVals.map(v => {
    const y = yOf(v);
    return `<line x1="${pad}" y1="${y.toFixed(1)}" x2="${W-pad}" y2="${y.toFixed(1)}" stroke="var(--bg-3)" stroke-dasharray="1,4"/>
            <text x="${pad-4}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--text-3)" font-family="ui-monospace">$${v.toFixed(0)}</text>`;
  }).join('');

  // X-axis labels: first, quartiles, last.
  const stride = Math.max(1, Math.floor(price.length / 5));
  const xLabels = price.map((p, i) => {
    if (i % stride !== 0 && i !== price.length - 1) return '';
    const x = xOf(p.date);
    return `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="var(--text-3)" font-size="9" font-family="ui-monospace">${p.date.slice(5)}</text>`;
  }).join('');

  svg.innerHTML = `
    ${yTicks}
    <polyline points="${pricePts}" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-linejoin="round"/>
    ${longPts.map(p => `<path d="${p}" stroke="var(--green)" stroke-width="2" fill="none"/>`).join('')}
    ${longDots.join('')}
    ${shortPts ? `<polyline points="${shortPts}" fill="none" stroke="var(--yellow)" stroke-width="1.5" stroke-dasharray="3,3"/>` : ''}
    ${shorts.map(r => `<circle cx="${xOf(r.as_of).toFixed(1)}" cy="${yOf(r.fair_value).toFixed(1)}" r="2.5" fill="var(--yellow)"/>`).join('')}
    ${xLabels}
  `;
}

function drawRegimeTimeline(id, trajectory) {
  const svg = document.getElementById(id);
  if (!svg) return;
  const W = 720, H = 220;
  const padL = 130, padR = 14, padT = 14, padB = 32;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const lanes  = ['Early-c', 'Mid-c', 'Late-c', 'Recession', 'Reflation'];
  const labels = {
    'Early-c':   'Early-cycle bull',
    'Mid-c':     'Mid-cycle bull',
    'Late-c':    'Late-cycle caution',
    'Recession': 'Recession',
    'Reflation': 'Reflation'
  };
  const colors = {
    'Early-c':   'var(--green)',
    'Mid-c':     'var(--blue)',
    'Late-c':    'var(--yellow)',
    'Recession': 'var(--red)',
    'Reflation': 'var(--orange)'
  };

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const laneH  = innerH / lanes.length;
  const n = trajectory.length;

  let html = '';

  // Lane rails + labels
  lanes.forEach((lane, i) => {
    const y = padT + i * laneH + laneH / 2;
    html += `<text x="${padL - 8}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-2)">${labels[lane]}</text>`;
    html += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="var(--bg-3)" stroke-dasharray="2,4"/>`;
  });

  const xAt = i => padL + (i / (n - 1)) * innerW;

  // Draw segments between observations
  for (let i = 0; i < n; i++) {
    const t = trajectory[i];
    const laneIdx = lanes.indexOf(t.v);
    if (laneIdx < 0) continue;
    const x1 = xAt(i);
    const x2 = i < n - 1 ? xAt(i + 1) : W - padR;
    const y  = padT + laneIdx * laneH + laneH / 2;
    const col = colors[t.v];
    html += `<line x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${col}" stroke-width="14" stroke-linecap="butt" stroke-opacity="0.55"/>`;
    // transition riser
    if (i > 0 && trajectory[i-1].v !== t.v) {
      const prevLane = lanes.indexOf(trajectory[i-1].v);
      const prevY = padT + prevLane * laneH + laneH / 2;
      html += `<line x1="${x1.toFixed(1)}" y1="${prevY.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--text-3)" stroke-width="1" stroke-dasharray="2,2"/>`;
      html += `<text x="${(x1+4).toFixed(1)}" y="${(Math.min(prevY,y) - 4).toFixed(1)}" font-size="9" fill="var(--text-2)" font-family="ui-monospace">${t.y}</text>`;
    }
    // observation dot
    html += `<circle cx="${x1.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${col}" stroke="var(--bg-1)" stroke-width="2"/>`;
    // pulse the most recent one
    if (i === n - 1) {
      html += `<circle cx="${x1.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="none" stroke="${col}" stroke-width="1.5" opacity="0.6"><animate attributeName="r" values="7;11;7" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0.1;0.7" dur="1.8s" repeatCount="indefinite"/></circle>`;
    }
  }

  // Time axis labels (first, last, and transitions already annotated)
  [0, n - 1].forEach(i => {
    const x = xAt(i);
    html += `<text x="${x.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="9" fill="var(--text-3)" font-family="ui-monospace">${trajectory[i].y}</text>`;
  });

  // Current-state caption (top-right)
  const current = trajectory[n - 1];
  html += `
    <text x="${W - padR}" y="${padT + 8}" text-anchor="end" font-size="10" fill="var(--text-2)">
      Currently: <tspan fill="${colors[current.v]}" font-weight="600">${labels[current.v]}</tspan>
    </text>
  `;

  // Reading-guide caption (bottom-left)
  html += `
    <text x="${padL}" y="${H - 10}" font-size="8.5" fill="var(--text-3)">
      Each row = one regime state · thick colored bar shows when that regime was active
    </text>
  `;

  svg.innerHTML = html;
}

function drawLineChart(id, series, color, labels) {
  const svg = document.getElementById(id);
  if (!svg) return;
  const W = 300, H = 140, pad = 12;
  const vals = series.map(s => s.v);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const rng = mx - mn || 1;
  const pts = series.map((s, i) => {
    const x = pad + (i / (series.length - 1)) * (W - 2*pad);
    const y = H - pad - ((s.v - mn) / rng) * (H - 2*pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePts = pts.join(' ');
  const areaPts = `${pad},${H-pad} ${linePts} ${W-pad},${H-pad}`;
  const labelsHtml = series.map((s, i) => {
    const x = pad + (i / (series.length - 1)) * (W - 2*pad);
    return `<text x="${x.toFixed(1)}" y="${H - 2}" text-anchor="middle" fill="var(--text-3)" font-size="8" font-family="ui-monospace">${s.y}</text>`;
  }).join('');
  const valLabels = series.map((s, i) => {
    const x = pad + (i / (series.length - 1)) * (W - 2*pad);
    const y = H - pad - ((s.v - mn) / rng) * (H - 2*pad);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${color}"/>`;
  }).join('');
  svg.innerHTML = `
    <polygon points="${areaPts}" fill="${color}" fill-opacity="0.12"/>
    <polyline points="${linePts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${valLabels}
    ${labelsHtml}
  `;
}


/* ============================================================
   TAB RENDERERS — PORTFOLIO / PM / MACRO / NEWS / VALIDATION
   ============================================================ */

function renderRegimeSignals() {
  const host = document.getElementById('regimeSignals');
  host.innerHTML = DATA.regime.signals.map(s => {
    const cls = s.trend === 'bullish' ? 'bullish' : s.trend === 'bearish' ? 'bearish' : 'neutral';
    return `<div class="signal-pill ${cls}" data-open="${s.ref}">
      <span class="label">${s.label}</span>
      <span class="value">${s.value}</span>
    </div>`;
  }).join('');
}

function renderGauge() {
  const svg = document.getElementById('gaugeSvg');
  const val = DATA.regime.netExposure;
  // Upper-semicircle parameterization: α goes π (val=0, left) → π/2 (val=50, top) → 0 (val=100, right)
  const alpha = Math.PI * (1 - val / 100);
  const cx = 100, cy = 95, r = 72;
  const nx = cx + r * Math.cos(alpha);
  const ny = cy - r * Math.sin(alpha);  // note: minus because SVG y points down
  // val==100 lands exactly on the right endpoint — force large-arc/sweep path
  const leftX = cx - r, rightY = cy;
  svg.innerHTML = `
    <defs>
      <linearGradient id="gaugeGrad" x1="0" x2="1">
        <stop offset="0" stop-color="var(--red)"/>
        <stop offset="0.5" stop-color="var(--yellow)"/>
        <stop offset="1" stop-color="var(--green)"/>
      </linearGradient>
    </defs>
    <path d="M ${leftX},${rightY} A ${r},${r} 0 0 1 ${cx+r},${rightY}" fill="none" stroke="var(--bg-3)" stroke-width="10" stroke-linecap="round"/>
    <path d="M ${leftX},${rightY} A ${r},${r} 0 0 1 ${nx.toFixed(2)},${ny.toFixed(2)}" fill="none" stroke="url(#gaugeGrad)" stroke-width="10" stroke-linecap="round"/>
    <circle cx="${nx.toFixed(2)}" cy="${ny.toFixed(2)}" r="6" fill="var(--text-0)" stroke="var(--bg-0)" stroke-width="2"/>
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="26" font-weight="600" fill="var(--text-0)" font-family="ui-monospace, monospace">${val}<tspan font-size="13" fill="var(--text-2)">%</tspan></text>
    <text x="${cx - r + 4}" y="${rightY + 14}" font-size="8" fill="var(--text-3)" font-family="ui-monospace">0%</text>
    <text x="${cx + r - 4}" y="${rightY + 14}" font-size="8" fill="var(--text-3)" text-anchor="end" font-family="ui-monospace">100%</text>
  `;
}

function renderTilts() {
  const host = document.getElementById('tiltRows');
  host.innerHTML = DATA.regime.styleTilts.map(t => {
    // Sprint 8: null score = factor not computable yet (shows "—" flat bar).
    if (t.score == null) {
      return `<div class="tilt-row">
        <span class="tilt-name">${t.name}</span>
        <div class="tilt-bar"><div class="tilt-bar-mid"></div></div>
        <span class="tilt-val" style="color:var(--text-3)">—</span>
      </div>`;
    }
    const pct = Math.abs(t.score) * 100;
    const cls = t.score > 0 ? 'pos' : t.score < 0 ? 'neg' : '';
    const left = t.score >= 0 ? 50 : 50 - pct/2;
    const width = pct / 2;
    return `<div class="tilt-row">
      <span class="tilt-name">${t.name}</span>
      <div class="tilt-bar">
        <div class="tilt-bar-mid"></div>
        <div class="tilt-bar-fill ${cls}" style="left:${left}%;width:${width}%;"></div>
      </div>
      <span class="tilt-val">${(t.score > 0 ? '+' : '') + t.score.toFixed(2)}</span>
    </div>`;
  }).join('');
}

function renderSectorTable() {
  const host = document.getElementById('sectorTableBody');
  const fmt = v => {
    if (v == null || Number.isNaN(v)) return '—';
    return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
  };
  const col = v => {
    if (v == null || Number.isNaN(v)) return 'color:var(--text-3)';
    return v > 0.3 ? 'color:var(--green)' : v < -0.3 ? 'color:var(--red)' : 'color:var(--text-1)';
  };
  host.innerHTML = DATA.sectors.map(s => {
    const refKey = `sector:${s.name}`;
    const hasEntity = !!ENTITIES[refKey];
    const nameCell = hasEntity ? `<td data-open="${refKey}">${s.name}</td>` : `<td>${s.name}</td>`;
    return `<tr>
      ${nameCell}
      <td><span class="score-cell" style="${col(s.regime)}">${fmt(s.regime)}</span></td>
      <td><span class="score-cell" style="${col(s.earn)}">${fmt(s.earn)}</span></td>
      <td><span class="score-cell" style="${col(s.val)}">${fmt(s.val)}</span></td>
      <td><span class="score-cell" style="${col(s.rs)}">${fmt(s.rs)}</span></td>
      <td><span class="stance-badge stance-${s.stance.toLowerCase()}">${s.stance}</span></td>
    </tr>`;
  }).join('');
}

function renderRRG() {
  const svg = document.getElementById('rrgSvg');
  const W = 260, H = 260, cx = W/2, cy = H/2;
  // Data is centered around 100 with ±4 range. Scale so ±4 spans half-width.
  const half = W/2 - 14;
  const scale = v => (v - 100) / 4 * half;
  let svgHtml = `
    <rect x="${cx}" y="10" width="${cx-10}" height="${cy-10}" fill="rgba(63,185,80,0.06)"/>
    <rect x="10" y="10" width="${cx-10}" height="${cy-10}" fill="rgba(88,166,255,0.06)"/>
    <rect x="${cx}" y="${cy}" width="${cx-10}" height="${cy-10}" fill="rgba(210,153,34,0.06)"/>
    <rect x="10" y="${cy}" width="${cx-10}" height="${cy-10}" fill="rgba(248,81,73,0.06)"/>
    <line x1="${cx}" y1="10" x2="${cx}" y2="${H-10}" stroke="var(--border)" stroke-dasharray="2,2"/>
    <line x1="10" y1="${cy}" x2="${W-10}" y2="${cy}" stroke="var(--border)" stroke-dasharray="2,2"/>
    <text x="${W-12}" y="20" font-size="8" fill="var(--green)" text-anchor="end" font-weight="600">LEADING</text>
    <text x="12" y="20" font-size="8" fill="var(--blue)" font-weight="600">IMPROVING</text>
    <text x="${W-12}" y="${H-12}" font-size="8" fill="var(--yellow)" text-anchor="end" font-weight="600">LAGGING</text>
    <text x="12" y="${H-12}" font-size="8" fill="var(--red)" font-weight="600">WEAKENING</text>
    <text x="${cx + 4}" y="${cy - 4}" font-size="7" fill="var(--text-3)" font-family="ui-monospace">RS-ratio →</text>
    <text x="${cx - 4}" y="${cy + 10}" font-size="7" fill="var(--text-3)" text-anchor="end" font-family="ui-monospace">momentum ↑</text>
  `;
  if (DATA.rrgPoints.length === 0) {
    svgHtml += `
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="9" fill="var(--text-3)" font-weight="600">RRG data accumulating</text>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="7" fill="var(--text-3)">≥85 days of ETF price history needed</text>
    `;
  } else {
    DATA.rrgPoints.forEach(p => {
      const x = cx + scale(p.x);
      const y = cy - scale(p.y);
      svgHtml += `
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${p.size}" fill="${p.color}" fill-opacity="0.6" stroke="${p.color}" stroke-width="1"/>
        <text x="${x.toFixed(1)}" y="${(y-p.size-3).toFixed(1)}" font-size="8" fill="var(--text-1)" text-anchor="middle" font-family="ui-monospace">${p.t}</text>
      `;
    });
  }
  svg.innerHTML = svgHtml;
}

function renderAllocBar() {
  const host = document.getElementById('allocBar');
  host.innerHTML = DATA.sectors.map(s => {
    const col = DATA.sectorColors[s.name] || '#888';
    const refKey = `sector:${s.name}`;
    const attrs = ENTITIES[refKey] ? `data-open="${refKey}"` : '';
    return `<div class="allocation-seg" ${attrs} style="flex:${s.weight};background:${col};" title="${s.name} ${s.weight}%">${s.weight}%</div>`;
  }).join('');
}

function renderStockGroups() {
  const host = document.getElementById('stockGroups');
  const fmt = (v, digits = 2) =>
    (v == null || Number.isNaN(v)) ? '—' : Number(v).toFixed(digits);
  const fmtSigned = (v, digits = 2) => {
    if (v == null || Number.isNaN(v)) return '—';
    const n = Number(v);
    return (n >= 0 ? '+' : '') + n.toFixed(digits);
  };
  const fmtPct = (v, digits = 1) => {
    if (v == null || Number.isNaN(v)) return '—';
    const n = Number(v) * 100;
    return (n >= 0 ? '+' : '') + n.toFixed(digits) + '%';
  };
  // Color helper: green if "good" (direction depends on metric), red if "bad".
  const classify = (v, good) => {
    if (v == null || Number.isNaN(v)) return 'stk-flat';
    return good(Number(v)) ? 'stk-pos' : 'stk-neg';
  };
  // Sector-header summary: mean Piotroski F across constituents where available
  const sectorSummary = (stocks) => {
    const pioVals = stocks.map(s => s.piotroski_f).filter(v => v != null);
    if (pioVals.length === 0) return `${stocks.length} names`;
    const avg = pioVals.reduce((a, b) => a + b, 0) / pioVals.length;
    return `${stocks.length} names · Piotroski ${avg.toFixed(1)} avg`;
  };

  const header = `
    <div class="stock-row stock-row-head">
      <span>Ticker</span>
      <span>Fwd P/E</span>
      <span>Rel σ</span>
      <span>EPS Rev</span>
      <span>Breadth</span>
      <span>SUE</span>
      <span>12–1 Mom</span>
      <span>RS 3m</span>
      <span>Piotr.</span>
      <span>Days</span>
    </div>`;

  host.innerHTML = Object.keys(DATA.stockShortlist).map(sector => {
    const stocks = DATA.stockShortlist[sector];
    return `<div class="sector-group">
      <div class="sector-group-head">
        <span class="name" ${ENTITIES['sector:'+sector] ? `data-open="sector:${sector}"` : ''}>${sector}</span>
        <span class="meta">${sectorSummary(stocks)}</span>
      </div>
      ${header}
      ${stocks.map(s => {
        const refKey = 'stock:' + s.ticker;
        const clickable = ENTITIES[refKey] ? `data-open="${refKey}"` : '';
        const relPeCls   = classify(s.rel_pe_sigma,    v => v < 0);  // cheap = negative = good
        const epsRevCls  = classify(s.eps_rev_4w,      v => v > 0);
        const breadthCls = classify(s.rev_breadth_4w,  v => v > 0);
        const sueCls     = classify(s.sue,             v => v > 0);
        const momCls     = classify(s.mom_12_1,        v => v > 0);
        const rsCls      = classify(s.rs_vs_sector_3m, v => v > 0);
        const pioCls     = (s.piotroski_f == null) ? 'stk-flat'
                           : s.piotroski_f >= 7 ? 'stk-pos'
                           : s.piotroski_f <= 3 ? 'stk-neg' : 'stk-flat';
        const catSoon = (s.days_to_catalyst != null && s.days_to_catalyst <= 14) ? 'soon' : '';
        return `<div class="stock-row" ${clickable}>
          <span class="stock-ticker">${s.ticker}</span>
          <span>${fmt(s.fwd_pe, 1)}</span>
          <span class="${relPeCls}">${fmtSigned(s.rel_pe_sigma)}</span>
          <span class="${epsRevCls}">${fmtPct(s.eps_rev_4w)}</span>
          <span class="${breadthCls}">${fmtSigned(s.rev_breadth_4w)}</span>
          <span class="${sueCls}">${fmt(s.sue)}</span>
          <span class="${momCls}">${fmtPct(s.mom_12_1)}</span>
          <span class="${rsCls}">${fmtPct(s.rs_vs_sector_3m)}</span>
          <span class="${pioCls}">${s.piotroski_f == null ? '—' : s.piotroski_f}</span>
          <span class="catalyst-chip ${catSoon}">${s.days_to_catalyst == null ? '—' : s.days_to_catalyst + 'd'}</span>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

function renderScatter() {
  const svg = document.getElementById('scatterSvg');
  const W = 260, H = 240, pad = 24;
  const allStocks = Object.values(DATA.stockShortlist).flat();
  // X-axis: eps_rev_4w as decimal (e.g., 0.02 = +2%). Plot range ±0.05 = ±5%.
  // Y-axis: rel_pe_sigma, clamped to ±2σ. Cheap (negative σ) → top of chart
  // so the ideal-long zone (high EPS revision AND cheap valuation) sits
  // upper-right.
  const xMin = -0.05, xMax = 0.05;
  const yMin = -2, yMax = 2;
  const xScale = v => pad + ((v - xMin) / (xMax - xMin)) * (W - 2 * pad);
  const yScale = v => pad + ((yMax - v) / (yMax - yMin)) * (H - 2 * pad);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let svgHtml = `
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H-pad}" stroke="var(--border)"/>
    <line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="var(--border)"/>
    <line x1="${xScale(0)}" y1="${pad}" x2="${xScale(0)}" y2="${H-pad}" stroke="var(--border-soft)" stroke-dasharray="2,3"/>
    <line x1="${pad}" y1="${yScale(0)}" x2="${W-pad}" y2="${yScale(0)}" stroke="var(--border-soft)" stroke-dasharray="2,3"/>
    <text x="${W/2}" y="${H-4}" text-anchor="middle" font-size="8" fill="var(--text-3)">EPS Rev 4w</text>
    <text x="10" y="${H/2}" text-anchor="middle" font-size="8" fill="var(--text-3)" transform="rotate(-90 10 ${H/2})">Rel P/E σ · cheap ↑</text>
    <text x="${W-pad-2}" y="${pad+10}" font-size="7" fill="var(--green)" text-anchor="end" font-weight="600">IDEAL LONG</text>
    <text x="${W-pad-2}" y="${yScale(-1.9)}" font-size="6" fill="var(--text-3)" text-anchor="end">+2σ expensive</text>
    <text x="${W-pad-2}" y="${yScale(1.9) + 8}" font-size="6" fill="var(--text-3)" text-anchor="end">−2σ cheap</text>
  `;
  let plotted = 0;
  allStocks.forEach(s => {
    if (s.rel_pe_sigma == null || s.eps_rev_4w == null) return;
    const x = xScale(clamp(s.eps_rev_4w, xMin, xMax));
    const y = yScale(clamp(s.rel_pe_sigma, yMin, yMax));
    // Color by Piotroski F as a proxy for quality: high=green, low=red.
    const pio = s.piotroski_f;
    const col = (pio == null)    ? 'var(--text-2)'
              : (pio >= 7)       ? 'var(--green)'
              : (pio <= 3)       ? 'var(--red)'
              :                    'var(--yellow)';
    const r = 5;
    svgHtml += `
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${col}" fill-opacity="0.5" stroke="${col}" stroke-width="1"/>
      <text x="${x.toFixed(1)}" y="${(y - r - 2).toFixed(1)}" text-anchor="middle" font-size="7" fill="var(--text-1)" font-family="ui-monospace">${s.ticker}</text>
    `;
    plotted++;
  });
  // Empty-state helper when no points have both fields populated
  if (plotted === 0) {
    svgHtml += `<text x="${W/2}" y="${H/2 + 16}" text-anchor="middle" font-size="9" fill="var(--text-3)">not enough factor data yet</text>`;
  }
  svg.innerHTML = svgHtml;
}

function renderKPIs() {
  const host = document.getElementById('kpiStrip');
  host.innerHTML = DATA.kpis.map(k => `
    <div class="kpi" data-prov="weights">
      <div class="k-label">${k.label}</div>
      <div class="k-value">${k.value}</div>
      <div class="k-delta ${k.cls}">${k.delta}</div>
    </div>
  `).join('');
}

function renderWeightChart() {
  const svg = document.getElementById('weightChart');
  const W = 720, H = 340, pad = 28;
  const rowH = (H - 2*pad) / DATA.weights.length;
  const maxW = 7;
  const xScale = v => pad + 80 + (v / maxW) * (W - pad - 100);

  let svgHtml = '';
  DATA.weights.forEach((w, i) => {
    const y = pad + i*rowH + rowH/2;
    const col = DATA.sectorColors[w.sector] || '#888';
    const xCurr = xScale(w.current);
    const xTarg = xScale(w.target);
    const delta = w.target - w.current;
    const arrowCol = delta > 0.1 ? 'var(--green)' : delta < -0.1 ? 'var(--red)' : 'var(--text-3)';
    svgHtml += `
      <text x="${pad}" y="${y+3}" font-size="10" font-family="ui-monospace" fill="var(--text-0)" font-weight="600">${w.ticker}</text>
      <line x1="${pad+80}" y1="${y}" x2="${W-pad}" y2="${y}" stroke="var(--bg-3)" stroke-width="1" stroke-dasharray="2,2"/>
      <circle cx="${xCurr.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="var(--bg-3)" stroke="var(--text-2)" stroke-width="1"/>
      <circle cx="${xTarg.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${col}"/>
      <line x1="${xCurr.toFixed(1)}" y1="${y}" x2="${xTarg.toFixed(1)}" y2="${y}" stroke="${arrowCol}" stroke-width="2"/>
      <text x="${W-pad+4}" y="${y+3}" font-size="9" font-family="ui-monospace" fill="var(--text-1)">${w.target.toFixed(1)}%</text>
    `;
  });
  svgHtml += `
    <text x="${pad+80}" y="${H-6}" font-size="8" fill="var(--text-3)">0%</text>
    <text x="${W-pad-10}" y="${H-6}" font-size="8" fill="var(--text-3)" text-anchor="end">${maxW}%</text>
    <text x="${W/2}" y="${pad-8}" font-size="9" fill="var(--text-2)" text-anchor="middle">Current (dim) → Target (solid)</text>
  `;
  svg.innerHTML = svgHtml;
}

function renderDecisionTrail() {
  const host = document.getElementById('decisionTrail');
  const d = DATA.decisionTrail;
  host.innerHTML = `
    <div class="trail-header">
      <span class="ticker" data-open="stock:${d.ticker}">${d.ticker}</span>
      <span class="weight">${d.weight}% NAV</span>
    </div>
    ${d.steps.map((s, i) => `
      <div class="trail-step">
        <span class="step-circle">${i+1}</span>
        <div>
          <div class="step-kind">${s.kind}</div>
          <div class="step-text">${s.text}</div>
        </div>
      </div>
    `).join('')}
  `;
}

function renderWaterfall() {
  const svg = document.getElementById('waterfallSvg');
  const W = 300, H = 240, pad = 24;
  if (!Array.isArray(DATA.attribution) || DATA.attribution.length === 0) {
    svg.innerHTML = `
      <text x="${W/2}" y="${H/2 - 6}" text-anchor="middle" font-size="12" fill="var(--text-2)" font-weight="600">Awaits data</text>
      <text x="${W/2}" y="${H/2 + 12}" text-anchor="middle" font-size="10" fill="var(--text-3)">Need 2+ days of NAV history — bars activate tomorrow.</text>`;
    return;
  }
  const barW = (W - 2*pad) / (DATA.attribution.length + 1);
  let running = 0;
  const maxAbs = Math.max(...DATA.attribution.map(a => Math.abs(a.value))) + 50;
  const yScale = v => H - pad - (v / (2 * maxAbs)) * (H - 2*pad);

  let svgHtml = `<line x1="${pad}" y1="${yScale(0)}" x2="${W-pad}" y2="${yScale(0)}" stroke="var(--border)" stroke-dasharray="2,2"/>`;
  DATA.attribution.forEach((a, i) => {
    const x = pad + barW/2 + i * barW;
    const y0 = yScale(running);
    const y1 = yScale(running + a.value);
    running += a.value;
    const barH = Math.abs(y1 - y0);
    const barY = Math.min(y0, y1);
    svgHtml += `
      <rect x="${x-barW*0.35}" y="${barY}" width="${barW*0.7}" height="${barH}" fill="${a.color}" fill-opacity="0.7" stroke="${a.color}" stroke-width="1"/>
      <text x="${x}" y="${H-8}" text-anchor="middle" font-size="8" fill="var(--text-2)">${a.label}</text>
      <text x="${x}" y="${y1 - 3}" text-anchor="middle" font-size="9" font-family="ui-monospace" fill="${a.color}" font-weight="600">${a.value > 0 ? '+' : ''}${a.value}</text>
    `;
  });
  const xTotal = pad + barW/2 + DATA.attribution.length * barW;
  svgHtml += `
    <line x1="${xTotal-barW*0.35}" y1="${yScale(0)}" x2="${xTotal+barW*0.35}" y2="${yScale(0)}" stroke="var(--blue)" stroke-width="2"/>
    <line x1="${xTotal-barW*0.35}" y1="${yScale(running)}" x2="${xTotal+barW*0.35}" y2="${yScale(running)}" stroke="var(--blue)" stroke-width="2"/>
    <rect x="${xTotal-barW*0.35}" y="${Math.min(yScale(0), yScale(running))}" width="${barW*0.7}" height="${Math.abs(yScale(running)-yScale(0))}" fill="var(--blue)" fill-opacity="0.25" stroke="var(--blue)" stroke-width="1"/>
    <text x="${xTotal}" y="${H-8}" text-anchor="middle" font-size="8" fill="var(--text-2)">Total</text>
    <text x="${xTotal}" y="${yScale(running)-3}" text-anchor="middle" font-size="10" font-family="ui-monospace" fill="var(--blue)" font-weight="700">+${running}</text>
  `;
  svg.innerHTML = svgHtml;
}

function renderCalibration() {
  const svg = document.getElementById('calibSvg');
  const W = 300, H = 240, pad = 30;
  // Sprint 9.1: always render the expected-prior curve. Actual points appear
  // only when closed-trades data with conviction exists (n≥3 per bucket).
  if (!Array.isArray(DATA.calibration) || DATA.calibration.length === 0) return;
  const xs = v => pad + (v - 1) / 4 * (W - 2*pad);
  const ys = v => H - pad - v * (H - 2*pad);
  const hasActual = DATA.calibration.some(c => c.actual != null);
  let svgHtml = `
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H-pad}" stroke="var(--border)"/>
    <line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="var(--border)"/>
    <line x1="${pad}" y1="${ys(0.2)}" x2="${W-pad}" y2="${ys(0.9)}" stroke="var(--text-3)" stroke-width="1" stroke-dasharray="3,3"/>
    <text x="${W/2}" y="${H-8}" text-anchor="middle" font-size="8" fill="var(--text-3)">Conviction level</text>
    <text x="10" y="${H/2}" text-anchor="middle" font-size="8" fill="var(--text-3)" transform="rotate(-90 10 ${H/2})">Hit rate</text>
  `;
  if (!hasActual) {
    svgHtml += `<text x="${W/2}" y="${pad + 10}" text-anchor="middle" font-size="9" fill="var(--text-3)">Expected prior curve · actuals populate as trades close</text>`;
  }
  DATA.calibration.forEach(c => {
    const x = xs(c.conv);
    const yE = ys(c.expected);
    svgHtml += `
      <circle cx="${x}" cy="${yE}" r="4" fill="none" stroke="var(--text-3)" stroke-dasharray="1,1"/>
      <text x="${x}" y="${H-pad+14}" text-anchor="middle" font-size="8" fill="var(--text-2)">Lv${c.conv}</text>
    `;
    if (c.actual != null) {
      const yA = ys(c.actual);
      svgHtml += `
        <circle cx="${x}" cy="${yA}" r="5" fill="var(--blue)"/>
        <text x="${x}" y="${yA-8}" text-anchor="middle" font-size="8" font-family="ui-monospace" fill="var(--text-1)">${(c.actual*100).toFixed(0)}%</text>
      `;
    }
  });
  svg.innerHTML = svgHtml;
}

function renderTrades() {
  const host = document.getElementById('tradesList');
  host.innerHTML = DATA.recentTrades.map(t => {
    const cls = t.pnl > 0 ? 'up' : 'down';
    const refKey = 'stock:' + t.ticker;
    const clickable = ENTITIES[refKey] ? `data-open="${refKey}"` : '';
    return `<div class="trade-row" ${clickable}>
      <span class="t-action ${t.action.toLowerCase()}">${t.action}</span>
      <span class="t-ticker">${t.ticker}</span>
      <span class="t-note">${t.note}</span>
      <span class="t-pnl ${cls}">${t.pnl > 0 ? '+' : ''}${t.pnl.toFixed(1)}%</span>
    </div>`;
  }).join('');
}

function renderAttribution() {
  const svg = document.getElementById('attributionDonut');
  if (!svg) return;
  const total = DATA.attribution.reduce((a, b) => a + Math.abs(b.value), 0);
  let cumulative = 0;
  const cx = 90, cy = 90, r = 70, innerR = 40;
  let svgHtml = '';
  DATA.attribution.forEach(a => {
    const pct = Math.abs(a.value) / total;
    const a0 = cumulative * 2 * Math.PI - Math.PI/2;
    cumulative += pct;
    const a1 = cumulative * 2 * Math.PI - Math.PI/2;
    const large = pct > 0.5 ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const ix0 = cx + innerR * Math.cos(a1), iy0 = cy + innerR * Math.sin(a1);
    const ix1 = cx + innerR * Math.cos(a0), iy1 = cy + innerR * Math.sin(a0);
    svgHtml += `<path d="M ${x0},${y0} A ${r},${r} 0 ${large},1 ${x1},${y1} L ${ix0},${iy0} A ${innerR},${innerR} 0 ${large},0 ${ix1},${iy1} Z" fill="${a.color}" fill-opacity="0.7" stroke="${a.color}" stroke-width="1"/>`;
  });
  svgHtml += `<text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="20" fill="var(--text-0)" font-weight="700" font-family="ui-monospace">+215</text>`;
  svgHtml += `<text x="${cx}" y="${cy+14}" text-anchor="middle" font-size="9" fill="var(--text-3)">bp · 30d</text>`;
  svg.innerHTML = svgHtml;

  const legend = document.getElementById('attributionLegend');
  legend.innerHTML = DATA.attribution.map(a => {
    const pct = (Math.abs(a.value)/total * 100).toFixed(0);
    const cls = a.value >= 0 ? 'up' : 'down';
    return `<div class="attr-row">
      <span class="swatch" style="background:${a.color}"></span>
      <span class="name">${a.label}</span>
      <span class="bar"><span class="fill" style="background:${a.color};width:${pct}%"></span></span>
      <span class="v pm-pnl-${a.value>=0?'pos':'neg'}">${a.value > 0 ? '+' : ''}${a.value}</span>
    </div>`;
  }).join('');
}

function renderDrawdown() {
  const svg = document.getElementById('drawdownSvg');
  if (!svg) return;
  const W = 400, H = 160, pad = 16;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const series = [];
  let running = 100000, peak = 100000;
  for (let i = 0; i < 126; i++) {
    running *= 1 + (Math.random() - 0.47) * 0.015;
    peak = Math.max(peak, running);
    series.push((running - peak) / peak);
  }
  const maxAbs = Math.max(0.01, Math.abs(Math.min(...series)));
  const pts = series.map((v, i) => {
    const x = pad + (i / (series.length-1)) * (W - 2*pad);
    const y = pad + (Math.abs(v) / maxAbs) * (H - 2*pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  // Zero baseline + deepest-DD reference line
  const deepestPct = (maxAbs * 100).toFixed(1);
  svg.innerHTML = `
    <line x1="${pad}" y1="${pad}" x2="${W-pad}" y2="${pad}" stroke="var(--border-soft)" stroke-width="1"/>
    <line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="var(--red)" stroke-width="1" stroke-dasharray="3,3" stroke-opacity="0.6"/>
    <polygon points="${pad},${pad} ${pts} ${W-pad},${pad}" fill="var(--red)" fill-opacity="0.2"/>
    <polyline points="${pts}" fill="none" stroke="var(--red)" stroke-width="1.5"/>
    <text x="${pad+4}" y="${pad+10}" font-size="9" fill="var(--text-3)" font-family="ui-monospace">0%</text>
    <text x="${pad+4}" y="${H-pad-4}" font-size="9" fill="var(--red)" font-family="ui-monospace">−${deepestPct}%</text>
  `;
}

function renderPMNav() {
  const svg = document.getElementById('pmNavSvg');
  if (!svg) return;
  const W = 800, H = 260, pad = 28;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const data = DATA.navCurve;
  const navs = data.map(d => d.nav);
  const spys = data.map(d => d.spy);
  const allVals = navs.concat(spys);
  const mn = Math.min(...allVals), mx = Math.max(...allVals);
  const rng = mx - mn;
  const navPts = data.map((d, i) => {
    const x = pad + (i / (data.length-1)) * (W - 2*pad);
    const y = H - pad - ((d.nav - mn) / rng) * (H - 2*pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const spyScaled = data.map(d => {
    const norm = (d.spy - data[0].spy) / data[0].spy;
    return data[0].nav * (1 + norm);
  });
  const spyPts = spyScaled.map((v, i) => {
    const x = pad + (i / (spyScaled.length-1)) * (W - 2*pad);
    const y = H - pad - ((v - mn) / rng) * (H - 2*pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  svg.innerHTML = `
    <polyline points="${navPts}" fill="none" stroke="var(--green)" stroke-width="2"/>
    <polyline points="${spyPts}" fill="none" stroke="var(--text-3)" stroke-width="1" stroke-dasharray="3,3"/>
    <text x="${W-pad}" y="${pad}" text-anchor="end" font-size="9" fill="var(--green)">NAV</text>
    <text x="${W-pad}" y="${pad+13}" text-anchor="end" font-size="9" fill="var(--text-3)">SPY</text>
  `;
}

function renderPMTable() {
  const tbl = document.getElementById('pmTable');
  tbl.innerHTML = `
    <thead><tr>
      <th>Ticker</th><th>Sector</th><th>Qty</th><th>Cost</th><th>Price</th>
      <th>MV (£)</th><th>Wt %</th><th>Unrlz %</th><th>1d %</th><th>Days</th>
    </tr></thead>
    <tbody>
      ${DATA.positions.map(p => {
        const mv = (p.qty * p.price / 1000).toFixed(1);
        const refKey = 'stock:' + p.ticker;
        const nameCell = ENTITIES[refKey] ? `<td data-open="${refKey}">${p.ticker}</td>` : `<td>${p.ticker}</td>`;
        return `<tr>
          ${nameCell}
          <td style="text-align:left;font-family:-apple-system,sans-serif;color:var(--text-2);">
            <span class="pm-sector-dot" style="background:${DATA.sectorColors[p.sector] || '#888'}"></span>${p.sector}
          </td>
          <td>${p.qty}</td>
          <td>${p.cost.toFixed(2)}</td>
          <td>${p.price.toFixed(2)}</td>
          <td>${mv}k</td>
          <td>${p.weight.toFixed(1)}</td>
          <td class="${p.unrlzPnl >= 0 ? 'pm-pnl-pos' : 'pm-pnl-neg'}">${p.unrlzPnl > 0 ? '+' : ''}${p.unrlzPnl.toFixed(1)}</td>
          <td class="${p.dayPnl >= 0 ? 'pm-pnl-pos' : 'pm-pnl-neg'}">${p.dayPnl > 0 ? '+' : ''}${p.dayPnl.toFixed(2)}</td>
          <td>${p.daysHeld}</td>
        </tr>`;
      }).join('')}
    </tbody>
  `;
}

function renderMacroIndicators() {
  const host = document.getElementById('macroIndicators');
  host.innerHTML = DATA.macroIndicators.map(m => {
    const refKey = 'indicator:' + m.label;
    const clickable = ENTITIES[refKey] ? `data-open="${refKey}"` : '';
    const col = m.trend === 'up' ? 'var(--green)' : m.trend === 'down' ? 'var(--red)' : 'var(--yellow)';
    const sparkSvg = `<svg class="ind-spark" viewBox="0 0 100 20" preserveAspectRatio="none">${renderSpark(m.spark, 100, 20, col)}</svg>`;
    return `<div class="macro-ind ${m.trend}" ${clickable}>
      <div class="ind-label">${m.label}</div>
      <div class="ind-value">${m.val}</div>
      <div class="ind-change" style="color:${col};">${m.chg}</div>
      ${sparkSvg}
    </div>`;
  }).join('');
}

function renderNewsStream() {
  const host = document.getElementById('newsStream');
  host.innerHTML = DATA.news.map(n => {
    const tickers = n.tickers.map(t => {
      const refKey = 'stock:' + t;
      const clickable = ENTITIES[refKey] ? `data-open="${refKey}"` : '';
      return `<span class="news-ticker-chip" ${clickable}>${t}</span>`;
    }).join('');
    return `<div class="news-item">
      <div class="news-item-head">
        <div class="news-item-title">${n.title}</div>
        <span class="news-sentiment ${n.sent}">${n.sent === 'pos' ? '+' : n.sent === 'neg' ? '−' : '•'} ${Math.abs(n.score).toFixed(2)}</span>
      </div>
      <div class="news-tickers">${tickers}</div>
      <div class="news-item-meta">
        <span>${n.src}</span>
        <span>·</span>
        <span>${n.date}</span>
        <span>·</span>
        <span class="news-materiality">◆ ${n.mat}/10</span>
      </div>
    </div>`;
  }).join('');
}

function renderTopDrivers() {
  const host = document.getElementById('topDrivers');
  host.innerHTML = DATA.topDrivers.map(d => {
    const col = d.move.startsWith('+') ? 'var(--green)' : 'var(--red)';
    const refKey = 'stock:' + d.ticker;
    const clickable = ENTITIES[refKey] ? `data-open="${refKey}"` : '';
    return `<div class="news-item" ${clickable}>
      <div class="news-item-head">
        <div class="news-item-title" style="font-family:ui-monospace;font-size:0.9rem;">${d.ticker}</div>
        <span style="color:${col};font-family:ui-monospace;font-weight:700;font-size:0.8rem;">${d.move}</span>
      </div>
      <div style="font-size:0.72rem;color:var(--text-2);margin-top:4px;">${d.reason}</div>
    </div>`;
  }).join('');
}

function renderClusters() {
  const svg = document.getElementById('clusterSvg');
  if (!svg) return;
  const W = 400, H = 200;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const clusters = [
    { x: 100, y:  60, r: 28, label: 'GLP-1',     size: 9, col: 'var(--green)' },
    { x: 230, y:  80, r: 34, label: 'AI capex',  size: 12, col: 'var(--purple)' },
    { x: 330, y:  55, r: 22, label: 'Earnings',  size: 7, col: 'var(--blue)' },
    { x: 150, y: 140, r: 26, label: 'Fed/Rates', size: 8, col: 'var(--yellow)' },
    { x: 290, y: 150, r: 20, label: 'OPEC',      size: 6, col: 'var(--red)' },
    { x:  80, y: 150, r: 14, label: 'Geo',       size: 4, col: 'var(--orange)' }
  ];
  svg.innerHTML = clusters.map(c => `
    <circle cx="${c.x}" cy="${c.y}" r="${c.r}" fill="${c.col}" fill-opacity="0.2" stroke="${c.col}" stroke-width="1"/>
    <text x="${c.x}" y="${c.y-2}" text-anchor="middle" font-size="10" fill="var(--text-0)" font-weight="600">${c.label}</text>
    <text x="${c.x}" y="${c.y+12}" text-anchor="middle" font-size="8" fill="var(--text-3)" font-family="ui-monospace">${c.size} items</text>
  `).join('');
}

function renderFreshness() {
  const host = document.getElementById('freshnessTable');
  host.innerHTML = `
    <thead><tr><th>Feed</th><th>Last update</th><th>Age</th><th>Status</th></tr></thead>
    <tbody>
      ${DATA.feeds.map(f => `<tr>
        <td>${f.name}</td>
        <td>${f.last}</td>
        <td>${f.age}</td>
        <td><span class="fresh-status ${f.status}">${f.status.toUpperCase()}</span></td>
      </tr>`).join('')}
    </tbody>
  `;
}

function renderAnomalies() {
  const host = document.getElementById('anomalyLog');
  host.innerHTML = DATA.anomalies.map(a => `
    <div class="anomaly-row">
      <span>${a.time}</span>
      <span><span class="anom-severity ${a.sev}">${a.sev.toUpperCase()}</span></span>
      <span style="font-family:-apple-system,sans-serif;color:var(--text-1);font-size:0.7rem;">${a.msg}</span>
      <span style="color:var(--text-3);font-size:0.62rem;">${a.source}</span>
    </div>
  `).join('');
}

// Sprint 7: pulls /api/triggers (proxied from narrator-dispatcher /status)
// and renders the 24h cost window + last-tick + recent-fires table.
// Non-fatal if the dispatcher is unreachable — subhead shows the error.
async function renderDispatcherStatus() {
  const subHead = document.getElementById('dispatcherSubHead');
  const setStat = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  try {
    const data = await fetchJSON('/api/triggers');
    const cost = data.cost_window_24h || {};
    setStat('dispFires',  cost.fires ?? '0');
    setStat('dispLlm',    cost.llm_fires ?? '0');
    setStat('dispStable', cost.stable_skips ?? '0');
    setStat('dispFail',   cost.failures ?? '0');
    const last = data.last_tick ? new Date(data.last_tick).toLocaleString() : '(never)';
    if (subHead) subHead.textContent = `Last tick · ${last}`;

    const tbody = document.querySelector('#dispatcherRecentFires tbody');
    if (tbody) {
      const rows = (data.recent_fires || []).slice(0, 12);
      tbody.innerHTML = rows.length ? rows.map(r => {
        const ts = r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '?';
        const entity = r.entity_id ? `${r.entity_type}:${r.entity_id}` : r.entity_type;
        const outcome = !r.succeeded ? '<span class="anom-severity err">FAIL</span>'
                      : r.stability_skipped ? '<span class="anom-severity warn">STABLE</span>'
                      : '<span class="anom-severity ok">FIRED</span>';
        const dur = r.duration_ms != null ? `${r.duration_ms}ms` : '—';
        return `<tr><td>${escapeHTML(ts)}</td><td>${escapeHTML(r.source_event || '')}</td><td>${escapeHTML(entity)}</td><td>${outcome}</td><td>${dur}</td></tr>`;
      }).join('') : '<tr><td colspan="5" style="color:var(--text-3);">No fires yet</td></tr>';
    }
  } catch (e) {
    if (subHead) subHead.textContent = `unreachable — ${e.message || e}`;
  }
}

function renderMonthlyCheck() {
  const host = document.getElementById('checkList');
  host.innerHTML = DATA.monthlyCheck.map(c => `
    <div class="check-item">
      <span class="ci-label">${c.label}</span>
      <span class="ci-status ${c.status}">${c.status.toUpperCase()}</span>
      <span class="ci-date">${c.date}</span>
    </div>
  `).join('');
}


/* ============================================================
   EVENT WIRING (global click delegation)
   ============================================================ */
document.addEventListener('click', (e) => {
  // Entity open (data-open="stock:UNH" / "sector:Healthcare" / "indicator:Regime")
  const openEl = e.target.closest('[data-open]');
  if (openEl) {
    e.stopPropagation();
    openEntity(openEl.dataset.open);
    return;
  }

  // Provenance popover (data-prov="key")
  const provEl = e.target.closest('[data-prov]');
  if (provEl) {
    e.stopPropagation();
    showProvPopover(provEl.dataset.prov, provEl);
    return;
  }

  // Funnel step scroll
  const scrollEl = e.target.closest('[data-scroll]');
  if (scrollEl) {
    const target = document.getElementById(scrollEl.dataset.scroll);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
});

document.getElementById('provBackdrop').addEventListener('click', hideProvPopover);

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

/* Keyboard: Escape closes entity / popover */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!document.getElementById('provPopover').classList.contains('hidden')) {
      hideProvPopover();
    } else if (appState.entity) {
      closeEntity();
    }
  }
});

/* ============================================================
   INIT
   ============================================================ */
function init() {
  // Layer 1
  renderRegimeSignals();
  renderGauge();
  renderTilts();
  // Layer 2
  renderSectorTable();
  renderRRG();
  renderAllocBar();
  // Layer 3
  renderStockGroups();
  renderScatter();
  // Layer 4
  renderKPIs();
  renderWeightChart();
  renderDecisionTrail();
  // Layer 5
  renderWaterfall();
  renderCalibration();
  renderTrades();
  // PM tab
  renderAttribution();
  renderDrawdown();
  renderPMNav();
  renderPMTable();
  // Calendar tab (replaces former Macro tab)
  bootstrapCalendar();
  // News
  renderNewsStream();
  renderTopDrivers();
  renderClusters();
  // Validation
  renderFreshness();
  renderAnomalies();
  renderMonthlyCheck();
  renderDispatcherStatus();

  // Sprint 4 — replace Layer 2 + Layer 3 stubs with real API data.
  // Runs async so the stub-based initial render shows up immediately,
  // then gets overwritten when fetches resolve.
  bootstrapPortfolioTab();
  // Layer 1 signal chips + net-exposure gauge.
  bootstrapRegimeSignals();
  // Sprint 7 — Layer 4 KPI strip + weight chart from real NAV + positions.
  bootstrapLayer4();
  // PM tab table + NAV curve from real positions / NAV.
  bootstrapPMTab();
  // News stream + top movers from BETA_12_News_digest + MOVER_EXPLANATIONS_daily.
  bootstrapNewsTab();
  // 12-indicator board (regime detail view) from MACRO_STATE_indicators.
  bootstrapMacroIndicators();
  // Sprint 14.1 — Run pipeline button.
  initRunPipelineButton();
}

// ======================================================================
// Sprint 14.1: local pipeline trigger button.
// POSTs to /api/run-pipeline on our Express server, which spawns
// `node src/pipeline.js`. Polls /api/run-pipeline every 2s for status.
// ======================================================================
function initRunPipelineButton() {
  const btn    = document.getElementById('runPipelineBtn');
  const label  = document.getElementById('runPipelineLabel');
  const icon   = document.getElementById('runPipelineIcon');
  const meta   = document.getElementById('runPipelineMeta');
  const drawer = document.getElementById('pipelineLogDrawer');
  const title  = document.getElementById('pipelineLogTitle');
  const body   = document.getElementById('pipelineLogBody');
  const closeBtn = document.getElementById('pipelineLogClose');
  if (!btn || !drawer) return;

  let pollTimer = null;
  const STATE = { drawerUserClosed: false };

  function setButton(cls, iconTxt, labelTxt, metaTxt) {
    btn.classList.remove('running', 'done', 'failed');
    if (cls) btn.classList.add(cls);
    icon.textContent  = iconTxt;
    label.textContent = labelTxt;
    meta.textContent  = metaTxt || '';
    btn.disabled = cls === 'running';
  }

  function fmtDuration(ms) {
    if (!ms || ms < 0) return '';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s/60)}m ${s%60}s`;
  }

  function fmtRelativeTime(iso) {
    if (!iso) return '';
    const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    return `${h}h ${mins%60}m ago`;
  }

  function renderLog(lines) {
    body.innerHTML = (lines || []).map(l => {
      const isErr = l.startsWith('[err]');
      const safe = l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return `<div class="log-line ${isErr ? 'err' : ''}">${safe}</div>`;
    }).join('');
    body.scrollTop = body.scrollHeight;
  }

  async function refresh(openDrawerIfRunning = false) {
    try {
      const r = await fetch('/api/run-pipeline');
      const s = await r.json();
      applyStatus(s, openDrawerIfRunning);
      return s;
    } catch (e) {
      // Server unreachable; keep previous state.
      return null;
    }
  }

  function applyStatus(s, openDrawerIfRunning) {
    if (s.status === 'running') {
      const dur = fmtDuration(Date.now() - Date.parse(s.started_at));
      setButton('running', '↻', 'Running pipeline…', dur);
      title.textContent = `Pipeline run · ${dur}`;
      renderLog(s.log_tail);
      if (openDrawerIfRunning && !STATE.drawerUserClosed) drawer.classList.add('open');
      if (!pollTimer) pollTimer = setInterval(() => refresh(false), 2000);
    } else if (s.status === 'done') {
      stopPolling();
      const dur = fmtDuration(s.duration_ms);
      setButton('done', '✓', 'Run pipeline', `last run · ${fmtRelativeTime(s.last_done_at)} · ${dur}`);
      title.textContent = `Pipeline run · done · ${dur}`;
      renderLog(s.log_tail);
    } else if (s.status === 'failed') {
      stopPolling();
      const dur = fmtDuration(s.duration_ms);
      setButton('failed', '✗', 'Run pipeline', `last run · failed (exit ${s.exit_code}) · ${dur}`);
      title.textContent = `Pipeline run · failed (exit ${s.exit_code})`;
      renderLog(s.log_tail);
      drawer.classList.add('open'); // always show on failure
    } else {
      stopPolling();
      const lastTxt = s.last_done_at ? `last run · ${fmtRelativeTime(s.last_done_at)}` : 'never run';
      setButton(null, '▶', 'Run pipeline', lastTxt);
    }
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    STATE.drawerUserClosed = false;
    drawer.classList.add('open');
    try {
      const res = await fetch('/api/run-pipeline', { method: 'POST' });
      const s = await res.json();
      if (!res.ok) {
        // 409 = already running; still show status
        applyStatus(s.run || s, true);
        return;
      }
      applyStatus(s.run, true);
    } catch (e) {
      title.textContent = `Pipeline run · error: ${e.message}`;
    }
  });

  closeBtn.addEventListener('click', () => {
    drawer.classList.remove('open');
    STATE.drawerUserClosed = true;
  });

  // Boot: poll once to pick up an already-running pipeline (e.g. user refreshed mid-run).
  refresh(true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
