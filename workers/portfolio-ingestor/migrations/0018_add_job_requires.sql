-- Migration 0018: Add 'requires' column to PROC_01_Job_queue
-- Used by the workflow runner to skip jobs whose dependencies failed.
-- Stored as a comma-separated list of worker names. Example:
--   requires='price-fetcher,earnings-fetcher'
-- NULL means no dependencies (runs unconditionally).
ALTER TABLE PROC_01_Job_queue ADD COLUMN requires TEXT;
