/**
 * MACRO-SECTOR-IMPLEMENTATION-AGENT (S4) — name-level plan inside the sector.
 *
 * Per [MAP_PIPELINE.md §S4]. Translate the sector thesis into a concrete
 * action list for the names this fund holds in that sector. Bridges the
 * sector view into the Book.
 *
 * Inputs (per /build?sector=X):
 *   - Sector thesis drivers + tripwires (SECTOR_TREND_long.thesis_json)
 *   - Sector driver-drift signs            HARDCODED null until S1 (MS-3e)
 *   - Sector tripwire flags fired          HARDCODED [] until S1
 *   - Sector-specific raw releases (same MACRO_STATE_indicators slice
 *     S2 reads — fresh prints can change sequencing)
 *   - Current book holdings in this sector (PORTFOLIO_01_Holdings ∩
 *     SECTOR_MAP)
 *   - Per-name signals (TICKER_TREND_long.score / regime / thesis for
 *     each held name in the sector — tells the agent which name is the
 *     cleanest expression today)
 *   - Book risk caps                       NOT in DB; soft cap of ±2%
 *                                          per name, ±5% per sector noted
 *                                          in the prompt rules.
 *
 * Output (validated):
 *   {
 *     prose: string,
 *     actions: [{
 *       ticker, action ("OW" | "UW" | "neutral" | "exit" | "initiate"),
 *       magnitude (1..5), rationale, sequence_note
 *     }],
 *     version, last_updated, input_fingerprint, regime_at_write
 *   }
 *
 * Writes SECTOR_TREND_long.{implementation_json,_updated_at,_model}.
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";

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
const VALID_SECTORS = new Set(Object.keys(SECTOR_MAP));

const SECTOR_INDICATOR_SLICES = {
  Energy:        ["WTI", "RIG_PROXY", "DXY_BROAD", "GOLD"],
  Finance:       ["DGS2", "DGS10", "OAS_IG", "OAS_HY", "FEDFUNDS", "BANK_RESERVES"],
  Technology:    ["DGS10", "REAL_5Y", "BREAKEVEN_5Y", "VIX"],
  Communication: ["DGS10", "REAL_5Y", "DXY_BROAD"],
  ConsDisc:      ["UNEMP", "UMICH_SENT", "INFL_EXP_1Y", "WTI"],
  Healthcare:    ["UNEMP", "UMICH_SENT", "DGS10", "INFL_EXP_1Y"],
  Staples:       ["CPI_HEADLINE", "CPI_CORE", "WTI", "DXY_BROAD"],
  Industrial:    ["INDPRO", "HOUST", "RIG_PROXY", "JOLTS", "WTI"],
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const sector = url.searchParams.get("sector");
    if (!sector || !VALID_SECTORS.has(sector)) {
      return Response.json({ ok: false, error: `invalid sector — use one of: ${[...VALID_SECTORS].join(",")}` }, { status: 400 });
    }
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
    try {
      const out = await build(env, env.DB, apiKey, sector, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(env, db, apiKey, sector, force) {
  const sectorRow = await db.prepare(
    `SELECT thesis_json, thesis_updated_at,
            implementation_json, implementation_updated_at
       FROM SECTOR_TREND_long WHERE sector = ?`,
  ).bind(sector).first();
  if (!sectorRow) throw new Error(`no SECTOR_TREND_long row for ${sector}`);
  if (!sectorRow.thesis_json) throw new Error(`no thesis_json for ${sector} — fire macro-sector-thesis-agent first`);
  const sectorThesis = JSON.parse(sectorRow.thesis_json);

  const macroRow = await db.prepare(
    `SELECT regime FROM BETA_10_Daily_macro
      WHERE thesis_json IS NOT NULL ORDER BY creation_date DESC LIMIT 1`,
  ).first();

  // Sector-specific indicator slice
  const slice = SECTOR_INDICATOR_SLICES[sector] || [];
  const indRows = slice.length
    ? (await db.prepare(
        `SELECT i.indicator_code, i.indicator_name, i.value, i.unit, i.delta_1m, i.z_vs_24m, i.release_date
           FROM MACRO_STATE_indicators i
           INNER JOIN (
             SELECT indicator_code, MAX(release_date) AS d
               FROM MACRO_STATE_indicators
              WHERE indicator_code IN (${slice.map(() => "?").join(",")})
              GROUP BY indicator_code
           ) g ON g.indicator_code = i.indicator_code AND g.d = i.release_date
          ORDER BY i.indicator_code`,
      ).bind(...slice).all()).results || []
    : [];

  // Book holdings + per-name signals for this sector.
  const tickers = SECTOR_MAP[sector];
  const placeholders = tickers.map(() => "?").join(",");
  const [holdRes, ttRes] = await Promise.all([
    db.prepare(`SELECT ticker, weight_pct FROM PORTFOLIO_01_Holdings WHERE ticker IN (${placeholders})`).bind(...tickers).all(),
    db.prepare(`SELECT ticker, regime, score, thesis FROM TICKER_TREND_long WHERE ticker IN (${placeholders})`).bind(...tickers).all(),
  ]);
  const holdings = Object.fromEntries((holdRes.results || []).map(r => [r.ticker, r.weight_pct]));
  const ttByTicker = Object.fromEntries((ttRes.results || []).map(r => [r.ticker, r]));

  // Fingerprint.
  const prevImpl = sectorRow.implementation_json ? safeJson(sectorRow.implementation_json) : null;
  const prevVersion = Number.isInteger(prevImpl?.version) ? prevImpl.version : 0;
  const fingerprint = await sha256(JSON.stringify({
    sector,
    macro_regime: macroRow?.regime ?? null,
    thesis_drivers:   sectorThesis.drivers,
    thesis_tripwires: sectorThesis.tripwires,
    indicators: indRows.map(r => [r.indicator_code, r.value, r.delta_1m, r.z_vs_24m]),
    holdings,
    ticker_signals: tickers.map(t => [t, ttByTicker[t]?.regime ?? null, ttByTicker[t]?.score ?? null]),
  }));

  if (!force && prevImpl?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      sector,
      version: prevVersion,
      implementation_updated_at: sectorRow.implementation_updated_at,
    };
  }

  const prompt = buildPrompt({
    sector,
    macroRegime: macroRow?.regime || "unclassified",
    sectorThesis, indRows, tickers, holdings, ttByTicker, prevImpl,
  });

  const blob = await callLLM(apiKey, prompt, { model: MODEL, env, caller: "macro-sector-implementation" });
  validateImpl(blob, tickers);

  const now = new Date().toISOString();
  const impl = {
    prose:        blob.prose.trim(),
    actions:      blob.actions,
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    regime_at_write: macroRow?.regime ?? null,
  };

  await db.prepare(
    `UPDATE SECTOR_TREND_long
        SET implementation_json = ?, implementation_updated_at = ?, implementation_model = ?
      WHERE sector = ?`,
  ).bind(JSON.stringify(impl), now, MODEL, sector).run();

  return {
    action: "wrote",
    sector,
    version: impl.version,
    actions_count: impl.actions.length,
    implementation_updated_at: now,
  };
}

function buildPrompt({ sector, macroRegime, sectorThesis, indRows, tickers, holdings, ttByTicker, prevImpl }) {
  const driversBlock = (sectorThesis.drivers || []).map(d => `  - ${d.name}: ${d.rationale}`).join("\n") || "  (none)";
  const tripwiresBlock = (sectorThesis.tripwires || []).map(t => `  - [${t.id}] ${t.condition} — currently: ${t.currently}`).join("\n") || "  (none)";
  const indBlock = indRows.length
    ? indRows.map(r => {
        const v  = fmtNum(r.value);
        const dd = r.delta_1m == null ? "n/a" : `${r.delta_1m >= 0 ? "+" : ""}${fmtNum(r.delta_1m)}`;
        const zz = r.z_vs_24m == null ? "n/a" : `${r.z_vs_24m >= 0 ? "+" : ""}${fmtNum(r.z_vs_24m)}σ`;
        return `  ${r.indicator_code.padEnd(20)} ${v}${r.unit ? " " + r.unit : ""}  |  Δ1m ${dd}  |  Z ${zz}   (${r.release_date})`;
      }).join("\n")
    : "  (no MACRO_STATE_indicators rows for this sector)";

  const namesBlock = tickers.map(t => {
    const w = holdings[t] != null ? `${holdings[t].toFixed(2)}%` : "n/a";
    const tt = ttByTicker[t];
    const sig = tt
      ? `regime ${tt.regime ?? "?"}, score ${fmtNum(tt.score)}, thesis: ${(tt.thesis || "").slice(0, 100)}`
      : "(no TICKER_TREND_long row)";
    return `  ${t.padEnd(6)} weight ${w.padEnd(7)}  ${sig}`;
  }).join("\n");

  const prevBlock = prevImpl
    ? `Version: ${prevImpl.version} (last updated ${prevImpl.last_updated})
Prose: ${prevImpl.prose ?? "(missing)"}
Actions:
${(prevImpl.actions || []).map(a => `  - ${a.action} ${a.ticker} (mag ${a.magnitude}): ${a.rationale}`).join("\n") || "  (none)"}`
    : "(no prior implementation — this is the first version)";

  return `You are translating the sector thesis for ${sector} into a concrete name-level plan inside this fund's book. Output one ACTION per held name (and any new initiates) — what to do, how big, in what order.

MACRO REGIME
  Label: ${macroRegime}

SECTOR THESIS DRIVERS
${driversBlock}

SECTOR THESIS TRIPWIRES
${tripwiresBlock}

SECTOR-SPECIFIC RAW RELEASES (current value | 1m delta | Z vs 24m)
${indBlock}

NAMES IN ${sector.toUpperCase()} (book weight + ticker-level signal)
${namesBlock}

BOOK RISK CAPS
  (none configured — assume soft cap of ±2% per name and ±5% per sector vs neutral)

PREVIOUS IMPLEMENTATION (drift gradually — keep actions when still right)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one short paragraph, 3-5 sentences. State the load-bearing tilt within the sector and the sequencing intent. Reference at least one ticker by name and one driver / release.>",
  "actions": [
    {
      "ticker":         "<one of: ${tickers.join(", ")}>",
      "action":         "OW" | "UW" | "neutral" | "exit" | "initiate",
      "magnitude":      1,
      "rationale":      "<one sentence: which sector driver and which ticker signal anchor this action>",
      "sequence_note":  "<short clause: do this first / wait for X / size into weakness / etc.>"
    }
  ]
}

RULES
- One entry per ticker in NAMES above. Drop only tickers we explicitly do NOT want exposure to (use action="exit"); otherwise express a stance even if "neutral".
- magnitude: 1 = small, 5 = max conviction within this sector.
- "initiate" only for tickers with weight=n/a today; "exit" only for tickers currently held (weight > 0).
- Anchor every action in BOTH a sector driver / release AND the per-name TICKER_TREND_long signal. Don't invent ticker-level facts not in the table above.
- Honor the soft cap: do not stack > +5 of magnitude across all OWs in this sector.
- Prose must take a position on which name is the cleanest expression of the thesis right now.`;
}

function fmtNum(v) {
  if (v == null) return "?";
  const n = Number(v);
  if (!Number.isFinite(n)) return "?";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 10)   return n.toFixed(2);
  return n.toFixed(3);
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validateImpl(blob, tickers) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 30) throw new Error("invalid output: prose missing");
  if (!Array.isArray(blob.actions) || blob.actions.length < 1) throw new Error("invalid output: actions empty");
  const validActions = new Set(["OW", "UW", "neutral", "exit", "initiate"]);
  const allowedTickers = new Set(tickers);
  for (const a of blob.actions) {
    if (!allowedTickers.has(a.ticker)) throw new Error(`invalid action: ticker "${a.ticker}" not in sector`);
    if (!validActions.has(a.action))   throw new Error(`invalid action: "${a.action}" must be OW/UW/neutral/exit/initiate`);
    if (!Number.isInteger(a.magnitude) || a.magnitude < 0 || a.magnitude > 5) throw new Error("invalid action: magnitude must be int 0..5");
    if (typeof a.rationale !== "string" || !a.rationale.trim()) throw new Error("invalid action: rationale missing");
    if (typeof a.sequence_note !== "string") throw new Error("invalid action: sequence_note missing");
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
