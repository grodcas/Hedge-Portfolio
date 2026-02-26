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

        // -------- GET /query/ticker-trends --------
        if (path === "/query/ticker-trends") {
          const { results } = await db.prepare(`
            SELECT id, ticker, summary, created_at
            FROM ALPHA_04_Trends
            ORDER BY created_at DESC
          `).all();

          // Group by ticker, keep latest per ticker
          const byTicker = {};
          for (const row of results) {
            if (!byTicker[row.ticker]) {
              byTicker[row.ticker] = {
                id: row.id,
                summary: row.summary,
                created_at: row.created_at
              };
            }
          }

          return Response.json(byTicker, { headers: corsHeaders });
        }

        // -------- GET /query/daily-news --------
        if (path === "/query/daily-news") {
          const { results } = await db.prepare(`
            SELECT id, ticker, summary, todays_important, last_important, last_important_date, created_at
            FROM ALPHA_05_Daily_news
            ORDER BY created_at DESC
          `).all();

          // Group by ticker, keep latest per ticker
          const byTicker = {};
          for (const row of results) {
            if (!byTicker[row.ticker]) {
              byTicker[row.ticker] = {
                id: row.id,
                summary: row.summary,
                todays_important: row.todays_important,
                last_important: row.last_important,
                last_important_date: row.last_important_date,
                date: row.created_at?.slice(0, 10)
              };
            }
          }

          return Response.json(byTicker, { headers: corsHeaders });
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
            SELECT id, ticker, date, heading, summary, created_at
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
            WhiteHouse: results.map(r => ({
              id: r.id,
              date: r.date,
              title: r.title,
              summary: r.summary,
              created_at: r.created_at
            }))
          }, { headers: corsHeaders });
        }

        // -------- GET /query/news --------
        if (path === "/query/news") {
          const { results } = await db.prepare(`
            SELECT id, tickers, date, source, title, summary, created_at
            FROM BETA_01_News
            ORDER BY date DESC
            LIMIT 50
          `).all();

          // Group by source
          const bySource = {};
          for (const row of results) {
            if (!bySource[row.source]) bySource[row.source] = [];
            bySource[row.source].push({
              id: row.id,
              tickers: row.tickers ? JSON.parse(row.tickers) : [],
              date: row.date,
              title: row.title,
              summary: row.summary,
              created_at: row.created_at
            });
          }

          return Response.json(bySource, { headers: corsHeaders });
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
            results: (results.results || []).map(r => ({
              id: r.id,
              summaryId: r.summary_id,
              summaryType: r.summary_type,
              totalFacts: r.total_facts,
              verified: r.verified,
              notFound: r.not_found,
              contradicted: r.contradicted,
              score: r.score,
              issues: r.issues ? JSON.parse(r.issues) : [],
              createdAt: r.created_at
            }))
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
          const [dailyMacro, macroTrend, tickerTrends, dailyNews, macro, sentiment] = await Promise.all([
            db.prepare(`SELECT id, structure, summary, creation_date FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1`).first(),
            db.prepare(`SELECT id, summary, created_at FROM BETA_09_Trend ORDER BY created_at DESC LIMIT 1`).first(),
            db.prepare(`SELECT id, ticker, summary, created_at FROM ALPHA_04_Trends ORDER BY created_at DESC`).all(),
            db.prepare(`SELECT id, ticker, summary, todays_important, last_important, last_important_date, created_at FROM ALPHA_05_Daily_news ORDER BY created_at DESC`).all(),
            db.prepare(`SELECT id, date, type, summary, created_at FROM BETA_03_Macro ORDER BY date DESC LIMIT 20`).all(),
            db.prepare(`SELECT id, date, type, summary, created_at FROM BETA_04_Sentiment ORDER BY date DESC LIMIT 20`).all()
          ]);

          // Process ticker trends
          const trendsMap = {};
          for (const row of tickerTrends.results || []) {
            if (!trendsMap[row.ticker]) {
              trendsMap[row.ticker] = { id: row.id, summary: row.summary, created_at: row.created_at };
            }
          }

          // Process daily news
          const newsMap = {};
          for (const row of dailyNews.results || []) {
            if (!newsMap[row.ticker]) {
              newsMap[row.ticker] = {
                id: row.id,
                summary: row.summary,
                todays_important: row.todays_important,
                last_important: row.last_important,
                last_important_date: row.last_important_date,
                date: row.created_at?.slice(0, 10)
              };
            }
          }

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
            tickerTrends: trendsMap,
            dailyNews: newsMap,
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

        return new Response("Not found", { status: 404, headers: corsHeaders });

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
             (id, ticker, date, heading, summary, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               summary=excluded.summary,
               created_at=excluded.created_at`
          ).bind(
            id,
            ticker,
            x.date,
            x.heading,
            x.summary ?? null,
            now
          ).run();
        }
      }
    }


    if (which === "daily-news") {
      for (const x of body) {
        const id = await shortHash(`${x.ticker}|${today}`);

        await db.prepare(
          `INSERT INTO ALPHA_05_Daily_news
           (id, ticker, summary, todays_important, last_important, last_important_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             summary=excluded.summary,
             todays_important=excluded.todays_important,
             last_important=excluded.last_important,
             last_important_date=excluded.last_important_date,
             created_at=excluded.created_at`
        ).bind(
          id,
          x.ticker,
          x.summary ?? null,
          x.todays_important ?? null,
          x.last_important ?? null,
          x.last_important_date ?? today,
          now
        ).run();
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
    if (which === "news") {
      for (const [source, items] of Object.entries(body)) {
        for (const x of items) {
          const title = x.heading ?? x.title;
          const id = await shortHash(`${source}|${x.date}|${title}`);

          await db.prepare(
            `INSERT INTO BETA_01_News
             (id, tickers, date, source, title, summary, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               summary=excluded.summary,
               created_at=excluded.created_at`
          ).bind(
            id,
            JSON.stringify(x.tickers ?? []),
            x.date,
            source,
            title,
            x.summary ?? null,
            now
          ).run();
        }
      }
    }


    // -------- BETA_02_WH --------
    if (which === "whitehouse") {
      for (const x of body.WhiteHouse) {
        const id = await shortHash(`${x.date}|${x.title}`);

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
          x.summary ?? null,
          now
        ).run();
      }
    }


    // -------- BETA_03_Macro --------
    if (which === "macro") {
      for (const x of body.Macro) {
        const id = await shortHash(`${x.heading}|${x.date}`);
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


    return new Response("OK", { headers: corsHeaders });
  }
};
