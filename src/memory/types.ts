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

