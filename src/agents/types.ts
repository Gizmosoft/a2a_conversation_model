// ============================================
// AGENT CONFIGURATION
// ============================================

interface PersonalityConfig {
  name: string;
  traits: string[];           // ["curious", "witty", "slightly sarcastic"]
  background: string;         // Brief backstory
  speakingStyle: string;      // "casual and warm" | "formal and precise"
  interests: string[];        // Topics they naturally gravitate toward
  quirks: string[];           // "often uses metaphors", "asks follow-up questions"
  avoidances: string[];       // Things this personality wouldn't do/say
}

interface AgentConfig {
  id: string;
  personality: PersonalityConfig;
  systemPrompt: string;       // Generated from personality
  temperature: number;        // 0.7-0.9 for natural conversation
  maxTokensPerResponse: number;
}