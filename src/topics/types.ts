// ============================================
// TOPIC GUIDANCE TYPES
// ============================================

export interface Topic {
  id: string;
  name: string;
  keywords: string[]; // Keywords that indicate this topic
  description: string;
  relevanceScore?: number; // 0-1, how relevant to current conversation
}

export interface TopicDetection {
  detectedTopics: Topic[];
  dominantTopic?: Topic;
  topicConfidence: number; // 0-1, confidence in topic detection
  semanticSimilarity?: number; // 0-1, semantic similarity to topic (if semantic detection enabled)
  messageAnalysis: {
    wordCount: number;
    uniqueWords: number;
    sentiment?: "positive" | "neutral" | "negative";
  };
}

export interface TopicSwitch {
  fromTopic?: Topic;
  toTopic: Topic;
  switchType: "natural" | "suggested" | "forced";
  confidence: number;
  reason?: string;
}

export interface TopicSuggestion {
  suggestedTopic: Topic;
  reason: string;
  confidence: number;
  context: string; // Why this topic was suggested
}

export interface TopicGuidanceState {
  currentTopics: Topic[];
  conversationHistory: Array<{
    turnNumber: number;
    topic?: Topic;
    message: string;
  }>;
  topicSwitches: TopicSwitch[];
  suggestions: TopicSuggestion[];
  lullDetected: boolean;
  lastActiveTurn?: number;
}
