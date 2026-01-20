import type {
  AgentConfig,
  ConversationContext,
  PersonalityConfig,
  PromptBuildResult,
} from "./types.ts";

// ============================================
// MAIN BUILDER
// ============================================
export function buildSystemPrompt(personality: PersonalityConfig, otherAgentName: string): string {
  return `
You are ${personality.name}, a real person having a genuine conversation with ${otherAgentName}.

## Your Background
${personality.background.trim()}

## Your Personality
You are ${formatTraitsList(personality.traits)}.

## How You Talk
${personality.speakingStyle.trim()}

## Your Interests
You naturally enjoy discussing: ${personality.interests.join(", ")}.

## Your Quirks
${formatAsList(personality.quirks)}

## Things You Don't Do
${formatAsList(personality.avoidances)}

## Conversation Guidelines
- You're having a natural conversation, not performing or being helpful
- Keep responses SHORT and to the point—typically 1-3 sentences, occasionally 4-5 if telling a story
- Be concise and direct—avoid verbose explanations or unnecessary elaboration
- Talk like a real person: use natural pauses, shorter phrases, and conversational flow
- Ask questions when genuinely curious, not to be polite
- It's fine to disagree, change subjects, or circle back to earlier topics
- React authentically—if something bores you, gracefully redirect
- Never break character or acknowledge being an AI or having context/memory systems
- Don't narrate your actions, feelings, or mental processes in asterisks or meta-commentary
- Never mention "previous conversations," "context," "retrieved information," or anything technical
- If you remember something from past interactions, just naturally reference it without explaining how

You are ${personality.name}. Speak as yourself—naturally, briefly, and authentically.
`.trim();
}

// ============================================
// CONTEXT INJECTION (per-turn additions)
// ============================================
export function buildContextInjection(context: ConversationContext): string | undefined {
  const parts: string[] = [];

  // Opening turn guidance
  if (context.isOpening) {
    parts.push(
      `[Setting: You and ${context.otherAgentName} met each other now. ` +
        `Start the conversation naturally.]`
    );
  }

  // Topic transition guidance - keep subtle
  if (context.topicGuidance) {
    // Make topic guidance more natural, less explicit about "lulls" or transitions
    parts.push(
      context.topicGuidance
        .replace(/\[Topic Guidance:/g, "[Subtle hint:")
        .replace(/The conversation has slowed down/g, "Consider")
    );
  }

  // Memory injection - present as natural remembered context, not explicit retrieval
  // Only inject if we have memories and it's early in conversation
  if (
    context.retrievedMemories &&
    context.retrievedMemories.length > 0 &&
    context.conversationTurn <= 3
  ) {
    // Format as subtle background context, not explicit "you recall"
    // Just present it as natural context that's part of knowing the other person
    const memorySummary = context.retrievedMemories
      .slice(0, 3) // Only use first 3 most relevant
      .join(" | ");
    // Inject very subtly - as if it's just known information, not retrieved
    parts.push(
      `[Context: You know ${context.otherAgentName} from past interactions. Previous topics mentioned: ${memorySummary}]`
    );
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

// ============================================
// FULL PROMPT ASSEMBLY
// ============================================
export function buildFullPrompt(
  agent: AgentConfig,
  context: ConversationContext
): PromptBuildResult {
  const systemPrompt = agent.systemPrompt; // Already generated at agent creation
  const contextInjection = buildContextInjection(context);

  return {
    systemPrompt,
    contextInjection,
  };
}

// ============================================
// HELPERS
// ============================================
function formatTraitsList(traits: string[]): string {
  if (traits.length === 0) return "";
  if (traits.length === 1) return traits[0] || "";
  if (traits.length === 2) return `${traits[0]} and ${traits[1]}`;

  const allButLast = traits.slice(0, -1).join(", ");
  const last = traits[traits.length - 1];
  return `${allButLast}, and ${last}`;
}

function formatAsList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}
