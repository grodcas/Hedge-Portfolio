export default {
  async fetch(request, env) {
    if (request.method !== "POST")
      return new Response("POST only", { status: 405 });

    const url = new URL(request.url);
    const which = url.pathname.split("/").pop();
    const body = await request.json();

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const db = env.HEDGE_DB;

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
    
        await db.prepare(
          `INSERT INTO BETA_03_Macro
           (id, date, type, summary, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             summary=excluded.summary,
             created_at=excluded.created_at`
        ).bind(
          id,
          x.date,
          x.heading,
          x.summary ?? null,
          now
        ).run();
      }
    }
    

    // -------- BETA_04_Sentiment --------
    if (which === "sentiment") {
      for (const x of body.Sentiment) {
        const id = await shortHash(`${x.heading}|${x.date}`);
    
        await db.prepare(
          `INSERT INTO BETA_04_Sentiment
           (id, date, type, summary, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             summary=excluded.summary,
             created_at=excluded.created_at`
        ).bind(
          id,
          x.date,
          x.heading,
          x.summary ?? null,
          now
        ).run();
      }
    }
    

    /* =========================
       REPORT + CLUSTERS
    ========================= */

    // -------- ALPHA_01_Reports + ALPHA_02_Clusters --------
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

      await db.prepare(
        `INSERT INTO ALPHA_01_Reports
        (id, date, ticker, type, structure, summary, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          structure = excluded.structure,
          summary   = excluded.summary,
          created_at = excluded.created_at`
      ).bind(
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
          ON CONFLICT(id) DO UPDATE SET
            importance = excluded.importance,
            title      = excluded.title,
            summary    = excluded.summary,
            created_at = excluded.created_at`
        ).bind(
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

      return Response.json({ ok: true, report_id: reportId });
    }


    return new Response("OK");
  }
};
