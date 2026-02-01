import { buildSystemPrompt } from "./prompt-builder.js";
import type { AgentConfig, PersonalityConfig } from "./types.ts";

/**
 * Create an agent configuration with the specified personality and settings.
 * Generates a system prompt based on the personality and configures temperature
 * and token limits for response generation.
 */
export function createAgent(
  id: string,
  personality: PersonalityConfig,
  otherAgentName: string,
  options?: {
    temperature?: number;
    maxTokensPerResponse?: number;
  }
): AgentConfig {
  return {
    id,
    personality,
    systemPrompt: buildSystemPrompt(personality, otherAgentName),
    temperature: options?.temperature ?? 0.8,
    maxTokensPerResponse: options?.maxTokensPerResponse ?? 300,
  };
}
