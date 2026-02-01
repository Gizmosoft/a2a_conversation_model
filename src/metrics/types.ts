// ============================================
// ENGAGEMENT METRICS TYPES
// ============================================

export interface EngagementMetrics {
  messageDiversity: number; // 0-1, unique topics/vocabulary richness
  responseQuality: number; // 0-1, length appropriateness, relevance
  topicFlowSmoothness: number; // 0-1, natural vs forced transitions
  conversationDepth: number; // 0-1, follow-up questions, elaboration
  overallEngagement: number; // 0-1, weighted average of all metrics
}

export interface EngagementTrackerConfig {
  windowSize?: number; // Number of recent messages to analyze (default: 10)
  minMessageLength?: number; // Minimum message length for quality (default: 20)
  maxMessageLength?: number; // Maximum message length for quality (default: 200)
  lowEngagementThreshold?: number; // Threshold below which engagement is low (default: 0.4)
  highEngagementThreshold?: number; // Threshold above which engagement is high (default: 0.7)
}

export interface EngagementIntervention {
  type: "topic_change" | "variety_injection" | "depth_encouragement" | "none";
  reason: string;
  suggestedAction?: string;
}
