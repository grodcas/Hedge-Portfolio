// validation/lib/logger.js - Console logging with fixed header and scrolling logs
import fs from "fs";
import path from "path";

// ANSI escape codes
const ESC = "\x1b";
const CLEAR_LINE = `${ESC}[2K`;
const CURSOR_UP = (n) => `${ESC}[${n}A`;
const CURSOR_DOWN = (n) => `${ESC}[${n}B`;
const CURSOR_TO_COL = (n) => `${ESC}[${n}G`;
const SAVE_CURSOR = `${ESC}7`;
const RESTORE_CURSOR = `${ESC}8`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR_SCREEN = `${ESC}[2J`;
const CURSOR_HOME = `${ESC}[H`;
const SCROLL_REGION = (top, bottom) => `${ESC}[${top};${bottom}r`;
const RESET_SCROLL = `${ESC}[r`;

// Colors
const COLORS = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  green: `${ESC}[32m`,
  red: `${ESC}[31m`,
  yellow: `${ESC}[33m`,
  blue: `${ESC}[34m`,
  cyan: `${ESC}[36m`,
  white: `${ESC}[37m`,
  bgGreen: `${ESC}[42m`,
  bgRed: `${ESC}[41m`,
  bgYellow: `${ESC}[43m`,
  bgBlue: `${ESC}[44m`
};

// Symbols
const SYM = {
  tick: `${COLORS.green}✓${COLORS.reset}`,
  cross: `${COLORS.red}✗${COLORS.reset}`,
  warn: `${COLORS.yellow}⚠${COLORS.reset}`,
  bullet: `${COLORS.cyan}●${COLORS.reset}`,
  empty: ` `,
  progress: "█",
  progressEmpty: "░"
};

class PipelineLogger {
  constructor(options = {}) {
    this.headerLines = 10; // Fixed header height
    this.steps = [];
    this.currentStep = 0;
    this.logs = [];
    this.maxLogs = options.maxLogs || 100;
    this.startTime = new Date();
    this.logFile = null;
    this.logData = {
      date: this.startTime.toISOString().slice(0, 10),
      startTime: this.startTime.toISOString(),
      steps: {},
      validations: {},
      summary: {}
    };

    // Terminal dimensions
    this.cols = process.stdout.columns || 80;
    this.rows = process.stdout.rows || 24;
  }

  init(steps, logDir = "C:\\AI_agent\\HF\\logs") {
    this.steps = steps.map((name, i) => ({
      name,
      status: "pending",
      progress: 0,
      detail: "",
      items: 0
    }));

    // Create log file
    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toISOString().slice(11, 19).replace(/:/g, "-");
    this.logFile = path.join(logDir, `ingest_${dateStr}_${timeStr}.json`);

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Setup terminal
    process.stdout.write(HIDE_CURSOR);
    process.stdout.write(CLEAR_SCREEN);
    process.stdout.write(CURSOR_HOME);

    // Draw initial header
    this.renderHeader();

    // Set scroll region below header
    const scrollStart = this.headerLines + 2;
    process.stdout.write(`${ESC}[${scrollStart};${this.rows}r`);
    process.stdout.write(`${ESC}[${scrollStart};1H`);
  }

  renderHeader() {
    process.stdout.write(SAVE_CURSOR);
    process.stdout.write(CURSOR_HOME);

    const dateStr = this.startTime.toISOString().slice(0, 19).replace("T", " ");
    const elapsed = this.getElapsed();

    // Title bar
    const title = ` INGESTION PIPELINE - ${dateStr} `;
    const padding = "─".repeat(Math.max(0, this.cols - title.length - 2));
    console.log(`${COLORS.cyan}┌${title}${padding}┐${COLORS.reset}`);

    // Steps
    this.steps.forEach((step, i) => {
      const num = `[${i + 1}/${this.steps.length}]`;
      const name = step.name.padEnd(18);
      const bar = this.makeProgressBar(step.progress, 20);
      const status = this.getStatusText(step);
      console.log(`${COLORS.cyan}│${COLORS.reset} ${num} ${name} ${bar} ${status.padEnd(20)}${COLORS.cyan}│${COLORS.reset}`);
    });

    // Separator
    console.log(`${COLORS.cyan}├${"─".repeat(this.cols - 2)}┤${COLORS.reset}`);
    console.log(`${COLORS.cyan}│${COLORS.reset} ${COLORS.bold}LOGS:${COLORS.reset}${" ".repeat(this.cols - 9)}${COLORS.cyan}│${COLORS.reset}`);
    console.log(`${COLORS.cyan}└${"─".repeat(this.cols - 2)}┘${COLORS.reset}`);

    process.stdout.write(RESTORE_CURSOR);
  }

  makeProgressBar(pct, width) {
    const filled = Math.floor((pct / 100) * width);
    const empty = width - filled;
    return `${COLORS.green}${SYM.progress.repeat(filled)}${COLORS.dim}${SYM.progressEmpty.repeat(empty)}${COLORS.reset}`;
  }

  getStatusText(step) {
    switch (step.status) {
      case "pending":
        return `${COLORS.dim}PENDING${COLORS.reset}`;
      case "running":
        return `${COLORS.yellow}${step.progress}%${COLORS.reset}  ${step.detail}`;
      case "done":
        return `${COLORS.green}DONE${COLORS.reset}  (${step.items} items)`;
      case "failed":
        return `${COLORS.red}FAILED${COLORS.reset}`;
      case "warning":
        return `${COLORS.yellow}WARN${COLORS.reset}  (${step.items} items)`;
      default:
        return "";
    }
  }

  getElapsed() {
    const ms = Date.now() - this.startTime.getTime();
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  }

  startStep(stepIndex) {
    this.currentStep = stepIndex;
    this.steps[stepIndex].status = "running";
    this.steps[stepIndex].progress = 0;
    this.renderHeader();
  }

  updateStep(stepIndex, progress, detail = "") {
    this.steps[stepIndex].progress = Math.min(100, Math.max(0, progress));
    this.steps[stepIndex].detail = detail;
    this.renderHeader();
  }

  completeStep(stepIndex, items = 0, status = "done") {
    this.steps[stepIndex].status = status;
    this.steps[stepIndex].progress = 100;
    this.steps[stepIndex].items = items;
    this.logData.steps[this.steps[stepIndex].name] = {
      status,
      items,
      completedAt: new Date().toISOString()
    };
    this.renderHeader();
  }

  log(category, message, status = "info") {
    const time = new Date().toISOString().slice(11, 19);
    const statusIcon = status === "ok" ? SYM.tick :
                       status === "fail" ? SYM.cross :
                       status === "warn" ? SYM.warn : " ";

    const logLine = `  ${COLORS.dim}${time}${COLORS.reset} [${COLORS.cyan}${category.padEnd(8)}${COLORS.reset}] ${statusIcon} ${message}`;

    // Store in memory
    this.logs.push({ time, category, message, status });
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Print to scrolling region
    console.log(logLine);
  }

  // Validation logging methods
  logValidation(section, ticker, checks, value = "") {
    // checks is an object like { url: true, format: true, data: false }
    const checkStr = Object.entries(checks)
      .map(([k, v]) => `${k}:${v ? SYM.tick : SYM.cross}`)
      .join(" ");

    const status = Object.values(checks).every(v => v) ? "ok" :
                   Object.values(checks).some(v => v) ? "warn" : "fail";

    this.log(section, `${ticker.padEnd(6)} ${checkStr} ${COLORS.dim}${value}${COLORS.reset}`, status);

    // Store in log data
    if (!this.logData.validations[section]) {
      this.logData.validations[section] = {};
    }
    this.logData.validations[section][ticker] = { checks, value, status };
  }

  logSECValidation(ticker, calendar, ingestor, secCheck, match, newFilings) {
    const calFlag = calendar ? `${COLORS.yellow}${calendar}${COLORS.reset}` : "    ";
    const matchIcon = match ? SYM.tick : SYM.cross;
    const ingStr = ingestor || "-";
    const secStr = secCheck || "-";
    const newStr = newFilings || "-";

    const status = match ? "ok" : "fail";
    this.log("SEC", `${calFlag} ${ticker.padEnd(6)} ING:${ingStr.padEnd(12)} SEC:${secStr.padEnd(12)} ${matchIcon} NEW:${newStr}`, status);

    if (!this.logData.validations.SEC) {
      this.logData.validations.SEC = {};
    }
    this.logData.validations.SEC[ticker] = { calendar, ingestor, secCheck, match, newFilings };
  }

  logMacroValidation(indicator, calendarFlag, checks, value) {
    const calIcon = calendarFlag ? SYM.bullet : SYM.empty;
    const checkStr = `url:${checks.url ? SYM.tick : SYM.cross} fmt:${checks.format ? SYM.tick : SYM.cross} data:${checks.data ? SYM.tick : SYM.cross}`;

    const status = checks.url && checks.format && checks.data ? "ok" :
                   checks.url || checks.format || checks.data ? "warn" : "fail";

    this.log("MACRO", `${calIcon} ${indicator.padEnd(20)} ${checkStr} ${COLORS.dim}${value}${COLORS.reset}`, status);

    if (!this.logData.validations.MACRO) {
      this.logData.validations.MACRO = {};
    }
    this.logData.validations.MACRO[indicator] = { calendarFlag, checks, value, status };
  }

  logPressValidation(ticker, checks, latest) {
    // New format: checks = { discovery, content, fresh }
    const discSym = checks.discovery ? SYM.tick : SYM.cross;
    const contSym = checks.content ? SYM.tick : SYM.cross;
    const freshSym = checks.fresh ? SYM.tick : SYM.cross;
    const checkStr = `disc:${discSym} cont:${contSym} fresh:${freshSym}`;
    const latestStr = latest ? `${latest.substring(0, 40)}...` : "[NO DATA]";

    const status = checks.discovery && checks.content ? "ok" :
                   checks.discovery ? "warn" : "fail";

    this.log("PRESS", `${ticker.padEnd(6)} ${checkStr} ${COLORS.dim}${latestStr}${COLORS.reset}`, status);

    if (!this.logData.validations.PRESS) {
      this.logData.validations.PRESS = {};
    }
    this.logData.validations.PRESS[ticker] = { checks, latest, status };
  }

  logNewsValidation(source, checks, articleCount, tickers) {
    const checkStr = `html:${checks.html ? SYM.tick : SYM.cross} txt:${checks.text ? SYM.tick : SYM.cross} ai:${checks.aiPass}/${checks.aiTotal}`;
    const tickerStr = tickers.slice(0, 5).join(",");

    const status = checks.html && checks.text && checks.aiPass === checks.aiTotal ? "ok" :
                   checks.aiPass > 0 ? "warn" : "fail";

    this.log("NEWS", `${source.padEnd(10)} ${checkStr} ${articleCount} articles ${COLORS.dim}${tickerStr}${COLORS.reset}`, status);

    if (!this.logData.validations.NEWS) {
      this.logData.validations.NEWS = {};
    }
    this.logData.validations.NEWS[source] = { checks, articleCount, tickers, status };
  }

  // Print validation table (for SEC)
  printSECTable(data) {
    console.log("");
    console.log(`${COLORS.bold}SEC EDGAR VALIDATION:${COLORS.reset}`);
    console.log(`${COLORS.dim}┌──────┬────────┬───────────────────┬───────────────────┬───────┬──────────┐${COLORS.reset}`);
    console.log(`${COLORS.dim}│${COLORS.reset} CAL  ${COLORS.dim}│${COLORS.reset} TICKER ${COLORS.dim}│${COLORS.reset} INGESTOR          ${COLORS.dim}│${COLORS.reset} SEC_CHECK         ${COLORS.dim}│${COLORS.reset} MATCH ${COLORS.dim}│${COLORS.reset} NEW      ${COLORS.dim}│${COLORS.reset}`);
    console.log(`${COLORS.dim}├──────┼────────┼───────────────────┼───────────────────┼───────┼──────────┤${COLORS.reset}`);

    for (const row of data) {
      const cal = (row.calendar || "").padEnd(4);
      const ticker = row.ticker.padEnd(6);
      const ing = (row.ingestor || "-").padEnd(17);
      const sec = (row.secCheck || "-").padEnd(17);
      const match = row.match ? SYM.tick : SYM.cross;
      const newF = (row.newFilings || "-").padEnd(8);
      console.log(`${COLORS.dim}│${COLORS.reset} ${cal} ${COLORS.dim}│${COLORS.reset} ${ticker} ${COLORS.dim}│${COLORS.reset} ${ing} ${COLORS.dim}│${COLORS.reset} ${sec} ${COLORS.dim}│${COLORS.reset}   ${match}   ${COLORS.dim}│${COLORS.reset} ${newF} ${COLORS.dim}│${COLORS.reset}`);
    }

    console.log(`${COLORS.dim}└──────┴────────┴───────────────────┴───────────────────┴───────┴──────────┘${COLORS.reset}`);

    const matches = data.filter(r => r.match).length;
    const total = data.length;
    const discrepancies = data.filter(r => !r.match).map(r => r.ticker).join(", ");
    console.log(`Summary: ${matches}/${total} match${discrepancies ? ` | Discrepancies: ${discrepancies}` : ""}`);
    console.log("");
  }

  // Print macro table
  printMacroTable(data) {
    console.log("");
    console.log(`${COLORS.bold}MACRO INDICATORS VALIDATION:${COLORS.reset}`);
    console.log(`${COLORS.dim}┌──────┬─────────────────────┬─────┬────────┬──────┬─────────────────────────────┐${COLORS.reset}`);
    console.log(`${COLORS.dim}│${COLORS.reset} CAL  ${COLORS.dim}│${COLORS.reset} INDICATOR           ${COLORS.dim}│${COLORS.reset} URL ${COLORS.dim}│${COLORS.reset} FORMAT ${COLORS.dim}│${COLORS.reset} DATA ${COLORS.dim}│${COLORS.reset} VALUE                       ${COLORS.dim}│${COLORS.reset}`);
    console.log(`${COLORS.dim}├──────┼─────────────────────┼─────┼────────┼──────┼─────────────────────────────┤${COLORS.reset}`);

    for (const row of data) {
      const cal = row.calendarFlag ? SYM.bullet : " ";
      const name = row.indicator.padEnd(19);
      const url = row.checks.url ? SYM.tick : SYM.cross;
      const fmt = row.checks.format ? SYM.tick : SYM.cross;
      const dat = row.checks.data ? SYM.tick : SYM.cross;
      const val = (row.value || "").substring(0, 27).padEnd(27);
      console.log(`${COLORS.dim}│${COLORS.reset}  ${cal}   ${COLORS.dim}│${COLORS.reset} ${name} ${COLORS.dim}│${COLORS.reset}  ${url}  ${COLORS.dim}│${COLORS.reset}   ${fmt}    ${COLORS.dim}│${COLORS.reset}  ${dat}   ${COLORS.dim}│${COLORS.reset} ${val} ${COLORS.dim}│${COLORS.reset}`);
    }

    console.log(`${COLORS.dim}└──────┴─────────────────────┴─────┴────────┴──────┴─────────────────────────────┘${COLORS.reset}`);

    const passed = data.filter(r => r.checks.url && r.checks.format && r.checks.data).length;
    const failed = data.filter(r => !r.checks.url || !r.checks.format || !r.checks.data);
    console.log(`Summary: ${passed}/${data.length} passed${failed.length ? ` | Failed: ${failed.map(r => r.indicator).join(", ")}` : ""}`);
    console.log("");
  }

  // Final summary
  printFinalSummary(summary) {
    const elapsed = this.getElapsed();
    const status = summary.hasErrors ? "COMPLETED WITH ERRORS" :
                   summary.hasWarnings ? "COMPLETED WITH WARNINGS" : "SUCCESS";
    const statusColor = summary.hasErrors ? COLORS.red :
                        summary.hasWarnings ? COLORS.yellow : COLORS.green;

    console.log("");
    console.log(`${COLORS.cyan}╔${"═".repeat(this.cols - 2)}╗${COLORS.reset}`);
    console.log(`${COLORS.cyan}║${COLORS.reset}${COLORS.bold}                         INGESTION COMPLETE                              ${COLORS.reset}${COLORS.cyan}║${COLORS.reset}`);
    console.log(`${COLORS.cyan}╠${"═".repeat(this.cols - 2)}╣${COLORS.reset}`);
    console.log(`${COLORS.cyan}║${COLORS.reset}  Duration: ${elapsed.padEnd(20)} Status: ${statusColor}${status}${COLORS.reset}${" ".repeat(Math.max(0, 25 - status.length))}${COLORS.cyan}║${COLORS.reset}`);
    console.log(`${COLORS.cyan}╠${"─".repeat(this.cols - 2)}╣${COLORS.reset}`);
    console.log(`${COLORS.cyan}║${COLORS.reset}  ${COLORS.bold}VALIDATION SUMMARY:${COLORS.reset}${" ".repeat(this.cols - 24)}${COLORS.cyan}║${COLORS.reset}`);

    for (const [section, result] of Object.entries(summary.sections)) {
      const icon = result.failed === 0 ? SYM.tick : SYM.cross;
      const line = `    ${section.padEnd(16)} ${result.passed}/${result.total} ${icon}  ${result.issues ? `(${result.issues})` : ""}`;
      console.log(`${COLORS.cyan}║${COLORS.reset}${line.padEnd(this.cols - 3)}${COLORS.cyan}║${COLORS.reset}`);
    }

    if (summary.calendarEvents && summary.calendarEvents.length > 0) {
      console.log(`${COLORS.cyan}╠${"─".repeat(this.cols - 2)}╣${COLORS.reset}`);
      console.log(`${COLORS.cyan}║${COLORS.reset}  ${COLORS.bold}CALENDAR EVENTS TODAY:${COLORS.reset}${" ".repeat(this.cols - 27)}${COLORS.cyan}║${COLORS.reset}`);
      for (const event of summary.calendarEvents) {
        const icon = event.confirmed ? SYM.tick : SYM.cross;
        const line = `    ${SYM.bullet} ${event.name} - ${event.confirmed ? "CONFIRMED" : "NOT FOUND"} ${icon}`;
        console.log(`${COLORS.cyan}║${COLORS.reset}${line.padEnd(this.cols - 3)}${COLORS.cyan}║${COLORS.reset}`);
      }
    }

    if (summary.actionRequired && summary.actionRequired.length > 0) {
      console.log(`${COLORS.cyan}╠${"─".repeat(this.cols - 2)}╣${COLORS.reset}`);
      console.log(`${COLORS.cyan}║${COLORS.reset}  ${COLORS.bold}ACTION REQUIRED:${COLORS.reset}${" ".repeat(this.cols - 21)}${COLORS.cyan}║${COLORS.reset}`);
      for (const action of summary.actionRequired) {
        const line = `    ${SYM.warn} ${action}`;
        console.log(`${COLORS.cyan}║${COLORS.reset}${line.padEnd(this.cols - 3)}${COLORS.cyan}║${COLORS.reset}`);
      }
    }

    console.log(`${COLORS.cyan}╚${"═".repeat(this.cols - 2)}╝${COLORS.reset}`);

    // Store summary
    this.logData.summary = summary;
    this.logData.endTime = new Date().toISOString();
    this.logData.duration = elapsed;
  }

  // Save log to file
  save() {
    this.logData.logs = this.logs;
    fs.writeFileSync(this.logFile, JSON.stringify(this.logData, null, 2));
    console.log(`\n${COLORS.dim}Log saved to: ${this.logFile}${COLORS.reset}`);
    return this.logFile;
  }

  // Get logs array for D1 upload
  getLogs() {
    return this.logs.slice(-50); // Return last 50 log entries
  }

  // Cleanup terminal
  cleanup() {
    process.stdout.write(RESET_SCROLL);
    process.stdout.write(SHOW_CURSOR);
  }
}

export default PipelineLogger;
export { COLORS, SYM };
