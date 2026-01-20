import { promises as fs } from "fs";
import { join } from "path";
import type { LogEntry, LogLevel } from "./types.js";

// ============================================
// FILE WRITER FOR LOGS
// ============================================
export class LogFileWriter {
  private logDir: string;
  private fileHandles: Map<string, fs.FileHandle> = new Map();

  constructor(logDir: string) {
    this.logDir = logDir;
  }

  /**
   * Initialize log directory and ensure it exists
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's okay
      if (error && typeof error === "object" && "code" in error && error.code !== "EEXIST") {
        throw error;
      }
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
   * Get or create file handle for a log level
   */
  private async getFileHandle(level: LogLevel): Promise<fs.FileHandle> {
    const filePath = this.getLogFilePath(level);

    if (!this.fileHandles.has(filePath)) {
      const handle = await fs.open(filePath, "a");
      this.fileHandles.set(filePath, handle);
    }

    return this.fileHandles.get(filePath)!;
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
   */
  async write(entry: LogEntry): Promise<void> {
    try {
      const handle = await this.getFileHandle(entry.level);
      const logLine = this.formatLogEntry(entry);
      await handle.writeFile(logLine, { flag: "a" });
    } catch (error) {
      // Silently fail if file writing fails (don't break the app)
      console.error("Failed to write log to file:", error);
    }
  }

  /**
   * Close all file handles
   */
  async close(): Promise<void> {
    for (const handle of this.fileHandles.values()) {
      await handle.close();
    }
    this.fileHandles.clear();
  }
}
