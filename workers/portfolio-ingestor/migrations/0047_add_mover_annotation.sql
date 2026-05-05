-- Migration 0047: tape annotation columns on MOVER_EXPLANATIONS_daily.
--
-- The 25th agent (MS-3i, tape-annotation-agent) writes one cautious sentence
-- per qualifying move with a citation to the TOPIC_FEED row it referenced.
-- Same triplet shape as MS-1a / 0045: <name>_json + _updated_at + _model.

ALTER TABLE MOVER_EXPLANATIONS_daily ADD COLUMN annotation_json       TEXT;
ALTER TABLE MOVER_EXPLANATIONS_daily ADD COLUMN annotation_updated_at TEXT;
ALTER TABLE MOVER_EXPLANATIONS_daily ADD COLUMN annotation_model      TEXT;
