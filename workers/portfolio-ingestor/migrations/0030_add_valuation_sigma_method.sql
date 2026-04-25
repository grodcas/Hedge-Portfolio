-- Sprint 9.1: audit trail for how valuation_sigma was computed each day.
-- "rolling" = 12-month rolling z-score (activates at N>=3 monthly snapshots)
-- "xsect"   = cross-sectional z-score (this sector's P/E vs the 7 others today)
-- NULL      = insufficient data (e.g. missing fwd_pe_sector)

ALTER TABLE SECTOR_FACTORS_daily ADD COLUMN valuation_sigma_method TEXT;
