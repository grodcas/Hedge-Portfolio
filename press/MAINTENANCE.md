# Press Scraper Maintenance Guide

## How the System Works

1. **Discovery scrapers** (`{TICKER}.js`) - Find press release listings from company newsrooms
2. **Article scrapers** (`{TICKER}_2.js`) - Extract full article text from individual press releases
3. **Orchestrator** (`AA_press_releases_today.js`) - Runs all scrapers, validates output, saves healthCheck

## Health Check Validation

The validation runs daily and checks:
- **Discovery**: Did the listing scraper return valid items?
- **Content**: Did the article scraper return 800+ characters?

Results are saved to `AA_press_releases_today.json` with a `healthCheck` object per ticker.

---

## Common Failure Patterns

### 1. CSS Selector Changed (Most Common)

**Symptom**: `textLength: 0` or `BAD_CONTENT` error

**Cause**: Website redesigned, CSS class names changed

**How to diagnose**:
```bash
cd C:\AI_agent\HF\press
node debug_scraper.js "https://example.com/press-release-url" debug_output.html
```

This shows which selectors work on the current page structure.

**How to fix**: Update the selector in `{TICKER}_2.js`

**Example fixes from 2026-02-24**:

| Ticker | Old Selector | New Selector |
|--------|--------------|--------------|
| GS | `.gs-uitk-c-1kdujvh--text-root...` (auto-generated) | `main p, #__next p` |
| BAC | `.richtext.text .cmp-text` | `.press-release p` |
| PG | `.formatted-text` | `main p, .page-content p` |
| INTC | `div.entry-content p` | `article p, main p` |

### 2. Timeout Issues

**Symptom**: `textLength: 0` but manual run works fine

**Cause**: `AA_press_releases_today.js` has a 30-second timeout. Scrapers using `networkidle0` or `networkidle2` may exceed this.

**How to fix**: Change `waitUntil` to `domcontentloaded` and reduce timeout:
```javascript
// Before (slow)
await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

// After (fast)
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
```

### 3. Missing Scraper File

**Symptom**: Ticker not in healthCheck results

**Cause**: `{TICKER}_2.js` file doesn't exist

**How to fix**: Create the file using a working template:
```javascript
import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeArticle(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  );

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
  const html = await page.content();
  await browser.close();

  const $ = load(html);
  const paragraphs = [];

  // Update selector based on debug_scraper.js output
  $("main p, article p").each((_, el) => {
    const txt = $(el).text().trim();
    if (txt && txt.length > 20) paragraphs.push(txt);
  });

  return paragraphs.join("\n\n");
}

const url = process.argv[2];
scrapeArticle(url).then(console.log).catch(console.error);
```

### 4. PDF Files

**Symptom**: `textLength: 0`, URL ends in `.pdf`

**Cause**: Company publishes press releases as PDFs (e.g., Berkshire Hathaway)

**Status**: Known limitation. Would require PDF parsing library.

### 5. Bot Protection / 403 Errors

**Symptom**: Discovery fails, or `textLength: 0` with timeout

**Cause**: Website blocks automated requests

**How to diagnose**: Try loading URL in debug_scraper.js - if it times out or returns minimal HTML, it's likely bot protection.

**Possible fixes**:
- Use `headless: "new"` instead of `headless: true`
- Add `args: ["--no-sandbox", "--disable-setuid-sandbox"]`
- Try different `waitUntil` options
- Some sites may require cookies/sessions (harder to fix)

---

## Debug Tools

### debug_scraper.js

Tests multiple selectors against a URL and saves raw HTML:

```bash
node debug_scraper.js "https://company.com/press/article" debug_output.html
```

Output shows:
- Which selectors find content
- How many matches each selector gets
- Sample text from first match

### Manual scraper test

```bash
node {TICKER}_2.js "https://press-release-url" 2>&1 | Measure-Object -Character
```

Should return 800+ characters for a passing article.

---

## Maintenance Checklist

When a ticker starts failing:

1. Check `AA_press_releases_today.json` for error type
2. If `content: false`, run debug_scraper.js on the latest URL
3. Find working selector from debug output
4. Update `{TICKER}_2.js` with new selector
5. Test manually: `node {TICKER}_2.js "url"`
6. Run full validation: `node AA_press_releases_today.js`

---

## File Locations

- Discovery scrapers: `C:\AI_agent\HF\press\{TICKER}.js`
- Article scrapers: `C:\AI_agent\HF\press\{TICKER}_2.js`
- Orchestrator: `C:\AI_agent\HF\press\AA_press_releases_today.js`
- Results: `C:\AI_agent\HF\press\AA_press_releases_today.json`
- Debug tool: `C:\AI_agent\HF\press\debug_scraper.js`

---

## History

### 2026-02-24
- Fixed GS_2.js (CSS selector)
- Fixed BAC_2.js (CSS selector)
- Fixed PG_2.js (CSS selector)
- Created GOOGL_2.js (was missing)
- Fixed INTC_2.js (CSS selector + timeout)
- Result: 22/24 passing (91.7%)
- Remaining: GOOGL (marginal - 791 chars), BRKB (PDF)
