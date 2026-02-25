// src/lib/config.js - Pipeline configuration

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory (HF root)
export const BASE_DIR = path.resolve(__dirname, "../..");

export const CONFIG = {
  useAI: true,              // Use AI for article validation (costs money)
  validatePress: true,      // Run press release validation
  validateNews: true,       // Run news validation
  skipIngestion: false,     // Skip actual ingestion (validation only)
  logDir: path.join(BASE_DIR, "logs")
};

export const INGEST_BASE = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";
export const WORKFLOW_BASE = "https://job-engine-workflow.gines-rodriguez-castro.workers.dev";

export default CONFIG;
