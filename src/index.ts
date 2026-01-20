import { createGeminiClient, createOllamaClient } from "./llm/index.js";
import { createAgent } from "./agents/agent-builder.js";
import { alicePersonality, bobPersonality } from "./agents/personalities/index.js";
import { ConversationOrchestrator } from "./orchestrator/index.js";
import { config } from "./config/config.js";
import { EpisodicMemoryStore } from "./memory/store.js";
import { createLogger, LogLevel, setDefaultLogger } from "./logger/index.js";
import { TopicManager } from "./topics/index.js";

// ============================================
// MAIN FUNCTION
// ============================================
let logger: ReturnType<typeof createLogger> | null = null;

// Graceful shutdown handler
async function cleanup(): Promise<void> {
  if (logger) {
    await logger.close();
  }
}

// Register cleanup handlers for graceful shutdown
const nodeProcess = (globalThis as { process?: { exit?: (code: number) => void; on?: (event: string, handler: (...args: unknown[]) => void) => void } }).process;
if (nodeProcess?.on) {
  // Handle unhandled rejections and exceptions with logging
  nodeProcess.on("unhandledRejection", async (reason, promise) => {
    console.error("[Unhandled Rejection]", reason);
    console.error("[Promise]", promise);
    await cleanup();
    nodeProcess.exit?.(1);
  });

  nodeProcess.on("uncaughtException", async (error) => {
    console.error("[Uncaught Exception]", error);
    await cleanup();
    nodeProcess.exit?.(1);
  });

  // Handle graceful shutdown signals
  nodeProcess.on("SIGINT", async () => {
    console.log("\n[Shutdown] Received SIGINT, cleaning up...");
    await cleanup();
    nodeProcess.exit?.(0);
  });

  nodeProcess.on("SIGTERM", async () => {
    console.log("\n[Shutdown] Received SIGTERM, cleaning up...");
    await cleanup();
    nodeProcess.exit?.(0);
  });
}

async function main(): Promise<void> {
  // ============================================
  // INITIALIZE LOGGER
  // ============================================
  logger = createLogger({
    logDir: config.logDir || "src/logs",
    level: (config.logLevel as LogLevel) || LogLevel.INFO,
    enableConsole: true,
    enableFile: true,
  });

  await logger.initialize();
  setDefaultLogger(logger);

  logger.info("Application starting", {
    nodeBuild: config.nodeBuild,
    modelName: config.modelName,
    logDir: config.logDir,
    logLevel: config.logLevel,
  });

  try {
    // ============================================
    // INITIALIZE MEMORY STORE
    // ============================================
    logger.debug("Initializing episodic memory store");
    const memoryStore = new EpisodicMemoryStore("conversations.db");
    logger.info("Episodic memory store initialized");

    // ============================================
    // INITIALIZE LLM CLIENT
    // ============================================
    // const llmClient = createGeminiClient(config.geminiApiKey, config.modelName);
    const llmClient = createOllamaClient(config.ollamaHostUrl, config.modelName);
    const llmProvider = "ollama"; // or "gemini" when using Gemini

    // ============================================
    // CREATE AGENTS
    // ============================================
    const alice = createAgent("alice", alicePersonality, "Bob");
    const bob = createAgent("bob", bobPersonality, "Alice");

    // ============================================
    // INITIALIZE TOPIC MANAGER
    // ============================================
    logger.debug("Initializing topic manager");
    const topicManager = new TopicManager(3, 20); // lullThreshold: 3, minMessageLength: 20
    logger.info("Topic manager initialized", {
      lullThreshold: 3,
      minMessageLength: 20,
    });

    // ============================================
    // CREATE AND RUN ORCHESTRATOR
    // ============================================
    const orchestrator = new ConversationOrchestrator({
      agentA: alice,
      agentB: bob,
      llmClient,
      maxTurns: 10,
      memoryStore,
      llmProvider,
      modelName: config.modelName, // Pass model name for storage
      usePastMemories: true, // Enable past memory retrieval
      topicManager, // Enable topic guidance
    });

    // Start the conversation
    await orchestrator.run();

    // Cleanup: Close memory store connection
    logger.debug("Closing memory store connection");
    memoryStore.close();

    logger.info("Application shutting down gracefully");
    await cleanup();
  } catch (error) {
    if (logger) {
      logger.error(
        "Fatal error running conversation",
        error instanceof Error ? error : new Error(String(error)),
        {
          nodeBuild: config.nodeBuild,
          modelName: config.modelName,
        }
      );
    }
    await cleanup();
    const nodeProcess = (globalThis as { process?: { exit?: (code: number) => void } }).process;
    nodeProcess?.exit?.(1);
  }
}

// ============================================
// ENTRY POINT
// ============================================
main().catch((error) => {
  console.error("\n[FATAL] Unhandled error in main():");
  console.error(error);
  if (error instanceof Error) {
    console.error("Error stack:", error.stack);
  }
  cleanup()
    .then(() => {
      const nodeProcess = (globalThis as { process?: { exit?: (code: number) => void } }).process;
      nodeProcess?.exit?.(1);
    })
    .catch((cleanupError) => {
      console.error("Error during cleanup:", cleanupError);
      const nodeProcess = (globalThis as { process?: { exit?: (code: number) => void } }).process;
      nodeProcess?.exit?.(1);
    });
});
