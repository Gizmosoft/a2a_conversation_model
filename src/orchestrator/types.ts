import type { AgentConfig } from "../agents/types.js";
import type { LLMClient } from "../llm/types.js";
import type { EpisodicMemoryStore } from "../memory/store.js";
import type { TopicManager } from "../topics/manager.js";
import type { EngagementTracker } from "../metrics/engagement-tracker.js";
import type { FlowManager } from "../conversation/index.js";
import type { CipherOrchestrator } from "./cipher-orchestrator.js";

// ============================================
// ORCHESTRATOR CONFIGURATION
// ============================================
export interface OrchestratorConfig {
  agentA: AgentConfig;
  agentB: AgentConfig;
  llmClient: LLMClient;
  maxTurns?: number; // Maximum number of conversation turns (default: 10, ignored if infiniteMode is true)
  memoryStore?: EpisodicMemoryStore; // Optional episodic memory store
  llmProvider?: string; // "gemini" or "ollama" for storage
  modelName?: string; // "gemini-pro" or "llama3" for storage
  usePastMemories?: boolean; // Whether to retrieve and use past conversation memories
  topicManager?: TopicManager; // Optional topic guidance manager
  infiniteMode?: boolean; // If true, conversation runs indefinitely until manually stopped
  engagementTracker?: EngagementTracker; // Optional engagement metrics tracker
  flowManager?: FlowManager; // Optional conversation flow manager
  cipher?: CipherOrchestrator; // Cipher orchestrator agent - handles all orchestration tasks
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
