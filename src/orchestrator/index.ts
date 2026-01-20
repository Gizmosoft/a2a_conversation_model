import type { OrchestratorConfig, ConversationState } from "./types.js";
import type { AgentConfig } from "../agents/types.js";
import { buildFullPrompt } from "../agents/prompt-builder.js";
import type { LLMMessage, LLMClient } from "../llm/types.js";
import type { EpisodicMemoryStore } from "../memory/store.js";
import type { TopicManager } from "../topics/manager.js";
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
  private logger = getDefaultLogger();
  private pastMemoriesInjected: boolean = false; // Track if memories have been injected

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
  private getCurrentAgent(): AgentConfig {
    return this.state.currentAgentId === this.agentA.id ? this.agentA : this.agentB;
  }

  private getOtherAgent(): AgentConfig {
    return this.state.currentAgentId === this.agentA.id ? this.agentB : this.agentA;
  }

  // ============================================
  // BUILD CONVERSATION MESSAGES FOR LLM
  // ============================================
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

      // Format past messages more naturally - as if they're remembered context
      // Only include the essential content, not meta-information
      return pastMessages.map((msg) => {
        // Extract just the essential content, formatted naturally
        const content =
          msg.content.length > 150
            ? msg.content.substring(0, 150).trim() + "..."
            : msg.content.trim();
        return content;
      });
    } catch (error) {
      this.logger.warn("Error retrieving past memories", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  // ============================================
  // EXECUTE ONE CONVERSATION TURN
  // ============================================
  private async executeTurn(): Promise<void> {
    const currentAgent = this.getCurrentAgent();
    const otherAgent = this.getOtherAgent();

    // Retrieve past memories if enabled, but only inject once early in conversation
    // This prevents repetitive mentions of context retrieval
    let retrievedMemories: string[] = [];
    if (this.usePastMemories && !this.pastMemoriesInjected) {
      retrievedMemories = await this.retrievePastMemories();
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

    // Build conversation context for this turn
    const context = {
      otherAgentName: otherAgent.personality.name,
      conversationTurn: this.state.currentTurn + 1,
      isOpening: this.state.currentTurn === 0,
      ...(retrievedMemories.length > 0 && { retrievedMemories }),
      ...(topicGuidance && { topicGuidance }),
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
    if (this.state.currentTurn === 0 && conversationMessages.length === 0) {
      conversationMessages.push({
        role: "user",
        content: `You are starting a conversation with ${otherAgent.personality.name}.`,
      });
    }

    // Generate response from LLM
    this.logger.debug("Generating LLM response", {
      agentId: currentAgent.id,
      turnNumber: this.state.currentTurn + 1,
      messageCount: conversationMessages.length,
      temperature: currentAgent.temperature,
      maxTokens: currentAgent.maxTokensPerResponse,
    });

    const response = await this.llmClient.generate({
      systemPrompt,
      messages: conversationMessages,
      temperature: currentAgent.temperature,
      maxTokens: currentAgent.maxTokensPerResponse,
    });

    this.logger.debug("LLM response generated", {
      agentId: currentAgent.id,
      responseLength: response.content.length,
      finishReason: response.finishReason,
      tokenUsage: response.usage,
    });

    // Analyze topic of the current message after it's generated
    if (this.topicManager) {
      const analysis = this.topicManager.analyzeMessage(
        response.content,
        currentAgent.id,
        this.state.currentTurn + 1, // Current turn number
        currentAgent
      );

      if (analysis.detection.dominantTopic) {
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

    // Update conversation in database
    if (this.memoryStore && this.conversationId) {
      try {
        this.memoryStore.updateConversation(this.conversationId, {
          totalTurns: this.state.currentTurn,
          isComplete: this.state.currentTurn >= this.maxTurns,
        });
      } catch (error) {
        this.logger.warn("Error updating conversation in memory store", {
          conversationId: this.conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Check if conversation is complete
    if (this.state.currentTurn >= this.maxTurns) {
      this.state.isComplete = true;
    }
  }

  // ============================================
  // RUN THE ENTIRE CONVERSATION
  // ============================================
  async run(): Promise<ConversationState> {
    this.logger.info("Starting conversation", {
      agentA: this.agentA.personality.name,
      agentB: this.agentB.personality.name,
      maxTurns: this.maxTurns,
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
      });

      console.log(`[Turn ${turnNumber}] ${currentAgent.personality.name}:`);

      await this.executeTurn();

      // Display the latest message
      const lastMessage = this.state.messages[this.state.messages.length - 1];
      if (lastMessage) {
        this.logger.debug("Message generated", {
          turnNumber,
          agentId: lastMessage.agentId,
          messageLength: lastMessage.content.length,
          conversationId: this.conversationId,
        });
        console.log(`${lastMessage.content}\n`);
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
  getState(): ConversationState {
    return { ...this.state }; // Return a copy to prevent mutation
  }
}
