// NARRATIVE_01_Content read/write helpers.
//
// Every narrator writes via `insertNarrative`, which:
//  - computes the row id (hash of entity_type|entity_id|date|field)
//  - marks any previously-current row for the same (entity, field) as
//    superseded_by the new row
//  - inserts the new row with created_at + last_confirmed_at = now
//
// Every narrator reads via `fetchLatest` — returns the current (non-superseded)
// row for a given (entity_type, entity_id, field). Used by the gatherer to
// supply "previous narrative" context to the next run.

import { hashRowId } from "./hash.js";

export async function insertNarrative(db, row) {
  const {
    entity_type,
    entity_id,
    date,
    field,
    content_json,
    sources_json,
    model,
    input_hash,
  } = row;

  const id = await hashRowId({ entity_type, entity_id, date, field });
  const nowIso = new Date().toISOString();

  // Supersede any older current row for the same (entity, field).
  await db
    .prepare(
      `UPDATE NARRATIVE_01_Content
         SET superseded_by = ?
       WHERE entity_type = ? AND IFNULL(entity_id, '') = IFNULL(?, '')
         AND field = ? AND id != ? AND superseded_by IS NULL`
    )
    .bind(id, entity_type, entity_id, field, id)
    .run();

  // Upsert: if the same id already exists (same day, same field, same entity),
  // bump last_confirmed_at; otherwise insert fresh.
  const existing = await db
    .prepare(`SELECT id FROM NARRATIVE_01_Content WHERE id = ?`)
    .bind(id)
    .first();

  if (existing) {
    await db
      .prepare(
        `UPDATE NARRATIVE_01_Content
            SET content_json = ?, sources_json = ?, model = ?,
                input_hash = ?, last_confirmed_at = ?, superseded_by = NULL
          WHERE id = ?`
      )
      .bind(
        typeof content_json === "string" ? content_json : JSON.stringify(content_json),
        sources_json ? JSON.stringify(sources_json) : null,
        model ?? null,
        input_hash ?? null,
        nowIso,
        id
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO NARRATIVE_01_Content
           (id, entity_type, entity_id, date, field, content_json,
            sources_json, model, input_hash, created_at, last_confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        entity_type,
        entity_id ?? null,
        date,
        field,
        typeof content_json === "string" ? content_json : JSON.stringify(content_json),
        sources_json ? JSON.stringify(sources_json) : null,
        model ?? null,
        input_hash ?? null,
        nowIso,
        nowIso
      )
      .run();
  }

  return id;
}

export async function bumpConfirmed(db, { entity_type, entity_id, field }) {
  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `UPDATE NARRATIVE_01_Content
          SET last_confirmed_at = ?
        WHERE entity_type = ? AND IFNULL(entity_id, '') = IFNULL(?, '')
          AND field = ? AND superseded_by IS NULL`
    )
    .bind(nowIso, entity_type, entity_id, field)
    .run();
}

export async function fetchLatest(db, { entity_type, entity_id, field }) {
  const row = await db
    .prepare(
      `SELECT id, entity_type, entity_id, date, field, content_json,
              sources_json, model, input_hash, created_at, last_confirmed_at
         FROM NARRATIVE_01_Content
        WHERE entity_type = ? AND IFNULL(entity_id, '') = IFNULL(?, '')
          AND field = ? AND superseded_by IS NULL
        ORDER BY date DESC LIMIT 1`
    )
    .bind(entity_type, entity_id, field)
    .first();
  if (!row) return null;
  try {
    row.content = JSON.parse(row.content_json);
  } catch {
    row.content = row.content_json;
  }
  if (row.sources_json) {
    try {
      row.sources = JSON.parse(row.sources_json);
    } catch {
      row.sources = null;
    }
  }
  return row;
}

export async function fetchAllLatest(db, { entity_type, entity_id }) {
  const res = await db
    .prepare(
      `SELECT id, entity_type, entity_id, date, field, content_json,
              model, input_hash, last_confirmed_at
         FROM NARRATIVE_01_Content
        WHERE entity_type = ? AND IFNULL(entity_id, '') = IFNULL(?, '')
          AND superseded_by IS NULL
        ORDER BY date DESC`
    )
    .bind(entity_type, entity_id)
    .all();
  const rows = res.results || [];
  return rows.map((r) => {
    try {
      r.content = JSON.parse(r.content_json);
    } catch {
      r.content = r.content_json;
    }
    return r;
  });
}
