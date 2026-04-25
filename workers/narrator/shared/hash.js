// SHA-256 of a canonicalized JSON blob. Used for:
//  - input_hash on every narrator write (stability check)
//  - id on every NARRATIVE_01_Content row (hash(entity_type|entity_id|date|field))
//
// Canonicalization: deterministic key ordering at every object level, so two
// semantically-equal inputs produce the same hash regardless of key insertion
// order.

export async function sha256Hex(input) {
  const data = typeof input === "string" ? input : JSON.stringify(input);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashInput(obj) {
  return sha256Hex(canonicalize(obj));
}

export async function hashRowId({ entity_type, entity_id, date, field }) {
  const key = `${entity_type}|${entity_id ?? ""}|${date}|${field}`;
  return sha256Hex(key);
}

function canonicalize(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(v[k])).join(",") + "}";
}
