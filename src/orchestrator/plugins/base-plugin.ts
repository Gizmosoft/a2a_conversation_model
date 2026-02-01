// ============================================
// BASE PLUGIN INTERFACE
// ============================================

import type { OrchestrationPlugin } from "../cipher-types.js";

/**
 * Base class for orchestration plugins
 * Provides default implementations for optional methods
 */
export abstract class BaseOrchestrationPlugin implements OrchestrationPlugin {
  abstract name: string;
  version?: string;

  async initialize(): Promise<void> {
    // Default: no initialization needed
  }

  async cleanup(): Promise<void> {
    // Default: no cleanup needed
  }
}
