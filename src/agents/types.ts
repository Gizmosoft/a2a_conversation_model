// ============================================
// AGENT CONFIGURATION
// ============================================
export interface PersonalityConfig {
  name: string;
  traits: string[]; // ["curious", "witty", "slightly sarcastic"]
  background: string; // Brief backstory
  speakingStyle: string; // "casual and warm" | "formal and precise"
  interests: string[]; // Topics they naturally gravitate toward
  quirks: string[]; // "often uses metaphors", "asks follow-up questions"
  avoidances: string[]; // Things this personality wouldn't do/say
}

export interface AgentConfig {
  id: string;
  personality: PersonalityConfig;
  systemPrompt: string; // Generated from personality
  temperature: number; // 0.7-0.9 for natural conversation
  maxTokensPerResponse: number;
}

export interface ConversationContext {
  otherAgentName: string;
  conversationTurn: number; // How far into the conversation
  isOpening: boolean; // First message?
  topicGuidance?: string; // Optional nudge toward a topic
  retrievedMemories?: string[]; // Relevant memories from past conversations
}

export interface PromptBuildResult {
  systemPrompt: string;
  contextInjection?: string | undefined; // Added to user message when needed
}
