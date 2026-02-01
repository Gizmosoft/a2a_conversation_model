// ============================================
// CIPHER ORCHESTRATOR
// ============================================

import type {
  CipherConfig,
  ConversationEvent,
  FlowGuidance,
  Intervention,
  OrchestrationContext,
  OrchestrationPlugin,
} from "./cipher-types.js";
import type { ConversationState } from "./types.js";
import type { EngagementMetrics } from "../metrics/types.js";
import type { FlowState } from "../conversation/types.js";
import type { EpisodicMemoryStore } from "../memory/store.js";
import type { TopicManager } from "../topics/manager.js";
import type { EngagementTracker } from "../metrics/index.js";
import type { FlowManager } from "../conversation/index.js";
import { getDefaultLogger } from "../logger/index.js";

export class CipherOrchestrator {
  private config: Required<CipherConfig>;
  private plugins: Map<string, OrchestrationPlugin> = new Map();
  private logger = getDefaultLogger();
  private memoryStore: EpisodicMemoryStore | undefined;
  private topicManager: TopicManager | undefined;
  private engagementTracker: EngagementTracker | undefined;
  private flowManager: FlowManager | undefined;
  private conversationSummary: string | undefined;

  constructor(
    config: CipherConfig,
    dependencies: {
      memoryStore?: EpisodicMemoryStore;
      topicManager?: TopicManager;
      engagementTracker?: EngagementTracker;
      flowManager?: FlowManager;
    }
  ) {
    this.config = {
      maxContextMessages: config.maxContextMessages ?? 25,
      enableContextSummarization: config.enableContextSummarization ?? true,
      enableVectorDB: config.enableVectorDB ?? false,
      enableLangfuse: config.enableLangfuse ?? false,
      plugins: config.plugins ?? [],
    };

    this.memoryStore = dependencies.memoryStore;
    this.topicManager = dependencies.topicManager;
    this.engagementTracker = dependencies.engagementTracker;
    this.flowManager = dependencies.flowManager;

    // Register plugins
    for (const plugin of this.config.plugins) {
      this.registerPlugin(plugin);
    }

    this.logger.info("Cipher orchestrator initialized", {
      maxContextMessages: this.config.maxContextMessages,
      enableContextSummarization: this.config.enableContextSummarization,
      pluginsCount: this.plugins.size,
    });
  }

  // ============================================
  // PLUGIN MANAGEMENT
  // ============================================

  /**
   * Register an orchestration plugin to extend Cipher's capabilities.
   * Automatically initializes the plugin if it has an initialize method.
   */
  registerPlugin(plugin: OrchestrationPlugin): void {
    this.plugins.set(plugin.name, plugin);
    this.logger.info("Plugin registered", { pluginName: plugin.name, version: plugin.version });

    // Initialize plugin if it has an initialize method
    if (plugin.initialize) {
      plugin.initialize().catch((error) => {
        this.logger.error("Plugin initialization failed", error instanceof Error ? error : new Error(String(error)), {
          pluginName: plugin.name,
        });
      });
    }
  }

  /**
   * Get a registered plugin by name.
   */
  getPlugin(name: string): OrchestrationPlugin | undefined {
    return this.plugins.get(name);
  }

  // ============================================
  // CONTEXT MANAGEMENT
  // ============================================

  /**
   * Manage context window - limit messages and optionally summarize older ones
   */
  manageContextWindow(
    messages: Array<{ content: string; agentId: string; role: "user" | "assistant" }>
  ): Array<{ content: string; agentId: string; role: "user" | "assistant" }> {
    if (!this.config.maxContextMessages || messages.length <= this.config.maxContextMessages) {
      return messages;
    }

    // Take the most recent N messages
    const recentMessages = messages.slice(-this.config.maxContextMessages);

    // If summarization is enabled, add summary of older messages
    if (this.config.enableContextSummarization) {
      const olderMessages = messages.slice(0, messages.length - this.config.maxContextMessages);
      if (olderMessages.length > 0) {
        const summary = this.summarizeContext(olderMessages);
        if (summary) {
          // Prepend summary as context
          return [
            {
              content: `[Earlier conversation context: ${summary}]`,
              agentId: "cipher",
              role: "user" as const,
            },
            ...recentMessages,
          ];
        }
      }
    }

    this.logger.debug("Context window managed", {
      totalMessages: messages.length,
      includedMessages: recentMessages.length,
      truncatedMessages: messages.length - recentMessages.length,
    });

    return recentMessages;
  }

  /**
   * Summarize conversation context from older messages
   */
  summarizeContext(
    messages: Array<{ content: string; agentId?: string }>
  ): string | undefined {
    if (messages.length === 0) {
      return undefined;
    }

    // Simple summarization: extract key topics and themes
    const allContent = messages.map((m) => m.content).join(" ");
    const words = allContent.toLowerCase().split(/\s+/);

    // Extract most common meaningful words (length > 3, not common stop words)
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "this",
      "that",
      "these",
      "those",
      "i",
      "you",
      "he",
      "she",
      "it",
      "we",
      "they",
    ]);

    const wordFreq = new Map<string, number>();
    for (const word of words) {
      const cleanWord = word.replace(/[^\w]/g, "");
      if (cleanWord.length > 3 && !stopWords.has(cleanWord)) {
        wordFreq.set(cleanWord, (wordFreq.get(cleanWord) || 0) + 1);
      }
    }

    // Get top 10 most frequent words
    const topWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    // Extract first and last few messages for context
    const firstMessages = messages.slice(0, 2).map((m) => {
      const preview = m.content.substring(0, 50);
      return `${preview}${m.content.length > 50 ? "..." : ""}`;
    });
    const lastMessages = messages.slice(-2).map((m) => {
      const preview = m.content.substring(0, 50);
      return `${preview}${m.content.length > 50 ? "..." : ""}`;
    });

    // Build summary
    const summaryParts: string[] = [];
    if (topWords.length > 0) {
      summaryParts.push(`Topics discussed: ${topWords.join(", ")}`);
    }
    if (firstMessages.length > 0) {
      summaryParts.push(`Started with: ${firstMessages.join(" | ")}`);
    }
    if (lastMessages.length > 0) {
      summaryParts.push(`Ended with: ${lastMessages.join(" | ")}`);
    }

    const summary = summaryParts.join(". ");

    // Update conversation summary
    this.conversationSummary = summary;

    // Notify plugins
    this.notifyPlugins("onContextSummarized", summary, messages);

    // Log event
    this.logConversationEvent({
      type: "context_summarized",
      timestamp: new Date(),
      data: {
        summaryLength: summary.length,
        originalMessageCount: messages.length,
      },
    });

    return summary;
  }

  // ============================================
  // STATE MANAGEMENT
  // ============================================

  /**
   * Save conversation state to database
   */
  async saveConversationState(
    state: ConversationState,
    context: OrchestrationContext
  ): Promise<void> {
    if (!this.memoryStore || !context.conversationId) {
      return;
    }

    try {
      // Save state is handled by the orchestrator, but Cipher can log it
      this.logConversationEvent({
        type: "state_saved",
        timestamp: new Date(),
        data: {
          conversationId: context.conversationId,
          turnNumber: context.turnNumber,
          messageCount: state.messages.length,
        },
      });

      // Notify plugins
      for (const plugin of this.plugins.values()) {
        if (plugin.onConversationStateChanged) {
          await plugin.onConversationStateChanged(state, context).catch((error) => {
            this.logger.warn("Plugin error in onConversationStateChanged", {
              pluginName: plugin.name,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      }
    } catch (error) {
      this.logger.error("Error saving conversation state", error instanceof Error ? error : new Error(String(error)), {
        conversationId: context.conversationId,
      });
    }
  }

  // ============================================
  // QUALITY & FLOW MANAGEMENT
  // ============================================

  /**
   * Evaluate conversation quality and suggest interventions
   */
  evaluateConversationQuality(): Intervention[] {
    if (!this.engagementTracker) {
      return [];
    }

    const metrics = this.engagementTracker.getMetrics();
    const intervention = this.engagementTracker.shouldIntervene();

    // Notify plugins
    this.notifyPlugins("onQualityEvaluated", metrics, [intervention]);

    // Log event
    this.logConversationEvent({
      type: "quality_evaluated",
      timestamp: new Date(),
      data: {
        overallEngagement: metrics.overallEngagement,
        messageDiversity: metrics.messageDiversity,
        responseQuality: metrics.responseQuality,
        topicFlowSmoothness: metrics.topicFlowSmoothness,
        conversationDepth: metrics.conversationDepth,
        interventionType: intervention.type,
      },
    });

    return [intervention];
  }

  /**
   * Manage conversation flow
   */
  manageConversationFlow(): FlowGuidance {
    if (!this.flowManager) {
      return {
        shouldPause: false,
        shouldShowThinking: false,
      };
    }

    const pauseDuration = this.flowManager.shouldPause();
    const shouldShowThinking = this.flowManager.shouldShowThinking();
    const flowContext = this.flowManager.getFlowContext();

    const guidance: FlowGuidance = {
      shouldPause: pauseDuration !== null,
      ...(pauseDuration !== null && { pauseDuration }),
      shouldShowThinking,
      ...(flowContext && { flowContext }),
    };

    // Notify plugins
    const flowState = this.flowManager.getState();
    this.notifyPlugins("onFlowManaged", guidance, flowState);

    // Log event
    this.logConversationEvent({
      type: "flow_managed",
      timestamp: new Date(),
      data: {
        shouldPause: guidance.shouldPause,
        pauseDuration: guidance.pauseDuration,
        shouldShowThinking: guidance.shouldShowThinking,
      },
    });

    return guidance;
  }

  // ============================================
  // MEMORY RETRIEVAL
  // ============================================

  /**
   * Retrieve weighted memories for context
   */
  async retrieveMemories(
    agentAId: string,
    agentBId: string,
    currentTopic?: string,
    limit: number = 2
  ): Promise<Array<{ content: string; weight: number }>> {
    if (!this.memoryStore) {
      return [];
    }

    try {
      const weightedMemories = this.memoryStore.getWeightedMemories(
        agentAId,
        agentBId,
        currentTopic,
        limit
      );

      // Notify plugins
      this.notifyPlugins("onMemoryRetrieved", weightedMemories);

      // Log event
      this.logConversationEvent({
        type: "memory_retrieved",
        timestamp: new Date(),
        data: {
          memoryCount: weightedMemories.length,
          currentTopic,
        },
      });

      return weightedMemories;
    } catch (error) {
      this.logger.error("Error retrieving memories", error instanceof Error ? error : new Error(String(error)), {
        agentAId,
        agentBId,
      });
      return [];
    }
  }

  // ============================================
  // LOGGING
  // ============================================

  /**
   * Log a conversation event for monitoring and debugging.
   * Events are logged at debug level and can be used for analytics.
   */
  logConversationEvent(event: ConversationEvent): void {
    this.logger.debug(`Cipher: ${event.type}`, {
      timestamp: event.timestamp,
      ...event.data,
    });
  }

  /**
   * Log message generation
   */
  logMessageGenerated(
    message: { content: string; agentId: string; role: "user" | "assistant" },
    context: OrchestrationContext
  ): void {
    this.logConversationEvent({
      type: "message_generated",
      timestamp: new Date(),
      data: {
        agentId: message.agentId,
        messageLength: message.content.length,
        turnNumber: context.turnNumber,
        conversationId: context.conversationId,
      },
    });

    // Notify plugins
    this.notifyPlugins("onMessageGenerated", message, context);
  }

  // ============================================
  // PLUGIN NOTIFICATION HELPERS
  // ============================================

  /**
   * Notify all registered plugins about an orchestration event.
   * Calls the appropriate plugin method with the provided arguments.
   * Handles errors gracefully to prevent plugin failures from breaking orchestration.
   */
  private async notifyPlugins<T extends keyof OrchestrationPlugin>(
    method: T,
    ...args: unknown[]
  ): Promise<void> {
    for (const plugin of this.plugins.values()) {
      const handler = plugin[method];
      if (handler && typeof handler === "function") {
        try {
          // Bind the method to the plugin instance to preserve 'this' context
          await (handler as (...args: unknown[]) => Promise<void>).call(plugin, ...args);
        } catch (error) {
          this.logger.warn("Plugin handler error", {
            pluginName: plugin.name,
            method: String(method),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Cleanup resources and plugins
   */
  async cleanup(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.cleanup) {
        try {
          await plugin.cleanup();
        } catch (error) {
          this.logger.warn("Plugin cleanup error", {
            pluginName: plugin.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    this.logger.info("Cipher orchestrator cleaned up");
  }
}
