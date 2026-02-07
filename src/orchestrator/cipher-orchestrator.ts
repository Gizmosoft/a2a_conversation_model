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
import type { LLMClient } from "../llm/types.js";
import { getDefaultLogger } from "../logger/index.js";

export class CipherOrchestrator {
  private config: Required<CipherConfig>;
  private plugins: Map<string, OrchestrationPlugin> = new Map();
  private logger = getDefaultLogger();
  private memoryStore: EpisodicMemoryStore | undefined;
  private topicManager: TopicManager | undefined;
  private engagementTracker: EngagementTracker | undefined;
  private flowManager: FlowManager | undefined;
  private llmClient: LLMClient | undefined;
  private conversationSummary: string | undefined;
  
  // Incremental summarization tracking
  private summaryCache: Map<string, string> = new Map(); // In-memory cache: range -> summary
  private lastSummarizedCount: number = 0; // Track how many older messages have been summarized
  private currentConversationId: number | undefined; // Track current conversation for persistence
  private pendingSummaries: Array<{ rangeStart: number; rangeEnd: number; summary: string }> = []; // Summaries to persist on cleanup

  constructor(
    config: CipherConfig,
    dependencies: {
      memoryStore?: EpisodicMemoryStore;
      topicManager?: TopicManager;
      engagementTracker?: EngagementTracker;
      flowManager?: FlowManager;
      llmClient?: LLMClient;
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
    this.llmClient = dependencies.llmClient;

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
   * Manage context window - limit messages and optionally summarize older ones.
   * Uses incremental LLM-based summarization: only summarizes new messages and merges with previous summary.
   * Implements hybrid caching: in-memory for fast access, database for persistence across restarts.
   */
  async manageContextWindow(
    messages: Array<{ content: string; agentId: string; role: "user" | "assistant" }>
  ): Promise<Array<{ content: string; agentId: string; role: "user" | "assistant" }>> {
    if (!this.config.maxContextMessages || messages.length <= this.config.maxContextMessages) {
      return messages;
    }

    // Take the most recent N messages
    const recentMessages = messages.slice(-this.config.maxContextMessages);
    const olderMessages = messages.slice(0, messages.length - this.config.maxContextMessages);

    if (olderMessages.length === 0) {
      return recentMessages;
    }

    // If summarization is enabled, use incremental summarization
    if (this.config.enableContextSummarization) {
      const summary = await this.getOrCreateIncrementalSummary(olderMessages);
      if (summary) {
        // Prepend summary as context - format it naturally to preserve context
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

    this.logger.debug("Context window managed", {
      totalMessages: messages.length,
      includedMessages: recentMessages.length,
      truncatedMessages: messages.length - recentMessages.length,
    });

    return recentMessages;
  }

  /**
   * Get or create incremental summary for older messages.
   * Uses hybrid caching: checks in-memory first, then database, then generates incrementally.
   */
  private async getOrCreateIncrementalSummary(
    olderMessages: Array<{ content: string; agentId: string; role: "user" | "assistant" }>
  ): Promise<string | undefined> {
    const currentRangeEnd = olderMessages.length;
    const cacheKey = `range-0-${currentRangeEnd}`;

    // Step 1: Check in-memory cache first (fastest)
    if (this.summaryCache.has(cacheKey)) {
      this.logger.debug("Summary found in memory cache", {
        rangeEnd: currentRangeEnd,
        cacheKey,
      });
      return this.summaryCache.get(cacheKey);
    }

    // Step 2: Check database cache (persistent across restarts)
    if (this.memoryStore && this.currentConversationId !== undefined) {
      const dbSummary = this.memoryStore.getSummaryForRange(
        this.currentConversationId,
        currentRangeEnd
      );
      if (dbSummary && dbSummary.messageRangeEnd === currentRangeEnd) {
        // Exact match - load into memory cache
        this.summaryCache.set(cacheKey, dbSummary.summary);
        this.lastSummarizedCount = dbSummary.messageRangeEnd;
        this.logger.debug("Summary loaded from database cache", {
          rangeEnd: currentRangeEnd,
          rangeStart: dbSummary.messageRangeStart,
        });
        return dbSummary.summary;
      }
    }

    // Step 3: Incremental summarization - only summarize new messages
    if (currentRangeEnd > this.lastSummarizedCount) {
      const newMessages = olderMessages.slice(this.lastSummarizedCount);
      const previousSummary = this.lastSummarizedCount > 0
        ? this.summaryCache.get(`range-0-${this.lastSummarizedCount}`)
        : undefined;

      if (previousSummary && newMessages.length > 0) {
        // Incremental: summarize only new messages and merge
        const incrementalSummary = await this.summarizeIncremental(
          previousSummary,
          newMessages
        );
        
        // Store in memory cache
        this.summaryCache.set(cacheKey, incrementalSummary);
        this.lastSummarizedCount = currentRangeEnd;
        
        // Mark for persistence on cleanup
        if (this.currentConversationId !== undefined) {
          this.pendingSummaries.push({
            rangeStart: 0,
            rangeEnd: currentRangeEnd,
            summary: incrementalSummary,
          });
        }

        this.logger.debug("Incremental summary created", {
          previousRangeEnd: this.lastSummarizedCount - newMessages.length,
          newRangeEnd: currentRangeEnd,
          newMessagesCount: newMessages.length,
        });

        return incrementalSummary;
      } else if (newMessages.length > 0) {
        // First time - full summarization
        const fullSummary = await this.summarizeContext(olderMessages);
        if (fullSummary) {
          this.summaryCache.set(cacheKey, fullSummary);
          this.lastSummarizedCount = currentRangeEnd;
          
          // Mark for persistence
          if (this.currentConversationId !== undefined) {
            this.pendingSummaries.push({
              rangeStart: 0,
              rangeEnd: currentRangeEnd,
              summary: fullSummary,
            });
          }

          return fullSummary;
        }
      }
    }

    // Fallback: use existing summary if available
    if (this.lastSummarizedCount > 0) {
      const existingKey = `range-0-${this.lastSummarizedCount}`;
      if (this.summaryCache.has(existingKey)) {
        return this.summaryCache.get(existingKey);
      }
    }

    return undefined;
  }

  /**
   * Summarize new messages incrementally and merge with previous summary.
   * Only summarizes the new messages, then combines with the previous summary.
   */
  private async summarizeIncremental(
    previousSummary: string,
    newMessages: Array<{ content: string; agentId?: string }>
  ): Promise<string> {
    if (!this.llmClient) {
      // Fallback: simple concatenation if no LLM
      const newContent = newMessages.map((m) => m.content).join(" ");
      return `${previousSummary} ${newContent.substring(0, 100)}...`;
    }

    // Format new messages for summarization
    const newMessagesText = newMessages
      .map((m, i) => {
        const speaker = m.agentId === "alice" ? "Alice" : m.agentId === "bob" ? "Bob" : "Speaker";
        return `[${i + 1}] ${speaker}: ${m.content}`;
      })
      .join("\n\n");

    const incrementalPrompt = `You have a previous conversation summary and new messages. 
Create a concise summary (1-2 sentences) of ONLY the new messages, then merge it with the previous summary.

Previous summary: ${previousSummary}

New messages:
${newMessagesText}

Provide:
1. A brief summary of the new messages (1-2 sentences)
2. A merged summary combining the previous summary with the new content (2-3 sentences total)

Format your response as:
NEW: [summary of new messages]
MERGED: [combined summary]`;

    try {
      const response = await this.llmClient.generate({
        systemPrompt:
          "You are a conversation summarizer. Create concise summaries and merge them efficiently while preserving essential context.",
        messages: [{ role: "user", content: incrementalPrompt }],
        temperature: 0.3,
        maxTokens: 200,
      });

      // Extract merged summary from response
      const responseText = response.content.trim();
      const mergedMatch = responseText.match(/MERGED:\s*(.+?)(?:\n|$)/i);
      if (mergedMatch && mergedMatch[1]) {
        return mergedMatch[1].trim();
      }

      // Fallback: use the full response or simple merge
      const newMatch = responseText.match(/NEW:\s*(.+?)(?:\n|MERGED:|$)/i);
      if (newMatch && newMatch[1]) {
        const newSummary = newMatch[1].trim();
        return `${previousSummary} ${newSummary}`;
      }

      // Last resort: simple concatenation
      return `${previousSummary} ${responseText.substring(0, 150)}`;
    } catch (error) {
      this.logger.warn("Incremental summarization failed, using simple merge", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback: simple concatenation
      const newContent = newMessages.map((m) => m.content).join(" ");
      return `${previousSummary} ${newContent.substring(0, 100)}...`;
    }
  }

  /**
   * Summarize conversation context from older messages using LLM for maximum context preservation.
   * Falls back to keyword-based summarization if LLM is unavailable or fails.
   * Goal: Retain maximum context while being token-efficient and maintaining conversation quality.
   */
  async summarizeContext(
    messages: Array<{ content: string; agentId?: string }>
  ): Promise<string | undefined> {
    if (messages.length === 0) {
      return undefined;
    }

    // Use LLM-based summarization if available for better context preservation
    if (this.llmClient && this.config.enableContextSummarization) {
      try {
        return await this.summarizeContextWithLLM(messages);
      } catch (error) {
        this.logger.warn("LLM summarization failed, falling back to keyword-based", {
          error: error instanceof Error ? error.message : String(error),
          messageCount: messages.length,
        });
        // Fall through to keyword-based summarization
      }
    }

    // Fallback to keyword-based summarization
    return this.summarizeContextKeywordBased(messages);
  }

  /**
   * Summarize context using LLM for maximum context preservation.
   * Creates a concise but informative summary that preserves key topics, themes, and conversation flow.
   */
  private async summarizeContextWithLLM(
    messages: Array<{ content: string; agentId?: string }>
  ): Promise<string> {
    if (!this.llmClient) {
      throw new Error("LLM client not available");
    }

    // Format messages for summarization
    // Include agent identifiers to preserve who said what
    const conversationText = messages
      .map((m, i) => {
        const speaker = m.agentId === "alice" ? "Alice" : m.agentId === "bob" ? "Bob" : "Speaker";
        return `[${i + 1}] ${speaker}: ${m.content}`;
      })
      .join("\n\n");

    // Create a focused summarization prompt that emphasizes context preservation
    const summaryPrompt = `Summarize the following conversation excerpt in 2-3 concise sentences. 
Focus on:
- Main topics and themes discussed
- Key points and insights shared
- Important context that would help continue the conversation naturally
- Any notable details or references that might be relevant later

Be specific enough to preserve context, but concise enough to be token-efficient. Do not include meta-commentary or analysis - just the essential information.

Conversation:
${conversationText}

Summary:`;

    const response = await this.llmClient.generate({
      systemPrompt:
        "You are a conversation summarizer. Create concise, informative summaries that preserve essential context for natural conversation continuation. Focus on facts, topics, and key points rather than analysis.",
      messages: [{ role: "user", content: summaryPrompt }],
      temperature: 0.3, // Lower temperature for more consistent, factual summaries
      maxTokens: 200, // Limit to ~200 tokens for efficiency while preserving context
    });

    const summary = response.content.trim();

    // Update conversation summary cache
    this.conversationSummary = summary;

    // Notify plugins
    this.notifyPlugins("onContextSummarized", summary, messages);

    this.logger.debug("Context summarized with LLM", {
      originalMessageCount: messages.length,
      summaryLength: summary.length,
      summaryPreview: summary.substring(0, 100),
    });

    return summary;
  }

  /**
   * Keyword-based summarization fallback method.
   * Extracts key topics and themes using word frequency analysis.
   */
  private summarizeContextKeywordBased(
    messages: Array<{ content: string; agentId?: string }>
  ): string | undefined {
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

    return summary;

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
   * Retrieve weighted memories for context, optionally summarizing them with LLM for better context preservation.
   * Summarization preserves key context while being token-efficient.
   */
  async retrieveMemories(
    agentAId: string,
    agentBId: string,
    currentTopic?: string,
    limit: number = 2,
    summarize: boolean = true
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

      // If LLM is available and summarization is enabled, summarize memories for better context preservation
      if (summarize && this.llmClient && weightedMemories.length > 0) {
        try {
          const summarizedMemories = await this.summarizePastMemories(weightedMemories, currentTopic);
          
          // Notify plugins
          this.notifyPlugins("onMemoryRetrieved", summarizedMemories);

          // Log event
          this.logConversationEvent({
            type: "memory_retrieved",
            timestamp: new Date(),
            data: {
              memoryCount: summarizedMemories.length,
              currentTopic,
              summarized: true,
            },
          });

          return summarizedMemories;
        } catch (error) {
          this.logger.warn("LLM memory summarization failed, using original memories", {
            error: error instanceof Error ? error.message : String(error),
            memoryCount: weightedMemories.length,
          });
          // Fall through to return original memories
        }
      }

      // Return original memories if summarization is disabled or failed
      // Notify plugins
      this.notifyPlugins("onMemoryRetrieved", weightedMemories);

      // Log event
      this.logConversationEvent({
        type: "memory_retrieved",
        timestamp: new Date(),
        data: {
          memoryCount: weightedMemories.length,
          currentTopic,
          summarized: false,
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

  /**
   * Summarize past conversation memories using LLM for maximum context preservation.
   * Batches multiple memories together for efficiency and creates concise summaries.
   */
  private async summarizePastMemories(
    memories: Array<{ content: string; weight: number; agentId: string }>,
    currentTopic?: string
  ): Promise<Array<{ content: string; weight: number }>> {
    if (!this.llmClient || memories.length === 0) {
      return memories;
    }

    // For efficiency, batch summarize memories together if there are multiple
    // Otherwise, create a focused summary of the single memory
    const memoryTexts = memories.map((m, i) => {
      const speaker = m.agentId === "alice" ? "Alice" : m.agentId === "bob" ? "Bob" : "Speaker";
      return `[Memory ${i + 1}] ${speaker}: ${m.content}`;
    }).join("\n\n");

    // Create a focused prompt for summarizing past conversation memories
    const topicContext = currentTopic ? ` The current conversation topic is: ${currentTopic}.` : "";
    const summaryPrompt = `Summarize the following past conversation excerpts in 1-2 concise sentences each.${topicContext}
Focus on:
- Key points and insights that would be relevant for continuing a natural conversation
- Important context, topics, or themes discussed
- Notable details that might be referenced later

Be specific enough to preserve meaningful context, but concise (1-2 sentences per memory). Do not include meta-commentary.

Past conversation memories:
${memoryTexts}

Provide a summary for each memory, numbered [1], [2], etc.:`;

    try {
      const response = await this.llmClient.generate({
        systemPrompt:
          "You are a conversation memory summarizer. Create concise summaries of past conversation excerpts that preserve essential context for natural conversation continuation. Focus on facts, topics, and key points.",
        messages: [{ role: "user", content: summaryPrompt }],
        temperature: 0.3, // Lower temperature for consistent, factual summaries
        maxTokens: 300, // Allow enough tokens for multiple memory summaries
      });

      // Parse the response to extract individual summaries
      const summaryText = response.content.trim();
      const summaries = this.parseMemorySummaries(summaryText, memories.length);

      // Map summaries back to memories, preserving weights
      const summarizedMemories = memories.map((memory, index) => ({
        content: summaries[index] || memory.content.substring(0, 100) + "...", // Fallback to truncated original
        weight: memory.weight,
      }));

      this.logger.debug("Past memories summarized with LLM", {
        originalCount: memories.length,
        summarizedCount: summarizedMemories.length,
        topic: currentTopic,
      });

      return summarizedMemories;
    } catch (error) {
      this.logger.warn("Error summarizing past memories with LLM", {
        error: error instanceof Error ? error.message : String(error),
        memoryCount: memories.length,
      });
      throw error; // Re-throw to trigger fallback
    }
  }

  /**
   * Parse LLM response to extract individual memory summaries.
   * Handles various formats like [1], [2] or numbered lists.
   */
  private parseMemorySummaries(summaryText: string, expectedCount: number): string[] {
    const summaries: string[] = [];

    // Try to extract numbered summaries [1], [2], etc.
    const numberedPattern = /\[(\d+)\][:\s]*(.+?)(?=\[(\d+)\]|$)/gs;
    const matches = Array.from(summaryText.matchAll(numberedPattern));

    if (matches.length > 0) {
      for (const match of matches) {
        const summary = match[2]?.trim();
        if (summary) {
          summaries.push(summary);
        }
      }
    }

    // If numbered extraction didn't work, try splitting by newlines and filtering
    if (summaries.length === 0) {
      const lines = summaryText.split(/\n+/).filter((line) => line.trim().length > 0);
      summaries.push(...lines.slice(0, expectedCount));
    }

    // Ensure we have the right number of summaries
    while (summaries.length < expectedCount) {
      summaries.push(""); // Add empty strings for missing summaries
    }

    return summaries.slice(0, expectedCount);
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
   * Set the current conversation ID for summary persistence.
   * Should be called when a conversation starts.
   */
  setConversationId(conversationId: number): void {
    this.currentConversationId = conversationId;
    // Load existing summaries from database for this conversation
    this.loadSummariesFromDatabase(conversationId);
  }

  /**
   * Load summaries from database for a conversation on startup.
   * Populates in-memory cache with persisted summaries.
   */
  private loadSummariesFromDatabase(conversationId: number): void {
    if (!this.memoryStore) {
      return;
    }

    try {
      const summaries = this.memoryStore.getSummariesForConversation(conversationId);
      
      for (const summary of summaries) {
        const cacheKey = `range-${summary.messageRangeStart}-${summary.messageRangeEnd}`;
        this.summaryCache.set(cacheKey, summary.summary);
        
        // Update last summarized count to the highest range end
        if (summary.messageRangeEnd > this.lastSummarizedCount) {
          this.lastSummarizedCount = summary.messageRangeEnd;
        }
      }

      if (summaries.length > 0) {
        this.logger.info("Loaded summaries from database", {
          conversationId,
          summaryCount: summaries.length,
          lastRangeEnd: this.lastSummarizedCount,
        });
      }
    } catch (error) {
      this.logger.warn("Error loading summaries from database", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Persist all pending summaries to database on cleanup.
   * Uses write-back approach: summaries are stored in memory during execution,
   * then persisted to database when program terminates.
   */
  async persistSummaries(): Promise<void> {
    if (!this.memoryStore || this.currentConversationId === undefined || this.pendingSummaries.length === 0) {
      return;
    }

    try {
      for (const pending of this.pendingSummaries) {
        this.memoryStore.saveSummary({
          conversationId: this.currentConversationId,
          messageRangeStart: pending.rangeStart,
          messageRangeEnd: pending.rangeEnd,
          summary: pending.summary,
        });
      }

      this.logger.info("Persisted summaries to database", {
        conversationId: this.currentConversationId,
        summaryCount: this.pendingSummaries.length,
      });

      // Clear pending summaries after persistence
      this.pendingSummaries = [];
    } catch (error) {
      this.logger.error("Error persisting summaries to database", error instanceof Error ? error : new Error(String(error)), {
        conversationId: this.currentConversationId,
        pendingCount: this.pendingSummaries.length,
      });
    }
  }

  /**
   * Cleanup resources and plugins.
   * Persists summaries to database before cleanup.
   */
  async cleanup(): Promise<void> {
    // Persist summaries before cleanup
    await this.persistSummaries();

    // Cleanup plugins
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
