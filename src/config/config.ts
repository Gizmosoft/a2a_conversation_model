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
}

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
};
