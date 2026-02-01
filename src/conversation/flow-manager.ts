import type {
  ConversationBeat,
  ConversationMood,
  FlowState,
  FlowConfig,
} from "./types.js";
import { getDefaultLogger } from "../logger/index.js";

// ============================================
// CONVERSATION FLOW MANAGER
// ============================================
export class FlowManager {
  private state: FlowState;
  private config: Required<FlowConfig>;
  private logger = getDefaultLogger();

  constructor(config: FlowConfig = {}) {
    this.config = {
      enablePauses: config.enablePauses ?? true,
      enableThinking: config.enableThinking ?? true,
      enableInterruptions: config.enableInterruptions ?? false, // Disabled by default
      enableAcknowledgment: config.enableAcknowledgment ?? true,
      minPauseMs: config.minPauseMs ?? 500,
      maxPauseMs: config.maxPauseMs ?? 2000,
      thinkingProbability: config.thinkingProbability ?? 0.1,
      acknowledgmentProbability: config.acknowledgmentProbability ?? 0.15,
    };

    this.state = {
      currentBeat: "unknown",
      mood: "neutral",
      rhythm: {
        averageResponseTime: 0,
        lastResponseTime: Date.now(),
        pauseCount: 0,
      },
      recentBeats: [],
      emotionalFlow: {
        intensity: 0.5,
        direction: "stable",
      },
    };
  }

  /**
   * Analyze a message and update flow state
   */
  analyzeMessage(content: string, turnNumber: number): void {
    const now = Date.now();
    const timeSinceLastResponse = now - this.state.rhythm.lastResponseTime;
    this.state.rhythm.lastResponseTime = now;

    // Update average response time (exponential moving average)
    if (this.state.rhythm.averageResponseTime === 0) {
      this.state.rhythm.averageResponseTime = timeSinceLastResponse;
    } else {
      this.state.rhythm.averageResponseTime =
        this.state.rhythm.averageResponseTime * 0.8 + timeSinceLastResponse * 0.2;
    }

    // Detect current beat
    const beat = this.detectBeat(content);
    this.state.currentBeat = beat;
    this.state.recentBeats.push(beat);
    if (this.state.recentBeats.length > 5) {
      this.state.recentBeats.shift();
    }

    // Detect mood
    this.state.mood = this.detectMood(content);

    // Update emotional flow
    this.updateEmotionalFlow(content);

    this.logger.debug("Flow state updated", {
      turnNumber,
      beat,
      mood: this.state.mood,
      averageResponseTime: this.state.rhythm.averageResponseTime,
    });
  }

  /**
   * Detect conversation beat from message content
   */
  private detectBeat(content: string): ConversationBeat {
    const lower = content.toLowerCase();

    // Questions
    if (lower.includes("?") || lower.match(/\b(what|why|how|when|where|who|which)\b/)) {
      return "question_answer";
    }

    // Story indicators
    if (
      lower.match(/\b(once|remember|story|happened|told|tale|narrative)\b/) ||
      content.length > 150
    ) {
      return "story_listening";
    }

    // Debate/discussion indicators
    if (
      lower.match(/\b(but|however|although|disagree|agree|opinion|think|believe)\b/) &&
      lower.match(/\b(because|reason|why|argument)\b/)
    ) {
      return "debate_discussion";
    }

    // Deep dive indicators
    if (
      lower.match(/\b(explore|analyze|understand|examine|consider|implications|complex)\b/) ||
      (content.length > 100 && lower.match(/\b(because|since|therefore|thus)\b/))
    ) {
      return "deep_dive";
    }

    // Acknowledgment
    if (
      lower.match(/^(yeah|yes|yep|right|ok|okay|sure|got it|i see|interesting|hmm|ah)\b/i) &&
      content.length < 30
    ) {
      return "acknowledgment";
    }

    // Casual chat (short, simple messages)
    if (content.length < 80 && !lower.includes("?")) {
      return "casual_chat";
    }

    return "unknown";
  }

  /**
   * Detect conversation mood from content
   */
  private detectMood(content: string): ConversationMood {
    const lower = content.toLowerCase();

    // Light/playful indicators
    const lightWords = ["fun", "funny", "laugh", "joke", "haha", "lol", "cool", "awesome"];
    if (lightWords.some((word) => lower.includes(word))) {
      return "playful";
    }

    // Serious indicators
    const seriousWords = [
      "important",
      "serious",
      "critical",
      "problem",
      "issue",
      "concern",
      "worry",
      "difficult",
    ];
    if (seriousWords.some((word) => lower.includes(word))) {
      return "serious";
    }

    // Thoughtful indicators
    const thoughtfulWords = [
      "think",
      "consider",
      "wonder",
      "reflect",
      "philosophy",
      "meaning",
      "understand",
      "analyze",
    ];
    if (thoughtfulWords.some((word) => lower.includes(word))) {
      return "thoughtful";
    }

    return "neutral";
  }

  /**
   * Update emotional flow intensity
   */
  private updateEmotionalFlow(content: string): void {
    const lower = content.toLowerCase();

    // Emotional intensity indicators
    const intenseWords = [
      "love",
      "hate",
      "amazing",
      "terrible",
      "excited",
      "angry",
      "passionate",
      "furious",
      "ecstatic",
      "devastated",
    ];
    const intenseCount = intenseWords.filter((word) => lower.includes(word)).length;

    // Update intensity
    const newIntensity = Math.min(1, 0.5 + intenseCount * 0.1);
    const oldIntensity = this.state.emotionalFlow.intensity;

    if (newIntensity > oldIntensity + 0.1) {
      this.state.emotionalFlow.direction = "increasing";
    } else if (newIntensity < oldIntensity - 0.1) {
      this.state.emotionalFlow.direction = "decreasing";
    } else {
      this.state.emotionalFlow.direction = "stable";
    }

    this.state.emotionalFlow.intensity = newIntensity;
  }

  /**
   * Get natural pause duration if pause should occur
   */
  shouldPause(): number | null {
    if (!this.config.enablePauses) {
      return null;
    }

    // Pause probability based on beat and mood
    let pauseProbability = 0.3; // Base probability

    // Longer pauses for thinking/deep beats
    if (this.state.currentBeat === "deep_dive" || this.state.currentBeat === "thinking") {
      pauseProbability = 0.6;
    }

    // Shorter pauses for casual/acknowledgment beats
    if (
      this.state.currentBeat === "casual_chat" ||
      this.state.currentBeat === "acknowledgment"
    ) {
      pauseProbability = 0.1;
    }

    // Random pause decision
    if (Math.random() < pauseProbability) {
      const pauseDuration =
        this.config.minPauseMs +
        Math.random() * (this.config.maxPauseMs - this.config.minPauseMs);
      this.state.rhythm.pauseCount++;
      return Math.round(pauseDuration);
    }

    return null;
  }

  /**
   * Check if thinking indicator should be shown
   */
  shouldShowThinking(): boolean {
    if (!this.config.enableThinking) {
      return false;
    }

    // Higher probability for complex beats
    let probability = this.config.thinkingProbability;
    if (this.state.currentBeat === "deep_dive" || this.state.currentBeat === "debate_discussion") {
      probability *= 2;
    }

    return Math.random() < probability;
  }

  /**
   * Check if acknowledgment message should be generated
   */
  shouldGenerateAcknowledgment(): boolean {
    if (!this.config.enableAcknowledgment) {
      return false;
    }

    // Higher probability after questions or stories
    let probability = this.config.acknowledgmentProbability;
    if (
      this.state.recentBeats.includes("question_answer") ||
      this.state.recentBeats.includes("story_listening")
    ) {
      probability *= 1.5;
    }

    return Math.random() < probability;
  }

  /**
   * Get flow context for prompt injection
   */
  getFlowContext(): string | undefined {
    const parts: string[] = [];

    // Beat context
    if (this.state.currentBeat !== "unknown") {
      const beatHints: Partial<Record<ConversationBeat, string>> = {
        question_answer: "You're in a question-answer exchange",
        story_listening: "The other person is sharing a story - listen and react naturally",
        debate_discussion: "You're having a discussion - feel free to present your perspective",
        casual_chat: "Keep it light and casual",
        deep_dive: "You're exploring a topic in depth - elaborate and think deeply",
        transition: "You're transitioning between topics - make it smooth",
        acknowledgment: "Keep your response brief and acknowledging",
        thinking: "Take a moment to think before responding",
        pause: "There's a natural pause - use it thoughtfully",
        interruption: "You're building on the other person's thought",
        multi_part: "You can break your response into parts if needed",
        unknown: "",
      };

      const hint = beatHints[this.state.currentBeat];
      if (hint) {
        parts.push(`[Flow: ${hint}]`);
      }
    }

    // Mood context
    if (this.state.mood !== "neutral") {
      const moodHints: Partial<Record<ConversationMood, string>> = {
        light: "Keep the tone light and easygoing",
        serious: "The conversation is serious - match the tone appropriately",
        playful: "The mood is playful - feel free to be lighthearted",
        thoughtful: "The conversation is thoughtful - engage deeply",
        neutral: "",
      };

      const hint = moodHints[this.state.mood];
      if (hint) {
        parts.push(`[Mood: ${hint}]`);
      }
    }

    return parts.length > 0 ? parts.join(" ") : undefined;
  }

  /**
   * Get current flow state (for logging/monitoring)
   */
  getState(): FlowState {
    return { ...this.state };
  }

  /**
   * Reset flow state (for new conversation)
   */
  reset(): void {
    this.state = {
      currentBeat: "unknown",
      mood: "neutral",
      rhythm: {
        averageResponseTime: 0,
        lastResponseTime: Date.now(),
        pauseCount: 0,
      },
      recentBeats: [],
      emotionalFlow: {
        intensity: 0.5,
        direction: "stable",
      },
    };
  }
}
