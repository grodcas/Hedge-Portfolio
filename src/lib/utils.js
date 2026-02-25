// src/lib/utils.js - Shared utilities

/**
 * Run a step with error handling
 */
export async function runStep(name, fn, logger) {
  try {
    const result = await fn();
    return { success: true, result };
  } catch (err) {
    logger.log(name, `Error: ${err.message}`, "fail");
    return { success: false, error: err.message };
  }
}

/**
 * Import and run ingestion script
 */
export async function importScript(scriptPath, logger, stepName) {
  try {
    await import(scriptPath);
    return { success: true };
  } catch (err) {
    logger.log(stepName, `Import error: ${err.message}`, "fail");
    return { success: false, error: err.message };
  }
}
