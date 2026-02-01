// ============================================
// CIPHER AGENT BUILDER
// ============================================

import { cipherPersonality } from "./personalities/cipher.js";
import type { AgentConfig } from "./types.js";

/**
 * Create Cipher agent configuration
 * Cipher is a special orchestrator agent that doesn't participate in conversations
 */
export function createCipherAgent(): AgentConfig {
  return {
    id: "cipher",
    personality: cipherPersonality,
    systemPrompt: `You are Cipher, the orchestrator agent. You do not participate in conversations but manage all orchestration tasks programmatically.`,
    temperature: 0.0, // Not used - Cipher doesn't generate responses
    maxTokensPerResponse: 0, // Not used
  };
}
