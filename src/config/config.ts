import { loadEnvFile } from "node:process";
import { resolve } from "node:path";

// Load .env file at the top
try {
  loadEnvFile(resolve(process.cwd(), ".env"));
} catch {
  console.warn("No .env file found, using system environment variables");
}

interface Config {
  geminiApiKey?: string;
  ollamaHostUrl?: string;
  nodeBuild: string;
  modelName: string;
  port: number;
  logLevel?: string; // "debug" | "info" | "warn" | "error"
  logDir?: string; // Directory for log files
  maxContextMessages?: number; // Maximum messages before summarization (default: 25)
  summarizationBatchSize?: number; // New messages needed in older segment before a merge fires (default: 5)
}

/**
 * Retrieve an environment variable by key, with optional default value.
 * Throws an error if the variable is required but not found.
 */
function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config: Config = {
  // geminiApiKey:  getEnvVar('GEMINI_API_KEY', undefined),
  ollamaHostUrl: getEnvVar("OLLAMA_HOST_URL"),
  nodeBuild: getEnvVar("NODE_BUILD"),
  modelName: getEnvVar("MODEL_NAME", undefined),
  port: parseInt(getEnvVar("PORT", "3000"), 10),
  logLevel: getEnvVar("LOG_LEVEL", "info"),
  logDir: getEnvVar("LOG_DIR", "src/logs"),
  maxContextMessages: parseInt(getEnvVar("MAX_CONTEXT_MESSAGES", "25"), 10), // Configurable threshold for summarization
  summarizationBatchSize: parseInt(getEnvVar("SUMMARIZATION_BATCH_SIZE", "5"), 10), // Merge fires every N new messages in older segment
};
