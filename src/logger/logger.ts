import type { LogEntry, LogLevel, LoggerConfig, Logger } from "./types.js";
import { LogFileWriter } from "./file-writer.js";

// ============================================
// STANDARDIZED LOGGER
// ============================================
export class AppLogger implements Logger {
  private config: LoggerConfig;
  private fileWriter: LogFileWriter;
  private initialized: boolean = false;

  constructor(config: LoggerConfig) {
    this.config = config;
    this.fileWriter = new LogFileWriter(config.logDir);
  }

  /**
   * Initialize the logger (create log directory, etc.)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.enableFile) {
      await this.fileWriter.initialize();
    }

    this.initialized = true;
  }

  /**
   * Check if log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];

    const currentLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Format log entry for console output
   */
  private formatConsoleLog(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context, null, 2)}` : "";
    const errorStr = entry.error
      ? `\nError: ${entry.error.message}${entry.error.stack ? `\n${entry.error.stack}` : ""}`
      : "";

    return `[${timestamp}] ${level} ${entry.message}${contextStr}${errorStr}`;
  }

  /**
   * Internal log method
   */
  private async log(
    level: LogLevel,
    message: string,
    error?: Error,
    context?: Record<string, unknown>
  ): Promise<void> {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
      error,
    };

    // Console output
    if (this.config.enableConsole) {
      const consoleMessage = this.formatConsoleLog(entry);
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(consoleMessage);
          break;
        case LogLevel.INFO:
          console.info(consoleMessage);
          break;
        case LogLevel.WARN:
          console.warn(consoleMessage);
          break;
        case LogLevel.ERROR:
          console.error(consoleMessage);
          break;
      }
    }

    // File output
    if (this.config.enableFile && this.initialized) {
      await this.fileWriter.write(entry);
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, undefined, context).catch(() => {
      // Ignore errors in logging
    });
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, undefined, context).catch(() => {
      // Ignore errors in logging
    });
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, undefined, context).catch(() => {
      // Ignore errors in logging
    });
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, error, context).catch(() => {
      // Ignore errors in logging
    });
  }

  /**
   * Close logger and cleanup resources
   */
  async close(): Promise<void> {
    if (this.config.enableFile) {
      await this.fileWriter.close();
    }
    this.initialized = false;
  }
}

// ============================================
// LOGGER FACTORY
// ============================================
let defaultLogger: AppLogger | null = null;

export function createLogger(config?: Partial<LoggerConfig>): AppLogger {
  const defaultConfig: LoggerConfig = {
    logDir: "src/logs",
    level: LogLevel.INFO,
    enableConsole: true,
    enableFile: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    ...config,
  };

  return new AppLogger(defaultConfig);
}

export function getDefaultLogger(): AppLogger {
  if (!defaultLogger) {
    defaultLogger = createLogger();
  }
  return defaultLogger;
}

export function setDefaultLogger(logger: AppLogger): void {
  defaultLogger = logger;
}
