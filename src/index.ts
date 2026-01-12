import { createGeminiClient, createOllamaClient } from "./llm/index.js";
import { createAgent } from "./agents/agent-builder.js";
import { alicePersonality, bobPersonality } from "./agents/personalities/index.js";
import { ConversationOrchestrator } from "./orchestrator/index.js";
import { config } from "./config/config.js";

// ============================================
// MAIN FUNCTION
// ============================================
async function main(): Promise<void> {
  console.log(`Starting in ${config.nodeBuild} mode`);
  console.log(`Using model: ${config.modelName}`);
  try {
    // ============================================
    // INITIALIZE LLM CLIENT
    // ============================================
    // const llmClient = createGeminiClient(config.geminiApiKey, config.modelName);
    const llmClient = createOllamaClient(config.ollamaHostUrl, config.modelName);

    // ============================================
    // CREATE AGENTS
    // ============================================
    const alice = createAgent("alice", alicePersonality, "Bob");
    const bob = createAgent("bob", bobPersonality, "Alice");

    // ============================================
    // CREATE AND RUN ORCHESTRATOR
    // ============================================
    const orchestrator = new ConversationOrchestrator({
      agentA: alice,
      agentB: bob,
      llmClient,
      maxTurns: 5, // 5 turns = 5 exchanges between agents
    });

    // Start the conversation
    await orchestrator.run();
  } catch (error) {
    console.error("Error running conversation:", error);
    const nodeProcess = (globalThis as { process?: { exit?: (code: number) => void } }).process;
    nodeProcess?.exit?.(1);
  }
}

// ============================================
// ENTRY POINT
// ============================================
main();
