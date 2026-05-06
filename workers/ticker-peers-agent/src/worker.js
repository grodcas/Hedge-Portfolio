/**
 * TICKER-PEERS-AGENT (#4 Peer comps reading) — per [TICKER_PIPELINE.md §4].
 *
 * One paragraph placing the ticker against peers and the sector median.
 * Verdict on whether the relative premium is earned or stretched.
 *
 * Inputs (per ticker):
 *   - PEER_SET_config.peers_json — list of peer tickers (deduped server-side).
 *   - For ticker + each peer: latest STOCK_FACTORS_daily + FUND_01_Fundamentals
 *     (forward_pe, operating_margin, profit_margin, peer_median_pe,
 *      rs_vs_sector_3m, mom_12_1, market_cap, revenue_annual + _prev for
 *      YoY rev growth approximation).
 *   - SECTOR_FACTORS_daily for the ticker's sector (sector median PE).
 *
 * Self-contained per the spec — no thesis driver input.
 *
 * Output (validated):
 *   {
 *     prose: string,
 *     relative_position: "outlier" | "middle" | "laggard",
 *     premium_status:    "earned" | "stretched" | "none",
 *     peer_count: int,
 *     version, last_updated, input_fingerprint, ticker_at_write
 *   }
 *
 * Writes TICKER_TREND_long.{peers_json, _updated_at, _model}.
 * Endpoint: GET /build?ticker=NVDA[&force=1].
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";
const VALID_POSITION = new Set(["outlier", "middle", "laggard"]);
const VALID_PREMIUM  = new Set(["earned", "stretched", "none"]);
const MAX_PEERS = 6;

const SECTOR_MAP = {
  Technology:    ["AAPL", "MSFT", "NVDA", "INTC", "AMD"],
  ConsDisc:      ["AMZN", "TSLA", "HD"],
  Communication: ["GOOGL", "META", "NFLX"],
  Finance:       ["JPM", "GS", "BAC", "MS", "BRK.B"],
  Energy:        ["XOM", "CVX"],
  Healthcare:    ["UNH", "LLY", "JNJ"],
  Staples:       ["PG", "KO"],
  Industrial:    ["CAT", "BA"],
};
const TICKER_TO_SECTOR = (() => {
  const m = {};
  for (const [sec, tickers] of Object.entries(SECTOR_MAP)) {
    for (const t of tickers) m[t] = sec;
  }
  return m;
})();

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const ticker = url.searchParams.get("ticker");
    if (!ticker) return Response.json({ ok: false, error: "ticker query param required" }, { status: 400 });
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";

    try {
      const out = await build(env.DB, apiKey, ticker, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(db, apiKey, ticker, force) {
  const sector = TICKER_TO_SECTOR[ticker] || null;

  const [trendRow, peerCfg, sectorRow] = await Promise.all([
    db.prepare(
      `SELECT peers_json, peers_updated_at FROM TICKER_TREND_long WHERE ticker = ?`,
    ).bind(ticker).first(),
    db.prepare(
      `SELECT peers_json, source FROM PEER_SET_config WHERE ticker = ?`,
    ).bind(ticker).first(),
    sector
      ? db.prepare(
          `SELECT date, fwd_pe_sector, valuation_sigma
             FROM SECTOR_FACTORS_daily WHERE sector = ?
            ORDER BY date DESC LIMIT 1`,
        ).bind(sector).first()
      : Promise.resolve(null),
  ]);
  if (!trendRow) throw new Error(`no TICKER_TREND_long row for ${ticker}`);
  if (!peerCfg)  throw new Error(`no PEER_SET_config row for ${ticker} — bootstrap-peer-set-config first`);

  const rawPeers = safeJson(peerCfg.peers_json) || [];
  const peers = dedupe(rawPeers).filter(t => t !== ticker).slice(0, MAX_PEERS);
  if (peers.length === 0) throw new Error(`PEER_SET_config.peers_json empty for ${ticker}`);

  // Pull comp rows for ticker + peers in one batched query each table.
  const all = [ticker, ...peers];
  const placeholders = all.map(() => "?").join(",");
  const [factorsRes, fundRes] = await Promise.all([
    db.prepare(
      `SELECT s.ticker, s.date, s.fwd_pe, s.rel_pe_sigma, s.peer_median_pe,
              s.mom_12_1, s.rs_vs_sector_3m, s.eps_rev_4w
         FROM STOCK_FACTORS_daily s
         INNER JOIN (
           SELECT ticker, MAX(date) AS d FROM STOCK_FACTORS_daily
            WHERE ticker IN (${placeholders})
            GROUP BY ticker
         ) g ON g.ticker = s.ticker AND g.d = s.date`,
    ).bind(...all).all(),
    db.prepare(
      `SELECT f.ticker, f.date, f.pe_ratio, f.forward_pe, f.market_cap,
              f.profit_margin, f.operating_margin, f.dividend_yield, f.beta,
              f.revenue_annual, f.revenue_annual_prev, f.cfo
         FROM FUND_01_Fundamentals f
         INNER JOIN (
           SELECT ticker, MAX(date) AS d FROM FUND_01_Fundamentals
            WHERE ticker IN (${placeholders})
            GROUP BY ticker
         ) g ON g.ticker = f.ticker AND g.d = f.date`,
    ).bind(...all).all(),
  ]);
  const byTicker = new Map();
  for (const t of all) byTicker.set(t, { ticker: t, factors: null, fund: null });
  for (const r of factorsRes.results || []) byTicker.get(r.ticker).factors = r;
  for (const r of fundRes.results    || []) byTicker.get(r.ticker).fund    = r;

  const tickerComp = byTicker.get(ticker);
  const peerComps  = peers.map(t => byTicker.get(t)).filter(c => c.factors || c.fund);

  const prevPeers   = trendRow.peers_json ? safeJson(trendRow.peers_json) : null;
  const prevVersion = Number.isInteger(prevPeers?.version) ? prevPeers.version : 0;

  // Annotated-gap path. When STOCK_FACTORS_daily / FUND_01_Fundamentals
  // have no rows for any of this ticker's configured peers (typical for
  // names like UNH whose ELV/HUM/CNC peers aren't in the portfolio's 25),
  // we write a synthetic peers_json instead of throwing. Keeps the
  // slide-out card rendering with a clear "insufficient peer coverage"
  // tag rather than going blank or breaking the per-ticker fan-out DAG.
  if (peerComps.length === 0) {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const out = {
      prose: `Peer comparison unavailable for ${ticker}. The configured peer set (${peers.join(", ")}) has no comp rows in STOCK_FACTORS_daily or FUND_01_Fundamentals — peer coverage isn't broad enough to land on a relative-position read. Add the missing peers to factor ingestion to unlock this card.`,
      relative_position: "n/a",
      premium_status:    "insufficient peer coverage",
      peer_count:        0,
      peer_set:          peers,
      missing_peers:     peers,
      version:           prevVersion + 1,
      as_of:             today,
      last_updated:      now,
      input_fingerprint: await sha256(JSON.stringify({ ticker, peers, gap: true })),
      ticker_at_write:   ticker,
      note:              "annotated-gap fallback (no peer comp rows)",
    };
    await db.prepare(
      `UPDATE TICKER_TREND_long
          SET peers_json       = ?,
              peers_updated_at = ?,
              peers_model      = ?
        WHERE ticker = ?`,
    ).bind(JSON.stringify(out), now, "annotated-gap", ticker).run();
    return {
      action: "wrote_gap_annotation",
      ticker,
      version: out.version,
      relative_position: out.relative_position,
      premium_status:    out.premium_status,
      peer_count:        0,
      peers_updated_at:  now,
    };
  }

  const fingerprint = await sha256(JSON.stringify({
    ticker,
    peers,
    target:   compFingerprint(tickerComp),
    peer_fp:  peerComps.map(compFingerprint),
    sector_fp: sectorRow ? [sectorRow.fwd_pe_sector, sectorRow.valuation_sigma] : null,
    peer_source: peerCfg.source,
  }));

  if (!force && prevPeers?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      ticker,
      version: prevVersion,
      peers_updated_at: trendRow.peers_updated_at,
    };
  }

  const prompt = buildPrompt({ ticker, sector, tickerComp, peerComps, sectorRow, prevPeers });
  const blob = await callLLM(apiKey, prompt, { model: MODEL });
  validate(blob);

  const now = new Date().toISOString();
  const out = {
    prose:             blob.prose.trim(),
    relative_position: blob.relative_position,
    premium_status:    blob.premium_status,
    peer_count:        peerComps.length,
    peer_set:          peers,
    version:           prevVersion + 1,
    last_updated:      now,
    input_fingerprint: fingerprint,
    ticker_at_write:   ticker,
  };

  await db.prepare(
    `UPDATE TICKER_TREND_long
        SET peers_json       = ?,
            peers_updated_at = ?,
            peers_model      = ?
      WHERE ticker = ?`,
  ).bind(JSON.stringify(out), now, MODEL, ticker).run();

  return {
    action: "wrote",
    ticker,
    version: out.version,
    relative_position: out.relative_position,
    premium_status:    out.premium_status,
    peer_count:        out.peer_count,
    peers_updated_at:  now,
  };
}

function compFingerprint(c) {
  if (!c) return null;
  return [
    c.factors?.fwd_pe ?? null,
    c.factors?.mom_12_1 ?? null,
    c.factors?.rs_vs_sector_3m ?? null,
    c.fund?.forward_pe ?? null,
    c.fund?.operating_margin ?? null,
    c.fund?.profit_margin ?? null,
    c.fund?.market_cap ?? null,
    c.fund?.revenue_annual ?? null,
    c.fund?.revenue_annual_prev ?? null,
  ];
}

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    if (typeof x !== "string" || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function buildPrompt({ ticker, sector, tickerComp, peerComps, sectorRow, prevPeers }) {
  const peerLines = [tickerComp, ...peerComps].map(c => fmtPeerLine(c, c.ticker === ticker));
  const peerBlock = peerLines.join("\n");

  const sectorBlock = sectorRow
    ? `  fwd_pe_sector:   ${fmtNum(sectorRow.fwd_pe_sector)}
  valuation_sigma: ${fmtNum(sectorRow.valuation_sigma)}σ   (sector vs trend)`
    : "  (no SECTOR_FACTORS_daily row)";

  const prevBlock = prevPeers
    ? `Version: ${prevPeers.version} (last updated ${prevPeers.last_updated})
Position: ${prevPeers.relative_position}, premium: ${prevPeers.premium_status}
Prose: ${prevPeers.prose}`
    : "(no prior peers reading)";

  return `You are a senior equity analyst writing the peer-comps reading for ${ticker} (sector: ${sector || "unknown"}). One short paragraph placing it against the peer table and the sector median, then a verdict on the relative premium.

PEER TABLE (target marked with ★; sector: ${sector || "unknown"})
  ticker  | fwd_pe |  OPM  | profit_m | mom_12_1 | rs_vs_sector_3m | mkt_cap     | rev_yoy_approx
  --------+--------+-------+----------+----------+-----------------+-------------+----------------
${peerBlock}

SECTOR MEDIAN
${sectorBlock}

PREVIOUS PEERS READING (drift gradually — only flip when comp set demands)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one short paragraph, 3-5 sentences. Compare ${ticker} explicitly against the peer median and the sector median. Cite at least one peer by ticker and one specific number.>",
  "relative_position": "outlier" | "middle" | "laggard",
  "premium_status":    "earned" | "stretched" | "none"
}

RULES
- "outlier" = ${ticker} sits clearly above peer median on growth + margins (top 1-2 of the comp set). "laggard" = clearly below. "middle" = between.
- "earned" = the multiple premium (fwd_pe vs peer median) is matched or exceeded by superior margins / momentum. "stretched" = premium without the supporting metrics. "none" = no premium (target trades at-or-below peer median).
- Cite ${ticker}'s number first, then the peer median number, in the same sentence.
- Do NOT cite a metric marked "(unavailable)" for ${ticker} OR the peer median.
- Do not hedge — pick one position and one premium status.`;
}

function fmtPeerLine(c, isTarget) {
  const t = c.ticker;
  const fwd_pe = c.factors?.fwd_pe ?? c.fund?.forward_pe ?? null;
  const opm    = c.fund?.operating_margin ?? null;
  const pm     = c.fund?.profit_margin ?? null;
  const mom    = c.factors?.mom_12_1 ?? null;
  const rs     = c.factors?.rs_vs_sector_3m ?? null;
  const mc     = c.fund?.market_cap ?? null;
  const rev    = c.fund?.revenue_annual;
  const revPrev = c.fund?.revenue_annual_prev;
  const revYoY = (rev != null && revPrev != null && revPrev > 0)
    ? `${(((rev - revPrev) / revPrev) * 100).toFixed(1)}%`
    : "(unavailable)";
  const marker = isTarget ? "★" : " ";
  return `  ${marker}${t.padEnd(6)}| ${fmtNum(fwd_pe).padStart(6)} | ${fmtPct(opm).padStart(5)} | ${fmtPct(pm).padStart(8)} | ${fmtNum(mom).padStart(8)} | ${fmtNum(rs).padStart(15)} | ${fmtMoneyShort(mc).padStart(11)} | ${revYoY.padStart(14)}`;
}

function fmtNum(v) {
  if (v == null) return "(NA)";
  const n = Number(v);
  if (!Number.isFinite(n)) return "(NA)";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 10)   return n.toFixed(2);
  return n.toFixed(3);
}
function fmtPct(v) {
  if (v == null) return "(NA)";
  const n = Number(v);
  if (!Number.isFinite(n)) return "(NA)";
  return `${(n * 100).toFixed(1)}%`;
}
function fmtMoneyShort(v) {
  if (v == null) return "(NA)";
  const n = Number(v);
  if (!Number.isFinite(n)) return "(NA)";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9)  return `$${(n / 1e9).toFixed(0)}B`;
  if (Math.abs(n) >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validate(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 50) {
    throw new Error("invalid output: prose missing or too short");
  }
  if (!VALID_POSITION.has(blob.relative_position)) {
    throw new Error(`invalid relative_position: ${blob.relative_position}`);
  }
  if (!VALID_PREMIUM.has(blob.premium_status)) {
    throw new Error(`invalid premium_status: ${blob.premium_status}`);
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
