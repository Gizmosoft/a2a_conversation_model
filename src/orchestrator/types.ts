import type { AgentConfig } from "../agents/types.js";
import type { LLMClient } from "../llm/types.js";
import type { EpisodicMemoryStore } from "../memory/store.js";

// ============================================
// ORCHESTRATOR CONFIGURATION
// ============================================
export interface OrchestratorConfig {
  agentA: AgentConfig;
  agentB: AgentConfig;
  llmClient: LLMClient;
  maxTurns?: number; // Maximum number of conversation turns (default: 10)
  memoryStore?: EpisodicMemoryStore; // Optional episodic memory store
  llmProvider?: string; // "gemini" or "ollama" for storage
  modelName?: string; // "gemini-pro" or "llama3" for storage
  usePastMemories?: boolean; // Whether to retrieve and use past conversation memories
}

// ============================================
// CONVERSATION STATE
// ============================================
export interface ConversationState {
  messages: Array<{ role: "user" | "assistant"; content: string; agentId: string }>;
  currentTurn: number;
  currentAgentId: string; // "alice" or "bob"
  isComplete: boolean;
}

