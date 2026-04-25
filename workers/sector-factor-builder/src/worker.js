/**
 * SECTOR FACTOR BUILDER — Sector-level aggregates + RRG + stance.
 *
 * 13 fields per sector per day, written to SECTOR_FACTORS_daily:
 *   regime_fit            hardcoded (regime × sector) affinity, [-1, +1]
 *   earn_momentum         mean of constituent STOCK_FACTORS_daily.eps_rev_4w
 *   beat_rate_sector      frac of constituents with sue > 0
 *   valuation_sigma       z-score of sector median fwd_pe vs 252d history (NULL until ready)
 *   rel_strength_13w      sector ETF 63d return − SPY 63d return
 *   rs_ratio              JdK RRG x-axis, centered at 100
 *   rs_momentum           JdK RRG y-axis, centered at 100
 *   stance_score          null-aware renormalized weighted sum
 *   stance                OW / EW / UW bucket
 *   fwd_pe_sector         median of constituent fwd_pe
 *   breadth_above_200dma  frac of constituents with close > dma_200
 *
 * Regime read: best-effort latest row from BETA_10_Daily_macro. If missing,
 * regime = "neutral" (matrix returns 0 for all sectors).
 *
 * No LLM. Deterministic. Writes direct to D1 (public-URL worker fetch hits
 * Cloudflare error 1042 loop guard — same workaround as stock-factor-builder).
 */

// Ticker → sector per SPDR/GICS ETF convention (post-2018 reclass).
// GOOGL and META live in XLC (Communication Services), not XLK.
const SECTOR_BUCKET = {
  AAPL: "Technology", MSFT: "Technology", NVDA: "Technology",
  INTC: "Technology", AMD: "Technology",
  AMZN: "ConsDisc", TSLA: "ConsDisc", HD: "ConsDisc",
  GOOGL: "Communication", META: "Communication", NFLX: "Communication",
  JPM: "Finance", GS: "Finance", BAC: "Finance", MS: "Finance", "BRK.B": "Finance",
  XOM: "Energy", CVX: "Energy",
  UNH: "Healthcare", LLY: "Healthcare", JNJ: "Healthcare",
  PG: "Staples", KO: "Staples",
  CAT: "Industrial", BA: "Industrial",
};

const SECTOR_ETF = {
  Technology: "XLK",
  ConsDisc: "XLY",
  Communication: "XLC",
  Finance: "XLF",
  Energy: "XLE",
  Healthcare: "XLV",
  Staples: "XLP",
  Industrial: "XLI",
};

const SECTORS = Object.keys(SECTOR_ETF);

// regime × sector affinity. Positive = regime helps. Tunable.
const REGIME_AFFINITY = {
  bullish:          { Technology: 0.8, ConsDisc: 0.7, Communication: 0.5, Finance: 0.6, Energy: 0.3, Healthcare: 0.0, Staples: -0.4, Industrial: 0.5 },
  cautious_bullish: { Technology: 0.5, ConsDisc: 0.3, Communication: 0.3, Finance: 0.4, Energy: 0.2, Healthcare: 0.1, Staples: -0.1, Industrial: 0.3 },
  neutral:          { Technology: 0.0, ConsDisc: 0.0, Communication: 0.0, Finance: 0.0, Energy: 0.0, Healthcare: 0.0, Staples: 0.0,  Industrial: 0.0 },
  cautious_bearish: { Technology: -0.3, ConsDisc: -0.4, Communication: -0.2, Finance: -0.3, Energy: 0.0, Healthcare: 0.3, Staples: 0.4, Industrial: -0.3 },
  bearish:          { Technology: -0.6, ConsDisc: -0.7, Communication: -0.4, Finance: -0.5, Energy: 0.1, Healthcare: 0.4, Staples: 0.7, Industrial: -0.5 },
};

// stance_score weights. weightedSumRenorm handles null inputs, so removing
// flow_5d (permanently blocked data source) auto-rebalances the remaining 0.90.
const STANCE_WEIGHTS = {
  regime_fit: 0.30,
  earn_momentum: 0.20,
  valuation_sigma: 0.15,
  rel_strength_13w: 0.15,
  beat_rate_sector: 0.10,
};

// Matches portfolio-ingestor's shortHash (full 64-char SHA-256 hex).
async function shortHash(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/compute-sector-factors")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const today = new Date().toISOString().slice(0, 10);

    console.log(`[SECTOR-FACTOR] Starting for ${SECTORS.length} sectors (${today})`);

    // ---------- LOAD INPUTS ----------
    // 200DMA is computed directly from PRICE_01 (FUND_01.dma_200 is often null
    // because AV OVERVIEW drops the field intermittently), so FUND_01 is not
    // needed in this worker.
    const [stockRows, priceRows, macroRow, valRows] = await Promise.all([
      db.prepare(`
        SELECT s.* FROM STOCK_FACTORS_daily s
        INNER JOIN (SELECT ticker, MAX(date) as md FROM STOCK_FACTORS_daily GROUP BY ticker) g
        ON s.ticker = g.ticker AND s.date = g.md
      `).all(),
      db.prepare(`
        SELECT ticker, date, close FROM PRICE_01_Daily
        WHERE date >= date('now', '-400 days') ORDER BY ticker, date
      `).all(),
      db.prepare(`
        SELECT summary FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1
      `).first(),
      // Sprint 9: forward P/E history per sector from monthly SSGA fact-sheet scrapes.
      db.prepare(`
        SELECT sector_bucket, date, forward_pe FROM SECTOR_VALUATION_monthly
        WHERE forward_pe IS NOT NULL
        ORDER BY sector_bucket, date ASC
      `).all(),
    ]);

    const stockByTicker = indexBy(stockRows.results, "ticker");
    const pricesByTicker = groupBy(priceRows.results, "ticker");
    // Sprint 9: SECTOR_VALUATION_monthly grouped by sector for z-score computation.
    // Z-score activates at N >= 3 months of history.
    const valPEBySector = {};
    for (const r of (valRows.results || [])) {
      (valPEBySector[r.sector_bucket] ||= []).push(r.forward_pe);
    }

    // Resolve current regime label; fall back to "neutral" if missing/unparseable.
    let regime = "neutral";
    try {
      if (macroRow?.summary) {
        const blob = JSON.parse(macroRow.summary);
        if (blob?.trend?.regime && REGIME_AFFINITY[blob.trend.regime]) {
          regime = blob.trend.regime;
        }
      }
    } catch (e) {
      console.warn(`[SECTOR-FACTOR] BETA_10 summary unparseable: ${e.message}`);
    }
    console.log(`[SECTOR-FACTOR] regime=${regime}`);

    const spyPrices = pricesByTicker["SPY"] || [];
    const spy63 = pctReturn(spyPrices, 63);

    // ---------- PER-SECTOR COMPUTE ----------
    const rows = [];
    for (const sector of SECTORS) {
      const constituents = Object.keys(SECTOR_BUCKET).filter((t) => SECTOR_BUCKET[t] === sector);
      const etf = SECTOR_ETF[sector];
      const etfPrices = pricesByTicker[etf] || [];

      // Aggregate constituent stock-factor values (null-skipping).
      const epsRevs   = collect(constituents, (t) => stockByTicker[t]?.eps_rev_4w);
      const sues      = collect(constituents, (t) => stockByTicker[t]?.sue);
      const fwdPEs    = collect(constituents, (t) => stockByTicker[t]?.fwd_pe);

      const earn_momentum = epsRevs.length > 0 ? mean(epsRevs) : null;

      const beat_rate_sector = sues.length >= Math.ceil(constituents.length / 2)
        ? sues.filter((s) => s > 0).length / sues.length
        : null;

      const fwd_pe_sector = fwdPEs.length > 0 ? median(fwdPEs) : null;

      // breadth_above_200dma — latest close vs PRICE_01-computed 200DMA.
      // FUND_01.dma_200 is unreliable (AV returns null frequently), so we
      // compute it directly from PRICE_01 close history per ticker.
      let above = 0, denom = 0;
      for (const t of constituents) {
        const prices = pricesByTicker[t];
        if (!prices || prices.length < 10) continue;            // need at least a few bars
        const closes = prices.map((p) => p.close).filter((c) => c > 0);
        if (closes.length < 10) continue;
        const window = closes.slice(-200);
        const dma200 = mean(window);
        const latestClose = closes[closes.length - 1];
        denom++;
        if (latestClose > dma200) above++;
      }
      const breadth_above_200dma = denom > 0 ? above / denom : null;

      // rel_strength_13w — sector ETF 63d return − SPY 63d return.
      const etf63 = pctReturn(etfPrices, 63);
      const rel_strength_13w = (etf63 != null && spy63 != null) ? etf63 - spy63 : null;

      // JdK RRG — rs_raw = sector_close / spy_close; rs_ratio centered at 100.
      const { rs_ratio, rs_momentum } = computeRRG(etfPrices, spyPrices);

      const regime_fit = REGIME_AFFINITY[regime][sector] ?? 0;

      // Sprint 9: time-series rolling z-score (activates at N≥3 monthly snapshots).
      let rolling_sigma = null;
      const peHistory = valPEBySector[sector] || [];
      if (peHistory.length >= 3) {
        const window = peHistory.slice(-12);
        const latest = peHistory[peHistory.length - 1];
        const m = median(window);
        const s = stdev(window);
        if (s && s > 0) rolling_sigma = (latest - m) / s;
      }

      rows.push({
        sector,
        date: today,
        regime_fit,
        earn_momentum,
        beat_rate_sector,
        // valuation_sigma finalized in Sprint 9.1 second pass below
        rolling_sigma,
        rel_strength_13w,
        rs_ratio,
        rs_momentum,
        fwd_pe_sector,
        breadth_above_200dma,
      });
    }

    // ---------- SPRINT 9.1: finalize valuation_sigma ----------
    // Rolling (time-series, N≥3 months) preferred; otherwise cross-sectional
    // (this sector's fwd P/E vs the other sectors' today). Prefers SSGA's
    // weighted-harmonic fwd P/E (from SECTOR_VALUATION_monthly) over our
    // bottom-up constituent median — SSGA's number is cleaner (doesn't get
    // skewed by single-ticker outliers like BA's elevated P/E).
    const sectorPeForXsect = (sector, fallbackMedian) => {
      const hist = valPEBySector[sector] || [];
      return hist.length > 0 ? hist[hist.length - 1] : fallbackMedian;
    };
    const xsPEs = rows
      .map(r => sectorPeForXsect(r.sector, r.fwd_pe_sector))
      .filter(v => v != null && v > 0 && v < 100);   // drop implausible outliers
    const xsMedian = xsPEs.length > 0 ? median(xsPEs) : null;
    const xsStdev = xsPEs.length > 1 ? stdev(xsPEs) : null;
    const clip = (x, lo = -3, hi = 3) => Math.max(lo, Math.min(hi, x));
    for (const r of rows) {
      let sigma = null, method = null;
      if (r.rolling_sigma != null) {
        sigma = r.rolling_sigma;
        method = "rolling";
      } else {
        const pe = sectorPeForXsect(r.sector, r.fwd_pe_sector);
        if (pe != null && pe > 0 && pe < 100 && xsMedian != null && xsStdev && xsStdev > 0) {
          sigma = clip((pe - xsMedian) / xsStdev);
          method = "xsect";
        }
      }
      r.valuation_sigma = sigma;
      r.valuation_sigma_method = method;

      // stance_score — must run after valuation_sigma is finalized.
      const stance_score = weightedSumRenorm({
        regime_fit: r.regime_fit,
        earn_momentum: r.earn_momentum,
        valuation_sigma: r.valuation_sigma,
        rel_strength_13w: r.rel_strength_13w,
        beat_rate_sector: r.beat_rate_sector,
      }, STANCE_WEIGHTS);
      r.stance_score = stance_score;
      if (stance_score != null) {
        if (stance_score > 0.33) r.stance = "OW";
        else if (stance_score < -0.33) r.stance = "UW";
        else r.stance = "EW";
      } else {
        r.stance = null;
      }
    }

    // ---------- WRITE DIRECT TO D1 ----------
    // flow_5d column still exists on the table (D1 doesn't DROP COLUMN cleanly)
    // but is no longer written. It will remain NULL forever.
    const nowIso = new Date().toISOString();
    let ingested = 0;
    for (const r of rows) {
      const id = await shortHash(`${r.sector}|${r.date}`);
      await db.prepare(`
        INSERT INTO SECTOR_FACTORS_daily
          (id, sector, date, regime_fit, earn_momentum, beat_rate_sector, valuation_sigma,
           rel_strength_13w, rs_ratio, rs_momentum, stance_score, stance,
           fwd_pe_sector, breadth_above_200dma, valuation_sigma_method, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          regime_fit = excluded.regime_fit, earn_momentum = excluded.earn_momentum,
          beat_rate_sector = excluded.beat_rate_sector, valuation_sigma = excluded.valuation_sigma,
          rel_strength_13w = excluded.rel_strength_13w, rs_ratio = excluded.rs_ratio,
          rs_momentum = excluded.rs_momentum,
          stance_score = excluded.stance_score, stance = excluded.stance,
          fwd_pe_sector = excluded.fwd_pe_sector, breadth_above_200dma = excluded.breadth_above_200dma,
          valuation_sigma_method = excluded.valuation_sigma_method,
          created_at = excluded.created_at
      `).bind(
        id, r.sector, r.date,
        r.regime_fit ?? null, r.earn_momentum ?? null, r.beat_rate_sector ?? null,
        r.valuation_sigma ?? null, r.rel_strength_13w ?? null,
        r.rs_ratio ?? null, r.rs_momentum ?? null,
        r.stance_score ?? null, r.stance ?? null,
        r.fwd_pe_sector ?? null, r.breadth_above_200dma ?? null,
        r.valuation_sigma_method ?? null, nowIso,
      ).run();
      ingested++;
    }
    console.log(`[SECTOR-FACTOR] Wrote ${ingested} rows to SECTOR_FACTORS_daily`);

    return Response.json({ ok: true, computed: rows.length, ingested, regime, date: today });
  },
};

// ============================================================
// FACTOR HELPERS
// ============================================================

function computeRRG(etfPrices, spyPrices) {
  // Build paired rs_raw series from dates common to both ETF and SPY.
  // Both arrays are ASC by date.
  if (!etfPrices || !spyPrices || etfPrices.length < 85 || spyPrices.length < 85) {
    return { rs_ratio: null, rs_momentum: null };
  }
  const spyByDate = {};
  for (const p of spyPrices) spyByDate[p.date] = p.close;
  const rsRaw = [];
  for (const p of etfPrices) {
    const sp = spyByDate[p.date];
    if (sp && p.close) rsRaw.push(p.close / sp);
  }
  if (rsRaw.length < 85) return { rs_ratio: null, rs_momentum: null };

  // rs_ratio_t = 100 + 10 × ((rs_raw_t − SMA_63(rs_raw)) / σ_63(rs_raw))
  const computeRatio = (arr, endIdx) => {
    const start = endIdx - 62;
    if (start < 0) return null;
    const window = arr.slice(start, endIdx + 1);
    const m = mean(window);
    const s = stdev(window);
    if (!s || s === 0) return 100;
    return 100 + 10 * ((arr[endIdx] - m) / s);
  };

  const tIdx = rsRaw.length - 1;
  const rs_ratio = computeRatio(rsRaw, tIdx);

  // rs_momentum = rs_ratio_t − rs_ratio_{t-21} + 100
  const ratio21Ago = computeRatio(rsRaw, tIdx - 21);
  const rs_momentum = (rs_ratio != null && ratio21Ago != null)
    ? rs_ratio - ratio21Ago + 100
    : null;

  return { rs_ratio, rs_momentum };
}

function weightedSumRenorm(inputs, weights) {
  let num = 0;
  let denom = 0;
  for (const [k, w] of Object.entries(weights)) {
    const v = inputs[k];
    if (v == null) continue;
    num += v * w;
    denom += w;
  }
  if (denom === 0) return null;
  return num / denom;
}

// ============================================================
// GENERIC UTILS
// ============================================================

function indexBy(rows, key) {
  const map = {};
  for (const r of (rows || [])) {
    if (!map[r[key]]) map[r[key]] = r;
  }
  return map;
}

function groupBy(rows, key) {
  const map = {};
  for (const r of (rows || [])) {
    (map[r[key]] ||= []).push(r);
  }
  return map;
}

function collect(keys, extractor) {
  const out = [];
  for (const k of keys) {
    const v = extractor(k);
    if (v != null && !Number.isNaN(v)) out.push(v);
  }
  return out;
}

function mean(arr) {
  if (!arr || arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdev(arr) {
  if (!arr || arr.length < 2) return null;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function pctReturn(prices, days) {
  if (!prices || prices.length <= days) return null;
  const latest = prices[prices.length - 1]?.close;
  const base = prices[prices.length - 1 - days]?.close;
  if (!latest || !base || base === 0) return null;
  return latest / base - 1;
}
