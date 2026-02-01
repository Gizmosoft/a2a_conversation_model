// ============================================
// CONVERSATION FLOW TYPES
// ============================================

export type ConversationBeat =
  | "question_answer" // One asks, other answers
  | "story_listening" // One tells story, other listens/reacts
  | "debate_discussion" // Back-and-forth discussion/debate
  | "casual_chat" // Light, casual conversation
  | "deep_dive" // Deep exploration of a topic
  | "transition" // Transitioning between topics/beats
  | "acknowledgment" // Brief acknowledgments ("yeah", "right", etc.)
  | "thinking" // Agent is thinking/processing
  | "pause" // Natural pause in conversation
  | "interruption" // One agent interrupts or builds on other's thought
  | "multi_part" // Multi-part response (starts, pauses, continues)
  | "unknown"; // Unknown/undetermined

export type ConversationMood = "light" | "serious" | "playful" | "thoughtful" | "neutral";

export interface FlowState {
  currentBeat: ConversationBeat;
  mood: ConversationMood;
  rhythm: {
    averageResponseTime: number; // Average time between responses (ms)
    lastResponseTime: number; // Time of last response (ms)
    pauseCount: number; // Number of pauses in recent conversation
  };
  recentBeats: ConversationBeat[]; // Last N beats for pattern detection
  emotionalFlow: {
    intensity: number; // 0-1, how intense/emotional the conversation is
    direction: "increasing" | "decreasing" | "stable"; // Emotional direction
  };
}

export interface FlowConfig {
  enablePauses?: boolean; // Enable natural pauses between turns
  enableThinking?: boolean; // Show "thinking" indicators
  enableInterruptions?: boolean; // Allow agents to interrupt
  enableAcknowledgment?: boolean; // Allow brief acknowledgment messages
  minPauseMs?: number; // Minimum pause duration (ms)
  maxPauseMs?: number; // Maximum pause duration (ms)
  thinkingProbability?: number; // Probability of showing thinking indicator (0-1)
  acknowledgmentProbability?: number; // Probability of acknowledgment message (0-1)
}
