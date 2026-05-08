-- Migration 0050: Drop ALPHA_04_Trends.
--
-- Orphan table. Only writer was /ingest/trends in portfolio-ingestor (now
-- removed); no consumer ever queried it. Held 6 rows of legacy data from a
-- prior architecture iteration. Removing keeps the schema honest.
--
-- Reversible: re-create the table from migration 0001 / earlier if needed.

DROP TABLE IF EXISTS ALPHA_04_Trends;
