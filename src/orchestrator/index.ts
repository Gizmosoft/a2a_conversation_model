import type { OrchestratorConfig, ConversationState } from "./types.js";
import type { AgentConfig } from "../agents/types.js";
import { buildFullPrompt } from "../agents/prompt-builder.js";
import type { LLMMessage, LLMClient } from "../llm/types.js";
import type { EpisodicMemoryStore } from "../memory/store.js";

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
  
  constructor(config: OrchestratorConfig) {
    this.agentA = config.agentA;
    this.agentB = config.agentB;
    this.llmClient = config.llmClient;
    this.maxTurns = config.maxTurns ?? 10;
    this.memoryStore = config.memoryStore;
    this.llmProvider = config.llmProvider;
    this.modelName = config.modelName;
    this.usePastMemories = config.usePastMemories ?? false;

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
      return pastMessages.map(
        (msg, idx) =>
          `[Past conversation ${pastMessages.length - idx}]: ${msg.agentId} said: "${msg.content.substring(0, 100)}${msg.content.length > 100 ? "..." : ""}"`
      );
    } catch (error) {
      console.warn("Error retrieving past memories:", error);
      return [];
    }
  }

  // ============================================
  // EXECUTE ONE CONVERSATION TURN
  // ============================================
  private async executeTurn(): Promise<void> {
    const currentAgent = this.getCurrentAgent();
    const otherAgent = this.getOtherAgent();

    // Retrieve past memories if enabled
    const retrievedMemories = await this.retrievePastMemories();

    // Build conversation context for this turn
    const context = {
      otherAgentName: otherAgent.personality.name,
      conversationTurn: this.state.currentTurn + 1,
      isOpening: this.state.currentTurn === 0,
      ...(retrievedMemories.length > 0 && { retrievedMemories }),
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
    const response = await this.llmClient.generate({
      systemPrompt,
      messages: conversationMessages,
      temperature: currentAgent.temperature,
      maxTokens: currentAgent.maxTokensPerResponse,
    });
    
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
      } catch (error) {
        console.warn("Error saving message to memory store:", error);
      }
    }

    // Update state
    this.state.currentTurn++;
    this.state.currentAgentId = this.state.currentAgentId === this.agentA.id ? this.agentB.id : this.agentA.id;

    // Update conversation in database
    if (this.memoryStore && this.conversationId) {
      try {
        this.memoryStore.updateConversation(this.conversationId, {
          totalTurns: this.state.currentTurn,
          isComplete: this.state.currentTurn >= this.maxTurns,
        });
      } catch (error) {
        console.warn("Error updating conversation in memory store:", error);
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
        console.log(`[Memory] Conversation saved with ID: ${this.conversationId}\n`);
      } catch (error) {
        console.warn("Error creating conversation in memory store:", error);
      }
    }

    while (!this.state.isComplete) {
      const currentAgent = this.getCurrentAgent();
      console.log(`[Turn ${this.state.currentTurn + 1}] ${currentAgent.personality.name}:`);

      await this.executeTurn();

      // Display the latest message
      const lastMessage = this.state.messages[this.state.messages.length - 1];
      if (lastMessage) {
        console.log(`${lastMessage.content}\n`);
      }
    }

    console.log(`\nConversation complete after ${this.state.currentTurn} turns.`);

    // Finalize conversation in database
    if (this.memoryStore && this.conversationId) {
      try {
        this.memoryStore.updateConversation(this.conversationId, {
          totalTurns: this.state.currentTurn,
          isComplete: true,
        });
        console.log(`[Memory] Conversation ${this.conversationId} saved to database.\n`);
      } catch (error) {
        console.warn("Error finalizing conversation in memory store:", error);
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

