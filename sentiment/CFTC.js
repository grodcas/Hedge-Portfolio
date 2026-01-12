import axios from "axios";

const URL = "https://www.cftc.gov/dea/newcot/FinFutWk.txt";

function num(x) {
  return x === "." ? 0 : parseInt(x.replace(/,/g, ""), 10) || 0;
}

async function getCOT() {
  const { data } = await axios.get(URL, {
    responseType: "text",
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const lines = data.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  let es = null;
  let nq = null;

  for (let line of lines) {
    // split CSV respecting quotes
    const cols = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
    if (!cols) continue;

    const name = cols[0].replace(/"/g, "").trim();

    // ES (S&P)
    if (name.includes("E-MINI S&P")) {
      // According to CFTC:
      const assetLong  = num(cols[10]);
      const assetShort = num(cols[11]);
      const levLong    = num(cols[13]);
      const levShort   = num(cols[14]);

      es = {
        asset_managers: assetLong - assetShort,
        leveraged_funds: levLong - levShort
      };
    }

    // NQ (Nasdaq)
    if (name.includes("NASDAQ MINI")) {
      const assetLong  = num(cols[10]);
      const assetShort = num(cols[11]);
      const levLong    = num(cols[13]);
      const levShort   = num(cols[14]);

      nq = {
        asset_managers: assetLong - assetShort,
        leveraged_funds: levLong - levShort
      };
    }
  }

  return { es, nq };
}

// Example usage:
(async () => {
  console.log(await getCOT());
})();
