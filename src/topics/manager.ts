import type { TopicDetection, TopicSwitch, TopicSuggestion, TopicGuidanceState } from "./types.js";
import { TopicDetector } from "./topic-detector.js";
import { TopicSuggester } from "./topic-suggester.js";
import { getDefaultLogger } from "../logger/index.js";
import type { AgentConfig } from "../agents/types.js";

// ============================================
// TOPIC MANAGER
// ============================================
export class TopicManager {
  private detector: TopicDetector;
  private suggester: TopicSuggester;
  private state: TopicGuidanceState;
  private logger = getDefaultLogger();

  constructor(lullThreshold: number = 3, minMessageLength: number = 20) {
    this.detector = new TopicDetector();
    this.suggester = new TopicSuggester(lullThreshold, minMessageLength);
    this.state = {
      currentTopics: [],
      conversationHistory: [],
      topicSwitches: [],
      suggestions: [],
      lullDetected: false,
    };

    this.logger.info("Topic manager initialized", {
      lullThreshold,
      minMessageLength,
      availableTopics: this.detector.getAllTopics().map((t) => t.name),
    });
  }

  /**
   * Analyze a message and update topic state
   */
  analyzeMessage(
    message: string,
    agentId: string,
    turnNumber: number,
    agent: AgentConfig
  ): {
    detection: TopicDetection;
    topicSwitch: TopicSwitch | null;
    suggestion: TopicSuggestion | null;
    guidance: string | undefined;
  } {
    // Detect topics in current message
    const detection = this.detector.detectTopics(message, turnNumber);

    // Update conversation history
    this.state.conversationHistory.push({
      turnNumber,
      topic: detection.dominantTopic,
      message,
    });

    // Keep history to last 20 turns
    if (this.state.conversationHistory.length > 20) {
      this.state.conversationHistory.shift();
    }

    // Update current topics
    if (detection.dominantTopic) {
      const existingIndex = this.state.currentTopics.findIndex(
        (t) => t.id === detection.dominantTopic!.id
      );
      if (existingIndex >= 0) {
        this.state.currentTopics[existingIndex] = detection.dominantTopic;
      } else {
        this.state.currentTopics.push(detection.dominantTopic);
        // Keep only last 3 topics
        if (this.state.currentTopics.length > 3) {
          this.state.currentTopics.shift();
        }
      }
    }

    // Detect topic switch
    let topicSwitch: TopicSwitch | null = null;
    if (this.state.conversationHistory.length >= 2) {
      const previousEntry =
        this.state.conversationHistory[this.state.conversationHistory.length - 2];
      if (previousEntry.topic) {
        const previousDetection: TopicDetection = {
          detectedTopics: previousEntry.topic ? [previousEntry.topic] : [],
          dominantTopic: previousEntry.topic,
          topicConfidence: 0.5,
          messageAnalysis: {
            wordCount: previousEntry.message.split(/\s+/).length,
            uniqueWords: new Set(previousEntry.message.split(/\s+/)).size,
          },
        };

        topicSwitch = this.detector.detectTopicSwitch(previousDetection, detection, turnNumber);

        if (topicSwitch) {
          this.state.topicSwitches.push(topicSwitch);
          this.logger.info("Topic switch logged", {
            turnNumber,
            switchId: this.state.topicSwitches.length,
            switchType: topicSwitch.switchType,
          });
        }
      }
    }

    // Detect lull
    const lullDetected = this.suggester.detectLull(this.state, turnNumber, message);
    this.state.lullDetected = lullDetected;

    if (lullDetected) {
      this.state.lastActiveTurn = turnNumber;
    }

    // Generate suggestion if lull detected
    let suggestion: TopicSuggestion | null = null;
    if (lullDetected) {
      suggestion = this.suggester.suggestTopic(
        agent,
        this.state,
        detection,
        this.detector.getAllTopics()
      );

      if (suggestion) {
        this.state.suggestions.push(suggestion);
        this.logger.info("Topic suggestion logged", {
          turnNumber,
          suggestionId: this.state.suggestions.length,
          suggestedTopic: suggestion.suggestedTopic.name,
        });
      }
    }

    // Generate topic guidance text
    const guidance = this.suggester.generateTopicGuidance(lullDetected, suggestion, topicSwitch);

    if (guidance) {
      this.logger.debug("Topic guidance generated", {
        turnNumber,
        guidance,
        hasSuggestion: !!suggestion,
        hasSwitch: !!topicSwitch,
      });
    }

    // Log comprehensive topic state
    this.logger.debug("Topic analysis complete", {
      turnNumber,
      agentId,
      dominantTopic: detection.dominantTopic?.name,
      topicConfidence: detection.topicConfidence,
      lullDetected,
      hasSuggestion: !!suggestion,
      hasSwitch: !!topicSwitch,
      currentTopicsCount: this.state.currentTopics.length,
      totalSwitches: this.state.topicSwitches.length,
      totalSuggestions: this.state.suggestions.length,
    });

    return {
      detection,
      topicSwitch,
      suggestion,
      guidance,
    };
  }

  /**
   * Get current topic guidance state
   */
  getState(): TopicGuidanceState {
    return {
      ...this.state,
      conversationHistory: [...this.state.conversationHistory],
      topicSwitches: [...this.state.topicSwitches],
      suggestions: [...this.state.suggestions],
    };
  }

  /**
   * Get topic statistics
   */
  getTopicStatistics(): {
    topicDistribution: Record<string, number>;
    mostCommonTopic: string | undefined;
    totalSwitches: number;
    totalSuggestions: number;
    averageTopicConfidence: number;
  } {
    const topicDistribution: Record<string, number> = {};

    for (const entry of this.state.conversationHistory) {
      if (entry.topic) {
        topicDistribution[entry.topic.name] = (topicDistribution[entry.topic.name] || 0) + 1;
      }
    }

    const mostCommonTopic = Object.entries(topicDistribution).sort(([, a], [, b]) => b - a)[0]?.[0];

    const confidences = this.state.conversationHistory
      .map((entry) => entry.topic?.relevanceScore || 0)
      .filter((score) => score > 0);

    const averageTopicConfidence =
      confidences.length > 0
        ? confidences.reduce((sum, score) => sum + score, 0) / confidences.length
        : 0;

    return {
      topicDistribution,
      mostCommonTopic,
      totalSwitches: this.state.topicSwitches.length,
      totalSuggestions: this.state.suggestions.length,
      averageTopicConfidence,
    };
  }

  /**
   * Log topic statistics
   */
  logStatistics(): void {
    const stats = this.getTopicStatistics();

    this.logger.info("Topic statistics", {
      topicDistribution: stats.topicDistribution,
      mostCommonTopic: stats.mostCommonTopic,
      totalSwitches: stats.totalSwitches,
      totalSuggestions: stats.totalSuggestions,
      averageTopicConfidence: stats.averageTopicConfidence.toFixed(3),
    });
  }
}
