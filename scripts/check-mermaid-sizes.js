// Quick diagnostic: render the doc in Puppeteer, report each Mermaid SVG's
// dimensions after the print stylesheet is applied. Tells us if any diagram
// is taller than a page after clamping.

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MD_FILE = path.join(__dirname, "..", "docs", "SYSTEM_REFERENCE.md");

let md = fs.readFileSync(MD_FILE, "utf8");
md = md.replace(/\\pagebreak/g, '<div class="page-break"></div>');

// Re-use the same HTML template as render-pdf.js (inlined here)
const PAGE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body { font-family: sans-serif; }
  .mermaid svg {
    max-width: 100% !important;
    max-height: 200mm !important;
    width: auto !important;
    height: auto !important;
    display: block;
    margin: 0 auto;
  }
</style>
<script src="https://cdn.jsdelivr.net/npm/marked@9/marked.min.js"></script>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs";
  window.__mermaid = mermaid;
</script>
</head>
<body>
<div id="content"></div>
<script>
(async () => {
  while (typeof marked === "undefined" || !window.__mermaid) await new Promise(r => setTimeout(r, 50));
  const md = ${JSON.stringify(md)};
  let html = marked.parse(md);
  html = html.replace(/<pre><code class="language-mermaid">([\\s\\S]*?)<\\/code><\\/pre>/g, (_, code) => {
    const decoded = code.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    return '<div class="mermaid">' + decoded + '</div>';
  });
  document.getElementById("content").innerHTML = html;
  window.__mermaid.initialize({ startOnLoad: false, theme: "default", flowchart: { htmlLabels: true, curve: "basis", padding: 8 }, securityLevel: "loose" });
  await window.__mermaid.run({ querySelector: ".mermaid" });
  window.__renderDone = true;
})();
</script>
</body></html>`;

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
// Match A4 width at 96dpi: 210mm = 793px
await page.setViewport({ width: 793, height: 1122 });
await page.setContent(PAGE_HTML, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction("window.__renderDone === true", { timeout: 180000 });

const sizes = await page.evaluate(() => {
  // Find each .mermaid div and the cluster header before it
  const divs = Array.from(document.querySelectorAll(".mermaid"));
  return divs.map((div) => {
    // Walk back to find the previous h2 or h1
    let prev = div.previousElementSibling;
    while (prev && !["H1", "H2", "H3"].includes(prev.tagName)) prev = prev.previousElementSibling;
    const svg = div.querySelector("svg");
    const r = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };
    return {
      header: prev ? prev.textContent.trim().slice(0, 60) : "(no header)",
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  });
});

console.log("\nMermaid SVG sizes (rendered at A4 width 793px):");
console.log("Page content height ≈ 1010px (A4 minus 18mm top + 18mm bottom margins)\n");
console.log("Header                                                       Width  Height");
console.log("-".repeat(80));
for (const s of sizes) {
  const flag = s.height > 800 ? "  ⚠ TALL" : "";
  console.log(`${s.header.padEnd(60)} ${String(s.width).padStart(5)}  ${String(s.height).padStart(5)}${flag}`);
}

await browser.close();
