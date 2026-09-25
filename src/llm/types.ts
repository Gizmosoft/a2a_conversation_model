// ============================================
// LLM MESSAGE TYPES
// ============================================
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Purpose tag for an LLM call, used to attribute latency and token usage
 * to the work that triggered it (turn generation vs. summarization).
 */
export type LLMCallType =
  | "turn-generation"
  | "context-summarization"
  | "memory-summarization"
  | "unknown";

export interface LLMGenerateOptions {
  systemPrompt: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  metadata?: {
    callType?: LLMCallType;
  };
}

export interface LLMGenerateResponse {
  content: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface LLMClient {
  generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse>;
}
