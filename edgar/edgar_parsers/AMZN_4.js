import { load } from "cheerio";
import he from "he";

function clean(t) {
  return he.decode(t || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidDate(s) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(s);
}

const VALID_CODES = new Set(["A","S","M","F","G","D","C","P","I"]);

function toNumber(s) {
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.,]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parse4(html) {
  const $ = load(html, { decodeEntities: false });
  const rows = [];

  const tableI = $("th")
    .filter((_, th) => {
      const t = clean($(th).text()).toLowerCase();
      return t.includes("table i") && t.includes("non-derivative");
    })
    .first()
    .closest("table");

  if (!tableI.length) return rows;

  tableI.find("tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 9) return;

    const security  = clean($(tds[0]).text());
    const date      = clean($(tds[1]).text());
    const rawCode   = clean($(tds[3]).text());
    const code = rawCode.replace(/[^A-Z]/gi, "");

    const amount    = toNumber(clean($(tds[5]).text()));
    const direction = clean($(tds[6]).text());
    const price     = toNumber(clean($(tds[7]).text()));
    const after     = toNumber(clean($(tds[8]).text()));

    if (!security) return;
    if (!isValidDate(date)) return;
    if (!VALID_CODES.has(code)) return;
    if (!Number.isFinite(amount)) return;

    rows.push({
      security,
      date,
      code,
      amount,
      direction,
      price,
      after,
    });
  });

  return rows;
}
