// scripts/render-pdf-bw.js
//
// Black-and-white variant of render-pdf.js. Same input markdown, but the
// per-diagram Mermaid `classDef` lines are rewritten so each layer is
// distinguished by SHAPE + FILL SHADE + STROKE STYLE rather than colour.
// Renders cleanly on a B&W laser printer with no loss of meaning.
//
// Output: docs/SYSTEM_REFERENCE-bw.pdf
//
// Visual signatures (combined with shape, which is already distinct):
//   src       (rounded)      thin solid 1px border          white fill
//   code      (rectangle)    thick solid 2.5px border       white fill
//   db        (cylinder)     thin solid 1px border          white fill   (cylinder shape itself is the cue)
//   agentLLM  (hexagon)      medium solid 2px border        light grey fill (#e8e8e8)
//   agentDet  (subroutine)   medium 1.5px DASHED border     white fill
//   ui        (parallelogram)medium solid 2px border        dark grey fill (#c8c8c8)

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MD_FILE  = path.join(__dirname, "..", "docs", "SYSTEM_REFERENCE.md");
const PDF_FILE = path.join(__dirname, "..", "docs", "SYSTEM_REFERENCE-bw.pdf");

console.log(`Reading ${MD_FILE}`);
let md = fs.readFileSync(MD_FILE, "utf8");

// Convert LaTeX-style page-break markers to CSS-controlled divs.
md = md.replace(/\\pagebreak/g, '<div class="page-break"></div>');

// Replace coloured Mermaid classDef blocks with B&W equivalents.
const BW_CLASSDEFS = [
  [
    "classDef src fill:#e3f2fd,stroke:#1976d2,color:#0d47a1",
    "classDef src fill:#fff,stroke:#000,stroke-width:1px,color:#000",
  ],
  [
    "classDef code fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20",
    "classDef code fill:#fff,stroke:#000,stroke-width:2.5px,color:#000",
  ],
  [
    "classDef db fill:#fff8e1,stroke:#f57c00,color:#e65100",
    "classDef db fill:#fff,stroke:#000,stroke-width:1px,color:#000",
  ],
  [
    "classDef agentLLM fill:#fce4ec,stroke:#c2185b,color:#880e4f",
    "classDef agentLLM fill:#e8e8e8,stroke:#000,stroke-width:2px,color:#000",
  ],
  [
    "classDef agentDet fill:#f5f5f5,stroke:#616161,color:#212121",
    "classDef agentDet fill:#fff,stroke:#000,stroke-width:1.5px,stroke-dasharray:4 2,color:#000",
  ],
  [
    "classDef ui fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c",
    "classDef ui fill:#c8c8c8,stroke:#000,stroke-width:2px,color:#000",
  ],
];
for (const [from, to] of BW_CLASSDEFS) {
  md = md.split(from).join(to);
}

const PAGE_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<title>Hedge Portfolio System Reference (B&W)</title>
<style>
  @page { size: A4; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 {
    font-size: 22pt; margin: 0 0 8pt 0; padding-top: 8pt;
    border-bottom: 2px solid #000; padding-bottom: 6pt;
    page-break-before: always;
  }
  h1:first-of-type { page-break-before: auto; }
  h2 {
    font-size: 16pt; margin: 22pt 0 8pt 0; padding-bottom: 4pt;
    border-bottom: 1px solid #000; color: #000;
    page-break-after: avoid;
  }
  h3 { font-size: 13pt; margin: 16pt 0 6pt 0; color: #000; page-break-after: avoid; }
  h4 { font-size: 11pt; margin: 12pt 0 4pt 0; color: #000; page-break-after: avoid; }
  p  { margin: 6pt 0; }
  table {
    border-collapse: collapse; margin: 8pt 0; width: 100%;
    font-size: 9.5pt;
  }
  table tr { page-break-inside: avoid; }
  th, td {
    border: 1px solid #000; padding: 5pt 8pt;
    text-align: left; vertical-align: top;
  }
  th { background: #d0d0d0; font-weight: 600; color: #000; }
  tr:nth-child(even) td { background: #f0f0f0; }
  code {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 9pt; background: #ececec; padding: 1px 4px;
    border-radius: 2px;
  }
  pre {
    background: #f0f0f0; border: 1px solid #888; border-radius: 4px;
    padding: 9pt 11pt; overflow: hidden;
    font-size: 8.5pt; line-height: 1.35;
    page-break-inside: avoid;
    white-space: pre-wrap; word-break: normal;
  }
  pre code { background: none; padding: 0; font-size: inherit; }
  blockquote {
    border-left: 3px solid #777; margin: 6pt 0; padding: 2pt 12pt;
    color: #333;
  }
  .mermaid {
    background: white; padding: 4pt; margin: 8pt auto;
    text-align: center;
    max-width: 100%;
  }
  .mermaid svg {
    max-width: 100% !important;
    max-height: 200mm !important;
    width: auto !important;
    height: auto !important;
    display: block;
    margin: 0 auto;
  }
  .page-break { page-break-after: always; height: 0; line-height: 0; }
  hr { border: none; border-top: 1px solid #888; margin: 16pt 0; }
  ul, ol { margin: 6pt 0 6pt 20pt; padding: 0; }
  li { margin: 2pt 0; }
  a { color: #000; text-decoration: underline; }
  strong { color: #000; font-weight: 700; }
  em { color: #000; font-style: italic; }
  body > #content > h1:first-of-type {
    margin-top: 30pt; font-size: 28pt;
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
  try {
    while (typeof marked === "undefined" || !window.__mermaid) {
      await new Promise(r => setTimeout(r, 50));
    }

    const md = ${JSON.stringify(md)};
    let html = marked.parse(md);

    // Convert fenced mermaid code blocks to mermaid divs for runtime rendering
    html = html.replace(
      /<pre><code class="language-mermaid">([\\s\\S]*?)<\\/code><\\/pre>/g,
      (_, code) => {
        const decoded = code
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        return '<div class="mermaid">' + decoded + '</div>';
      }
    );

    document.getElementById("content").innerHTML = html;

    window.__mermaid.initialize({
      startOnLoad: false,
      theme: "neutral",
      themeVariables: {
        fontFamily: "Helvetica Neue, Arial, sans-serif",
        primaryColor: "#ffffff",
        primaryTextColor: "#000000",
        primaryBorderColor: "#000000",
        lineColor: "#000000",
        secondaryColor: "#e8e8e8",
        tertiaryColor: "#c8c8c8",
        edgeLabelBackground: "#ffffff",
      },
      flowchart: { htmlLabels: true, curve: "basis", padding: 8 },
      securityLevel: "loose",
    });
    await window.__mermaid.run({ querySelector: ".mermaid" });
  } catch (err) {
    console.error("[render-bw]", err);
    window.__renderError = String(err);
  }
  window.__renderDone = true;
})();
</script>
</body></html>`;

console.log("Launching headless Chrome...");
const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[browser]", msg.text());
  });

  await page.setContent(PAGE_HTML, { waitUntil: "networkidle0", timeout: 60000 });

  console.log("Rendering Mermaid diagrams (~30s)...");
  await page.waitForFunction("window.__renderDone === true", { timeout: 180000 });

  const err = await page.evaluate(() => window.__renderError || null);
  if (err) console.warn(`Mermaid had errors but PDF still produced: ${err}`);

  await new Promise((r) => setTimeout(r, 2000));

  const diagrams = await page.evaluate(
    () => document.querySelectorAll(".mermaid svg").length
  );
  console.log(`${diagrams} Mermaid diagrams rendered as SVG`);

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
