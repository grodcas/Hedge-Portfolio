import peersMapping from "../../../config/peers-mapping.json";
import portfolioTargets from "../../../config/portfolio-targets.json";

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

        // -------- GET /query/macro-thesis --------
        // M2 Macro Thesis (MS-2b agent output). Returns the latest
        // BETA_10_Daily_macro.thesis_json with parsed body + meta. The
        // dashboard reads this for the v2-balanced Macro slide-out.
        if (path === "/query/macro-thesis") {
          const row = await db.prepare(`
            SELECT id, regime, confidence, thesis_json, thesis_updated_at, thesis_model, creation_date
            FROM BETA_10_Daily_macro
            WHERE thesis_json IS NOT NULL
            ORDER BY creation_date DESC
            LIMIT 1
          `).first();

          if (!row) {
            return Response.json({ error: "No thesis row yet" }, { status: 404, headers: corsHeaders });
          }

          let thesis = null;
          try { thesis = JSON.parse(row.thesis_json); } catch {}
          if (!thesis) {
            return Response.json({ error: "thesis_json failed to parse" }, { status: 500, headers: corsHeaders });
          }

          return Response.json({
            id: row.id,
            regime: row.regime,
            confidence: row.confidence,
            creation_date: row.creation_date,
            thesis_updated_at: row.thesis_updated_at,
            thesis_model: row.thesis_model,
            thesis,
          }, { headers: corsHeaders });
        }

        // -------- GET /query/macro-positioning -------- (M4, MS-3b)
        // -------- GET /query/macro-signposts ----------- (M5, MS-3b)
        // -------- GET /query/macro-read ---------------- (M6, MS-3b)
        // -------- GET /query/macro-fomc-summary -------- (M7, MS-3b)
        // Each returns the parsed *_json column from the latest BETA_10 row
        // alongside the *_updated_at + *_model meta the dashboard uses for
        // its "last updated" badge.
        {
          const macroAgentMap = {
            "/query/macro-positioning":   { col: "positioning_json",  ts: "positioning_updated_at",  model: "positioning_model"  },
            "/query/macro-signposts":     { col: "signposts_json",    ts: "signposts_updated_at",    model: "signposts_model"    },
            "/query/macro-read":          { col: "read_json",         ts: "read_updated_at",         model: "read_model"         },
            "/query/macro-fomc-summary":  { col: "fomc_summary_json", ts: "fomc_summary_updated_at", model: "fomc_summary_model" },
          };
          const cfg = macroAgentMap[path];
          if (cfg) {
            const row = await db.prepare(
              `SELECT id, regime, confidence, ${cfg.col} AS payload, ${cfg.ts} AS updated_at, ${cfg.model} AS model, creation_date
                 FROM BETA_10_Daily_macro
                WHERE ${cfg.col} IS NOT NULL
                ORDER BY creation_date DESC
                LIMIT 1`
            ).first();

            if (!row) {
              return Response.json({ error: `No ${cfg.col} row yet` }, { status: 404, headers: corsHeaders });
            }
            let parsed = null;
            try { parsed = JSON.parse(row.payload); } catch {}
            if (!parsed) {
              return Response.json({ error: `${cfg.col} failed to parse` }, { status: 500, headers: corsHeaders });
            }
            return Response.json({
              id:            row.id,
              regime:        row.regime,
              confidence:    row.confidence,
              creation_date: row.creation_date,
              updated_at:    row.updated_at,
              model:         row.model,
              payload:       parsed,
            }, { headers: corsHeaders });
          }
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

        // -------- GET /query/narrative --------
        // Reads NARRATIVE_01_Content rows for a given entity. Returns the 4
        // current fields (current_reading, identification, recommendation,
        // lede) parsed as structured JSON.
        //
        // Params:
        //   entity_type  required: 'regime' | 'sector_landscape' | 'sector' | 'stock_landscape' | 'stock'
        //   entity_id    optional: e.g. 'Healthcare', 'UNH'. Regime + landscapes omit.
        if (path === "/query/narrative") {
          const entityType = url.searchParams.get("entity_type");
          const entityId = url.searchParams.get("entity_id") || null;
          if (!entityType) {
            return Response.json({ error: "entity_type required" }, { status: 400, headers: corsHeaders });
          }

          const { results } = await db.prepare(`
            SELECT id, entity_type, entity_id, date, field, content_json,
                   sources_json, model, input_hash, created_at, last_confirmed_at
              FROM NARRATIVE_01_Content
             WHERE entity_type = ? AND IFNULL(entity_id, '') = IFNULL(?, '')
               AND superseded_by IS NULL
             ORDER BY date DESC, field ASC
          `).bind(entityType, entityId).all();

          const fields = {};
          for (const r of (results || [])) {
            let content = r.content_json;
            try { content = JSON.parse(r.content_json); } catch {}
            let sources = null;
            if (r.sources_json) { try { sources = JSON.parse(r.sources_json); } catch {} }
            fields[r.field] = {
              content,
              sources,
              model: r.model,
              date: r.date,
              input_hash: r.input_hash,
              last_confirmed_at: r.last_confirmed_at,
              created_at: r.created_at,
            };
          }

          return Response.json({
            entity_type: entityType,
            entity_id: entityId,
            fields,
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

        // -------- GET /query/stock-factors --------
        if (path === "/query/stock-factors") {
          const ticker = url.searchParams.get("ticker");
          const date = url.searchParams.get("date");
          const days = parseInt(url.searchParams.get("days") || "0");

          let rows;
          if (ticker && days > 0) {
            rows = await db.prepare(`
              SELECT * FROM STOCK_FACTORS_daily WHERE ticker = ? ORDER BY date DESC LIMIT ?
            `).bind(ticker, days).all();
          } else if (ticker) {
            const row = await db.prepare(`
              SELECT * FROM STOCK_FACTORS_daily WHERE ticker = ? ORDER BY date DESC LIMIT 1
            `).bind(ticker).first();
            return Response.json(row || {}, { headers: corsHeaders });
          } else if (date) {
            rows = await db.prepare(`
              SELECT * FROM STOCK_FACTORS_daily WHERE date = ? ORDER BY ticker
            `).bind(date).all();
          } else {
            const latestDate = await db.prepare(`SELECT date FROM STOCK_FACTORS_daily ORDER BY date DESC LIMIT 1`).first();
            if (!latestDate) return Response.json({ error: "No stock factor data" }, { status: 404, headers: corsHeaders });
            rows = await db.prepare(`
              SELECT * FROM STOCK_FACTORS_daily WHERE date = ? ORDER BY ticker
            `).bind(latestDate.date).all();
          }

          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        // -------- GET /query/sector-factors --------
        if (path === "/query/sector-factors") {
          const sector = url.searchParams.get("sector");
          const date = url.searchParams.get("date");
          const days = parseInt(url.searchParams.get("days") || "0");

          let rows;
          if (sector && days > 0) {
            rows = await db.prepare(`
              SELECT * FROM SECTOR_FACTORS_daily WHERE sector = ? ORDER BY date DESC LIMIT ?
            `).bind(sector, days).all();
          } else if (sector) {
            const row = await db.prepare(`
              SELECT * FROM SECTOR_FACTORS_daily WHERE sector = ? ORDER BY date DESC LIMIT 1
            `).bind(sector).first();
            return Response.json(row || {}, { headers: corsHeaders });
          } else if (date) {
            rows = await db.prepare(`
              SELECT * FROM SECTOR_FACTORS_daily WHERE date = ? ORDER BY sector
            `).bind(date).all();
          } else {
            const latestDate = await db.prepare(`SELECT date FROM SECTOR_FACTORS_daily ORDER BY date DESC LIMIT 1`).first();
            if (!latestDate) return Response.json({ error: "No sector factor data" }, { status: 404, headers: corsHeaders });
            rows = await db.prepare(`
              SELECT * FROM SECTOR_FACTORS_daily WHERE date = ? ORDER BY sector
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

        // -------- Portfolio v2 queries --------

        // -------- Sprint 7: trade ledger / positions / NAV --------

        if (path === "/query/trades") {
          const ticker = url.searchParams.get("ticker");
          const from = url.searchParams.get("from");
          const to = url.searchParams.get("to");
          const limit = parseInt(url.searchParams.get("limit") || "500");
          const where = [], bind = [];
          if (ticker) { where.push("ticker = ?"); bind.push(ticker); }
          if (from)   { where.push("trade_date >= ?"); bind.push(from); }
          if (to)     { where.push("trade_date <= ?"); bind.push(to); }
          const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
          const rows = await db.prepare(
            `SELECT * FROM TRADE_01_Ledger ${whereClause} ORDER BY trade_date DESC, created_at DESC LIMIT ?`
          ).bind(...bind, limit).all();
          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        if (path === "/query/positions") {
          const date = url.searchParams.get("date");
          const ticker = url.searchParams.get("ticker");
          let rows;
          if (ticker && date) {
            rows = await db.prepare(
              `SELECT * FROM POSITION_01_Daily WHERE ticker = ? AND date = ?`
            ).bind(ticker, date).all();
          } else if (ticker) {
            rows = await db.prepare(
              `SELECT * FROM POSITION_01_Daily WHERE ticker = ? ORDER BY date DESC LIMIT 60`
            ).bind(ticker).all();
          } else if (date) {
            rows = await db.prepare(
              `SELECT * FROM POSITION_01_Daily WHERE date = ? ORDER BY weight_pct DESC`
            ).bind(date).all();
          } else {
            const latest = await db.prepare(
              `SELECT MAX(date) AS d FROM POSITION_01_Daily`
            ).first();
            if (!latest?.d) return Response.json([], { headers: corsHeaders });
            rows = await db.prepare(
              `SELECT * FROM POSITION_01_Daily WHERE date = ? ORDER BY weight_pct DESC`
            ).bind(latest.d).all();
          }
          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        if (path === "/query/nav") {
          const from = url.searchParams.get("from");
          const to = url.searchParams.get("to");
          const limit = parseInt(url.searchParams.get("limit") || "60");
          const where = [], bind = [];
          if (from) { where.push("date >= ?"); bind.push(from); }
          if (to)   { where.push("date <= ?"); bind.push(to); }
          const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
          const rows = await db.prepare(
            `SELECT * FROM NAV_01_Daily ${whereClause} ORDER BY date ASC LIMIT ?`
          ).bind(...bind, limit).all();
          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        if (path === "/query/trades/closed") {
          // FIFO lot-matching: replay ledger chronologically per ticker.
          // A SELL consumes oldest open BUY lots; each consumed chunk emits
          // one closed-trade row with realized pnl %.
          const limit = parseInt(url.searchParams.get("limit") || "10");
          const trades = (await db.prepare(
            `SELECT ticker, trade_date, side, qty, price, notes
             FROM TRADE_01_Ledger ORDER BY ticker, trade_date, created_at`
          ).all()).results || [];

          const openLots = {}; // ticker -> [{qty, price, date}]
          const closed = [];
          for (const t of trades) {
            const lots = openLots[t.ticker] ||= [];
            if (t.side === "BUY") {
              lots.push({ qty: t.qty, price: t.price, date: t.trade_date });
            } else { // SELL
              let remaining = t.qty;
              while (remaining > 0 && lots.length > 0) {
                const lot = lots[0];
                const takeQty = Math.min(remaining, lot.qty);
                const pnlPct = lot.price > 0 ? (t.price - lot.price) / lot.price * 100 : 0;
                closed.push({
                  action: "SELL",
                  ticker: t.ticker,
                  note: t.notes || `Closed ${takeQty.toFixed(2)} opened ${lot.date}`,
                  pnl: Number(pnlPct.toFixed(2)),
                  closed_date: t.trade_date,
                });
                lot.qty -= takeQty;
                remaining -= takeQty;
                if (lot.qty <= 1e-9) lots.shift();
              }
            }
          }
          closed.sort((a, b) => b.closed_date.localeCompare(a.closed_date));
          return Response.json(closed.slice(0, limit), { headers: corsHeaders });
        }

        if (path === "/query/sector-valuation") {
          const sector = url.searchParams.get("sector");
          const etf = url.searchParams.get("etf");
          const where = [], bind = [];
          if (sector) { where.push("sector_bucket = ?"); bind.push(sector); }
          if (etf)    { where.push("etf_ticker = ?");    bind.push(etf); }
          const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
          const rows = await db.prepare(
            `SELECT * FROM SECTOR_VALUATION_monthly ${whereClause} ORDER BY sector_bucket, date DESC`
          ).bind(...bind).all();
          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        if (path === "/query/returns-vol") {
          // Sprint 9: per-ticker stdev of daily returns over N days. One query.
          // Used by the low-vol style tilt on Layer 1.
          const days = parseInt(url.searchParams.get("days") || "60");
          const since = new Date(Date.now() - (days + 10) * 86400000).toISOString().slice(0, 10);
          const bars = (await db.prepare(
            `SELECT ticker, date, close FROM PRICE_01_Daily
             WHERE date >= ? ORDER BY ticker, date ASC`
          ).bind(since).all()).results || [];
          const byTicker = {};
          for (const b of bars) (byTicker[b.ticker] ||= []).push(b.close);
          const out = {};
          for (const [ticker, closes] of Object.entries(byTicker)) {
            if (closes.length < 30) continue;
            const recent = closes.slice(-days);
            const rets = [];
            for (let i = 1; i < recent.length; i++) {
              if (recent[i - 1] > 0) rets.push((recent[i] - recent[i - 1]) / recent[i - 1]);
            }
            if (rets.length < 10) continue;
            const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
            const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
            out[ticker] = Math.sqrt(variance);
          }
          return Response.json(out, { headers: corsHeaders });
        }

        if (path === "/query/attribution") {
          // Sprint 8: Brinson-Fachler-lite over NAV history vs SPY benchmark.
          // Returns [] with metadata if <5 days of NAV history (honest empty
          // state — panel shows "awaits data").
          const days = parseInt(url.searchParams.get("days") || "30");
          const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
          const navs = (await db.prepare(
            `SELECT date, net_value, day_pnl_pct FROM NAV_01_Daily
             WHERE date >= ? ORDER BY date ASC`
          ).bind(since).all()).results || [];
          // Sprint 9.1: lowered threshold from 5 to 2 — one day of active return
          // is enough to produce a 4-bucket split; magnitudes grow organically.
          if (navs.length < 2) {
            return Response.json(
              [],
              { headers: { ...corsHeaders, "X-Attribution-Status": "insufficient_history", "X-Attribution-Days": "0" } }
            );
          }
          // Load SPY returns for the same window
          const spySet = (await db.prepare(
            `SELECT date, close FROM PRICE_01_Daily WHERE ticker='SPY' AND date >= ? ORDER BY date ASC`
          ).bind(since).all()).results || [];
          const spyByDate = Object.fromEntries(spySet.map(r => [r.date, r.close]));

          let sumRegime = 0, sumSector = 0, sumStock = 0, sumSizing = 0;
          for (let i = 1; i < navs.length; i++) {
            const today = navs[i], prev = navs[i - 1];
            const spyToday = spyByDate[today.date], spyPrev = spyByDate[prev.date];
            if (!spyToday || !spyPrev) continue;
            const portfolioRet = today.day_pnl_pct != null ? today.day_pnl_pct / 100 : 0;
            const spyRet = (spyToday - spyPrev) / spyPrev;
            const active = portfolioRet - spyRet;
            // Equal-split proxy; refined once per-position-per-day tables exist.
            sumRegime += active * 0.40;
            sumSector += active * 0.30;
            sumStock  += active * 0.20;
            sumSizing += active * 0.10;
          }
          const toBps = r => Math.round(r * 10000);
          return Response.json([
            { label: "Regime call", value: toBps(sumRegime), color: sumRegime >= 0 ? "var(--green)" : "var(--red)" },
            { label: "Sector tilt", value: toBps(sumSector), color: sumSector >= 0 ? "var(--green)" : "var(--red)" },
            { label: "Stock picks", value: toBps(sumStock),  color: sumStock  >= 0 ? "var(--green)" : "var(--red)" },
            { label: "Sizing",      value: toBps(sumSizing), color: sumSizing >= 0 ? "var(--green)" : "var(--red)" },
          ], { headers: { ...corsHeaders, "X-Attribution-Days": String(navs.length - 1) } });
        }

        if (path === "/query/calibration") {
          // Sprint 8: bucket FIFO-matched closed trades by conviction.
          // Suppress buckets with n < 3. Returns [] when no closed trades
          // exist with conviction recorded.
          const trades = (await db.prepare(
            `SELECT ticker, trade_date, side, qty, price, conviction
             FROM TRADE_01_Ledger ORDER BY ticker, trade_date, created_at`
          ).all()).results || [];
          const openLots = {};
          const closed = [];
          for (const t of trades) {
            const lots = openLots[t.ticker] ||= [];
            if (t.side === "BUY") {
              lots.push({ qty: t.qty, price: t.price, conviction: t.conviction ?? null });
            } else {
              let remaining = t.qty;
              while (remaining > 0 && lots.length > 0) {
                const lot = lots[0];
                const takeQty = Math.min(remaining, lot.qty);
                const pnlPct = lot.price > 0 ? (t.price - lot.price) / lot.price * 100 : 0;
                closed.push({ conviction: lot.conviction, pnl_pct: pnlPct });
                lot.qty -= takeQty;
                remaining -= takeQty;
                if (lot.qty <= 1e-9) lots.shift();
              }
            }
          }
          const buckets = {}; // conv -> {n, wins, sumPnl}
          for (const c of closed) {
            if (c.conviction == null) continue;
            const b = buckets[c.conviction] ||= { n: 0, wins: 0, sumPnl: 0 };
            b.n++;
            if (c.pnl_pct > 0) b.wins++;
            b.sumPnl += c.pnl_pct;
          }
          // Sprint 9.1: always return the 5-bucket expected-prior curve.
          // `actual` is non-null only when n >= 3 (too-few-trades honesty).
          // Dashboard draws the expected line always; actual points appear as data arrives.
          const expectedByConv = { 1: 0.20, 2: 0.35, 3: 0.50, 4: 0.65, 5: 0.80 };
          const out = [];
          for (const conv of [1, 2, 3, 4, 5]) {
            const b = buckets[conv];
            const n = b?.n ?? 0;
            out.push({
              conv,
              expected: expectedByConv[conv],
              actual: (b && n >= 3) ? b.wins / n : null,
              n,
              avg_pnl_pct: (b && n > 0) ? b.sumPnl / n : null,
            });
          }
          return Response.json(out, { headers: corsHeaders });
        }

        if (path === "/query/portfolio-targets") {
          const ticker = url.searchParams.get("ticker");
          if (ticker) return Response.json(portfolioTargets[ticker] || {}, { headers: corsHeaders });
          return Response.json(portfolioTargets, { headers: corsHeaders });
        }

        if (path === "/query/regime-history") {
          const days = parseInt(url.searchParams.get("days") || "30");
          const rows = await db.prepare(
            `SELECT id, summary, creation_date FROM BETA_10_Daily_macro
             ORDER BY creation_date DESC LIMIT ?`
          ).bind(days).all();
          const out = (rows.results || []).map(r => {
            let s = {};
            try { s = JSON.parse(r.summary); } catch {}
            return {
              date: r.creation_date,
              regime: s.trend?.regime ?? null,
              confidence: s.confidence ?? s.trend?.confidence ?? null,
              action: s.recommendation?.action ?? null,
              window_start: s.trend?.window_start ?? null,
              window_end: s.trend?.window_end ?? null,
            };
          });
          return Response.json(out, { headers: corsHeaders });
        }

        if (path === "/query/indicator-history") {
          const code = url.searchParams.get("code");
          const days = parseInt(url.searchParams.get("days") || "365");
          const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
          let rows;
          if (code) {
            rows = await db.prepare(
              `SELECT * FROM MACRO_STATE_indicators
               WHERE indicator_code = ? AND release_date >= ?
               ORDER BY release_date DESC`
            ).bind(code, since).all();
          } else {
            rows = await db.prepare(
              `SELECT i.* FROM MACRO_STATE_indicators i
               INNER JOIN (SELECT indicator_code, MAX(release_date) d FROM MACRO_STATE_indicators GROUP BY indicator_code) g
               ON i.indicator_code = g.indicator_code AND i.release_date = g.d
               ORDER BY i.indicator_code`
            ).all();
          }
          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        if (path === "/query/sector-peers") {
          const ticker = url.searchParams.get("ticker");
          if (ticker) {
            return Response.json(peersMapping[ticker] || {}, { headers: corsHeaders });
          }
          return Response.json(peersMapping, { headers: corsHeaders });
        }

        if (path === "/query/sector-trends") {
          const sector = url.searchParams.get("sector");
          let longRows, shortRows;
          if (sector) {
            longRows = await db.prepare(`SELECT * FROM SECTOR_TREND_long WHERE sector = ?`).bind(sector).all();
            shortRows = await db.prepare(`SELECT * FROM SECTOR_TREND_short WHERE sector = ?`).bind(sector).all();
          } else {
            longRows = await db.prepare(`SELECT * FROM SECTOR_TREND_long ORDER BY sector`).all();
            shortRows = await db.prepare(`SELECT * FROM SECTOR_TREND_short ORDER BY sector`).all();
          }
          return Response.json({
            long: longRows.results || [],
            short: shortRows.results || [],
          }, { headers: corsHeaders });
        }

        if (path === "/query/ticker-trends") {
          const ticker = url.searchParams.get("ticker");
          let longRows, shortRows;
          if (ticker) {
            longRows = await db.prepare(`SELECT * FROM TICKER_TREND_long WHERE ticker = ?`).bind(ticker).all();
            shortRows = await db.prepare(`SELECT * FROM TICKER_TREND_short WHERE ticker = ?`).bind(ticker).all();
          } else {
            longRows = await db.prepare(`SELECT * FROM TICKER_TREND_long ORDER BY ticker`).all();
            shortRows = await db.prepare(`SELECT * FROM TICKER_TREND_short ORDER BY ticker`).all();
          }
          return Response.json({
            long: longRows.results || [],
            short: shortRows.results || [],
          }, { headers: corsHeaders });
        }

        if (path === "/query/signal-history") {
          const ticker = url.searchParams.get("ticker");
          const days = parseInt(url.searchParams.get("days") || "14");
          const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
          let rows;
          if (ticker) {
            rows = await db.prepare(
              `SELECT * FROM SIGNAL_HISTORY_daily WHERE ticker = ? AND date >= ? ORDER BY date`
            ).bind(ticker, since).all();
          } else {
            rows = await db.prepare(
              `SELECT * FROM SIGNAL_HISTORY_daily WHERE date >= ? ORDER BY ticker, date`
            ).bind(since).all();
          }
          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        if (path === "/query/operations") {
          const rows = await db.prepare(
            `SELECT * FROM OPERATION_01_Signals WHERE superseded_by IS NULL ORDER BY sector`
          ).all();
          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        if (path === "/query/rebalance") {
          const row = await db.prepare(
            `SELECT * FROM REBALANCE_01 ORDER BY created_at DESC LIMIT 1`
          ).first();
          return Response.json(row || {}, { headers: corsHeaders });
        }

        if (path === "/query/earnings-all") {
          const rows = await db.prepare(
            `SELECT ticker, period, estimate, actual, surprise, surprise_pct, report_date
               FROM FUND_02_Earnings ORDER BY ticker, report_date`
          ).all();
          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        // Macro release calendar (CPI/NFP/PMI etc.) — populated by
        // economic-calendar-fetcher worker into MACRO_STATE_calendar. Returns
        // events in [from, to]. Defaults to (today-30, today+45).
        if (path === "/query/calendar") {
          const today = new Date().toISOString().slice(0, 10);
          const from = url.searchParams.get("from")
            || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
          const to = url.searchParams.get("to") || today;
          const rows = await db.prepare(
            `SELECT event_date, event_time, country, event_code, event_label,
                    impact, consensus, prior, unit
               FROM MACRO_STATE_calendar
              WHERE country = 'US' AND event_date BETWEEN ? AND ?
              ORDER BY event_date, event_time`
          ).bind(from, to).all();
          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        if (path === "/query/movers") {
          let date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
          // Fall back to latest available date if requested date has no data
          const check = await db.prepare(
            `SELECT 1 FROM MOVER_EXPLANATIONS_daily WHERE date = ? LIMIT 1`
          ).bind(date).first();
          if (!check) {
            const latest = await db.prepare(
              `SELECT MAX(date) AS d FROM MOVER_EXPLANATIONS_daily`
            ).first();
            if (latest?.d) date = latest.d;
          }
          const rows = await db.prepare(
            `SELECT * FROM MOVER_EXPLANATIONS_daily WHERE date = ? ORDER BY direction, rank`
          ).bind(date).all();
          return Response.json(rows.results || [], { headers: corsHeaders });
        }

        // -------- GET /query/valuation-curve?ticker=X[&days=365] --------
        // Sprint 12: bundle of (price history, short-curve history, long-curve
        // history, realized calibration rows) for a single ticker. Drives the
        // 3-line overlay chart on the stock entity view.
        if (path === "/query/valuation-curve") {
          const ticker = url.searchParams.get("ticker");
          if (!ticker) {
            return Response.json({ error: "ticker required" }, { status: 400, headers: corsHeaders });
          }
          const days = Math.max(30, Math.min(1825, parseInt(url.searchParams.get("days") || "365", 10)));

          const [priceRes, shortRes, longRes, realizedRes] = await Promise.all([
            db.prepare(`SELECT date, close FROM PRICE_01_Daily
                         WHERE ticker = ? AND date >= date('now', ?)
                         ORDER BY date ASC`).bind(ticker, `-${days} days`).all(),
            db.prepare(`SELECT as_of, fair_value, adjustment_pct, contributing_events_json
                          FROM SIGNAL_03_ValuationCurve_short
                         WHERE ticker = ? AND as_of >= datetime('now', ?)
                         ORDER BY as_of ASC`).bind(ticker, `-${days} days`).all(),
            db.prepare(`SELECT as_of, fair_value, market_price_at_review, deviation_pct,
                               rationale, key_events_cited_json, would_change_mind_if_json,
                               trigger_reason
                          FROM SIGNAL_03_ValuationCurve_long
                         WHERE ticker = ? AND as_of >= datetime('now', ?)
                         ORDER BY as_of ASC`).bind(ticker, `-${days} days`).all(),
            db.prepare(`SELECT curve_type, forecast_date, realized_date, horizon_days,
                               forecast_fair_value, price_at_forecast, price_at_realized,
                               gap_at_forecast_pct, gap_closed_pct, converged
                          FROM SIGNAL_03_ValuationRealized
                         WHERE ticker = ? AND forecast_date >= date('now', ?)
                         ORDER BY forecast_date ASC`).bind(ticker, `-${days} days`).all(),
          ]);

          return Response.json({
            ticker,
            price_history: priceRes.results || [],
            short_curve: shortRes.results || [],
            long_curve: longRes.results || [],
            realized: realizedRes.results || [],
          }, { headers: corsHeaders });
        }

        // -------- GET /query/stock-profile?ticker=X --------
        // Sprint 9: single-hop bundle for the stock entity view.
        // Fundamentals + factors + epsHistory + filings + peers + catalysts + news.
        if (path === "/query/stock-profile") {
          const ticker = url.searchParams.get("ticker");
          if (!ticker) {
            return Response.json({ error: "ticker required" }, { status: 400, headers: corsHeaders });
          }

          // Resolve the ticker's sector from STOCK_FACTORS_daily (authoritative since 0022).
          // Fall back to FUND_01_Fundamentals.sector if factors row is absent.
          const sectorRow = await db.prepare(`
            SELECT sector FROM STOCK_FACTORS_daily WHERE ticker = ? ORDER BY date DESC LIMIT 1
          `).bind(ticker).first();
          let sector = sectorRow?.sector || null;
          if (!sector) {
            const fs = await db.prepare(`
              SELECT sector FROM FUND_01_Fundamentals WHERE ticker = ? AND sector IS NOT NULL ORDER BY date DESC LIMIT 1
            `).bind(ticker).first();
            sector = fs?.sector || null;
          }

          const todayIso = new Date().toISOString().slice(0, 10);

          const [fundamentals, factors, epsHistory, filings, peers, catalysts, news] =
            await Promise.all([
              db.prepare(`SELECT * FROM FUND_01_Fundamentals WHERE ticker = ? ORDER BY date DESC LIMIT 1`).bind(ticker).first(),
              db.prepare(`SELECT * FROM STOCK_FACTORS_daily WHERE ticker = ? ORDER BY date DESC LIMIT 1`).bind(ticker).first(),
              db.prepare(`SELECT period, estimate, actual, surprise, surprise_pct, report_date
                            FROM FUND_02_Earnings WHERE ticker = ? ORDER BY period DESC LIMIT 9`).bind(ticker).all(),
              db.prepare(`SELECT id, date, type, summary
                            FROM ALPHA_01_Reports WHERE ticker = ? AND type IN ('10-K','10-Q','8-K')
                           ORDER BY date DESC LIMIT 6`).bind(ticker).all(),
              sector
                ? db.prepare(`SELECT ticker, sector, fwd_pe, eps_rev_4w, rev_breadth_4w, rs_vs_sector_3m,
                                     piotroski_f, peer_median_pe, date
                                FROM STOCK_FACTORS_daily
                               WHERE sector = ? AND date = (SELECT MAX(date) FROM STOCK_FACTORS_daily WHERE sector = ?)
                               ORDER BY ticker`).bind(sector, sector).all()
                : Promise.resolve({ results: [] }),
              db.prepare(`SELECT period, estimate, report_date
                            FROM FUND_02_Earnings
                           WHERE ticker = ? AND report_date IS NOT NULL AND report_date > ?
                           ORDER BY report_date ASC LIMIT 4`).bind(ticker, todayIso).all(),
              db.prepare(`SELECT date, title, summary, sentiment, magnitude, source, rank
                            FROM BETA_12_News_digest
                           WHERE ticker = ? AND type = 'ticker' AND date >= date('now','-7 days')
                           ORDER BY date DESC, rank ASC LIMIT 5`).bind(ticker).all(),
            ]);

          return Response.json({
            ticker,
            sector,
            fundamentals: fundamentals || null,
            factors: factors || null,
            epsHistory: (epsHistory.results || []).slice().reverse(), // chronological for charts
            filings: filings.results || [],
            peers: peers.results || [],
            catalysts: catalysts.results || [],
            news: news.results || [],
          }, { headers: corsHeaders });
        }

        // -------- GET /query/sector-profile?sector=X --------
        // Sprint 9: single-hop bundle for the sector entity view.
        // Composition (constituents + score) + peers (other sectors) + news + catalysts.
        if (path === "/query/sector-profile") {
          const sector = url.searchParams.get("sector");
          if (!sector) {
            return Response.json({ error: "sector required" }, { status: 400, headers: corsHeaders });
          }

          const todayIso = new Date().toISOString().slice(0, 10);

          // Constituents come from the latest STOCK_FACTORS_daily for this sector.
          const constRes = await db.prepare(`
            SELECT ticker, sector, fwd_pe, eps_rev_4w, rev_breadth_4w, sue, mom_12_1,
                   rs_vs_sector_3m, piotroski_f, peer_median_pe, date
              FROM STOCK_FACTORS_daily
             WHERE sector = ? AND date = (SELECT MAX(date) FROM STOCK_FACTORS_daily WHERE sector = ?)
             ORDER BY ticker
          `).bind(sector, sector).all();
          const constituents = constRes.results || [];
          const tickers = constituents.map(r => r.ticker);

          // Latest assessment score per constituent (join shape via inner select).
          let scoreByTicker = {};
          if (tickers.length > 0) {
            const placeholders = tickers.map(() => "?").join(",");
            const scoreRes = await db.prepare(`
              SELECT a.ticker, a.score
                FROM SIGNAL_01_Assessment a
                INNER JOIN (
                  SELECT ticker, MAX(date) AS md FROM SIGNAL_01_Assessment WHERE ticker IN (${placeholders}) GROUP BY ticker
                ) g ON a.ticker = g.ticker AND a.date = g.md
            `).bind(...tickers).all();
            for (const r of (scoreRes.results || [])) scoreByTicker[r.ticker] = r.score;
          }

          const composition = constituents.map(c => ({
            ...c,
            score: scoreByTicker[c.ticker] ?? null,
          }));

          // Peer sectors = all 8 sectors on the latest SECTOR_FACTORS_daily date.
          const peersPromise = db.prepare(`
            SELECT * FROM SECTOR_FACTORS_daily
             WHERE date = (SELECT MAX(date) FROM SECTOR_FACTORS_daily)
             ORDER BY sector
          `).all();

          // News: 7d window filtered to sector constituents.
          const newsPromise = tickers.length > 0
            ? (async () => {
                const placeholders = tickers.map(() => "?").join(",");
                return db.prepare(`
                  SELECT date, ticker, title, summary, sentiment, magnitude, source, rank
                    FROM BETA_12_News_digest
                   WHERE ticker IN (${placeholders})
                     AND type = 'ticker'
                     AND date >= date('now','-7 days')
                   ORDER BY date DESC, rank ASC LIMIT 8
                `).bind(...tickers).all();
              })()
            : Promise.resolve({ results: [] });

          // Catalysts: upcoming earnings across constituents.
          const catalystsPromise = tickers.length > 0
            ? (async () => {
                const placeholders = tickers.map(() => "?").join(",");
                return db.prepare(`
                  SELECT ticker, period, estimate, report_date
                    FROM FUND_02_Earnings
                   WHERE ticker IN (${placeholders})
                     AND report_date IS NOT NULL AND report_date > ?
                   ORDER BY report_date ASC LIMIT 6
                `).bind(...tickers, todayIso).all();
              })()
            : Promise.resolve({ results: [] });

          const [peers, news, catalysts] = await Promise.all([peersPromise, newsPromise, catalystsPromise]);

          return Response.json({
            sector,
            composition,
            peers: peers.results || [],
            news: news.results || [],
            catalysts: catalysts.results || [],
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
             market_cap, week_52_high, week_52_low, dma_50, dma_200, analyst_target, dividend_yield, beta,
             sector, total_assets, total_assets_prev, total_debt, total_debt_prev,
             shares_outstanding, shares_outstanding_prev, net_income, net_income_prev,
             revenue_annual, revenue_annual_prev, gross_profit, gross_profit_prev,
             cfo, cfo_prev, roa, roa_prev, current_ratio, current_ratio_prev,
             gross_margin_annual, gross_margin_annual_prev, asset_turnover, asset_turnover_prev,
             fiscal_period_ending, last_10q_filing_date,
             peg_ratio, ev_ebitda, ev_sales, pb_ratio, ps_ratio, roe_ttm, roa_ttm,
             raw_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            pe_ratio = excluded.pe_ratio, forward_pe = excluded.forward_pe, eps = excluded.eps,
            revenue_ttm = excluded.revenue_ttm, profit_margin = excluded.profit_margin,
            operating_margin = excluded.operating_margin, market_cap = excluded.market_cap,
            week_52_high = excluded.week_52_high, week_52_low = excluded.week_52_low,
            dma_50 = excluded.dma_50, dma_200 = excluded.dma_200,
            analyst_target = excluded.analyst_target, dividend_yield = excluded.dividend_yield,
            beta = excluded.beta, sector = excluded.sector,
            total_assets = excluded.total_assets, total_assets_prev = excluded.total_assets_prev,
            total_debt = excluded.total_debt, total_debt_prev = excluded.total_debt_prev,
            shares_outstanding = excluded.shares_outstanding, shares_outstanding_prev = excluded.shares_outstanding_prev,
            net_income = excluded.net_income, net_income_prev = excluded.net_income_prev,
            revenue_annual = excluded.revenue_annual, revenue_annual_prev = excluded.revenue_annual_prev,
            gross_profit = excluded.gross_profit, gross_profit_prev = excluded.gross_profit_prev,
            cfo = excluded.cfo, cfo_prev = excluded.cfo_prev,
            roa = excluded.roa, roa_prev = excluded.roa_prev,
            current_ratio = excluded.current_ratio, current_ratio_prev = excluded.current_ratio_prev,
            gross_margin_annual = excluded.gross_margin_annual, gross_margin_annual_prev = excluded.gross_margin_annual_prev,
            asset_turnover = excluded.asset_turnover, asset_turnover_prev = excluded.asset_turnover_prev,
            fiscal_period_ending = COALESCE(excluded.fiscal_period_ending, fiscal_period_ending),
            last_10q_filing_date = COALESCE(excluded.last_10q_filing_date, last_10q_filing_date),
            peg_ratio = COALESCE(excluded.peg_ratio, peg_ratio),
            ev_ebitda = COALESCE(excluded.ev_ebitda, ev_ebitda),
            ev_sales  = COALESCE(excluded.ev_sales,  ev_sales),
            pb_ratio  = COALESCE(excluded.pb_ratio,  pb_ratio),
            ps_ratio  = COALESCE(excluded.ps_ratio,  ps_ratio),
            roe_ttm   = COALESCE(excluded.roe_ttm,   roe_ttm),
            roa_ttm   = COALESCE(excluded.roa_ttm,   roa_ttm),
            raw_json = excluded.raw_json, created_at = excluded.created_at
        `).bind(
          id, f.ticker, f.date, f.pe_ratio, f.forward_pe, f.eps, f.revenue_ttm,
          f.profit_margin, f.operating_margin, f.market_cap, f.week_52_high, f.week_52_low,
          f.dma_50, f.dma_200, f.analyst_target, f.dividend_yield, f.beta,
          f.sector ?? null,
          f.total_assets ?? null, f.total_assets_prev ?? null,
          f.total_debt ?? null, f.total_debt_prev ?? null,
          f.shares_outstanding ?? null, f.shares_outstanding_prev ?? null,
          f.net_income ?? null, f.net_income_prev ?? null,
          f.revenue_annual ?? null, f.revenue_annual_prev ?? null,
          f.gross_profit ?? null, f.gross_profit_prev ?? null,
          f.cfo ?? null, f.cfo_prev ?? null,
          f.roa ?? null, f.roa_prev ?? null,
          f.current_ratio ?? null, f.current_ratio_prev ?? null,
          f.gross_margin_annual ?? null, f.gross_margin_annual_prev ?? null,
          f.asset_turnover ?? null, f.asset_turnover_prev ?? null,
          f.fiscal_period_ending ?? null, f.last_10q_filing_date ?? null,
          f.peg_ratio ?? null, f.ev_ebitda ?? null, f.ev_sales ?? null,
          f.pb_ratio ?? null, f.ps_ratio ?? null, f.roe_ttm ?? null, f.roa_ttm ?? null,
          f.raw_json || null, now
        ).run();
        inserted++;
      }
      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }

    // -------- FUND_01_Quarterly (full 20-quarter history per ticker) --------
    if (which === "fundamentals-quarterly") {
      const items = Array.isArray(body) ? body : [body];
      let inserted = 0;
      for (const q of items) {
        if (!q.ticker || !q.fiscal_period_ending) continue;
        const id = await shortHash(`${q.ticker}|${q.fiscal_period_ending}`);
        await db.prepare(`
          INSERT INTO FUND_01_Quarterly
            (id, ticker, fiscal_period_ending,
             total_revenue, gross_profit, operating_income, net_income,
             rd_expense, sga_expense, interest_expense, ebit, ebitda,
             total_assets, total_liabilities, total_equity,
             current_assets, current_liabilities, inventory, receivables,
             cash_and_equivalents, short_term_debt, long_term_debt, shares_outstanding,
             cfo, capex, cfi, cff, dividends_paid, buyback,
             created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            total_revenue = COALESCE(excluded.total_revenue, total_revenue),
            gross_profit = COALESCE(excluded.gross_profit, gross_profit),
            operating_income = COALESCE(excluded.operating_income, operating_income),
            net_income = COALESCE(excluded.net_income, net_income),
            rd_expense = COALESCE(excluded.rd_expense, rd_expense),
            sga_expense = COALESCE(excluded.sga_expense, sga_expense),
            interest_expense = COALESCE(excluded.interest_expense, interest_expense),
            ebit = COALESCE(excluded.ebit, ebit),
            ebitda = COALESCE(excluded.ebitda, ebitda),
            total_assets = COALESCE(excluded.total_assets, total_assets),
            total_liabilities = COALESCE(excluded.total_liabilities, total_liabilities),
            total_equity = COALESCE(excluded.total_equity, total_equity),
            current_assets = COALESCE(excluded.current_assets, current_assets),
            current_liabilities = COALESCE(excluded.current_liabilities, current_liabilities),
            inventory = COALESCE(excluded.inventory, inventory),
            receivables = COALESCE(excluded.receivables, receivables),
            cash_and_equivalents = COALESCE(excluded.cash_and_equivalents, cash_and_equivalents),
            short_term_debt = COALESCE(excluded.short_term_debt, short_term_debt),
            long_term_debt = COALESCE(excluded.long_term_debt, long_term_debt),
            shares_outstanding = COALESCE(excluded.shares_outstanding, shares_outstanding),
            cfo = COALESCE(excluded.cfo, cfo),
            capex = COALESCE(excluded.capex, capex),
            cfi = COALESCE(excluded.cfi, cfi),
            cff = COALESCE(excluded.cff, cff),
            dividends_paid = COALESCE(excluded.dividends_paid, dividends_paid),
            buyback = COALESCE(excluded.buyback, buyback)
        `).bind(
          id, q.ticker, q.fiscal_period_ending,
          q.total_revenue ?? null, q.gross_profit ?? null, q.operating_income ?? null, q.net_income ?? null,
          q.rd_expense ?? null, q.sga_expense ?? null, q.interest_expense ?? null,
          q.ebit ?? null, q.ebitda ?? null,
          q.total_assets ?? null, q.total_liabilities ?? null, q.total_equity ?? null,
          q.current_assets ?? null, q.current_liabilities ?? null,
          q.inventory ?? null, q.receivables ?? null, q.cash_and_equivalents ?? null,
          q.short_term_debt ?? null, q.long_term_debt ?? null, q.shares_outstanding ?? null,
          q.cfo ?? null, q.capex ?? null, q.cfi ?? null, q.cff ?? null,
          q.dividends_paid ?? null, q.buyback ?? null,
          now
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

    // -------- SECTOR_VALUATION_monthly (Sprint 9) --------
    if (which === "sector-valuation") {
      const items = Array.isArray(body) ? body : [body];
      let inserted = 0;
      for (const v of items) {
        if (!v.etf_ticker || !v.date || !v.sector_bucket) continue;
        const id = await shortHash(`${v.etf_ticker}|${v.date}`);
        await db.prepare(`
          INSERT INTO SECTOR_VALUATION_monthly
            (id, date, etf_ticker, sector_bucket, forward_pe, div_yield, est_eps_growth_3_5y, raw_pdf_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            forward_pe = excluded.forward_pe, div_yield = excluded.div_yield,
            est_eps_growth_3_5y = excluded.est_eps_growth_3_5y,
            raw_pdf_hash = excluded.raw_pdf_hash, created_at = excluded.created_at
        `).bind(id, v.date, v.etf_ticker, v.sector_bucket,
                v.forward_pe ?? null, v.div_yield ?? null, v.est_eps_growth_3_5y ?? null,
                v.raw_pdf_hash ?? null, now).run();
        inserted++;
      }
      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }

    // -------- TRADE_01_Ledger (Sprint 7 + Sprint 8 conviction) --------
    if (which === "trades") {
      const items = Array.isArray(body) ? body : [body];
      let inserted = 0;
      for (const t of items) {
        if (!t.trade_date || !t.ticker || !t.side || t.qty == null || t.price == null) continue;
        const id = await shortHash(`${t.ticker}|${t.trade_date}|${t.side}|${t.qty}|${t.price}`);
        await db.prepare(`
          INSERT INTO TRADE_01_Ledger (id, trade_date, ticker, side, qty, price, fees, notes, conviction, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            fees = excluded.fees, notes = excluded.notes, conviction = excluded.conviction,
            created_at = excluded.created_at
        `).bind(id, t.trade_date, t.ticker, t.side, t.qty, t.price, t.fees ?? 0, t.notes ?? null, t.conviction ?? null, now).run();
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

    // -------- SECTOR_FACTORS_daily --------
    if (which === "sector-factors") {
      const items = Array.isArray(body) ? body : [body];
      let inserted = 0;
      for (const s of items) {
        const id = await shortHash(`${s.sector}|${s.date}`);
        await db.prepare(`
          INSERT INTO SECTOR_FACTORS_daily
            (id, sector, date, regime_fit, earn_momentum, beat_rate_sector, valuation_sigma,
             rel_strength_13w, rs_ratio, rs_momentum, stance_score, stance,
             fwd_pe_sector, breadth_above_200dma, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            regime_fit = excluded.regime_fit, earn_momentum = excluded.earn_momentum,
            beat_rate_sector = excluded.beat_rate_sector, valuation_sigma = excluded.valuation_sigma,
            rel_strength_13w = excluded.rel_strength_13w, rs_ratio = excluded.rs_ratio,
            rs_momentum = excluded.rs_momentum,
            stance_score = excluded.stance_score, stance = excluded.stance,
            fwd_pe_sector = excluded.fwd_pe_sector, breadth_above_200dma = excluded.breadth_above_200dma,
            created_at = excluded.created_at
        `).bind(
          id, s.sector, s.date,
          s.regime_fit ?? null, s.earn_momentum ?? null, s.beat_rate_sector ?? null,
          s.valuation_sigma ?? null, s.rel_strength_13w ?? null,
          s.rs_ratio ?? null, s.rs_momentum ?? null,
          s.stance_score ?? null, s.stance ?? null,
          s.fwd_pe_sector ?? null, s.breadth_above_200dma ?? null, now,
        ).run();
        inserted++;
      }
      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }

    // -------- STOCK_FACTORS_daily --------
    if (which === "stock-factors") {
      const items = Array.isArray(body) ? body : [body];
      let inserted = 0;
      for (const f of items) {
        const id = await shortHash(`${f.ticker}|${f.date}`);
        await db.prepare(`
          INSERT INTO STOCK_FACTORS_daily
            (id, ticker, date, sector, fwd_pe, rel_pe_sigma, eps_rev_4w, rev_breadth_4w,
             sue, mom_12_1, rs_vs_sector_3m, piotroski_f, days_to_catalyst,
             short_pct_float, peer_median_pe, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            sector = excluded.sector, fwd_pe = excluded.fwd_pe,
            rel_pe_sigma = excluded.rel_pe_sigma, eps_rev_4w = excluded.eps_rev_4w,
            rev_breadth_4w = excluded.rev_breadth_4w, sue = excluded.sue,
            mom_12_1 = excluded.mom_12_1, rs_vs_sector_3m = excluded.rs_vs_sector_3m,
            piotroski_f = excluded.piotroski_f, days_to_catalyst = excluded.days_to_catalyst,
            short_pct_float = excluded.short_pct_float, peer_median_pe = excluded.peer_median_pe,
            created_at = excluded.created_at
        `).bind(
          id, f.ticker, f.date, f.sector ?? null,
          f.fwd_pe ?? null, f.rel_pe_sigma ?? null,
          f.eps_rev_4w ?? null, f.rev_breadth_4w ?? null,
          f.sue ?? null, f.mom_12_1 ?? null, f.rs_vs_sector_3m ?? null,
          f.piotroski_f ?? null, f.days_to_catalyst ?? null,
          f.short_pct_float ?? null, f.peer_median_pe ?? null, now
        ).run();
        inserted++;
      }
      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }

    // -------- PEER_SET_config (MS-1c) --------
    // Accepts the same shape as config/peers-mapping.json:
    //   { "AAPL": { "sector": "Technology", "industry": "...", "peers": [...] }, ... }
    // Upserts one row per ticker. `source` defaults to 'finnhub'.
    if (which === "peer-set-config") {
      const source = body.__source || "finnhub";
      let inserted = 0;
      for (const [ticker, entry] of Object.entries(body)) {
        if (ticker.startsWith("__")) continue; // skip meta keys like __source
        const peers = Array.isArray(entry?.peers) ? entry.peers : [];
        if (peers.length === 0) continue;
        await db.prepare(`
          INSERT INTO PEER_SET_config (ticker, peers_json, source, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(ticker) DO UPDATE SET
            peers_json = excluded.peers_json,
            source     = excluded.source,
            updated_at = excluded.updated_at
        `).bind(ticker, JSON.stringify(peers), source, now).run();
        inserted++;
      }
      return Response.json({ ok: true, inserted }, { headers: corsHeaders });
    }

    return new Response("OK", { headers: corsHeaders });
  }
};
