// ============================================
// CIPHER ORCHESTRATOR TYPES
// ============================================

import type { ConversationState } from "./types.js";
import type { EngagementMetrics } from "../metrics/types.js";
import type { FlowState } from "../conversation/types.js";

// Re-export for plugins
export type { ConversationState, EngagementMetrics, FlowState };

export interface ConversationEvent {
  type:
    | "message_generated"
    | "context_summarized"
    | "quality_evaluated"
    | "state_saved"
    | "state_loaded"
    | "memory_retrieved"
    | "flow_managed"
    | "topic_detected"
    | "intervention_suggested";
  timestamp: Date;
  data: Record<string, unknown>;
}

export interface FlowGuidance {
  shouldPause: boolean;
  pauseDuration?: number;
  shouldShowThinking: boolean;
  flowContext?: string;
}

export interface Intervention {
  type: "topic_change" | "variety_injection" | "depth_encouragement" | "none";
  reason: string;
  suggestedAction?: string;
}

export interface OrchestrationContext {
  conversationId?: number;
  turnNumber: number;
  agentAId: string;
  agentBId: string;
  currentAgentId: string;
}

export interface CipherConfig {
  maxContextMessages?: number;
  enableContextSummarization?: boolean;
  enableVectorDB?: boolean;
  enableLangfuse?: boolean;
  plugins?: OrchestrationPlugin[];
}

export interface OrchestrationPlugin {
  name: string;
  version?: string;
  onMessageGenerated?(
    message: { content: string; agentId: string; role: "user" | "assistant" },
    context: OrchestrationContext
  ): Promise<void>;
  onContextSummarized?(summary: string, originalMessages: Array<{ content: string }>): Promise<void>;
  onQualityEvaluated?(metrics: EngagementMetrics, interventions: Intervention[]): Promise<void>;
  onConversationStateChanged?(state: ConversationState, context: OrchestrationContext): Promise<void>;
  onMemoryRetrieved?(memories: Array<{ content: string; weight: number }>): Promise<void>;
  onFlowManaged?(guidance: FlowGuidance, flowState: FlowState): Promise<void>;
  initialize?(): Promise<void>;
  cleanup?(): Promise<void>;
}
