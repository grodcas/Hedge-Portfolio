-- Migration 0037: BETA_10_Daily_macro — structured regime / confidence / tripwires.
--
-- macro-intelligence-builder writes a narrative blob today; the dashboard's
-- regime label + confidence% pill + tripwire counter all need typed fields.
-- Adding three columns: regime (5-bucket label), confidence (0..1), and
-- tripwires_json (array of {name, status, threshold, current_value}).
--
-- macro-intelligence-builder will start populating these on the next run
-- after this migration ships. Existing rows keep null values; the dashboard
-- shows the narrative-derived label until the first structured row lands.

ALTER TABLE BETA_10_Daily_macro ADD COLUMN regime          TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN confidence      REAL;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN tripwires_json  TEXT;

CREATE INDEX IF NOT EXISTS idx_beta10_regime
  ON BETA_10_Daily_macro(regime, creation_date);
