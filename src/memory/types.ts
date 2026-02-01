// ============================================
// EPISODIC MEMORY TYPES
// ============================================

export interface ConversationRecord {
  id?: number;
  agentAId: string;
  agentBId: string;
  agentAName: string;
  agentBName: string;
  maxTurns: number;
  totalTurns: number;
  isComplete: boolean;
  llmProvider?: string;
  modelName?: string;
  createdAt?: Date;
  completedAt?: Date | null;
}

export interface MessageRecord {
  id?: number;
  conversationId: number;
  turnNumber: number;
  role: "user" | "assistant";
  content: string;
  agentId: string;
  createdAt?: Date;
}

export interface PastConversationSummary {
  conversationId: number;
  agentAName: string;
  agentBName: string;
  totalTurns: number;
  createdAt: Date;
  firstMessage?: string;
  lastMessage?: string;
}

export interface WeightedMemory {
  content: string;
  conversationId: number;
  turnNumber: number;
  agentId: string;
  weight: number; // 0-1, higher = more relevant
  recencyScore: number; // 0-1, based on how recent
  relevanceScore: number; // 0-1, based on topic similarity (if available)
  frequencyScore: number; // 0-1, based on how often topic appears
}
