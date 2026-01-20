import type {
  Topic,
  TopicSuggestion,
  TopicGuidanceState,
  TopicDetection,
  TopicSwitch,
} from "./types.js";
import { getDefaultLogger } from "../logger/index.js";
import type { AgentConfig } from "../agents/types.js";

// ============================================
// TOPIC SUGGESTER
// ============================================
export class TopicSuggester {
  private logger = getDefaultLogger();
  private lullThreshold: number; // Number of turns with low activity before suggesting topic
  private minMessageLength: number; // Minimum message length to avoid lull

  constructor(lullThreshold: number = 3, minMessageLength: number = 20) {
    this.lullThreshold = lullThreshold;
    this.minMessageLength = minMessageLength;
  }

  /**
   * Detect if conversation has hit a lull
   */
  detectLull(state: TopicGuidanceState, currentTurn: number, currentMessage: string): boolean {
    // Check recent messages for short responses (potential lull)
    const recentMessages = state.conversationHistory.slice(-this.lullThreshold);

    if (recentMessages.length < this.lullThreshold) {
      return false;
    }

    const allShortMessages = recentMessages.every(
      (entry) => entry.message.length < this.minMessageLength
    );

    const currentMessageShort = currentMessage.length < this.minMessageLength;

    const lullDetected = allShortMessages && currentMessageShort;

    if (lullDetected) {
      this.logger.warn("Conversation lull detected", {
        turnNumber: currentTurn,
        recentMessagesCount: recentMessages.length,
        averageMessageLength:
          recentMessages.reduce((sum, m) => sum + m.message.length, 0) / recentMessages.length,
        currentMessageLength: currentMessage.length,
      });
    }

    return lullDetected;
  }

  /**
   * Suggest a topic based on agent interests and conversation history
   */
  suggestTopic(
    agent: AgentConfig,
    state: TopicGuidanceState,
    currentDetection: TopicDetection,
    allTopics: Topic[]
  ): TopicSuggestion | null {
    // Get topics that align with agent interests
    const agentInterests = agent.personality.interests.map((i) => i.toLowerCase());
    const relevantTopics = allTopics.filter((topic) => {
      return agentInterests.some((interest) =>
        topic.keywords.some((keyword) => interest.includes(keyword) || keyword.includes(interest))
      );
    });

    if (relevantTopics.length === 0) {
      return null;
    }

    // Avoid suggesting the current topic
    const currentTopicId = currentDetection.dominantTopic?.id;
    const suggestedTopics = relevantTopics.filter((t) => t.id !== currentTopicId);

    if (suggestedTopics.length === 0) {
      return null;
    }

    // Pick a topic that hasn't been discussed recently
    const recentTopicIds = new Set(
      state.conversationHistory
        .slice(-5)
        .map((entry) => entry.topic?.id)
        .filter(Boolean)
    );

    const freshTopics = suggestedTopics.filter((t) => !recentTopicIds.has(t.id));

    const suggestedTopic = freshTopics[0] || suggestedTopics[0];

    // Type guard: ensure suggestedTopic is defined
    if (!suggestedTopic) {
      return null;
    }

    const reason = `Based on ${agent.personality.name}'s interests: ${agent.personality.interests.slice(0, 2).join(", ")}`;
    const confidence = freshTopics.length > 0 ? 0.7 : 0.5;

    const suggestion: TopicSuggestion = {
      suggestedTopic,
      reason,
      confidence,
      context: `Agent ${agent.personality.name} might enjoy discussing ${suggestedTopic.name.toLowerCase()}`,
    };

    this.logger.info("Topic suggestion generated", {
      agentId: agent.id,
      agentName: agent.personality.name,
      suggestedTopic: suggestedTopic.name,
      reason,
      confidence,
      context: suggestion.context,
      wasRecentTopicAvoided: freshTopics.length > 0,
    });

    return suggestion;
  }

  /**
   * Generate topic guidance text for injection
   */
  generateTopicGuidance(
    lullDetected: boolean,
    suggestion: TopicSuggestion | null,
    topicSwitch: TopicSwitch | null
  ): string | undefined {
    const parts: string[] = [];

    if (lullDetected && suggestion) {
      // More subtle guidance - don't explicitly mention "lulls" or "slowing down"
      parts.push(
        `[Subtle hint: You might enjoy discussing ${suggestion.suggestedTopic.name.toLowerCase()}. ` +
          `${suggestion.context}]`
      );
    }

    if (topicSwitch && topicSwitch.switchType === "suggested") {
      // Natural transition hint - don't be explicit about "transitioning"
      parts.push(
        `[Subtle hint: ${topicSwitch.toTopic.name.toLowerCase()} could be interesting to explore.]`
      );
    }

    return parts.length > 0 ? parts.join(" ") : undefined;
  }
}
