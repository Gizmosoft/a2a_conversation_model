import type { AgentConfig } from "../agents/types.js";
import type { LLMClient } from "../llm/types.js";

// ============================================
// ORCHESTRATOR CONFIGURATION
// ============================================
export interface OrchestratorConfig {
  agentA: AgentConfig;
  agentB: AgentConfig;
  llmClient: LLMClient;
  maxTurns?: number; // Maximum number of conversation turns (default: 10)
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

