import type { OrchestratorConfig, ConversationState } from "./types.js";
import type { AgentConfig } from "../agents/types.js";
import { buildFullPrompt } from "../agents/prompt-builder.js";
import type { LLMMessage, LLMClient } from "../llm/types.js";

// ============================================
// ORCHESTRATOR CLASS
// ============================================
export class ConversationOrchestrator {
  private agentA: AgentConfig;
  private agentB: AgentConfig;
  private llmClient: LLMClient;
  private maxTurns: number;
  private state: ConversationState;

  constructor(config: OrchestratorConfig) {
    this.agentA = config.agentA;
    this.agentB = config.agentB;
    this.llmClient = config.llmClient;
    this.maxTurns = config.maxTurns ?? 10;

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
  // EXECUTE ONE CONVERSATION TURN
  // ============================================
  private async executeTurn(): Promise<void> {
    const currentAgent = this.getCurrentAgent();
    const otherAgent = this.getOtherAgent();

    // Build conversation context for this turn
    const context = {
      otherAgentName: otherAgent.personality.name,
      conversationTurn: this.state.currentTurn + 1,
      isOpening: this.state.currentTurn === 0,
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
    this.state.messages.push({
      role: "assistant",
      content: response.content,
      agentId: currentAgent.id,
    });

    // Update state
    this.state.currentTurn++;
    this.state.currentAgentId = this.state.currentAgentId === this.agentA.id ? this.agentB.id : this.agentA.id;

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
    return this.state;
  }

  // ============================================
  // GET CURRENT STATE (for inspection)
  // ============================================
  getState(): ConversationState {
    return { ...this.state }; // Return a copy to prevent mutation
  }
}

