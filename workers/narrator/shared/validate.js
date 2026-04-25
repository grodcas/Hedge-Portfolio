// Post-LLM validation. Enforces two contracts from NARRATIVE_BUILD_PLAN.md:
//
//  1. Numeric validation — every number cited in the LLM output must appear
//     in the input JSON. If the model invents a number, reject that bullet.
//  2. Citation-mandatory — every identification bullet must carry a
//     {table, id} source. If it doesn't, drop it.
//
// Also enforces the interpretation contract (user clarification 2026-04-21):
// every identification bullet must have a non-trivial `interpretation` field
// (>= 20 chars, not a paraphrase of `number`). Prompts tell the model this;
// validation backstops it.

const NUMBER_RE = /-?\d+(?:\.\d+)?%?/g;
const MIN_INTERPRETATION_LEN = 20;

// Returns { ok, bullets, dropped } — `bullets` is the filtered array safe to
// render; `dropped` explains why each dropped bullet failed.
export function validateIdentification(output, inputText) {
  const dropped = [];
  const numbersInInput = new Set(
    [...String(inputText).matchAll(NUMBER_RE)].map((m) => normalize(m[0]))
  );

  const bullets = [];
  for (const b of output?.bullets || []) {
    if (!b || typeof b !== "object") {
      dropped.push({ bullet: b, reason: "not_object" });
      continue;
    }
    // Required fields
    const required = ["headline", "number", "event", "interpretation", "source"];
    const missing = required.filter((k) => !b[k]);
    if (missing.length) {
      dropped.push({ bullet: b, reason: `missing: ${missing.join(",")}` });
      continue;
    }
    // Source must carry {table, id}
    if (!b.source.table || !b.source.id) {
      dropped.push({ bullet: b, reason: "source_incomplete" });
      continue;
    }
    // Interpretation must be substantive
    const interp = String(b.interpretation).trim();
    if (interp.length < MIN_INTERPRETATION_LEN) {
      dropped.push({ bullet: b, reason: "interpretation_too_short" });
      continue;
    }
    if (_isParaphrase(interp, String(b.number))) {
      dropped.push({ bullet: b, reason: "interpretation_paraphrases_number" });
      continue;
    }
    // Every number in `number` must appear in the input
    const cited = [...String(b.number).matchAll(NUMBER_RE)].map((m) => normalize(m[0]));
    const bad = cited.filter((n) => !numbersInInput.has(n));
    if (bad.length) {
      dropped.push({ bullet: b, reason: `hallucinated_numbers: ${bad.join(",")}` });
      continue;
    }
    bullets.push(b);
  }

  return {
    ok: bullets.length > 0,
    bullets,
    dropped,
    missing_factors: output?.missing_factors || [],
  };
}

// Returns { ok, stance, signposts, dropped }
export function validateRecommendation(output, inputText) {
  const dropped = [];
  if (!output || typeof output !== "object") {
    return { ok: false, stance: null, signposts: [], dropped: [{ reason: "not_object" }] };
  }
  const stance = typeof output.stance === "string" && output.stance.trim().length > 10
    ? output.stance.trim()
    : null;
  if (!stance) dropped.push({ field: "stance", reason: "empty_or_too_short" });

  const signposts = [];
  for (const s of output.signposts || []) {
    if (!s || typeof s !== "object") {
      dropped.push({ signpost: s, reason: "not_object" });
      continue;
    }
    const missing = ["trigger", "threshold", "dated_event", "action"].filter(
      (k) => !s[k]
    );
    if (missing.length) {
      dropped.push({ signpost: s, reason: `missing: ${missing.join(",")}` });
      continue;
    }
    signposts.push(s);
  }

  return { ok: Boolean(stance) && signposts.length > 0, stance, signposts, dropped };
}

// `detailText` (optional) is the concatenation of current_reading +
// identification + recommendation text the lede is summarising. When given,
// every number that appears in the lede must also appear in detailText
// (Sprint 6 quality gate #2). When omitted, only the word count + forward-
// looking clause are checked.
export function validateLede(text, detailText = null) {
  if (!text || typeof text !== "string") return { ok: false, reason: "empty" };
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).length;
  if (words > 45) return { ok: false, reason: `too_long (${words} words)`, text: trimmed };

  // Number-grounding: every number in the lede must appear in detailText.
  if (detailText) {
    const inputNums = new Set(
      [...String(detailText).matchAll(NUMBER_RE)].map((m) => normalize(m[0]))
    );
    const ledeNums = [...trimmed.matchAll(NUMBER_RE)].map((m) => normalize(m[0]));
    const hallucinated = ledeNums.filter((n) => !inputNums.has(n));
    if (hallucinated.length) {
      return { ok: false, reason: `hallucinated_numbers:${hallucinated.join(",")}`, text: trimmed, words };
    }
    if (ledeNums.length === 0) {
      return { ok: false, reason: "no_numbers", text: trimmed, words };
    }
  }

  // Forward-looking clause: the lede must end with a dated event OR a "next"-
  // style signpost. Accepts ISO dates, "next <word>", "watch for", "→", or
  // month names in the last 40 chars — loose enough to tolerate phrasing
  // variants, strict enough to reject pure-retrospective ledes.
  const tail = trimmed.slice(-80).toLowerCase();
  const forwardRe = /(next test|next trigger|next signpost|next (?:earnings|print|release|catalyst)|watch for|ahead of|→|->|\d{4}-\d{2}-\d{2}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b)/;
  if (!forwardRe.test(tail)) {
    return { ok: false, reason: "no_forward_clause", text: trimmed, words };
  }

  return { ok: true, text: trimmed, words };
}

function normalize(s) {
  // "3.2%" and "3.2" collapse to the same token for input-membership check
  return String(s).replace(/%$/, "").replace(/^0+(?=\d)/, "");
}

function _isParaphrase(interpretation, number) {
  // Very loose check: if interpretation is basically just the number with a
  // trivial wrapper ("Core CPI is 3.2%"), reject.
  const interp = interpretation.toLowerCase().replace(/\s+/g, " ");
  const num = number.toLowerCase().replace(/\s+/g, " ");
  if (interp === num) return true;
  if (interp.length < num.length + 15) {
    // Short interpretation that mostly contains the number string is suspect
    if (interp.includes(num)) return true;
  }
  return false;
}
