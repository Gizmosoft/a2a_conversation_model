import { appendFile } from "fs/promises";
import { mkdir } from "fs/promises";
import { join } from "path";
import type { LogEntry, LogLevel } from "./types.js";

// ============================================
// FILE WRITER FOR LOGS
// ============================================
export class LogFileWriter {
  private logDir: string;
  private initialized: boolean = false;

  constructor(logDir: string) {
    this.logDir = logDir;
  }

  /**
   * Initialize log directory and ensure it exists
   */
  async initialize(): Promise<void> {
    try {
      await mkdir(this.logDir, { recursive: true });
      this.initialized = true;
    } catch (error) {
      // Directory might already exist, that's okay
      if (error && typeof error === "object" && "code" in error && error.code !== "EEXIST") {
        throw error;
      }
      this.initialized = true;
    }
  }

  /**
   * Get file path for a log level
   */
  private getLogFilePath(level: LogLevel): string {
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const filename = `${level}-${date}.log`;
    return join(this.logDir, filename);
  }

  /**
   * Format log entry for file output
   */
  private formatLogEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
    const errorStr = entry.error
      ? `\nError: ${entry.error.message}\nStack: ${entry.error.stack}`
      : "";

    return `[${timestamp}] ${level} ${entry.message}${contextStr}${errorStr}\n`;
  }

  /**
   * Write log entry to appropriate file
   * Uses appendFile directly instead of keeping handles open to avoid GC issues
   */
  async write(entry: LogEntry): Promise<void> {
    if (!this.initialized) {
      return; // Skip writing if not initialized
    }

    try {
      const filePath = this.getLogFilePath(entry.level);
      const logLine = this.formatLogEntry(entry);
      
      // Use appendFile directly - opens, writes, and closes automatically
      // This avoids FileHandle lifecycle issues with garbage collection
      await appendFile(filePath, logLine, "utf8");
    } catch (error) {
      // Silently fail if file writing fails (don't break the app)
      // Only log actual errors, not permission/access issues
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (
        !errorMsg.includes("closed") &&
        !errorMsg.includes("ERR_INVALID_STATE") &&
        !errorMsg.includes("EBADF") &&
        !errorMsg.includes("ENOENT") // File not found - directory might not exist yet
      ) {
        // Only log unexpected errors
        try {
          console.error("Failed to write log to file:", errorMsg);
        } catch {
          // Ignore if console is also unavailable
        }
      }
    }
  }

  /**
   * Close all file handles
   * No-op since we don't keep handles open anymore
   */
  async close(): Promise<void> {
    this.initialized = false;
    // No handles to close - we use appendFile directly
  }
}
