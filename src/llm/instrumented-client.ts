import type { LLMCallType, LLMClient, LLMGenerateOptions, LLMGenerateResponse } from "./types.js";
import type { MetricsCollector } from "../metrics/run-metrics.js";

// ============================================
// INSTRUMENTED LLM CLIENT (DECORATOR)
// ============================================
//
// A transparent wrapper around any LLMClient that measures each generate()
// call — latency, token usage, and success — and reports it to a
// MetricsCollector, then returns the inner client's response unchanged.
//
// It is provider-agnostic: it works with the Ollama or Gemini client today,
// and the same pattern applies to a future Jev client so its calls appear in
// the same per-run report.

export class InstrumentedLLMClient implements LLMClient {
  constructor(
    private readonly inner: LLMClient,
    private readonly metrics: MetricsCollector
  ) {}

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse> {
    const callType: LLMCallType = options.metadata?.callType ?? "unknown";
    const start = performance.now();
    try {
      const response = await this.inner.generate(options);
      const promptTokens = response.usage?.promptTokens ?? 0;
      const completionTokens = response.usage?.completionTokens ?? 0;
      this.metrics.recordLLMCall({
        callType,
        latencyMs: performance.now() - start,
        promptTokens,
        completionTokens,
        totalTokens: response.usage?.totalTokens ?? promptTokens + completionTokens,
        ok: true,
      });
      return response;
    } catch (error) {
      this.metrics.recordLLMCall({
        callType,
        latencyMs: performance.now() - start,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        ok: false,
      });
      throw error;
    }
  }
}

/**
 * Wrap an LLM client for metrics collection. When the collector is disabled,
 * the original client is returned unchanged (zero overhead).
 */
export function instrumentLLMClient(inner: LLMClient, metrics: MetricsCollector): LLMClient {
  return metrics.isEnabled() ? new InstrumentedLLMClient(inner, metrics) : inner;
}
