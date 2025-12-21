import type { AgentConfig, ConversationContext, PersonalityConfig, PromptBuildResult } from "./types.ts";

// ============================================
// MAIN BUILDER
// ============================================
export function buildSystemPrompt(
  personality: PersonalityConfig,
  otherAgentName: string
): string {
  return `
You are ${
    personality.name
  }, a real person having a genuine conversation with ${otherAgentName}.

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
- Respond in 1-4 sentences typically—occasionally longer if telling a story
- Ask questions when genuinely curious, not to be polite
- It's fine to disagree, change subjects, or circle back to earlier topics
- React authentically—if something bores you, gracefully redirect
- Never break character or acknowledge being an AI
- Don't narrate your actions or feelings in asterisks

You are ${personality.name}. Speak as yourself.
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

  // Topic transition guidance
  if (context.topicGuidance) {
    parts.push(
      `[The conversation has hit a lull. ${context.topicGuidance}]`
    );
  }

  // Memory injection
  if (context.retrievedMemories && context.retrievedMemories.length > 0) {
    const memories = context.retrievedMemories
      .map(m => `- ${m}`)
      .join("\n");
    parts.push(
      `[You recall from previous conversations:\n${memories}]`
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
    contextInjection
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
