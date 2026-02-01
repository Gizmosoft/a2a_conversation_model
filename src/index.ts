import { createGeminiClient, createOllamaClient } from "./llm/index.js";
import { createAgent } from "./agents/agent-builder.js";
import { alicePersonality, bobPersonality } from "./agents/personalities/index.js";
import { ConversationOrchestrator } from "./orchestrator/index.js";
import { config } from "./config/config.js";
import { EpisodicMemoryStore } from "./memory/store.js";
import { createLogger, LogLevel, setDefaultLogger } from "./logger/index.js";
import { TopicManager } from "./topics/index.js";
import { EngagementTracker } from "./metrics/index.js";
import { FlowManager } from "./conversation/index.js";
import { createCipherAgent } from "./agents/cipher.js";
import { CipherOrchestrator } from "./orchestrator/cipher-orchestrator.js";
import { VectorDBPlugin, LangfusePlugin } from "./orchestrator/plugins/index.js";

// ============================================
// MAIN FUNCTION
// ============================================
let logger: ReturnType<typeof createLogger> | null = null;

/**
 * Cleanup resources and close connections gracefully.
 * Closes the logger and ensures all file handles are properly released.
 */
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

/**
 * Main application entry point.
 * Initializes all components (logger, memory store, LLM client, agents, managers),
 * creates the conversation orchestrator, and starts the conversation.
 */
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
    // INITIALIZE ENGAGEMENT TRACKER
    // ============================================
    logger.debug("Initializing engagement tracker");
    const engagementTracker = new EngagementTracker({
      windowSize: 10,
      minMessageLength: 20,
      maxMessageLength: 200,
      lowEngagementThreshold: 0.4,
      highEngagementThreshold: 0.7,
    });
    logger.info("Engagement tracker initialized");

    // ============================================
    // INITIALIZE FLOW MANAGER
    // ============================================
    logger.debug("Initializing flow manager");
    const flowManager = new FlowManager({
      enablePauses: true,
      enableThinking: true,
      enableInterruptions: false, // Disabled by default
      enableAcknowledgment: true,
      minPauseMs: 500,
      maxPauseMs: 2000,
      thinkingProbability: 0.1,
      acknowledgmentProbability: 0.15,
    });
    logger.info("Flow manager initialized");

    // ============================================
    // CREATE CIPHER ORCHESTRATOR AGENT
    // ============================================
    logger.debug("Initializing Cipher orchestrator agent");
    const cipherAgent = createCipherAgent();
    
    // Create plugins (stubs for future integrations)
    const vectorDBPlugin = new VectorDBPlugin(false); // Disabled - enable when ready
    const langfusePlugin = new LangfusePlugin(false); // Disabled - enable when ready

    const cipher = new CipherOrchestrator(
      {
        maxContextMessages: 25,
        enableContextSummarization: true,
        enableVectorDB: false, // Future: enable when VectorDB is integrated
        enableLangfuse: false, // Future: enable when Langfuse is integrated
        plugins: [vectorDBPlugin, langfusePlugin],
      },
      {
        memoryStore,
        topicManager,
        engagementTracker,
        flowManager,
      }
    );
    logger.info("Cipher orchestrator agent initialized", {
      pluginsCount: 2,
      maxContextMessages: 25,
      enableContextSummarization: true,
    });

    // ============================================
    // CREATE AND RUN ORCHESTRATOR
    // ============================================
    const orchestrator = new ConversationOrchestrator({
      agentA: alice,
      agentB: bob,
      llmClient,
      maxTurns: 10, // Only used if infiniteMode is false
      memoryStore,
      llmProvider,
      modelName: config.modelName, // Pass model name for storage
      usePastMemories: true, // Enable past memory retrieval
      topicManager, // Enable topic guidance
      engagementTracker, // Enable engagement tracking
      flowManager, // Enable conversation flow management
      cipher, // Cipher handles all orchestration tasks
      infiniteMode: true, // Enable infinite conversation mode
    });

    // Start the conversation
    await orchestrator.run();

    // Cleanup: Close memory store connection
    logger.debug("Closing memory store connection");
    memoryStore.close();

    // Cleanup: Close Cipher and plugins
    logger.debug("Cleaning up Cipher orchestrator");
    await cipher.cleanup();

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
