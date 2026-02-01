import type { OrchestratorConfig, ConversationState } from "./types.js";
import type { AgentConfig } from "../agents/types.js";
import { buildFullPrompt } from "../agents/prompt-builder.js";
import type { LLMMessage, LLMClient } from "../llm/types.js";
import type { EpisodicMemoryStore } from "../memory/store.js";
import type { TopicManager } from "../topics/manager.js";
import type { CipherOrchestrator } from "./cipher-orchestrator.js";
import { getDefaultLogger } from "../logger/index.js";

// ============================================
// ORCHESTRATOR CLASS
// ============================================
export class ConversationOrchestrator {
  private agentA: AgentConfig;
  private agentB: AgentConfig;
  private llmClient: LLMClient;
  private maxTurns: number;
  private state: ConversationState;
  private memoryStore: EpisodicMemoryStore | undefined;
  private llmProvider: string | undefined;
  private usePastMemories: boolean;
  private conversationId: number | undefined;
  private modelName: string | undefined;
  private topicManager: TopicManager | undefined;
  private engagementTracker: import("../metrics/index.js").EngagementTracker | undefined;
  private flowManager: import("../conversation/index.js").FlowManager | undefined;
  private cipher: CipherOrchestrator | undefined;
  private logger = getDefaultLogger();
  private pastMemoriesInjected: boolean = false; // Track if memories have been injected
  private infiniteMode: boolean = false; // Whether conversation runs indefinitely
  private engagementScore: number = 1.0; // Track conversation engagement (0-1)
  private consecutiveLowEngagementTurns: number = 0; // Track consecutive low engagement turns

  constructor(config: OrchestratorConfig) {
    this.agentA = config.agentA;
    this.agentB = config.agentB;
    this.llmClient = config.llmClient;
    this.maxTurns = config.maxTurns ?? 10;
    this.memoryStore = config.memoryStore;
    this.llmProvider = config.llmProvider;
    this.modelName = config.modelName;
    this.usePastMemories = config.usePastMemories ?? false;
    this.topicManager = config.topicManager;
    this.engagementTracker = config.engagementTracker;
    this.flowManager = config.flowManager;
    this.cipher = config.cipher;
    this.infiniteMode = config.infiniteMode ?? false;

    // Initialize conversation state
    this.state = {
      messages: [],
      currentTurn: 0,
      currentAgentId: this.agentA.id, // Alice starts first
      isComplete: false,
    };
  }

  // ============================================
  // GET CURRENT AGENT (based on whose turn it is)
  // ============================================

  /**
   * Get the agent configuration for the agent whose turn it is to speak.
   */
  private getCurrentAgent(): AgentConfig {
    return this.state.currentAgentId === this.agentA.id ? this.agentA : this.agentB;
  }

  /**
   * Get the agent configuration for the agent who is not currently speaking.
   */
  private getOtherAgent(): AgentConfig {
    return this.state.currentAgentId === this.agentA.id ? this.agentB : this.agentA;
  }

  // ============================================
  // BUILD CONVERSATION MESSAGES FOR LLM
  // ============================================

  /**
   * Convert conversation state messages into LLM message format.
   * Maps agent messages to user/assistant roles from the current agent's perspective.
   */
  private buildMessagesForLLM(): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // Convert conversation history to LLM message format
    for (const msg of this.state.messages) {
      // From current agent's perspective:
      // - Messages from OTHER agent = "user" (what they said to me)
      // - Messages from THIS agent = "assistant" (what I said)
      const role = msg.agentId === this.state.currentAgentId ? "assistant" : "user";
      messages.push({ role, content: msg.content });
    }

    return messages;
  }

  // ============================================
  // RETRIEVE PAST MEMORIES
  // ============================================

  /**
   * Retrieve relevant past conversation memories from the database.
   * Returns formatted memory strings extracted from previous conversations between the same agents.
   */
  private async retrievePastMemories(): Promise<string[]> {
    if (!this.memoryStore || !this.usePastMemories) {
      return [];
    }

    try {
      // Get relevant past messages from previous conversations
      const pastMessages = this.memoryStore.getRelevantPastMessages(
        this.agentA.id,
        this.agentB.id,
        5 // Limit to 5 most recent messages
      );

      if (pastMessages.length === 0) {
        return [];
      }

      // Format as memory strings for context injection
      this.logger.debug("Retrieved past memories", {
        count: pastMessages.length,
        agentAId: this.agentA.id,
        agentBId: this.agentB.id,
      });

      // Format past messages more naturally - extract just key phrases/topics
      // Don't include full messages, just enough to inform natural conversation
      return pastMessages.map((msg) => {
        // Extract just key words/phrases (first 10-12 words max)
        // This gives context without full message content that might trigger meta-commentary
        const words = msg.content.trim().split(/\s+/).slice(0, 12).join(" ");
        return words;
      });
    } catch (error) {
      this.logger.warn("Error retrieving past memories", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  // ============================================
  // ENGAGEMENT SCORE CALCULATION
  // ============================================

  /**
   * Calculate and update the conversation engagement score.
   * Considers message length diversity, topic diversity, and response quality.
   * Tracks consecutive low engagement turns for intervention decisions.
   */
  private updateEngagementScore(): void {
    if (this.state.messages.length < 2) {
      this.engagementScore = 1.0;
      return;
    }

    // Calculate engagement based on:
    // 1. Message length diversity (not all too short or too long)
    // 2. Topic diversity (recent messages cover different topics)
    // 3. Response quality (appropriate length, not repetitive)

    const recentMessages = this.state.messages.slice(-5);
    const avgLength = recentMessages.reduce((sum, m) => sum + m.content.length, 0) / recentMessages.length;
    const lengthVariance = recentMessages.reduce((sum, m) => {
      const diff = m.content.length - avgLength;
      return sum + diff * diff;
    }, 0) / recentMessages.length;

    // Length diversity score (0-1)
    const lengthScore = Math.min(1, lengthVariance / 1000); // Normalize

    // Topic diversity (if topic manager available)
    let topicScore = 0.5; // Default
    if (this.topicManager) {
      const state = this.topicManager.getState();
      const recentTopics = state.conversationHistory.slice(-5).map((e) => e.topic?.id).filter(Boolean);
      const uniqueTopics = new Set(recentTopics).size;
      topicScore = uniqueTopics / Math.max(1, recentTopics.length);
    }

    // Response quality (appropriate length: 20-200 chars is good)
    const lastMessage = this.state.messages[this.state.messages.length - 1];
    const qualityScore = lastMessage
      ? lastMessage.content.length >= 20 && lastMessage.content.length <= 200
        ? 1.0
        : lastMessage.content.length < 20
          ? lastMessage.content.length / 20
          : Math.max(0, 1 - (lastMessage.content.length - 200) / 200)
      : 0.5;

    // Weighted average
    this.engagementScore = lengthScore * 0.3 + topicScore * 0.4 + qualityScore * 0.3;

    // Update consecutive low engagement counter
    if (this.engagementScore < 0.4) {
      this.consecutiveLowEngagementTurns++;
    } else {
      this.consecutiveLowEngagementTurns = 0;
    }
  }

  // ============================================
  // EXECUTE ONE CONVERSATION TURN
  // ============================================

  /**
   * Execute a single conversation turn: retrieve context, build prompt,
   * generate response, and update conversation state.
   */
  private async executeTurn(): Promise<void> {
    const currentAgent = this.getCurrentAgent();
    const otherAgent = this.getOtherAgent();

    // Retrieve past memories via Cipher if available, otherwise use direct method
    let retrievedMemories: string[] = [];
    if (this.usePastMemories && !this.pastMemoriesInjected) {
      if (this.cipher) {
        // Get current topic for relevance weighting
        let currentTopic: string | undefined;
        if (this.topicManager && this.state.messages.length > 0) {
          const lastMsg = this.state.messages[this.state.messages.length - 1];
          if (lastMsg) {
            const analysis = this.topicManager.analyzeMessage(
              lastMsg.content,
              lastMsg.agentId,
              this.state.currentTurn,
              this.getOtherAgent()
            );
            currentTopic = analysis.detection.dominantTopic?.name;
          }
        }

        // Use Cipher to retrieve weighted memories
        const weightedMemories = await this.cipher.retrieveMemories(
          this.agentA.id,
          this.agentB.id,
          currentTopic,
          2
        );
        retrievedMemories = weightedMemories.map((m: { content: string; weight: number }) => {
          // Extract just key words/phrases (first 10-12 words max)
          const words = m.content.trim().split(/\s+/).slice(0, 12).join(" ");
          return words;
        });
      } else {
        // Fallback to direct retrieval
        retrievedMemories = await this.retrievePastMemories();
      }

      // Only mark as injected if we actually have memories and it's early in conversation
      if (retrievedMemories.length > 0 && this.state.currentTurn < 3) {
        this.pastMemoriesInjected = true;
        this.logger.debug("Past memories injected early in conversation", {
          turnNumber: this.state.currentTurn + 1,
          memoryCount: retrievedMemories.length,
        });
      }
    }

    // Analyze topic of previous message (if exists) to provide guidance
    let topicGuidance: string | undefined;
    const previousMessage = this.state.messages[this.state.messages.length - 1];

    if (this.topicManager && previousMessage) {
      // Analyze the previous message to detect topics and provide guidance
      const analysis = this.topicManager.analyzeMessage(
        previousMessage.content,
        previousMessage.agentId,
        this.state.currentTurn, // Previous turn number
        otherAgent // The agent who sent the previous message
      );

      if (analysis.guidance) {
        topicGuidance = analysis.guidance;
        this.logger.info("Topic guidance applied", {
          turnNumber: this.state.currentTurn + 1,
          guidance: topicGuidance,
          hasSuggestion: !!analysis.suggestion,
          hasSwitch: !!analysis.topicSwitch,
          previousMessageAgent: previousMessage.agentId,
        });
      }
    }

    // Get flow context via Cipher if available
    let flowContext: string | undefined;
    if (this.cipher) {
      // Cipher manages flow
      const flowGuidance = this.cipher.manageConversationFlow();
      flowContext = flowGuidance.flowContext;
      // Analyze previous message for flow if flow manager is available
      if (this.flowManager && previousMessage) {
        this.flowManager.analyzeMessage(previousMessage.content, this.state.currentTurn);
      }
    } else if (this.flowManager) {
      // Fallback to direct flow manager
      if (previousMessage) {
        this.flowManager.analyzeMessage(previousMessage.content, this.state.currentTurn);
      }
      flowContext = this.flowManager.getFlowContext();
    }

    // Build conversation context for this turn
    const context = {
      otherAgentName: otherAgent.personality.name,
      conversationTurn: this.state.currentTurn + 1,
      isOpening: this.state.currentTurn === 0,
      ...(retrievedMemories.length > 0 && { retrievedMemories }),
      ...(topicGuidance && { topicGuidance }),
      ...(flowContext && { flowContext }),
    };

    // Build full prompt (system prompt + context injection)
    const { systemPrompt, contextInjection } = buildFullPrompt(currentAgent, context);

    // Build messages for LLM
    const conversationMessages = this.buildMessagesForLLM();

    // Add context injection as a user message if present
    if (contextInjection) {
      conversationMessages.push({ role: "user", content: contextInjection });
    }

    // If this is the opening turn and there are no messages yet, add a starter
    // This ensures the first agent always starts with a greeting
    if (this.state.currentTurn === 0 && conversationMessages.length === 0) {
      if (retrievedMemories.length > 0) {
        conversationMessages.push({
          role: "user",
          content: `You're meeting ${otherAgent.personality.name} again. Start with a natural greeting.`,
        });
      } else {
        conversationMessages.push({
          role: "user",
          content: `You are starting a conversation with ${otherAgent.personality.name}. Begin with a natural greeting.`,
        });
      }
    }

    // Generate response from LLM
    this.logger.debug("Generating LLM response", {
      agentId: currentAgent.id,
      turnNumber: this.state.currentTurn + 1,
      messageCount: conversationMessages.length,
      temperature: currentAgent.temperature,
      maxTokens: currentAgent.maxTokensPerResponse,
    });

    let response;
    try {
      response = await this.llmClient.generate({
        systemPrompt,
        messages: conversationMessages,
        temperature: currentAgent.temperature,
        maxTokens: currentAgent.maxTokensPerResponse,
      });
    } catch (error) {
      this.logger.error("Error generating LLM response", error instanceof Error ? error : new Error(String(error)), {
        agentId: currentAgent.id,
        turnNumber: this.state.currentTurn + 1,
        llmProvider: this.llmProvider,
        modelName: this.modelName,
      });
      console.error(`\n[Error] Failed to generate response for ${currentAgent.personality.name}:`);
      console.error(error instanceof Error ? error.message : String(error));
      throw error; // Re-throw to stop the conversation
    }

    this.logger.debug("LLM response generated", {
      agentId: currentAgent.id,
      responseLength: response.content.length,
      finishReason: response.finishReason,
      tokenUsage: response.usage,
    });

    // Analyze topic of the current message after it's generated
    let detectedTopics: string[] = [];
    if (this.topicManager) {
      const analysis = this.topicManager.analyzeMessage(
        response.content,
        currentAgent.id,
        this.state.currentTurn + 1, // Current turn number
        currentAgent
      );

      if (analysis.detection.dominantTopic) {
        detectedTopics = [analysis.detection.dominantTopic.name];
        this.logger.info("Topic detected in generated message", {
          turnNumber: this.state.currentTurn + 1,
          agentId: currentAgent.id,
          dominantTopic: analysis.detection.dominantTopic.name,
          topicConfidence: analysis.detection.topicConfidence,
          hasSwitch: !!analysis.topicSwitch,
          hasSuggestion: !!analysis.suggestion,
        });
      }
    }

    // Track message and evaluate quality via Cipher if available
    if (this.engagementTracker) {
      this.engagementTracker.trackMessage(response.content, detectedTopics);
    }

    // Use Cipher to evaluate quality and log message
    if (this.cipher) {
      const interventions = this.cipher.evaluateConversationQuality();
      this.cipher.logMessageGenerated(
        {
          content: response.content,
          agentId: currentAgent.id,
          role: "assistant",
        },
        {
          ...(this.conversationId && { conversationId: this.conversationId }),
          turnNumber: this.state.currentTurn + 1,
          agentAId: this.agentA.id,
          agentBId: this.agentB.id,
          currentAgentId: currentAgent.id,
        }
      );
    } else if (this.engagementTracker) {
      // Fallback to direct engagement tracking
      const metrics = this.engagementTracker.getMetrics();
      const intervention = this.engagementTracker.shouldIntervene();
      this.logger.debug("Engagement metrics updated", {
        turnNumber: this.state.currentTurn + 1,
        overallEngagement: metrics.overallEngagement,
        interventionType: intervention.type,
      });
    }

    // Add response to conversation history
    const message = {
      role: "assistant" as const,
      content: response.content,
      agentId: currentAgent.id,
    };
    this.state.messages.push(message);

    // Save message to database if memory store is available
    if (this.memoryStore && this.conversationId) {
      try {
        this.memoryStore.saveMessage({
          conversationId: this.conversationId,
          turnNumber: this.state.currentTurn + 1,
          role: message.role,
          content: message.content,
          agentId: message.agentId,
        });
        this.logger.debug("Message saved to database", {
          conversationId: this.conversationId,
          turnNumber: this.state.currentTurn + 1,
          agentId: message.agentId,
        });
      } catch (error) {
        this.logger.warn("Error saving message to memory store", {
          conversationId: this.conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Update state
    this.state.currentTurn++;
    this.state.currentAgentId =
      this.state.currentAgentId === this.agentA.id ? this.agentB.id : this.agentA.id;

    // Update conversation in database - delegate to Cipher if available
    if (this.memoryStore && this.conversationId) {
      try {
        // In infinite mode, never mark as complete unless manually stopped
        const isComplete = this.infiniteMode ? false : this.state.currentTurn >= this.maxTurns;
        this.memoryStore.updateConversation(this.conversationId, {
          totalTurns: this.state.currentTurn,
          isComplete,
        });

        // Notify Cipher of state change
        if (this.cipher) {
          await this.cipher.saveConversationState(this.state, {
            conversationId: this.conversationId,
            turnNumber: this.state.currentTurn,
            agentAId: this.agentA.id,
            agentBId: this.agentB.id,
            currentAgentId: this.state.currentAgentId,
          });
        }
      } catch (error) {
        this.logger.warn("Error updating conversation in memory store", {
          conversationId: this.conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Check if conversation is complete
    // In infinite mode, only stop on error or manual intervention
    if (!this.infiniteMode && this.state.currentTurn >= this.maxTurns) {
      this.state.isComplete = true;
    }

    // In infinite mode, check conversation health
    if (this.infiniteMode) {
      this.updateEngagementScore();
      // If engagement is very low for many turns, suggest natural pause
      if (this.engagementScore < 0.3 && this.consecutiveLowEngagementTurns > 10) {
        this.logger.info("Low engagement detected in infinite mode", {
          engagementScore: this.engagementScore,
          consecutiveLowEngagementTurns: this.consecutiveLowEngagementTurns,
          turnNumber: this.state.currentTurn,
        });
        // Don't stop, but log for monitoring - conversation can continue naturally
      }
    }
  }

  // ============================================
  // RUN THE ENTIRE CONVERSATION
  // ============================================
  /**
   * Run the conversation between the two agents.
   * Executes turns until maxTurns is reached or infinite mode is stopped.
   * Manages conversation state, memory, topic guidance, and engagement tracking.
   */
  async run(): Promise<ConversationState> {
    this.logger.info("Starting conversation", {
      agentA: this.agentA.personality.name,
      agentB: this.agentB.personality.name,
      maxTurns: this.infiniteMode ? "infinite" : this.maxTurns,
      infiniteMode: this.infiniteMode,
      usePastMemories: this.usePastMemories,
    });

    console.log("Starting conversation between Alice and Bob...\n");

    // Initialize conversation in database if memory store is available
    if (this.memoryStore) {
      try {
        this.conversationId = this.memoryStore.createConversation({
          agentAId: this.agentA.id,
          agentBId: this.agentB.id,
          agentAName: this.agentA.personality.name,
          agentBName: this.agentB.personality.name,
          maxTurns: this.maxTurns,
          totalTurns: 0,
          isComplete: false,
          ...(this.llmProvider && { llmProvider: this.llmProvider }),
          ...(this.modelName && { modelName: this.modelName }),
        });
        this.logger.info("Conversation created in database", {
          conversationId: this.conversationId,
          agentA: this.agentA.personality.name,
          agentB: this.agentB.personality.name,
        });
        console.log(`[Memory] Conversation saved with ID: ${this.conversationId}\n`);
      } catch (error) {
        this.logger.warn("Error creating conversation in memory store", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    while (!this.state.isComplete) {
      const currentAgent = this.getCurrentAgent();
      const turnNumber = this.state.currentTurn + 1;

      this.logger.debug("Executing conversation turn", {
        turnNumber,
        currentAgent: currentAgent.personality.name,
        conversationId: this.conversationId,
        infiniteMode: this.infiniteMode,
      });
      
      if (this.infiniteMode) {
        console.log(`[Turn ${turnNumber}] ${currentAgent.personality.name} (Infinite Mode):`);
      } else {
        console.log(`[Turn ${turnNumber}/${this.maxTurns}] ${currentAgent.personality.name}:`);
      }

      try {
        // Check flow guidance via Cipher if available
        if (this.cipher) {
          const flowGuidance = this.cipher.manageConversationFlow();
          if (flowGuidance.shouldPause && flowGuidance.pauseDuration) {
            this.logger.debug("Natural pause in conversation", {
              turnNumber,
              pauseDurationMs: flowGuidance.pauseDuration,
            });
            await new Promise((resolve) => setTimeout(resolve, flowGuidance.pauseDuration!));
          }

          if (flowGuidance.shouldShowThinking) {
            console.log("...");
            await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
          }
        } else if (this.flowManager) {
          // Fallback to direct flow manager
          const pauseDuration = this.flowManager.shouldPause();
          if (pauseDuration) {
            this.logger.debug("Natural pause in conversation", {
              turnNumber,
              pauseDurationMs: pauseDuration,
            });
            await new Promise((resolve) => setTimeout(resolve, pauseDuration));
          }

          if (this.flowManager.shouldShowThinking()) {
            console.log("...");
            await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
          }
        }

        await this.executeTurn();

        // Display the latest message
        const lastMessage = this.state.messages[this.state.messages.length - 1];
        if (lastMessage) {
          this.logger.debug("Message generated", {
            turnNumber,
            agentId: lastMessage.agentId,
            messageLength: lastMessage.content.length,
            conversationId: this.conversationId,
            engagementScore: this.engagementScore,
          });
          console.log(`${lastMessage.content}\n`);
        }
      } catch (error) {
        this.logger.error("Error executing conversation turn", error instanceof Error ? error : new Error(String(error)), {
          turnNumber,
          agentId: currentAgent.id,
          conversationId: this.conversationId,
        });
        console.error(`\n[Error] Conversation failed at turn ${turnNumber}. Stopping conversation.`);
        this.state.isComplete = true; // Stop the conversation on error
        throw error; // Re-throw to propagate to main
      }
    }

    this.logger.info("Conversation completed", {
      conversationId: this.conversationId,
      totalTurns: this.state.currentTurn,
      maxTurns: this.maxTurns,
    });

    // Log topic statistics if topic manager is available
    if (this.topicManager) {
      this.topicManager.logStatistics();
    }

    console.log(`\nConversation complete after ${this.state.currentTurn} turns.`);

    // Finalize conversation in database
    if (this.memoryStore && this.conversationId) {
      try {
        this.memoryStore.updateConversation(this.conversationId, {
          totalTurns: this.state.currentTurn,
          isComplete: true,
        });
        this.logger.info("Conversation finalized in database", {
          conversationId: this.conversationId,
          totalTurns: this.state.currentTurn,
        });
        console.log(`[Memory] Conversation ${this.conversationId} saved to database.\n`);
      } catch (error) {
        this.logger.warn("Error finalizing conversation in memory store", {
          conversationId: this.conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return this.state;
  }

  // ============================================
  // GET CURRENT STATE (for inspection)
  // ============================================
  /**
   * Get the current conversation state.
   * Returns a copy to prevent external mutation of internal state.
   */
  getState(): ConversationState {
    return { ...this.state }; // Return a copy to prevent mutation
  }
}
