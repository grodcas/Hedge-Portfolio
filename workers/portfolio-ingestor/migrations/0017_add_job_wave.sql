-- Migration 0017: Add wave column for parallel workflow execution
-- Jobs with the same wave run in parallel; workflow moves to next wave when all jobs in current wave complete.
-- Default wave = 1 preserves backward compatibility for any code that inserts without specifying wave.
ALTER TABLE PROC_01_Job_queue ADD COLUMN wave INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_job_queue_wave ON PROC_01_Job_queue(status, wave, id);
