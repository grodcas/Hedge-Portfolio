export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.HEDGE_DB;

    // CORS headers for dashboard access
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    /* =========================
       GET ENDPOINTS (QUERY)
    ========================= */
    if (request.method === "GET") {
      try {
        // -------- GET /query/daily-macro --------
        if (path === "/query/daily-macro") {
          const row = await db.prepare(`
            SELECT id, structure, summary, creation_date
            FROM BETA_10_Daily_macro
            ORDER BY creation_date DESC
            LIMIT 1
          `).first();

          if (!row) {
            return Response.json({ error: "No data" }, { status: 404, headers: corsHeaders });
          }

          return Response.json({
            id: row.id,
            structure: JSON.parse(row.structure || "[]"),
            summary: row.summary,
            creation_date: row.creation_date
          }, { headers: corsHeaders });
        }

        // -------- GET /query/macro-trend --------
        if (path === "/query/macro-trend") {
          const row = await db.prepare(`
            SELECT id, summary, created_at
            FROM BETA_09_Trend
            ORDER BY created_at DESC
            LIMIT 1
          `).first();

          if (!row) {
            return Response.json({ error: "No data" }, { status: 404, headers: corsHeaders });
          }

          return Response.json({
            id: row.id,
            summary: row.summary,
            date: row.created_at
          }, { headers: corsHeaders });
        }

        // -------- GET /query/reports --------
        if (path === "/query/reports") {
          const ticker = url.searchParams.get("ticker");

          let query = `
            SELECT id, date, ticker, type, structure, summary, created_at
            FROM ALPHA_01_Reports
            ORDER BY date DESC
            LIMIT 50
          `;

          if (ticker) {
            query = `
              SELECT id, date, ticker, type, structure, summary, created_at
              FROM ALPHA_01_Reports
              WHERE ticker = ?
              ORDER BY date DESC
              LIMIT 10
            `;
          }

          const stmt = ticker
            ? db.prepare(query).bind(ticker)
            : db.prepare(query);

          const { results } = await stmt.all();

          // Group by ticker
          const byTicker = {};
          for (const row of results) {
            if (!byTicker[row.ticker]) byTicker[row.ticker] = [];
            byTicker[row.ticker].push({
              id: row.id,
              date: row.date,
              form_type: row.type,
              structure: JSON.parse(row.structure || "[]"),
              summary: row.summary,
              created_at: row.created_at
            });
          }

          return Response.json(byTicker, { headers: corsHeaders });
        }

        // -------- GET /query/macro --------
        if (path === "/query/macro") {
          const { results } = await db.prepare(`
            SELECT id, date, type, summary, created_at
            FROM BETA_03_Macro
            ORDER BY date DESC
            LIMIT 20
          `).all();

          return Response.json({
            Macro: results.map(r => ({
              id: r.id,
              date: r.date,
              heading: r.type,
              summary: r.summary ? JSON.parse(r.summary) : null
            }))
          }, { headers: corsHeaders });
        }

        // -------- GET /query/sentiment --------
        if (path === "/query/sentiment") {
          const { results } = await db.prepare(`
            SELECT id, date, type, summary, created_at
            FROM BETA_04_Sentiment
            ORDER BY date DESC
            LIMIT 20
          `).all();

          return Response.json({
            Sentiment: results.map(r => ({
              id: r.id,
              date: r.date,
              heading: r.type,
              summary: r.summary ? JSON.parse(r.summary) : null
            }))
          }, { headers: corsHeaders });
        }

        // -------- GET /query/press --------
        if (path === "/query/press") {
          const dateParam = url.searchParams.get("date");
          const { results } = await db.prepare(`
            SELECT id, ticker, date, heading, summary, sentiment, magnitude, created_at
            FROM ALPHA_03_Press
            ${dateParam ? "WHERE date = ?" : ""}
            ORDER BY date DESC, created_at DESC
            LIMIT 100
          `).bind(...(dateParam ? [dateParam] : [])).all();

          // Group by ticker
          const byTicker = {};
          for (const row of results) {
            if (!byTicker[row.ticker]) byTicker[row.ticker] = [];
            byTicker[row.ticker].push({
              id: row.id,
              date: row.date,
              heading: row.heading,
              summary: row.summary,
              sentiment: row.sentiment,
              magnitude: row.magnitude,
              created_at: row.created_at
            });
          }

          return Response.json(byTicker, { headers: corsHeaders });
        }

        // -------- GET /query/whitehouse --------
        if (path === "/query/whitehouse") {
          const { results } = await db.prepare(`
            SELECT id, date, title, summary, created_at
            FROM BETA_02_WH
            ORDER BY date DESC
            LIMIT 20
          `).all();

          return Response.json({
            WhiteHouse: results.map(r => {
              // Parse link from JSON summary if available
              let summary = r.summary;
              let link = null;
              try {
                const parsed = JSON.parse(r.summary);
                if (parsed?.text) { summary = parsed.text; link = parsed.link || null; }
              } catch {}
              return { id: r.id, date: r.date, title: r.title, summary, link, created_at: r.created_at };
            })
          }, { headers: corsHeaders });
        }

        // -------- GET /query/pipeline-validation --------
        if (path === "/query/pipeline-validation") {
          const dateParam = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

          const row = await db.prepare(`
            SELECT id, date, summary, validations, logs, created_at
            FROM PROC_01_Pipeline_logs
            WHERE date = ?
            ORDER BY created_at DESC
            LIMIT 1
          `).bind(dateParam).first();

          if (row) {
            return Response.json({
              date: row.date,
              summary: row.summary ? JSON.parse(row.summary) : null,
              validations: row.validations ? JSON.parse(row.validations) : null,
              logs: row.logs ? JSON.parse(row.logs) : [],
              created_at: row.created_at
            }, { headers: corsHeaders });
          }

          return Response.json({ date: dateParam, summary: null, validations: null, logs: [] }, { headers: corsHeaders });
        }

        // -------- GET /query/earnings-calendar --------
        if (path === "/query/earnings-calendar") {
          const { results } = await db.prepare(`
            SELECT ticker, date, type
            FROM ALPHA_01_Reports
            WHERE type IN ('10-K', '10-Q')
            ORDER BY date DESC
          `).all();

          // Estimate next earnings based on last filing
          const calendar = {};
          for (const row of results) {
            if (!calendar[row.ticker]) {
              // Estimate next earnings ~90 days after last filing
              const lastDate = new Date(row.date);
              lastDate.setDate(lastDate.getDate() + 90);
              calendar[row.ticker] = {
                nextEarnings: lastDate.toISOString().slice(0, 10),
                type: row.type === "10-K" ? "10-Q" : "10-Q",
                lastFiling: row.date
              };
            }
          }

          return Response.json(calendar, { headers: corsHeaders });
        }

        // -------- GET /query/verification --------
        if (path === "/query/verification") {
          const dateParam = url.searchParams.get("date");
          const targetDate = dateParam || new Date().toISOString().slice(0, 10);

          const results = await db.prepare(`
            SELECT id, date, summary_id, summary_type, total_facts, verified, not_found,
                   contradicted, score, issues, created_at
            FROM GAMMA_01_Verification
            WHERE date = ?
            ORDER BY created_at DESC
          `).bind(targetDate).all();

          return Response.json({
            date: targetDate,
            results: (results.results || []).map(r => {
              const parsed = r.issues ? JSON.parse(r.issues) : [];
              // Handle both old format (array of issues) and new format (object with problems/verifiedFacts/analysis)
              const isNewFormat = parsed && !Array.isArray(parsed) && typeof parsed === "object";
              return {
                id: r.id,
                summaryId: r.summary_id,
                summaryType: r.summary_type,
                totalFacts: r.total_facts,
                verified: r.verified,
                notFound: r.not_found,
                contradicted: r.contradicted,
                score: r.score,
                issues: isNewFormat ? (parsed.problems || []) : parsed,
                verifiedFacts: isNewFormat ? (parsed.verifiedFacts || []) : [],
                analysis: isNewFormat ? (parsed.analysis || "") : "",
                createdAt: r.created_at
              };
            })
          }, { headers: corsHeaders });
        }

        // -------- GET /query/workflow-status --------
        if (path === "/query/workflow-status") {
          const row = await db.prepare(`
            SELECT id, status, completed_at
            FROM PROC_02_Workflow_status
            WHERE id = 'latest'
          `).first();

          return Response.json(row || { status: "unknown" }, { headers: corsHeaders });
        }

        // -------- GET /query/all (dashboard combined) --------
        if (path === "/query/all") {
          const [dailyMacro, macroTrend, macro, sentiment] = await Promise.all([
            db.prepare(`SELECT id, structure, summary, creation_date FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1`).first(),
            db.prepare(`SELECT id, summary, created_at FROM BETA_09_Trend ORDER BY created_at DESC LIMIT 1`).first(),
            db.prepare(`SELECT id, date, type, summary, created_at FROM BETA_03_Macro ORDER BY date DESC LIMIT 20`).all(),
            db.prepare(`SELECT id, date, type, summary, created_at FROM BETA_04_Sentiment ORDER BY date DESC LIMIT 20`).all()
          ]);

          return Response.json({
            dailyMacro: dailyMacro ? {
              id: dailyMacro.id,
              structure: JSON.parse(dailyMacro.structure || "[]"),
              summary: dailyMacro.summary,
              creation_date: dailyMacro.creation_date
            } : null,
            macroTrend: macroTrend ? {
              id: macroTrend.id,
              summary: macroTrend.summary,
              date: macroTrend.created_at
            } : null,
            macro: {
              Macro: (macro.results || []).map(r => ({
                id: r.id,
                date: r.date,
                heading: r.type,
                summary: r.summary ? JSON.parse(r.summary) : null
              }))
            },
            sentiment: {
              Sentiment: (sentiment.results || []).map(r => ({
                id: r.id,
                date: r.date,
                heading: r.type,
                summary: r.summary ? JSON.parse(r.summary) : null
              }))
            }
          }, { headers: corsHeaders });
        }

        // -------- GET /query/prices --------
        if (path === "/query/prices") {
          const ticker = url.searchParams.get("ticker");
          const date = url.searchParams.get("date");
          const range = parseInt(url.searchParams.get("range") || "0");

          let rows;
          if (ticker && range > 0) {
            // Time series for one ticker (for charts)
            rows = await db.prepare(`
              SELECT * FROM PRICE_01_Daily WHERE ticker = ? ORDER BY date DESC LIMIT ?
            `).bind(ticker, range).all();
          } else if (date) {
            rows = await db.prepare(`
              SELECT * FROM PRICE_01_Daily WHERE date = ? ORDER BY ticker
            `).bind(date).all();
          } else {
            // Latest date, all tickers
            const latestDate = await db.prepare(`SELECT date FROM PRICE_01_Daily ORDER BY date DESC LIMIT 1`).first();
            if (!latestDate) return Response.json({ error: "No price data" }, { status: 404, headers: corsHeaders });
            rows = await db.prepare(`
              SELECT * FROM PRICE_01_Daily WHERE date = ? ORDER BY ticker
            `).bind(latestDate.date).all();
          }

          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        // -------- GET /query/sector-performance --------
        if (path === "/query/sector-performance") {
          const latestDate = await db.prepare(`SELECT date FROM PRICE_01_Daily ORDER BY date DESC LIMIT 1`).first();
          if (!latestDate) return Response.json({ error: "No price data" }, { status: 404, headers: corsHeaders });

          const { results } = await db.prepare(`
            SELECT ticker, open, close FROM PRICE_01_Daily WHERE date = ?
          `).bind(latestDate.date).all();

          const priceMap = {};
          for (const r of results) {
            priceMap[r.ticker] = r.open > 0 ? ((r.close - r.open) / r.open * 100) : 0;
          }

          const sectorETFs = { Technology: "XLK", Finance: "XLF", Energy: "XLE", Healthcare: "XLV", Consumer: "XLP", Industrial: "XLI" };
          const sectors = {};
          for (const [sector, etf] of Object.entries(sectorETFs)) {
            sectors[sector] = { etf, return_pct: priceMap[etf] ?? null };
          }

          return Response.json({
            date: latestDate.date,
            spy_return: priceMap["SPY"] ?? null,
            sectors,
          }, { headers: corsHeaders });
        }

        // -------- GET /query/fundamentals --------
        if (path === "/query/fundamentals") {
          const ticker = url.searchParams.get("ticker");
          const history = url.searchParams.get("history");

          let rows;
          if (ticker && history) {
            rows = await db.prepare(`
              SELECT * FROM FUND_01_Fundamentals WHERE ticker = ? ORDER BY date DESC LIMIT 30
            `).bind(ticker).all();
          } else if (ticker) {
            const row = await db.prepare(`
              SELECT * FROM FUND_01_Fundamentals WHERE ticker = ? ORDER BY date DESC LIMIT 1
            `).bind(ticker).first();
            return Response.json(row || {}, { headers: corsHeaders });
          } else {
            // Latest per ticker
            rows = await db.prepare(`
              SELECT f.* FROM FUND_01_Fundamentals f
              INNER JOIN (SELECT ticker, MAX(date) as max_date FROM FUND_01_Fundamentals GROUP BY ticker) g
              ON f.ticker = g.ticker AND f.date = g.max_date
              ORDER BY f.ticker
            `).all();
          }

          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        // -------- GET /query/earnings --------
        if (path === "/query/earnings") {
          const ticker = url.searchParams.get("ticker");

          let rows;
          if (ticker) {
            rows = await db.prepare(`
              SELECT * FROM FUND_02_Earnings WHERE ticker = ? ORDER BY period DESC LIMIT 8
            `).bind(ticker).all();
          } else {
            // Latest quarter per ticker
            rows = await db.prepare(`
              SELECT e.* FROM FUND_02_Earnings e
              INNER JOIN (SELECT ticker, MAX(period) as max_period FROM FUND_02_Earnings GROUP BY ticker) g
              ON e.ticker = g.ticker AND e.period = g.max_period
              ORDER BY e.ticker
            `).all();
          }

          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        // -------- GET /query/recommendations --------
        if (path === "/query/recommendations") {
          const ticker = url.searchParams.get("ticker");

          let rows;
          if (ticker) {
            rows = await db.prepare(`
              SELECT * FROM FUND_03_Recommendations WHERE ticker = ? ORDER BY date DESC LIMIT 6
            `).bind(ticker).all();
          } else {
            // Latest per ticker
            rows = await db.prepare(`
              SELECT r.* FROM FUND_03_Recommendations r
              INNER JOIN (SELECT ticker, MAX(date) as max_date FROM FUND_03_Recommendations GROUP BY ticker) g
              ON r.ticker = g.ticker AND r.date = g.max_date
              ORDER BY r.ticker
            `).all();
          }

          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        // -------- GET /query/assessments --------
        if (path === "/query/assessments") {
          const date = url.searchParams.get("date");
          const ticker = url.searchParams.get("ticker");
          const history = url.searchParams.get("history");

          let rows;
          if (ticker && history) {
            rows = await db.prepare(`SELECT * FROM SIGNAL_01_Assessment WHERE ticker = ? ORDER BY date DESC LIMIT 90`).bind(ticker).all();
          } else if (date) {
            rows = await db.prepare(`SELECT * FROM SIGNAL_01_Assessment WHERE date = ? ORDER BY score DESC`).bind(date).all();
          } else {
            const latest = await db.prepare(`SELECT MAX(date) as d FROM SIGNAL_01_Assessment`).first();
            if (!latest?.d) return Response.json([], { headers: corsHeaders });
            rows = await db.prepare(`SELECT * FROM SIGNAL_01_Assessment WHERE date = ? ORDER BY score DESC`).bind(latest.d).all();
          }

          const parsed = (rows.results || []).map(r => ({
            ...r,
            factors: r.factors_json ? JSON.parse(r.factors_json) : [],
            sources: r.sources_json ? JSON.parse(r.sources_json) : [],
          }));
          return Response.json(parsed, { headers: corsHeaders });
        }

        // -------- GET /query/probabilities --------
        if (path === "/query/probabilities") {
          const ticker = url.searchParams.get("ticker");
          const date = url.searchParams.get("date");

          let rows;
          if (ticker) {
            rows = await db.prepare(`SELECT * FROM SIGNAL_02_Probability WHERE ticker = ? ORDER BY date DESC LIMIT 90`).bind(ticker).all();
          } else if (date) {
            rows = await db.prepare(`SELECT * FROM SIGNAL_02_Probability WHERE date = ? ORDER BY ticker`).bind(date).all();
          } else {
            const latest = await db.prepare(`SELECT MAX(date) as d FROM SIGNAL_02_Probability`).first();
            if (!latest?.d) return Response.json([], { headers: corsHeaders });
            rows = await db.prepare(`SELECT * FROM SIGNAL_02_Probability WHERE date = ? ORDER BY ticker`).bind(latest.d).all();
          }

          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        // -------- GET /query/consensus --------
        if (path === "/query/consensus") {
          const date = url.searchParams.get("date");
          const target = url.searchParams.get("target");

          let rows;
          if (target) {
            rows = await db.prepare(`SELECT * FROM SIGNAL_03_Consensus WHERE target = ? ORDER BY date DESC LIMIT 30`).bind(target).all();
          } else if (date) {
            rows = await db.prepare(`SELECT * FROM SIGNAL_03_Consensus WHERE date = ?`).bind(date).all();
          } else {
            const latest = await db.prepare(`SELECT MAX(date) as d FROM SIGNAL_03_Consensus`).first();
            if (!latest?.d) return Response.json([], { headers: corsHeaders });
            rows = await db.prepare(`SELECT * FROM SIGNAL_03_Consensus WHERE date = ?`).bind(latest.d).all();
          }

          const parsed = (rows.results || []).map(r => ({
            ...r,
            missed_factors: r.missed_factors ? JSON.parse(r.missed_factors) : [],
            search_sources: r.search_sources ? JSON.parse(r.search_sources) : [],
          }));
          return Response.json(parsed, { headers: corsHeaders });
        }

        // -------- GET /query/pipeline-health --------
        if (path === "/query/pipeline-health") {
          // Return status of the most recent daily_update jobs,
          // grouped by wave. Used by dashboard to show pipeline progress.
          const { results } = await db.prepare(`
            SELECT id, worker, wave, status, date, last_update
            FROM PROC_01_Job_queue
            WHERE date >= datetime('now', '-2 hours')
            ORDER BY wave ASC, id ASC
          `).all();

          const jobs = results || [];
          const byWave = {};
          for (const j of jobs) {
            if (!byWave[j.wave]) byWave[j.wave] = [];
            byWave[j.wave].push({
              worker: j.worker,
              status: j.status,
              last_update: j.last_update,
            });
          }

          const summary = {
            total: jobs.length,
            done: jobs.filter(j => j.status === "done").length,
            running: jobs.filter(j => j.status === "running").length,
            pending: jobs.filter(j => j.status === "pending").length,
            failed: jobs.filter(j => j.status === "failed").length,
          };

          // Also fetch workflow completion flag
          const wf = await db.prepare(`
            SELECT status, completed_at FROM PROC_02_Workflow_status WHERE id='latest'
          `).first();

          return Response.json({
            summary,
            workflow: wf || { status: "unknown" },
            waves: byWave,
          }, { headers: corsHeaders });
        }

        // -------- GET /query/attributions --------
        if (path === "/query/attributions") {
          const date = url.searchParams.get("date");
          const ticker = url.searchParams.get("ticker");

          let rows;
          if (ticker) {
            rows = await db.prepare(`SELECT * FROM SIGNAL_04_Attributions WHERE ticker = ? ORDER BY date DESC LIMIT 30`).bind(ticker).all();
          } else if (date) {
            rows = await db.prepare(`SELECT * FROM SIGNAL_04_Attributions WHERE date = ?`).bind(date).all();
          } else {
            const latest = await db.prepare(`SELECT MAX(date) as d FROM SIGNAL_04_Attributions`).first();
            if (!latest?.d) return Response.json([], { headers: corsHeaders });
            rows = await db.prepare(`SELECT * FROM SIGNAL_04_Attributions WHERE date = ?`).bind(latest.d).all();
          }

          const parsed = (rows.results || []).map(r => ({
            ...r,
            candidates: r.candidates_json ? JSON.parse(r.candidates_json) : [],
          }));
          return Response.json(parsed, { headers: corsHeaders });
        }

        // -------- GET /query/portfolio-signals --------
        if (path === "/query/portfolio-signals") {
          const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

          // Find latest assessment date (fallback if specific date empty)
          let workingDate = date;
          const check = await db.prepare(`SELECT MAX(date) as d FROM SIGNAL_01_Assessment WHERE date <= ?`).bind(date).first();
          if (check?.d) workingDate = check.d;

          const [assessments, probabilities, consensus, prices, attributions] = await Promise.all([
            db.prepare(`SELECT * FROM SIGNAL_01_Assessment WHERE date = ? ORDER BY score DESC`).bind(workingDate).all(),
            db.prepare(`SELECT * FROM SIGNAL_02_Probability WHERE date = ?`).bind(workingDate).all(),
            db.prepare(`SELECT * FROM SIGNAL_03_Consensus WHERE date = ?`).bind(workingDate).all(),
            db.prepare(`SELECT * FROM PRICE_01_Daily WHERE date = (SELECT MAX(date) FROM PRICE_01_Daily WHERE date <= ?)`).bind(workingDate).all(),
            db.prepare(`SELECT * FROM SIGNAL_04_Attributions WHERE date = ?`).bind(workingDate).all(),
          ]);

          // Index by ticker
          const probMap = {};
          for (const p of (probabilities.results || [])) probMap[p.ticker] = p;
          const consMap = {};
          for (const c of (consensus.results || [])) consMap[c.target] = c;
          const priceMap = {};
          for (const pr of (prices.results || [])) priceMap[pr.ticker] = pr;
          const attrMap = {};
          for (const a of (attributions.results || [])) attrMap[a.ticker] = a;

          const tickers = (assessments.results || []).map(a => {
            const price = priceMap[a.ticker];
            const ret = price && price.open > 0 ? ((price.close - price.open) / price.open * 100) : null;
            return {
              ticker: a.ticker,
              date: a.date,
              score: a.score,
              factors: a.factors_json ? JSON.parse(a.factors_json) : [],
              explanation: a.explanation,
              sources: a.sources_json ? JSON.parse(a.sources_json) : [],
              probability: probMap[a.ticker] ? {
                p_favorable: probMap[a.ticker].p_favorable,
                p_neutral: probMap[a.ticker].p_neutral,
                p_unfavorable: probMap[a.ticker].p_unfavorable,
              } : null,
              consensus: consMap[a.ticker] ? {
                confidence: consMap[a.ticker].confidence,
                level: consMap[a.ticker].consensus_level,
                narrative: consMap[a.ticker].dominant_narrative,
                counter: consMap[a.ticker].strongest_counter,
              } : null,
              price: price ? {
                close: price.close,
                return_pct: ret,
              } : null,
              attribution: attrMap[a.ticker] ? {
                movement_type: attrMap[a.ticker].movement_type,
                ticker_return: attrMap[a.ticker].ticker_return,
                sector_return: attrMap[a.ticker].sector_return,
                spy_return: attrMap[a.ticker].spy_return,
                company_alpha: attrMap[a.ticker].company_alpha,
                explanation: attrMap[a.ticker].explanation,
                top_event_type: attrMap[a.ticker].top_event_type,
                top_event_lag: attrMap[a.ticker].top_event_lag,
              } : null,
            };
          });

          const buySignals = tickers.filter(t => t.score > 0.15).slice(0, 8);
          const sellSignals = tickers.filter(t => t.score < -0.15).sort((a, b) => a.score - b.score).slice(0, 8);

          return Response.json({
            date: workingDate,
            tickers,
            buy_signals: buySignals,
            sell_signals: sellSignals,
          }, { headers: corsHeaders });
        }

        // -------- GET /query/news-digest --------
        if (path === "/query/news-digest") {
          const requestedDate = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

          // If the requested date has no digest, fall back to the most recent date available
          let date = requestedDate;
          const hasToday = await db.prepare(
            `SELECT 1 FROM BETA_12_News_digest WHERE date = ? LIMIT 1`
          ).bind(requestedDate).first();
          if (!hasToday) {
            const latest = await db.prepare(
              `SELECT MAX(date) AS d FROM BETA_12_News_digest WHERE date <= ?`
            ).bind(requestedDate).first();
            if (latest?.d) date = latest.d;
          }

          const [digestRows, secRows, pressRows, macroRows] = await Promise.all([
            db.prepare(`SELECT * FROM BETA_12_News_digest WHERE date = ? ORDER BY type, rank`).bind(date).all(),
            db.prepare(`SELECT id, date, ticker, type FROM ALPHA_01_Reports WHERE date = ?`).bind(date).all(),
            db.prepare(`SELECT id, ticker, date, heading FROM ALPHA_03_Press WHERE date = ?`).bind(date).all(),
            db.prepare(`SELECT id, date, type, summary FROM BETA_03_Macro WHERE date = ? ORDER BY date DESC`).bind(date).all(),
          ]);

          // Structure digest by type
          const macroHeadlines = [];
          const tickerHeadlines = {};
          for (const row of (digestRows.results || [])) {
            if (row.type === "macro") {
              macroHeadlines.push(row);
            } else {
              if (!tickerHeadlines[row.ticker]) tickerHeadlines[row.ticker] = [];
              tickerHeadlines[row.ticker].push(row);
            }
          }

          return Response.json({
            date,
            releases: {
              sec: (secRows.results || []),
              press: (pressRows.results || []),
              macro: (macroRows.results || []).map(r => ({ ...r, summary: r.summary ? JSON.parse(r.summary) : null })),
            },
            macro_headlines: macroHeadlines,
            ticker_headlines: tickerHeadlines,
          }, { headers: corsHeaders });
        }

        return new Response("Not found", { status: 404, headers: corsHeaders });

      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    /* =========================
       ADMIN ENDPOINTS
    ========================= */
    if (request.method === "POST" && path === "/admin/delete-rows") {
      try {
        const body = await request.json();
        const { table, where_column, where_value } = body;
        const allowed = ["BETA_03_Macro", "BETA_04_Sentiment", "GAMMA_01_Verification"];
        if (!allowed.includes(table)) {
          return Response.json({ error: "Table not allowed" }, { status: 400, headers: corsHeaders });
        }
        const result = await db.prepare(`DELETE FROM ${table} WHERE ${where_column} = ?`)
          .bind(where_value).run();
        return Response.json({ ok: true, deleted: result.meta?.changes || 0 }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    /* =========================
       POST ENDPOINTS (INGEST)
    ========================= */
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const which = path.split("/").pop();
    const body = await request.json();
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    async function shortHash(str, len = 6) {
      const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(str)
      );
      return [...new Uint8Array(buf)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
    }

    /* =========================
       ALPHA INGESTORS
    ========================= */

    // -------- ALPHA_03_Press --------
    if (which === "press") {
      for (const [ticker, items] of Object.entries(body)) {
        for (const x of items) {
          const id = await shortHash(`${ticker}|${x.date}|${x.heading}`);

          await db.prepare(
            `INSERT INTO ALPHA_03_Press
             (id, ticker, date, heading, summary, sentiment, magnitude, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               summary=excluded.summary,
               sentiment=excluded.sentiment,
               magnitude=excluded.magnitude,
               created_at=excluded.created_at`
          ).bind(
            id,
            ticker,
            x.date,
            x.heading,
            x.summary ?? null,
            x.sentiment ?? null,
            typeof x.magnitude === "number" ? x.magnitude : null,
            now
          ).run();
        }
      }
    }


    // -------- ALPHA_04_Trends --------
    if (which === "trends") {
      for (const x of body) {
        const id = await shortHash(`${x.ticker}|${x.summary}`);

        await db.prepare(
          `INSERT INTO ALPHA_04_Trends
           (id, ticker, summary, created_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             summary=excluded.summary,
             created_at=excluded.created_at`
        ).bind(
          id,
          x.ticker,
          x.summary ?? null,
          now
        ).run();
      }
    }


    /* =========================
       BETA INGESTORS
    ========================= */

    // -------- BETA_01_News --------
    // -------- BETA_02_WH --------
    if (which === "whitehouse") {
      for (const x of body.WhiteHouse) {
        const id = await shortHash(`${x.date}|${x.title}`);
        // Store link inside summary JSON so it's retrievable
        const summaryPayload = x.link
          ? JSON.stringify({ text: x.summary, link: x.link })
          : x.summary ?? null;

        await db.prepare(
          `INSERT INTO BETA_02_WH
           (id, date, title, summary, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             summary=excluded.summary,
             created_at=excluded.created_at`
        ).bind(
          id,
          x.date,
          x.title,
          summaryPayload,
          now
        ).run();
      }
    }


    // -------- BETA_03_Macro --------
    if (which === "macro") {
      for (const x of body.Macro) {
        // Gamma Regime uses fixed ID so it overwrites (single row, not daily accumulation)
        const idInput = x.heading === "Gamma Regime (VIX)" ? x.heading : `${x.heading}|${x.date}`;
        const id = await shortHash(idInput);
        const summary_json = x.summary ? JSON.stringify(x.summary) : null;

        await db.prepare(`
          INSERT INTO BETA_03_Macro
            (id, date, type, summary, last_update, created_at)
          VALUES (?, ?, ?, ?, 1, ?)
          ON CONFLICT(id) DO UPDATE SET
            summary = excluded.summary,
            last_update = CASE
              WHEN date(created_at) = date(excluded.created_at)
                THEN last_update
              ELSE last_update + 1
            END,
            created_at = excluded.created_at
        `).bind(
          id,
          x.date,
          x.heading,
          summary_json ?? null,
          now
        ).run();
      }
    }



    // -------- BETA_04_Sentiment --------
    if (which === "sentiment") {
      for (const x of body.Sentiment) {
        const id = await shortHash(`${x.heading}|${x.date}`);
         const summary_json = x.summary ? JSON.stringify(x.summary) : null;

        await db.prepare(`
          INSERT INTO BETA_04_Sentiment
            (id, date, type, summary, last_update, created_at)
          VALUES (?, ?, ?, ?, 1, ?)
          ON CONFLICT(id) DO UPDATE SET
            summary = excluded.summary,
            last_update = CASE
              WHEN date(created_at) = date(excluded.created_at)
                THEN last_update
              ELSE last_update + 1
            END,
            created_at = excluded.created_at
        `).bind(
          id,
          x.date,
          x.heading,
          summary_json ?? null,
          now
        ).run();
      }
    }



    /* =========================
       REPORT + CLUSTERS
    ========================= */

    // -------- ALPHA_01_Reports + ALPHA_02_Clusters --------
    if (which === "reports") {
      const {
        ticker,
        reportType,
        reportDate,
        report_seq,
        itemKey,
        clusters = []
      } = body;

      if (!ticker || !reportType || !reportDate || report_seq == null || !itemKey) {
        return new Response("Missing report fields", { status: 400 });
      }

      // ---------- REPORT (idempotent UPSERT) ----------
      const reportBase = `${ticker}|${reportType}|${reportDate}|${report_seq}`;
      const reportId = await shortHash(reportBase, 8);

      await db.prepare(`
        INSERT INTO ALPHA_01_Reports
          (id, date, ticker, type, structure, summary, last_update, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          last_update = CASE
            WHEN date(created_at) = date(excluded.created_at)
              THEN last_update          -- same day → do nothing
            ELSE last_update + 1        -- new day → increment
          END,
          created_at = excluded.created_at
      `).bind(
        reportId,
        reportDate,
        ticker,
        reportType,
        "[]",
        null,
        now
      ).run();


      // ---------- CLUSTERS (cheap, deterministic IDs) ----------
      for (const c of clusters) {
        if (!Number.isFinite(c.clusterIndex) || typeof c.content !== "string") {
          continue;
        }

        // deterministic, collision-free inside a report
        const clusterId = `${reportId}_${itemKey}_${c.clusterIndex}`;

        await db.prepare(
          `INSERT INTO ALPHA_02_Clusters
          (id, report_id, date, item, content, importance, title, summary, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING
        `).bind(
          clusterId,
          reportId,
          today,
          itemKey,
          c.content,
          null,
          null,
          null,
          now
        ).run();
      }

      // ---------- AUTO-QUEUE report-orchestrator ----------
      // Only queue if there's no pending/running job for this report already.
      // Multiple chunks of the same report (different itemKeys) will try to
      // queue, but only the first one succeeds until the job completes.
      // report-orchestrator is idempotent — re-runs are safe.
      const orchestratorInput = JSON.stringify({ report_id: reportId });
      await db.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        SELECT ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM PROC_01_Job_queue
          WHERE worker = 'report-orchestrator'
            AND input = ?
            AND status IN ('pending', 'running')
        )
      `).bind(now, "report-orchestrator", orchestratorInput, "pending", orchestratorInput).run();

      return Response.json({ ok: true, report_id: reportId }, { headers: corsHeaders });
    }


    // -------- GAMMA_01_Verification --------
    if (which === "verification") {
      const results = body.results || [];
      let inserted = 0;

      for (const r of results) {
        const id = await shortHash(`${today}|${r.summaryId}|${r.summaryType}`);

        await db.prepare(`
          INSERT INTO GAMMA_01_Verification
            (id, date, summary_id, summary_type, total_facts, verified, not_found, contradicted, score, issues, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            total_facts = excluded.total_facts,
            verified = excluded.verified,
            not_found = excluded.not_found,
            contradicted = excluded.contradicted,
            score = excluded.score,
            issues = excluded.issues,
            created_at = excluded.created_at
        `).bind(
          id,
          today,
          r.summaryId || r.itemName || "unknown",
          r.summaryType || r.itemType || "unknown",
          r.totalFacts || 0,
          r.verified || 0,
          r.notFound || 0,
          r.contradicted || 0,
          r.score || 0,
          r.issues ? JSON.stringify(r.issues) : "[]",
          now
        ).run();
        inserted++;
      }

      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }


    // -------- PROC_01_Pipeline_logs --------
    if (which === "pipeline-validation") {
      const { summary, validations, logs } = body;
      const id = await shortHash(`${today}|pipeline`);

      await db.prepare(`
        INSERT INTO PROC_01_Pipeline_logs
          (id, date, summary, validations, logs, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          summary = excluded.summary,
          validations = excluded.validations,
          logs = excluded.logs,
          created_at = excluded.created_at
      `).bind(
        id,
        today,
        summary ? JSON.stringify(summary) : null,
        validations ? JSON.stringify(validations) : null,
        logs ? JSON.stringify(logs) : "[]",
        now
      ).run();

      return Response.json({ ok: true, id }, { headers: corsHeaders });
    }


    // -------- PRICE_01_Daily --------
    if (which === "prices") {
      const items = Array.isArray(body) ? body : [body];
      let inserted = 0;
      for (const p of items) {
        const id = await shortHash(`${p.ticker}|${p.date}`);
        await db.prepare(`
          INSERT INTO PRICE_01_Daily (id, ticker, date, open, high, low, close, volume, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            open = excluded.open, high = excluded.high, low = excluded.low,
            close = excluded.close, volume = excluded.volume, created_at = excluded.created_at
        `).bind(id, p.ticker, p.date, p.open, p.high, p.low, p.close, p.volume, now).run();
        inserted++;
      }
      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }

    // -------- FUND_01_Fundamentals --------
    if (which === "fundamentals") {
      const items = Array.isArray(body) ? body : [body];
      let inserted = 0;
      for (const f of items) {
        const id = await shortHash(`${f.ticker}|${f.date}`);
        await db.prepare(`
          INSERT INTO FUND_01_Fundamentals
            (id, ticker, date, pe_ratio, forward_pe, eps, revenue_ttm, profit_margin, operating_margin,
             market_cap, week_52_high, week_52_low, dma_50, dma_200, analyst_target, dividend_yield, beta, raw_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            pe_ratio = excluded.pe_ratio, forward_pe = excluded.forward_pe, eps = excluded.eps,
            revenue_ttm = excluded.revenue_ttm, profit_margin = excluded.profit_margin,
            operating_margin = excluded.operating_margin, market_cap = excluded.market_cap,
            week_52_high = excluded.week_52_high, week_52_low = excluded.week_52_low,
            dma_50 = excluded.dma_50, dma_200 = excluded.dma_200,
            analyst_target = excluded.analyst_target, dividend_yield = excluded.dividend_yield,
            beta = excluded.beta, raw_json = excluded.raw_json, created_at = excluded.created_at
        `).bind(
          id, f.ticker, f.date, f.pe_ratio, f.forward_pe, f.eps, f.revenue_ttm,
          f.profit_margin, f.operating_margin, f.market_cap, f.week_52_high, f.week_52_low,
          f.dma_50, f.dma_200, f.analyst_target, f.dividend_yield, f.beta, f.raw_json || null, now
        ).run();
        inserted++;
      }
      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }

    // -------- FUND_02_Earnings --------
    if (which === "earnings") {
      const items = Array.isArray(body) ? body : [body];
      let inserted = 0;
      for (const e of items) {
        const id = await shortHash(`${e.ticker}|${e.period}`);
        await db.prepare(`
          INSERT INTO FUND_02_Earnings
            (id, ticker, period, estimate, actual, surprise, surprise_pct, report_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            estimate = excluded.estimate, actual = excluded.actual,
            surprise = excluded.surprise, surprise_pct = excluded.surprise_pct,
            report_date = excluded.report_date, created_at = excluded.created_at
        `).bind(id, e.ticker, e.period, e.estimate, e.actual, e.surprise, e.surprise_pct, e.report_date, now).run();
        inserted++;
      }
      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }

    // -------- FUND_03_Recommendations --------
    if (which === "recommendations") {
      const items = Array.isArray(body) ? body : [body];
      let inserted = 0;
      for (const r of items) {
        const id = await shortHash(`${r.ticker}|recs|${r.date}`);
        await db.prepare(`
          INSERT INTO FUND_03_Recommendations
            (id, ticker, date, strong_buy, buy, hold, sell, strong_sell, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            strong_buy = excluded.strong_buy, buy = excluded.buy, hold = excluded.hold,
            sell = excluded.sell, strong_sell = excluded.strong_sell, created_at = excluded.created_at
        `).bind(id, r.ticker, r.date, r.strong_buy, r.buy, r.hold, r.sell, r.strong_sell, now).run();
        inserted++;
      }
      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }

    // -------- SIGNAL_01_Assessment --------
    if (which === "assessments") {
      const items = Array.isArray(body) ? body : [body];
      let inserted = 0;
      for (const a of items) {
        const id = await shortHash(`${a.ticker}|assessment|${a.date}`);
        await db.prepare(`
          INSERT INTO SIGNAL_01_Assessment
            (id, ticker, date, score, factors_json, explanation, sources_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            score = excluded.score, factors_json = excluded.factors_json,
            explanation = excluded.explanation, sources_json = excluded.sources_json,
            created_at = excluded.created_at
        `).bind(
          id, a.ticker, a.date, a.score,
          a.factors_json || "[]", a.explanation || "", a.sources_json || "[]", now
        ).run();
        inserted++;
      }
      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }

    // -------- SIGNAL_02_Probability --------
    if (which === "probabilities") {
      const items = Array.isArray(body) ? body : [body];
      let inserted = 0;
      for (const p of items) {
        const id = await shortHash(`${p.ticker}|prob|${p.date}`);
        await db.prepare(`
          INSERT INTO SIGNAL_02_Probability
            (id, ticker, date, p_favorable, p_neutral, p_unfavorable, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            p_favorable = excluded.p_favorable, p_neutral = excluded.p_neutral,
            p_unfavorable = excluded.p_unfavorable, created_at = excluded.created_at
        `).bind(id, p.ticker, p.date, p.p_favorable, p.p_neutral, p.p_unfavorable, now).run();
        inserted++;
      }
      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }

    // -------- SIGNAL_03_Consensus --------
    if (which === "consensus") {
      const items = Array.isArray(body) ? body : [body];
      let inserted = 0;
      for (const c of items) {
        const id = await shortHash(`${c.target}|consensus|${c.date}`);
        await db.prepare(`
          INSERT INTO SIGNAL_03_Consensus
            (id, date, target, our_conclusion, dominant_narrative, consensus_level,
             missed_factors, strongest_counter, confidence, search_sources, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            our_conclusion = excluded.our_conclusion,
            dominant_narrative = excluded.dominant_narrative,
            consensus_level = excluded.consensus_level,
            missed_factors = excluded.missed_factors,
            strongest_counter = excluded.strongest_counter,
            confidence = excluded.confidence,
            search_sources = excluded.search_sources,
            created_at = excluded.created_at
        `).bind(
          id, c.date, c.target, c.our_conclusion || "",
          c.dominant_narrative || "", c.consensus_level || 0,
          c.missed_factors || "[]", c.strongest_counter || "",
          c.confidence || "MEDIUM", c.search_sources || "[]", now
        ).run();
        inserted++;
      }
      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }

    // -------- SIGNAL_04_Attributions --------
    if (which === "attributions") {
      const items = Array.isArray(body) ? body : [body];
      let inserted = 0;
      for (const a of items) {
        const id = await shortHash(`${a.ticker}|attr|${a.date}`);
        await db.prepare(`
          INSERT INTO SIGNAL_04_Attributions
            (id, ticker, date, movement_type, ticker_return, sector_return, spy_return,
             company_alpha, top_event_type, top_event_id, top_event_date, top_event_lag,
             top_event_weight, explanation, candidates_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            movement_type = excluded.movement_type,
            ticker_return = excluded.ticker_return,
            sector_return = excluded.sector_return,
            spy_return = excluded.spy_return,
            company_alpha = excluded.company_alpha,
            top_event_type = excluded.top_event_type,
            top_event_id = excluded.top_event_id,
            top_event_date = excluded.top_event_date,
            top_event_lag = excluded.top_event_lag,
            top_event_weight = excluded.top_event_weight,
            explanation = excluded.explanation,
            candidates_json = excluded.candidates_json,
            created_at = excluded.created_at
        `).bind(
          id, a.ticker, a.date, a.movement_type,
          a.ticker_return ?? null, a.sector_return ?? null, a.spy_return ?? null, a.company_alpha ?? null,
          a.top_event_type ?? null, a.top_event_id ?? null, a.top_event_date ?? null,
          a.top_event_lag ?? null, a.top_event_weight ?? null,
          a.explanation ?? null, a.candidates_json ?? "[]", now
        ).run();
        inserted++;
      }
      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }

    return new Response("OK", { headers: corsHeaders });
  }
};
