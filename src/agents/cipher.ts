// ============================================
// CIPHER AGENT BUILDER
// ============================================

import { cipherPersonality } from "./personalities/cipher.js";
import type { AgentConfig } from "./types.js";

/**
 * Create Cipher agent configuration.
 * Cipher is a special orchestrator agent that manages conversation flow,
 * memory, quality evaluation, and logging without participating in the actual dialogue.
 * It operates programmatically in the background to ensure smooth conversations.
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
