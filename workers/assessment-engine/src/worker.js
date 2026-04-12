/**
 * ASSESSMENT ENGINE — Core Scoring System (v2)
 *
 * Computes a -1.0 to +1.0 composite score per ticker based on 8 factors.
 * ALL SCORING IS DETERMINISTIC MATH — no AI in the computation.
 * Then uses GPT-4o-mini ONLY to explain the pre-computed score in 2 sentences.
 *
 * Factors (v2 — refactored after Phase 5 review):
 * 1. Price position (vs 50DMA)                  Trust L4, weight 1.5
 * 2. Valuation (P/E vs sector avg)               Trust L3, weight 2.0
 * 3. Earnings momentum (surprise direction)      Trust L3, weight 2.0
 * 4. Analyst consensus (buy ratio)               Trust L3, weight 2.0
 * 5. Insider direction (Form 4 BUY/SELL parse)   Trust L1, weight 3.0
 * 6. News sentiment (BETA_12 avg magnitude)      Trust L5, weight 1.0
 * 7. Press materiality (sentiment × magnitude)   Trust L2, weight 2.5
 * 8. Macro alignment (sector in favor)           Trust L4, weight 1.5
 *
 * Total weight: 15.5
 *
 * Removed from v1:
 * - Relative performance (same-day noise — now handled by event-attribution-engine)
 * - SEC narrative keyword matching (too noisy on objective language)
 */

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS"
];

// BRK.B moved to Finance (Berkshire is primarily insurance + financial holdings)
const SECTOR_MAP = {
  AAPL: "Technology", MSFT: "Technology", GOOGL: "Technology", AMZN: "Technology",
  NVDA: "Technology", META: "Technology", INTC: "Technology", AMD: "Technology", NFLX: "Technology",
  TSLA: "Technology",
  JPM: "Finance", GS: "Finance", BAC: "Finance", MS: "Finance", "BRK.B": "Finance",
  XOM: "Energy", CVX: "Energy",
  UNH: "Healthcare", LLY: "Healthcare", JNJ: "Healthcare",
  PG: "Consumer", KO: "Consumer", HD: "Consumer",
  CAT: "Industrial", BA: "Industrial",
};

const INGESTOR_URL = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/compute-assessments")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const today = new Date().toISOString().slice(0, 10);

    console.log(`[ASSESSMENT v2] Starting for ${TICKERS.length} tickers (${today})`);

    // =========================================================
    // LOAD ALL DATA IN PARALLEL
    // =========================================================
    const [priceRows, fundRows, earningsRows, recsRows, form4Rows, newsRows, pressRows, macroRow] = await Promise.all([
      db.prepare(`SELECT * FROM PRICE_01_Daily WHERE date = (SELECT MAX(date) FROM PRICE_01_Daily)`).all(),
      db.prepare(`SELECT f.* FROM FUND_01_Fundamentals f INNER JOIN (SELECT ticker, MAX(date) as md FROM FUND_01_Fundamentals GROUP BY ticker) g ON f.ticker=g.ticker AND f.date=g.md`).all(),
      db.prepare(`SELECT e.* FROM FUND_02_Earnings e INNER JOIN (SELECT ticker, MAX(period) as mp FROM FUND_02_Earnings GROUP BY ticker) g ON e.ticker=g.ticker AND e.period=g.mp`).all(),
      db.prepare(`SELECT r.* FROM FUND_03_Recommendations r INNER JOIN (SELECT ticker, MAX(date) as md FROM FUND_03_Recommendations GROUP BY ticker) g ON r.ticker=g.ticker AND r.date=g.md`).all(),
      // Form 4: now load full summary text to parse BUY/SELL
      db.prepare(`SELECT ticker, summary, date FROM ALPHA_01_Reports WHERE type = '4' AND date >= date('now', '-30 days')`).all(),
      db.prepare(`SELECT ticker, sentiment, magnitude FROM BETA_12_News_digest WHERE date = ? AND type = 'ticker'`).bind(today).all(),
      // Press: now load sentiment + magnitude
      db.prepare(`SELECT ticker, date, sentiment, magnitude FROM ALPHA_03_Press WHERE date >= date('now', '-7 days')`).all(),
      db.prepare(`SELECT summary FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1`).first(),
    ]);

    // Index data by ticker for O(1) lookups
    const prices = indexBy(priceRows.results, "ticker");
    const funds = indexBy(fundRows.results, "ticker");
    const earnings = indexBy(earningsRows.results, "ticker");
    const recs = indexBy(recsRows.results, "ticker");

    // Form 4 summaries grouped by ticker (array of summary strings)
    const form4ByTicker = {};
    for (const r of (form4Rows.results || [])) {
      if (!form4ByTicker[r.ticker]) form4ByTicker[r.ticker] = [];
      if (r.summary) form4ByTicker[r.ticker].push(r.summary);
    }

    // News sentiment averages per ticker (from BETA_12)
    const newsSentiment = {};
    const newsCount = {};
    for (const r of (newsRows.results || [])) {
      if (r.ticker && r.magnitude != null) {
        newsSentiment[r.ticker] = (newsSentiment[r.ticker] || 0) + r.magnitude;
        newsCount[r.ticker] = (newsCount[r.ticker] || 0) + 1;
      }
    }

    // Press releases grouped by ticker with sentiment+magnitude
    const pressByTicker = {};
    for (const r of (pressRows.results || [])) {
      if (!pressByTicker[r.ticker]) pressByTicker[r.ticker] = [];
      pressByTicker[r.ticker].push({
        date: r.date,
        sentiment: r.sentiment,
        magnitude: r.magnitude,
      });
    }

    // Parse macro intelligence for sector alignment
    let macroIntel = null;
    try {
      if (macroRow?.summary?.startsWith("{")) macroIntel = JSON.parse(macroRow.summary);
    } catch (e) { /* not JSON */ }

    // Compute sector average P/E from our tickers
    const sectorPE = {};
    const sectorPEcount = {};
    for (const ticker of TICKERS) {
      const f = funds[ticker];
      if (f?.pe_ratio && f.pe_ratio > 0) {
        const sec = SECTOR_MAP[ticker];
        sectorPE[sec] = (sectorPE[sec] || 0) + f.pe_ratio;
        sectorPEcount[sec] = (sectorPEcount[sec] || 0) + 1;
      }
    }
    for (const sec of Object.keys(sectorPE)) {
      sectorPE[sec] /= sectorPEcount[sec];
    }

    // =========================================================
    // COMPUTE FACTORS PER TICKER (8 factors)
    // =========================================================
    const assessments = [];

    for (const ticker of TICKERS) {
      const factors = [];
      const sources = [];

      const p = prices[ticker];
      const f = funds[ticker];
      const e = earnings[ticker];
      const r = recs[ticker];
      const sector = SECTOR_MAP[ticker];

      // -------------------------------------------------------
      // Factor 1: Price position (vs 50DMA)
      // -------------------------------------------------------
      let f1 = 0, f1reason = "No price/DMA data";
      if (p && f?.dma_50) {
        if (p.close > f.dma_50 * 1.02) {
          f1 = 1;
          f1reason = `Close ${p.close.toFixed(1)} above 50DMA ${f.dma_50.toFixed(1)}`;
        } else if (p.close < f.dma_50 * 0.98) {
          f1 = -1;
          f1reason = `Close ${p.close.toFixed(1)} below 50DMA ${f.dma_50.toFixed(1)}`;
        } else {
          f1reason = `Close near 50DMA ${f.dma_50.toFixed(1)}`;
        }
        sources.push("PRICE_01_Daily", "FUND_01_Fundamentals");
      }
      factors.push({ name: "Price position", value: f1, weight: 1.5, trust: 4, reason: f1reason });

      // -------------------------------------------------------
      // Factor 2: Valuation (P/E vs sector average)
      // -------------------------------------------------------
      let f2 = 0, f2reason = "No P/E data";
      if (f?.pe_ratio && f.pe_ratio > 0 && sectorPE[sector] && sectorPEcount[sector] > 1) {
        const ratio = f.pe_ratio / sectorPE[sector];
        if (ratio < 0.8) {
          f2 = 1;
          f2reason = `P/E ${f.pe_ratio.toFixed(1)} below sector avg ${sectorPE[sector].toFixed(1)}`;
        } else if (ratio > 1.2) {
          f2 = -1;
          f2reason = `P/E ${f.pe_ratio.toFixed(1)} above sector avg ${sectorPE[sector].toFixed(1)}`;
        } else {
          f2reason = `P/E ${f.pe_ratio.toFixed(1)} near sector avg ${sectorPE[sector].toFixed(1)}`;
        }
        sources.push("FUND_01_Fundamentals");
      }
      factors.push({ name: "Valuation", value: f2, weight: 2.0, trust: 3, reason: f2reason });

      // -------------------------------------------------------
      // Factor 3: Earnings momentum (last surprise)
      // -------------------------------------------------------
      let f3 = 0, f3reason = "No earnings data";
      if (e?.surprise_pct != null) {
        if (e.surprise_pct > 2) {
          f3 = 1;
          f3reason = `Last surprise +${e.surprise_pct.toFixed(1)}%`;
        } else if (e.surprise_pct < -2) {
          f3 = -1;
          f3reason = `Last surprise ${e.surprise_pct.toFixed(1)}%`;
        } else {
          f3reason = `Last surprise ${e.surprise_pct.toFixed(1)}% (in line)`;
        }
        sources.push("FUND_02_Earnings");
      }
      factors.push({ name: "Earnings momentum", value: f3, weight: 2.0, trust: 3, reason: f3reason });

      // -------------------------------------------------------
      // Factor 4: Analyst consensus (buy ratio)
      // -------------------------------------------------------
      let f4 = 0, f4reason = "No analyst data";
      if (r) {
        const total = (r.strong_buy || 0) + (r.buy || 0) + (r.hold || 0) + (r.sell || 0) + (r.strong_sell || 0);
        if (total > 0) {
          const buyRatio = ((r.strong_buy || 0) + (r.buy || 0)) / total;
          if (buyRatio > 0.6) {
            f4 = 1;
            f4reason = `${Math.round(buyRatio * 100)}% buy/strong-buy`;
          } else if (buyRatio < 0.4) {
            f4 = -1;
            f4reason = `Only ${Math.round(buyRatio * 100)}% buy/strong-buy`;
          } else {
            f4reason = `${Math.round(buyRatio * 100)}% buy/strong-buy (mixed)`;
          }
          sources.push("FUND_03_Recommendations");
        }
      }
      factors.push({ name: "Analyst consensus", value: f4, weight: 2.0, trust: 3, reason: f4reason });

      // -------------------------------------------------------
      // Factor 5: Insider direction (parse Form 4 summaries for BUY/SELL)
      // -------------------------------------------------------
      let f5 = 0, f5reason = "No recent Form 4 filings";
      const form4Summaries = form4ByTicker[ticker] || [];
      if (form4Summaries.length > 0) {
        let buys = 0, sells = 0;
        for (const s of form4Summaries) {
          const text = (s || "").toUpperCase();
          // form4-summarizer writes explicit "BUY"/"SELL" and "DIRECTION: buy/sell"
          const hasBuy = text.includes("DIRECTION: BUY") || text.includes("DIRECTION:BUY") ||
                         text.includes("PURCHASE") || text.match(/\bBUY\b/);
          const hasSell = text.includes("DIRECTION: SELL") || text.includes("DIRECTION:SELL") ||
                          text.includes("DISPOSED") || text.match(/\bSELL\b/);
          // Prefer the stronger signal — if both appear, skip (balanced/ambiguous)
          if (hasBuy && !hasSell) buys++;
          else if (hasSell && !hasBuy) sells++;
        }
        if (buys > sells) {
          f5 = 1;
          f5reason = `${buys} insider buy(s) vs ${sells} sell(s)`;
        } else if (sells > buys) {
          f5 = -1;
          f5reason = `${sells} insider sell(s) vs ${buys} buy(s)`;
        } else {
          f5reason = `${buys} buys / ${sells} sells (balanced)`;
        }
        sources.push("ALPHA_01_Reports");
      }
      factors.push({ name: "Insider direction", value: f5, weight: 3.0, trust: 1, reason: f5reason });

      // -------------------------------------------------------
      // Factor 6: News sentiment (from BETA_12 filter agent)
      // -------------------------------------------------------
      let f6 = 0, f6reason = "No news today";
      if (newsCount[ticker] > 0) {
        const avgMag = newsSentiment[ticker] / newsCount[ticker];
        if (avgMag > 0.3) {
          f6 = 1;
          f6reason = `News sentiment +${avgMag.toFixed(2)} (${newsCount[ticker]} items)`;
        } else if (avgMag < -0.3) {
          f6 = -1;
          f6reason = `News sentiment ${avgMag.toFixed(2)} (${newsCount[ticker]} items)`;
        } else {
          f6reason = `News sentiment neutral ${avgMag.toFixed(2)}`;
        }
        sources.push("BETA_12_News_digest");
      }
      factors.push({ name: "News sentiment", value: f6, weight: 1.0, trust: 5, reason: f6reason });

      // -------------------------------------------------------
      // Factor 7: Press materiality (content-based sentiment × magnitude)
      // -------------------------------------------------------
      let f7 = 0, f7reason = "No recent press releases";
      const pressItems = pressByTicker[ticker] || [];
      if (pressItems.length > 0) {
        // Weighted average: direction × magnitude
        let weightedSum = 0;
        let totalMag = 0;
        for (const press of pressItems) {
          if (press.magnitude != null && press.sentiment) {
            const dir = press.sentiment === "bullish" ? 1 : press.sentiment === "bearish" ? -1 : 0;
            weightedSum += dir * press.magnitude;
            totalMag += press.magnitude;
          }
        }
        if (totalMag > 0) {
          const avg = weightedSum / totalMag;
          if (avg > 0.3) {
            f7 = 1;
            f7reason = `Material bullish press (avg ${avg.toFixed(2)}, ${pressItems.length} items)`;
          } else if (avg < -0.3) {
            f7 = -1;
            f7reason = `Material bearish press (avg ${avg.toFixed(2)}, ${pressItems.length} items)`;
          } else {
            f7reason = `Mixed press signals (${avg.toFixed(2)})`;
          }
          sources.push("ALPHA_03_Press");
        } else {
          f7reason = `${pressItems.length} press release(s) but no sentiment data yet`;
        }
      }
      factors.push({ name: "Press materiality", value: f7, weight: 2.5, trust: 2, reason: f7reason });

      // -------------------------------------------------------
      // Factor 8: Macro alignment (is this sector favored by macro intelligence?)
      // -------------------------------------------------------
      let f8 = 0, f8reason = "No macro intelligence";
      if (macroIntel?.portfolio_action) {
        const pa = macroIntel.portfolio_action;
        const overweight = (pa.overweight || []).map(s => s.toLowerCase());
        const underweight = (pa.underweight || []).map(s => s.toLowerCase());
        const sectorLower = sector.toLowerCase();
        if (overweight.some(s => s.includes(sectorLower) || sectorLower.includes(s))) {
          f8 = 1;
          f8reason = `${sector} sector in overweight recommendation`;
        } else if (underweight.some(s => s.includes(sectorLower) || sectorLower.includes(s))) {
          f8 = -1;
          f8reason = `${sector} sector in underweight recommendation`;
        } else {
          f8reason = `${sector} sector not mentioned in macro action`;
        }
        sources.push("BETA_10_Daily_macro");
      }
      factors.push({ name: "Macro alignment", value: f8, weight: 1.5, trust: 4, reason: f8reason });

      // =========================================================
      // COMPUTE COMPOSITE SCORE
      // =========================================================
      let weightedSum = 0;
      let totalWeight = 0;
      for (const fac of factors) {
        weightedSum += fac.value * fac.weight;
        totalWeight += fac.weight;
      }
      const score = totalWeight > 0 ? Math.max(-1, Math.min(1, weightedSum / totalWeight)) : 0;

      assessments.push({
        ticker,
        date: today,
        score: Math.round(score * 1000) / 1000,
        factors,
        sources: [...new Set(sources)],
      });
    }

    console.log(`[ASSESSMENT v2] Computed scores for ${assessments.length} tickers`);

    // =========================================================
    // AI EXPLANATIONS (GPT-4o-mini, batched 5 at a time)
    // =========================================================
    const apiKey = env.OPENAI_API_KEY;

    if (apiKey) {
      for (let i = 0; i < assessments.length; i += 5) {
        const batch = assessments.slice(i, i + 5);
        await Promise.allSettled(
          batch.map(async (a) => {
            try {
              const factorLines = a.factors
                .filter(f => f.value !== 0)
                .map(f => `${f.name}: ${f.value > 0 ? "+1" : "-1"} (${f.reason})`)
                .join("\n");

              const prompt = `Given these factor scores for ${a.ticker}:\n${factorLines || "All factors neutral."}\nComposite score: ${a.score.toFixed(3)}\n\nWrite exactly 2 sentences explaining what is driving this stock. Focus on the strongest factors. Do not invent any numbers not listed above. Do not add caveats or disclaimers.`;

              const res = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [{ role: "user", content: prompt }],
                  temperature: 0,
                  max_tokens: 150,
                }),
              });

              const j = await res.json();
              a.explanation = j.choices?.[0]?.message?.content?.trim() || null;
            } catch (err) {
              console.error(`[ASSESSMENT v2] Explanation failed for ${a.ticker}: ${err.message}`);
            }
          })
        );
        if (i + 5 < assessments.length) await sleep(200);
      }
      console.log(`[ASSESSMENT v2] Generated ${assessments.filter(a => a.explanation).length} explanations`);
    }

    // =========================================================
    // WRITE TO D1 VIA INGESTOR
    // =========================================================
    try {
      const payload = assessments.map(a => ({
        ticker: a.ticker,
        date: a.date,
        score: a.score,
        factors_json: JSON.stringify(a.factors),
        explanation: a.explanation || "",
        sources_json: JSON.stringify(a.sources),
      }));

      const res = await fetch(`${INGESTOR_URL}/ingest/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[ASSESSMENT v2] Ingested ${data.inserted} assessments`);
      }
    } catch (err) {
      console.error(`[ASSESSMENT v2] Ingest failed: ${err.message}`);
    }

    return Response.json({
      ok: true,
      date: today,
      tickers: assessments.length,
      scores: assessments.map(a => ({ ticker: a.ticker, score: a.score })),
    });
  },
};

function indexBy(rows, key) {
  const map = {};
  for (const r of (rows || [])) {
    if (!map[r[key]]) map[r[key]] = r;
  }
  return map;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
