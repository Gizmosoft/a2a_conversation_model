import type {
  EngagementMetrics,
  EngagementTrackerConfig,
  EngagementIntervention,
} from "./types.js";
import { getDefaultLogger } from "../logger/index.js";

// ============================================
// ENGAGEMENT TRACKER
// ============================================
export class EngagementTracker {
  private config: Required<EngagementTrackerConfig>;
  private logger = getDefaultLogger();
  private messageHistory: Array<{ content: string; topics?: string[] }> = [];

  constructor(config: EngagementTrackerConfig = {}) {
    this.config = {
      windowSize: config.windowSize ?? 10,
      minMessageLength: config.minMessageLength ?? 20,
      maxMessageLength: config.maxMessageLength ?? 200,
      lowEngagementThreshold: config.lowEngagementThreshold ?? 0.4,
      highEngagementThreshold: config.highEngagementThreshold ?? 0.7,
    };
  }

  /**
   * Track a new message and update engagement metrics
   */
  trackMessage(content: string, topics?: string[]): void {
    this.messageHistory.push({
      content,
      ...(topics && { topics }),
    });
    // Keep only recent messages in window
    if (this.messageHistory.length > this.config.windowSize) {
      this.messageHistory.shift();
    }
  }

  /**
   * Calculate current engagement metrics
   */
  calculateMetrics(): EngagementMetrics {
    if (this.messageHistory.length < 2) {
      return {
        messageDiversity: 1.0,
        responseQuality: 1.0,
        topicFlowSmoothness: 1.0,
        conversationDepth: 0.5,
        overallEngagement: 1.0,
      };
    }

    // 1. Message Diversity: unique topics and vocabulary richness
    const messageDiversity = this.calculateMessageDiversity();

    // 2. Response Quality: length appropriateness and relevance
    const responseQuality = this.calculateResponseQuality();

    // 3. Topic Flow Smoothness: natural vs forced transitions
    const topicFlowSmoothness = this.calculateTopicFlowSmoothness();

    // 4. Conversation Depth: follow-up questions, elaboration
    const conversationDepth = this.calculateConversationDepth();

    // Overall engagement: weighted average
    const overallEngagement =
      messageDiversity * 0.25 +
      responseQuality * 0.3 +
      topicFlowSmoothness * 0.25 +
      conversationDepth * 0.2;

    return {
      messageDiversity,
      responseQuality,
      topicFlowSmoothness,
      conversationDepth,
      overallEngagement,
    };
  }

  /**
   * Calculate message diversity score
   */
  private calculateMessageDiversity(): number {
    const recentMessages = this.messageHistory.slice(-this.config.windowSize);

    // Topic diversity
    let topicDiversity = 0.5; // Default
    const topics = recentMessages
      .map((m) => m.topics)
      .filter((t): t is string[] => !!t)
      .flat();
    if (topics.length > 0) {
      const uniqueTopics = new Set(topics).size;
      topicDiversity = uniqueTopics / Math.max(1, topics.length);
    }

    // Vocabulary diversity (unique words)
    const allWords = recentMessages
      .map((m) => m.content.toLowerCase().split(/\s+/))
      .flat();
    const uniqueWords = new Set(allWords).size;
    const totalWords = allWords.length;
    const vocabularyDiversity = totalWords > 0 ? uniqueWords / totalWords : 0.5;

    return (topicDiversity + vocabularyDiversity) / 2;
  }

  /**
   * Calculate response quality score
   */
  private calculateResponseQuality(): number {
    const recentMessages = this.messageHistory.slice(-this.config.windowSize);

    if (recentMessages.length === 0) {
      return 0.5;
    }

    // Check if messages are within appropriate length range
    const qualityScores = recentMessages.map((m) => {
      const length = m.content.length;
      if (length >= this.config.minMessageLength && length <= this.config.maxMessageLength) {
        return 1.0;
      } else if (length < this.config.minMessageLength) {
        return length / this.config.minMessageLength;
      } else {
        // Too long - penalize but not too harshly
        return Math.max(0.3, 1 - (length - this.config.maxMessageLength) / 200);
      }
    });

    return qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
  }

  /**
   * Calculate topic flow smoothness
   */
  private calculateTopicFlowSmoothness(): number {
    const recentMessages = this.messageHistory.slice(-this.config.windowSize);
    const topics = recentMessages
      .map((m) => m.topics)
      .filter((t): t is string[] => !!t);

    if (topics.length < 2) {
      return 0.5; // Not enough data
    }

    // Count topic switches (changes between consecutive messages)
    let switches = 0;
    let smoothTransitions = 0;

    for (let i = 1; i < topics.length; i++) {
      const prevTopics = topics[i - 1];
      const currTopics = topics[i];

      if (prevTopics && currTopics && prevTopics.length > 0 && currTopics.length > 0) {
        // Check if there's overlap (smooth transition) or complete change (switch)
        const hasOverlap = prevTopics.some((t) => currTopics.includes(t));
        if (!hasOverlap) {
          switches++;
        } else {
          smoothTransitions++;
        }
      }
    }

    // More smooth transitions = higher score
    // Some switches are natural, but too many = low score
    const totalTransitions = switches + smoothTransitions;
    if (totalTransitions === 0) {
      return 0.5;
    }

    const smoothnessRatio = smoothTransitions / totalTransitions;
    // Penalize excessive switching
    const switchPenalty = switches > totalTransitions * 0.5 ? 0.2 : 0;
    return Math.max(0, smoothnessRatio - switchPenalty);
  }

  /**
   * Calculate conversation depth
   */
  private calculateConversationDepth(): number {
    const recentMessages = this.messageHistory.slice(-this.config.windowSize);

    if (recentMessages.length === 0) {
      return 0.5;
    }

    // Look for indicators of depth:
    // - Questions (follow-ups)
    // - Elaboration (longer messages with detail)
    // - References to previous messages

    let depthScore = 0;

    for (const msg of recentMessages) {
      const content = msg.content.toLowerCase();
      let messageDepth = 0;

      // Questions indicate engagement
      const questionCount = (content.match(/\?/g) || []).length;
      messageDepth += Math.min(0.3, questionCount * 0.1);

      // Elaboration (longer messages with detail words)
      const detailWords = ["because", "since", "when", "why", "how", "example", "instance"];
      const hasDetail = detailWords.some((word) => content.includes(word));
      if (hasDetail) {
        messageDepth += 0.2;
      }

      // References to previous content (pronouns, "that", "this", "it")
      const referenceWords = ["that", "this", "it", "they", "we", "you", "i"];
      const referenceCount = referenceWords.filter((word) => content.includes(word)).length;
      messageDepth += Math.min(0.2, referenceCount * 0.05);

      // Message length indicates elaboration
      if (msg.content.length > 50) {
        messageDepth += 0.3;
      }

      depthScore += Math.min(1, messageDepth);
    }

    return depthScore / recentMessages.length;
  }

  /**
   * Determine if intervention is needed and what type
   */
  shouldIntervene(): EngagementIntervention {
    const metrics = this.calculateMetrics();

    if (metrics.overallEngagement < this.config.lowEngagementThreshold) {
      // Low engagement - suggest topic change
      if (metrics.topicFlowSmoothness < 0.3) {
        return {
          type: "topic_change",
          reason: "Low engagement and poor topic flow",
          suggestedAction: "Suggest a new topic to re-engage",
        };
      }

      // Low diversity - inject variety
      if (metrics.messageDiversity < 0.3) {
        return {
          type: "variety_injection",
          reason: "Low message diversity, conversation becoming repetitive",
          suggestedAction: "Encourage different perspectives or topics",
        };
      }

      // Low depth - encourage depth
      if (metrics.conversationDepth < 0.3) {
        return {
          type: "depth_encouragement",
          reason: "Conversation is too shallow",
          suggestedAction: "Encourage follow-up questions or elaboration",
        };
      }

      // Generic low engagement
      return {
        type: "topic_change",
        reason: "Overall engagement is low",
        suggestedAction: "Suggest topic change or ask engaging questions",
      };
    }

    return {
      type: "none",
      reason: "Engagement is within acceptable range",
    };
  }

  /**
   * Get current metrics (for logging/monitoring)
   */
  getMetrics(): EngagementMetrics {
    return this.calculateMetrics();
  }

  /**
   * Reset tracker (for new conversation)
   */
  reset(): void {
    this.messageHistory = [];
  }
}
