-- Sprint 9.1: wipe permanently-blocked flow data.
-- SECTOR_FLOWS_daily was created in migration 0023 but never populated — no free
-- ETF-flow data source. Dropping the table + the etf-flows-fetcher is deferred.
-- flow_5d column on SECTOR_FACTORS_daily stays (D1 doesn't DROP COLUMN cleanly)
-- but all code references are removed — the column will sit as an eternal NULL.

DROP TABLE IF EXISTS SECTOR_FLOWS_daily;
