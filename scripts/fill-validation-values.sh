#!/usr/bin/env bash
# Auto-fills the "Value written" column of docs/active/sprint-output/VALIDATION_REPORT.md
# with the latest values from the remote D1 database.
#
# Usage:  scripts/fill-validation-values.sh
# Requires: npx, wrangler (auth'd via `npx wrangler login`), python3.
#
# Runs one SELECT per indicator code (or composite key for FOMC / fundamentals
# rows), captures the value, and rewrites VALIDATION_REPORT.md in place. The
# user verifies values against source URLs manually after the script
# completes — this script does NOT mark Match? YES/NO.

set -euo pipefail
cd "$(dirname "$0")/.."

REPORT="docs/active/sprint-output/VALIDATION_REPORT.md"
DB="portfolio-db"
WRANGLER_DIR="workers/portfolio-ingestor"

python3 - "$REPORT" "$DB" "$WRANGLER_DIR" <<'PY'
import json
import re
import subprocess
import sys
from pathlib import Path

REPORT_PATH = Path(sys.argv[1])
DB          = sys.argv[2]
WRANGLER_DIR = sys.argv[3]


def run_sql(sql: str) -> str:
    """Run one SQL command against the remote D1 and return the first row's
    'value' column (or empty string if no result)."""
    cmd = [
        "npx", "wrangler", "d1", "execute", DB,
        "--remote", "--json", "--command", sql,
    ]
    try:
        out = subprocess.run(
            cmd, cwd=WRANGLER_DIR, check=True,
            capture_output=True, text=True, timeout=60,
        ).stdout
    except subprocess.CalledProcessError as e:
        print(f"  ! wrangler failed for: {sql[:80]}…  ({e.stderr[:200] if e.stderr else 'no stderr'})", file=sys.stderr)
        return ""
    except subprocess.TimeoutExpired:
        print(f"  ! wrangler timed out for: {sql[:80]}…", file=sys.stderr)
        return ""
    # Strip the wrangler banner ("⛅️ wrangler X.Y.Z\n──") that prints to stdout.
    json_start = out.find("[")
    if json_start < 0:
        return ""
    try:
        parsed = json.loads(out[json_start:])
    except json.JSONDecodeError:
        return ""
    if not parsed or not parsed[0].get("results"):
        return ""
    row = parsed[0]["results"][0]
    # First column is what we always select as `value` (or aliased to value).
    val = row.get("value")
    if val is None:
        return ""
    return str(val)


def latest(table: str, code: str) -> str:
    return run_sql(
        f"SELECT value FROM {table} WHERE indicator_code = '{code}' "
        f"ORDER BY release_date DESC LIMIT 1"
    )


def fomc(indicator: str, year: str, stat: str) -> str:
    return run_sql(
        f"SELECT value FROM FOMC_PROJECTIONS "
        f"WHERE indicator='{indicator}' AND year='{year}' AND stat='{stat}' "
        f"ORDER BY meeting_date DESC LIMIT 1"
    )


def fund01_nvda(col: str) -> str:
    return run_sql(
        f"SELECT {col} AS value FROM FUND_01_Fundamentals "
        f"WHERE ticker='NVDA' ORDER BY date DESC LIMIT 1"
    )


def fund01_nvda_quarter_count() -> str:
    return run_sql(
        "SELECT COUNT(DISTINCT fiscal_period_ending) AS value "
        "FROM FUND_01_Quarterly WHERE ticker='NVDA'"
    )


V: dict[str, str] = {}

print("→ macro-state-fetcher (FRED + BLS series)…", file=sys.stderr)
for code in [
    "REAL_5Y","BREAKEVEN_5Y","BREAKEVEN_5Y5Y_FWD","OAS_IG","OAS_HY",
    "FED_TOTAL_ASSETS","BANK_RESERVES","DXY_BROAD","WTI","GOLD",
    "INITIAL_CLAIMS","VIX","UMICH_SENT","INFL_EXP_1Y","PPI_FINAL_DEMAND",
    "SKEW","EURUSD","COPPER","VVIX",
]:
    V[code] = latest("MACRO_STATE_indicators", code)
    print(f"    {code} = {V[code] or '(empty)'}", file=sys.stderr)

print("→ sentiment-state-fetcher…", file=sys.stderr)
for code in [
    "PUTCALL_EQUITY","PUTCALL_INDEX","PUTCALL_TOTAL",
    "AAII_BULLISH","AAII_BEARISH","AAII_BULL_BEAR",
    "COT_ES_AM_NET","COT_ES_LF_NET","COT_NQ_AM_NET","COT_NQ_LF_NET",
]:
    V[code] = latest("SENTIMENT_STATE_indicators", code)
    print(f"    {code} = {V[code] or '(empty)'}", file=sys.stderr)

# Soft-deleted indicators — skip the query, mark explicitly.
V["NAAIM"]   = "DEPRECATED 2026-05-04"
V["ISM_MFG"] = "DEPRECATED 2026-05-04"
V["ISM_SVC"] = "DEPRECATED 2026-05-04"

print("→ fomc-statement-fetcher (FOMC_PROJECTIONS spot-checks)…", file=sys.stderr)
V["FOMC_FED_FUNDS_2026_median"]      = fomc("FED_FUNDS", "2026", "median")
V["FOMC_GDP_2026_median"]            = fomc("GDP", "2026", "median")
V["FOMC_UNEMPLOYMENT_2026_median"]   = fomc("UNEMPLOYMENT", "2026", "median")
V["FOMC_PCE_2026_median"]            = fomc("PCE", "2026", "median")
V["FOMC_CORE_PCE_2026_median"]       = fomc("CORE_PCE", "2026", "median")
V["FOMC_FED_FUNDS_2026_ct_low"]      = fomc("FED_FUNDS", "2026", "central_tendency_low")
V["FOMC_FED_FUNDS_2026_ct_high"]     = fomc("FED_FUNDS", "2026", "central_tendency_high")

print("→ fetch-fundamentals (NVDA spot-checks)…", file=sys.stderr)
V["NVDA_quarters"]  = fund01_nvda_quarter_count()
V["NVDA_peg"]       = fund01_nvda("peg_ratio")
V["NVDA_evebitda"]  = fund01_nvda("ev_ebitda")
V["NVDA_pb"]        = fund01_nvda("pb_ratio")
V["NVDA_roe"]       = fund01_nvda("roe_ttm")
V["NVDA_roa"]       = fund01_nvda("roa_ttm")

# ---- Patch VALIDATION_REPORT.md ----
text = REPORT_PATH.read_text()


def fill_indicator_row(line: str, code: str) -> str:
    """For a markdown row whose 2nd cell is exactly `code`, fill the cell
    after the source-URL cell ("Value written") with V[code]."""
    if not V.get(code):
        return line
    parts = line.split("|")
    for i, c in enumerate(parts):
        if c.strip() == code:
            # The next non-empty cell is the source URL; the one after is "Value written".
            j = i + 1
            while j < len(parts) and parts[j].strip() == "":
                j += 1
            if j + 1 < len(parts):
                parts[j + 1] = f" {V[code]} "
            return "|".join(parts)
    return line


def fill_fomc_row(line: str) -> str:
    parts = line.split("|")
    if len(parts) < 7:
        return line
    cells = [p.strip() for p in parts]
    indicators = {"FED_FUNDS","GDP","UNEMPLOYMENT","PCE","CORE_PCE"}
    stats_known = {"median","central_tendency_low","central_tendency_high"}
    for i in range(len(cells) - 3):
        ind, yr, st = cells[i], cells[i+1], cells[i+2]
        if ind in indicators and yr.isdigit() and st in stats_known:
            key_stat = "ct_low" if st == "central_tendency_low" else \
                       "ct_high" if st == "central_tendency_high" else st
            key = f"FOMC_{ind}_{yr}_{key_stat}"
            if V.get(key):
                parts[i + 3] = f" {V[key]} "
                return "|".join(parts)
    return line


nvda_map = [
    ("FUND_01_Quarterly · NVDA quarter count",  "NVDA_quarters"),
    ("FUND_01_Fundamentals.peg_ratio · NVDA",   "NVDA_peg"),
    ("FUND_01_Fundamentals.ev_ebitda · NVDA",   "NVDA_evebitda"),
    ("FUND_01_Fundamentals.pb_ratio · NVDA",    "NVDA_pb"),
    ("FUND_01_Fundamentals.roe_ttm · NVDA",     "NVDA_roe"),
    ("FUND_01_Fundamentals.roa_ttm · NVDA",     "NVDA_roa"),
]


def fill_nvda_row(line: str) -> str:
    # Row layout: | # | Check | Expectation | Written | Match? | Notes |
    # Needle is the Check cell, Written is two columns to the right.
    for needle, key in nvda_map:
        if needle in line and V.get(key):
            parts = line.split("|")
            for i, c in enumerate(parts):
                if needle in c:
                    if i + 2 < len(parts):
                        parts[i + 2] = f" {V[key]} "
                    return "|".join(parts)
    return line


indicator_codes = [
    "REAL_5Y","BREAKEVEN_5Y","BREAKEVEN_5Y5Y_FWD","OAS_IG","OAS_HY",
    "FED_TOTAL_ASSETS","BANK_RESERVES","DXY_BROAD","WTI","GOLD",
    "INITIAL_CLAIMS","VIX","UMICH_SENT","INFL_EXP_1Y","PPI_FINAL_DEMAND",
    "SKEW","EURUSD","COPPER","VVIX",
    "NAAIM","ISM_MFG","ISM_SVC",
    "PUTCALL_EQUITY","PUTCALL_INDEX","PUTCALL_TOTAL",
    "AAII_BULLISH","AAII_BEARISH","AAII_BULL_BEAR",
    "COT_ES_AM_NET","COT_ES_LF_NET","COT_NQ_AM_NET","COT_NQ_LF_NET",
]

out_lines = []
for line in text.splitlines():
    new = line
    for code in indicator_codes:
        new = fill_indicator_row(new, code)
    new = fill_fomc_row(new)
    new = fill_nvda_row(new)
    out_lines.append(new)

new_text = "\n".join(out_lines) + ("\n" if text.endswith("\n") else "")
REPORT_PATH.write_text(new_text)
print(f"✓ Wrote {REPORT_PATH}", file=sys.stderr)
PY
