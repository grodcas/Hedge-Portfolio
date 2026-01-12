import fs from "fs";

const baseFiles = [
  //"AAPL_10K_item1.js",
  //"AAPL_10K_item7.js",
  //"AAPL_10K_item8.js",
  //"AAPL_10Q_item1.js",
  //"AAPL_10Q_item2.js",
 // "AAPL_10Q_item3.js",
  //"AAPL_8K.js",
  "AAPL_4.js"
];

const tickers = [
  "MSFT","GOOGL","AMZN","NVDA","META","TSLA","BRK","JPM","GS","BAC",
  "XOM","CVX","UNH","LLY","JNJ","PG","KO","HD","CAT","BA","INTC",
  "AMD","NFLX","MS"
];

// ❌ tickers that should NOT get certain reports
const skip = {
  "10Q": ["INTC","JNJ","MS","NFLX"],              // example
  "10K": [],                   // none skipped
  "8K": []                     // none skipped
};

for (const file of baseFiles) {
  const aaplContent = fs.readFileSync(file, "utf8");

  const is10Q = file.includes("_10Q_");
  const is10K = file.includes("_10K_");
  const is8K  = file.includes("_8K");

  for (const t of tickers) {
    if (
      (is10Q && skip["10Q"]?.includes(t)) ||
      (is10K && skip["10K"]?.includes(t)) ||
      (is8K  && skip["8K"] ?.includes(t))
    ) {
      continue;
    }

    const newName = file.replace("AAPL", t);
    const newContent = aaplContent.replaceAll("AAPL", t);
    fs.writeFileSync(newName, newContent);
  }
}

console.log("Done.");
