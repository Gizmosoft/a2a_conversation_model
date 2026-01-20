import { buildSystemPrompt } from "./prompt-builder.js";
import type { AgentConfig, PersonalityConfig } from "./types.ts";

// AGENT FACTORY
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
