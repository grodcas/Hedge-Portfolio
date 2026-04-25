-- Sprint 8: optional conviction (1..5) per trade, for Layer 5 calibration.
-- Null allowed — historical seed rows stay null; only new ideas record it.

ALTER TABLE TRADE_01_Ledger ADD COLUMN conviction INTEGER;
