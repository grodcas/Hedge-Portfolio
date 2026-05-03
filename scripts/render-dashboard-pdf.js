// scripts/render-dashboard-pdf.js
// Renders docs/PORTFOLIO_DASHBOARD_DESIGN.md to docs/PORTFOLIO_DASHBOARD_DESIGN.pdf.
// Mirrors scripts/render-pdf.js but without Mermaid (this doc has no diagrams).

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MD_FILE  = path.join(__dirname, "..", "docs", "PORTFOLIO_DASHBOARD_DESIGN.md");
const PDF_FILE = path.join(__dirname, "..", "docs", "PORTFOLIO_DASHBOARD_DESIGN.pdf");

console.log(`Reading ${MD_FILE}`);
const md = fs.readFileSync(MD_FILE, "utf8");

const PAGE_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<title>Portfolio Dashboard — How to Use It</title>
<style>
  @page { size: A4; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #1a1a1a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 { font-size: 22pt; margin: 0 0 8pt 0; padding-top: 8pt; border-bottom: 2px solid #222; padding-bottom: 6pt; page-break-before: always; }
  h1:first-of-type { page-break-before: auto; }
  h2 { font-size: 16pt; margin: 22pt 0 8pt 0; padding-bottom: 4pt; border-bottom: 1px solid #999; color: #1a1a1a; page-break-after: avoid; }
  h3 { font-size: 13pt; margin: 16pt 0 6pt 0; color: #2a2a2a; page-break-after: avoid; }
  h4 { font-size: 11pt; margin: 12pt 0 4pt 0; color: #333; page-break-after: avoid; }
  p  { margin: 6pt 0; }
  table { border-collapse: collapse; margin: 8pt 0; width: 100%; font-size: 9.5pt; }
  table tr { page-break-inside: avoid; }
  th, td { border: 1px solid #d0d0d0; padding: 5pt 8pt; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 600; color: #111; }
  tr:nth-child(even) td { background: #fafafa; }
  code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 9pt; background: #f3f3f3; padding: 1px 4px; border-radius: 2px; }
  pre { background: #f7f7f7; border: 1px solid #e0e0e0; border-radius: 4px; padding: 9pt 11pt; overflow: hidden; font-size: 8.5pt; line-height: 1.35; page-break-inside: avoid; white-space: pre-wrap; word-break: normal; }
  pre code { background: none; padding: 0; font-size: inherit; }
  blockquote { border-left: 3px solid #ccc; margin: 6pt 0; padding: 2pt 12pt; color: #555; }
  hr { border: none; border-top: 1px solid #bbb; margin: 16pt 0; }
  ul, ol { margin: 6pt 0 6pt 20pt; padding: 0; }
  li { margin: 2pt 0; }
  a { color: #2563eb; text-decoration: none; }
  strong { color: #111; font-weight: 600; }
  em { color: #444; }
  body > #content > h1:first-of-type { margin-top: 30pt; font-size: 28pt; }
</style>
<script src="https://cdn.jsdelivr.net/npm/marked@9/marked.min.js"></script>
</head>
<body>
<div id="content"></div>
<script>
(async () => {
  try {
    while (typeof marked === "undefined") { await new Promise(r => setTimeout(r, 50)); }
    const md = ${JSON.stringify(md)};
    document.getElementById("content").innerHTML = marked.parse(md);
  } catch (err) {
    console.error("[render]", err);
    window.__renderError = String(err);
  }
  window.__renderDone = true;
})();
</script>
</body></html>`;

console.log("Launching headless Chrome...");
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
  page.on("console", (msg) => { if (msg.type() === "error") console.log("[browser]", msg.text()); });
  await page.setContent(PAGE_HTML, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction("window.__renderDone === true", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));
  console.log("Generating PDF...");
  await page.pdf({
    path: PDF_FILE,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: false,
    margin: { top: "18mm", right: "15mm", bottom: "18mm", left: "15mm" },
  });
} finally {
  await browser.close();
}
const stat = fs.statSync(PDF_FILE);
console.log(`Done: ${PDF_FILE}`);
console.log(`Size: ${(stat.size / 1024).toFixed(0)} KB`);
