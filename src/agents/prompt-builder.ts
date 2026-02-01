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
- Keep responses SHORT—1-2 sentences is ideal, 3 sentences maximum unless telling a brief story
- Be concise: cut unnecessary words, avoid filler phrases, get to the point quickly
- Talk like a real person: use natural pauses, shorter phrases, conversational flow
- Never be verbose, wordy, or overly elaborate—brevity is key to natural conversation
- Ask questions when genuinely curious, not to be polite
- It's fine to disagree, change subjects, or circle back to earlier topics
- React authentically—if something bores you, gracefully redirect
- Never break character or acknowledge being an AI or having context/memory systems
- Don't narrate your actions, feelings, or mental processes in asterisks or meta-commentary
- Never mention "previous conversations," "context," "retrieved information," "building conversations," "using memories," or anything technical
- If you remember something from past interactions, just naturally reference it without explaining how or where it came from
- When starting a new conversation, always begin with a natural greeting as if you're meeting again

You are ${personality.name}. Speak as yourself—naturally, briefly, and authentically.
`.trim();
}

// ============================================
// CONTEXT INJECTION (per-turn additions)
// ============================================
export function buildContextInjection(context: ConversationContext): string | undefined {
  const parts: string[] = [];

  // Opening turn guidance - always start with a greeting
  if (context.isOpening) {
    if (context.retrievedMemories && context.retrievedMemories.length > 0) {
      // If there are past memories, it's a reunion - greet naturally
      parts.push(
        `[Setting: You're meeting ${context.otherAgentName} again after some time. ` +
        `Start with a natural greeting (like "Hey!" or "Hi!" or "Good to see you again!") ` +
        `and then naturally continue the conversation. Don't reference that you're "continuing" or "resuming"—just greet and chat naturally.]`
      );
    } else {
      // First time meeting
      parts.push(
        `[Setting: You and ${context.otherAgentName} are meeting each other now. ` +
        `Start the conversation with a natural greeting.]`
      );
    }
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
  // Only inject if we have memories and it's early in conversation, but NOT on opening turn
  // Opening turn should be a fresh greeting, memories can inform later turns naturally
  if (
    context.retrievedMemories &&
    context.retrievedMemories.length > 0 &&
    context.conversationTurn > 1 &&
    context.conversationTurn <= 3
  ) {
    // Format as very subtle background context - just topics, no explicit mention of "past" or "previous"
    // Extract just the essence of what was discussed, not full messages
    const memoryTopics = context.retrievedMemories
      .slice(0, 2) // Only use first 2 most relevant
      .map(m => {
        // Extract just a few key words from the memory, not the full content
        const words = m.split(/\s+/).slice(0, 5).join(" ");
        return words;
      })
      .join(", ");
    
    // Inject very subtly - as if it's just things you naturally remember
    parts.push(
      `[Note: You naturally remember some things you've discussed with ${context.otherAgentName} before, like: ${memoryTopics}. ` +
      `Use this naturally in conversation without mentioning that you're "remembering" or "recalling" anything.]`
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
