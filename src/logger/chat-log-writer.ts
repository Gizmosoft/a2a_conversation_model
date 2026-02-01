import { appendFile } from "fs/promises";
import { mkdir } from "fs/promises";
import { join } from "path";

// ============================================
// CHAT LOG WRITER
// ============================================
/**
 * Writes chat messages to a dedicated log file.
 * Creates a new file for each program run with format: chat-YYYY-MM-DD-HHMMSS.log
 */
export class ChatLogWriter {
  private logDir: string;
  private initialized: boolean = false;
  private runTimestamp: string; // Timestamp for this run
  private chatLogPath: string;

  constructor(logDir: string) {
    this.logDir = logDir;
    // Generate a unique timestamp for this run (YYYY-MM-DD-HHMMSS)
    const now = new Date();
    const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(" ")[0];
    const time = timeStr ? timeStr.replace(/:/g, "") : "000000"; // HHMMSS, fallback if undefined
    this.runTimestamp = `${date}-${time}`;
    this.chatLogPath = join(this.logDir, `chat-${this.runTimestamp}.log`);
  }

  /**
   * Initialize chat log directory and ensure it exists
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
   * Write a chat message to the log file.
   * Format: [Turn X] AgentName: message content
   */
  async writeMessage(turnNumber: number, agentName: string, content: string): Promise<void> {
    if (!this.initialized) {
      return; // Skip writing if not initialized
    }

    try {
      const logLine = `[Turn ${turnNumber}] ${agentName}:\n${content}\n\n`;
      
      // Use appendFile directly - opens, writes, and closes automatically
      // This avoids FileHandle lifecycle issues with garbage collection
      await appendFile(this.chatLogPath, logLine, "utf8");
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
          console.error("Failed to write chat log to file:", errorMsg);
        } catch {
          // Ignore if console is also unavailable
        }
      }
    }
  }

  /**
   * Close chat log writer
   * No-op since we don't keep handles open anymore
   */
  async close(): Promise<void> {
    this.initialized = false;
    // No handles to close - we use appendFile directly
  }
}
