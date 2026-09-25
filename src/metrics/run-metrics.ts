import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LLMCallType } from "../llm/types.js";

// ============================================
// RUN METRICS COLLECTOR
// ============================================
//
// An isolated, dependency-light collector for baseline performance metrics
// of a single program run. It records:
//   - Every LLM call (latency, token usage, success) tagged by purpose
//   - Process memory samples (RSS / heap) taken per turn
//   - Conversation throughput (turns, duration)
//   - Memory-store footprint (SQLite file size) and Cipher cache size
//   - How many past memories were retrieved vs. actually injected
//
// It has no dependencies on other project modules (only a type import from the
// LLM layer), so it can be reused unchanged when Jev is added later: wrap the
// Jev client the same way the LLM client is wrapped, and its calls land in the
// same per-run report for an apples-to-apples comparison.

/**
 * A single LLM call measurement reported by the instrumented client.
 */
export interface LLMCallSample {
  callType: LLMCallType;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  ok: boolean;
}

/**
 * A point-in-time process memory reading, taken once per turn.
 */
export interface MemorySample {
  turn: number;
  rssBytes: number;
  heapUsedBytes: number;
}

/**
 * Snapshot of Cipher's in-memory summary cache footprint.
 */
export interface CacheStatsSnapshot {
  summaryCacheEntries: number;
  pendingSummaries: number;
  conversationSummaryChars: number;
}

/**
 * Labelling metadata for a run, used to distinguish before/after Jev runs.
 */
export interface RunContext {
  provider?: string;
  model?: string;
  jevEnabled: boolean;
  gitSha?: string;
  label?: string;
  config?: Record<string, unknown>;
}

interface TokenTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface LatencyStats {
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

interface CallTypeBreakdown {
  calls: number;
  tokens: TokenTotals;
  latencyMs: LatencyStats;
}

/**
 * The serializable per-run report. Written to disk as JSON and diffable
 * across runs (e.g. baseline vs. Jev-enabled).
 */
export interface MetricsReport {
  schemaVersion: number;
  generatedAt: string;
  run: {
    startedAt: string;
    endedAt: string;
    durationMs: number;
    durationSec: number;
    turns: number;
    turnsPerMinute: number;
    jevEnabled: boolean;
    provider?: string;
    model?: string;
    gitSha?: string;
    label?: string;
    config?: Record<string, unknown>;
  };
  llm: {
    totalCalls: number;
    okCalls: number;
    errorCalls: number;
    tokens: TokenTotals;
    tokensPerTurn: number;
    latencyMs: LatencyStats;
    byCallType: Record<string, CallTypeBreakdown>;
  };
  memory: {
    samples: number;
    rssBytes: { peak: number; mean: number };
    heapUsedBytes: { peak: number; mean: number };
  };
  store: {
    dbSizeBytes: number | null;
    cache: CacheStatsSnapshot | null;
  };
  memories: {
    retrievedCandidates: number;
    injected: number;
    injectionRate: number | null;
  };
}

const SCHEMA_VERSION = 1;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumTokens(samples: LLMCallSample[]): TokenTotals {
  return samples.reduce<TokenTotals>(
    (acc, s) => ({
      promptTokens: acc.promptTokens + s.promptTokens,
      completionTokens: acc.completionTokens + s.completionTokens,
      totalTokens: acc.totalTokens + s.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1)
  );
  return sortedAsc[idx] ?? 0;
}

function latencyStats(values: number[]): LatencyStats {
  const count = values.length;
  if (count === 0) {
    return { count: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, minMs: 0, maxMs: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count,
    meanMs: round2(sum / count),
    p50Ms: round2(percentile(sorted, 50)),
    p95Ms: round2(percentile(sorted, 95)),
    minMs: round2(sorted[0] ?? 0),
    maxMs: round2(sorted[count - 1] ?? 0),
  };
}

function peak(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${round2(bytes / 1024)} KB`;
  return `${round2(mb)} MB`;
}

function timestampStamp(date: Date): string {
  const iso = date.toISOString();
  const datePart = iso.split("T")[0] ?? "0000-00-00";
  const timePart = (iso.split("T")[1] ?? "00:00:00").split(".")[0] ?? "00:00:00";
  return `${datePart}-${timePart.replace(/:/g, "")}`;
}

/**
 * Collects metrics for a single program run and produces a diffable report.
 * All methods are no-ops when the collector is disabled, so call sites never
 * need to guard on the enabled flag themselves.
 */
export class MetricsCollector {
  private readonly enabled: boolean;
  private startedAtMs = 0;
  private context: RunContext = { jevEnabled: false };
  private readonly llmSamples: LLMCallSample[] = [];
  private readonly memorySamples: MemorySample[] = [];
  private turns = 0;
  private retrievedCandidates = 0;
  private injectedMemories = 0;
  private dbSizeBytes: number | null = null;
  private cacheStats: CacheStatsSnapshot | null = null;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Mark the start of the run and record labelling metadata.
   */
  startRun(context: RunContext): void {
    if (!this.enabled) return;
    this.startedAtMs = Date.now();
    this.context = context;
  }

  /**
   * Record a single LLM call. Invoked by the instrumented LLM client.
   */
  recordLLMCall(sample: LLMCallSample): void {
    if (!this.enabled) return;
    this.llmSamples.push(sample);
  }

  /**
   * Increment the completed-turn counter.
   */
  recordTurn(): void {
    if (!this.enabled) return;
    this.turns += 1;
  }

  /**
   * Take a process memory reading, associated with the given turn number.
   */
  sampleMemory(turn: number): void {
    if (!this.enabled) return;
    const mem = process.memoryUsage();
    this.memorySamples.push({ turn, rssBytes: mem.rss, heapUsedBytes: mem.heapUsed });
  }

  /**
   * Record how many past-memory candidates were considered for injection.
   */
  addRetrievedCandidates(n: number): void {
    if (!this.enabled) return;
    this.retrievedCandidates += n;
  }

  /**
   * Record how many past memories were actually injected into a prompt.
   */
  addInjectedMemories(n: number): void {
    if (!this.enabled) return;
    this.injectedMemories += n;
  }

  /**
   * Snapshot the on-disk size of the memory store (SQLite file).
   */
  setDbSizeBytes(n: number): void {
    if (!this.enabled) return;
    this.dbSizeBytes = n;
  }

  /**
   * Snapshot Cipher's in-memory summary cache footprint.
   */
  setCacheStats(stats: CacheStatsSnapshot): void {
    if (!this.enabled) return;
    this.cacheStats = stats;
  }

  /**
   * Compute the aggregated report from everything collected so far.
   * Pure: can be called at any time (including mid-run on shutdown).
   */
  buildReport(): MetricsReport {
    const endedAtMs = Date.now();
    const durationMs = this.startedAtMs ? endedAtMs - this.startedAtMs : 0;
    const durationSec = round2(durationMs / 1000);
    const turnsPerMinute = durationMs > 0 ? round2((this.turns / durationMs) * 60000) : 0;

    const okCalls = this.llmSamples.filter((s) => s.ok).length;
    const errorCalls = this.llmSamples.length - okCalls;
    const tokens = sumTokens(this.llmSamples);
    const tokensPerTurn = this.turns > 0 ? round2(tokens.totalTokens / this.turns) : 0;

    const groups = new Map<LLMCallType, LLMCallSample[]>();
    for (const s of this.llmSamples) {
      const arr = groups.get(s.callType) ?? [];
      arr.push(s);
      groups.set(s.callType, arr);
    }
    const byCallType: Record<string, CallTypeBreakdown> = {};
    for (const [type, arr] of groups) {
      byCallType[type] = {
        calls: arr.length,
        tokens: sumTokens(arr),
        latencyMs: latencyStats(arr.map((s) => s.latencyMs)),
      };
    }

    const rssValues = this.memorySamples.map((s) => s.rssBytes);
    const heapValues = this.memorySamples.map((s) => s.heapUsedBytes);

    const injectionRate =
      this.retrievedCandidates > 0
        ? round2(this.injectedMemories / this.retrievedCandidates)
        : null;

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      run: {
        startedAt: new Date(this.startedAtMs || endedAtMs).toISOString(),
        endedAt: new Date(endedAtMs).toISOString(),
        durationMs,
        durationSec,
        turns: this.turns,
        turnsPerMinute,
        jevEnabled: this.context.jevEnabled,
        ...(this.context.provider !== undefined && { provider: this.context.provider }),
        ...(this.context.model !== undefined && { model: this.context.model }),
        ...(this.context.gitSha !== undefined && { gitSha: this.context.gitSha }),
        ...(this.context.label !== undefined && { label: this.context.label }),
        ...(this.context.config !== undefined && { config: this.context.config }),
      },
      llm: {
        totalCalls: this.llmSamples.length,
        okCalls,
        errorCalls,
        tokens,
        tokensPerTurn,
        latencyMs: latencyStats(this.llmSamples.map((s) => s.latencyMs)),
        byCallType,
      },
      memory: {
        samples: this.memorySamples.length,
        rssBytes: { peak: peak(rssValues), mean: mean(rssValues) },
        heapUsedBytes: { peak: peak(heapValues), mean: mean(heapValues) },
      },
      store: {
        dbSizeBytes: this.dbSizeBytes,
        cache: this.cacheStats,
      },
      memories: {
        retrievedCandidates: this.retrievedCandidates,
        injected: this.injectedMemories,
        injectionRate,
      },
    };
  }

  /**
   * Render a compact human-readable summary for the console.
   */
  formatSummary(report: MetricsReport = this.buildReport()): string {
    const lines: string[] = [];
    lines.push("================ RUN METRICS ================");
    lines.push(
      `Run:        ${report.run.turns} turns in ${report.run.durationSec}s ` +
        `(${report.run.turnsPerMinute} turns/min)` +
        (report.run.jevEnabled ? "  [Jev ON]" : "  [Jev OFF]")
    );
    if (report.run.provider || report.run.model) {
      lines.push(`Model:      ${report.run.provider ?? "?"} / ${report.run.model ?? "?"}`);
    }
    if (report.run.gitSha) {
      lines.push(`Commit:     ${report.run.gitSha}`);
    }
    lines.push("--- LLM ---------------------------------------");
    lines.push(
      `Calls:      ${report.llm.totalCalls} (${report.llm.errorCalls} errors)`
    );
    lines.push(
      `Tokens:     ${report.llm.tokens.totalTokens} total ` +
        `(prompt ${report.llm.tokens.promptTokens}, completion ${report.llm.tokens.completionTokens}), ` +
        `${report.llm.tokensPerTurn}/turn`
    );
    lines.push(
      `Latency:    mean ${report.llm.latencyMs.meanMs}ms, ` +
        `p50 ${report.llm.latencyMs.p50Ms}ms, p95 ${report.llm.latencyMs.p95Ms}ms, ` +
        `max ${report.llm.latencyMs.maxMs}ms`
    );
    for (const [type, b] of Object.entries(report.llm.byCallType)) {
      lines.push(
        `  ${type.padEnd(22)} ${String(b.calls).padStart(4)} calls, ` +
          `${String(b.tokens.totalTokens).padStart(7)} tok, ` +
          `mean ${b.latencyMs.meanMs}ms`
      );
    }
    lines.push("--- Memory footprint --------------------------");
    lines.push(
      `Process:    RSS peak ${formatBytes(report.memory.rssBytes.peak)} ` +
        `(mean ${formatBytes(report.memory.rssBytes.mean)}), ` +
        `heap peak ${formatBytes(report.memory.heapUsedBytes.peak)}`
    );
    lines.push(`DB file:    ${formatBytes(report.store.dbSizeBytes)}`);
    if (report.store.cache) {
      lines.push(
        `Cache:      ${report.store.cache.summaryCacheEntries} summaries, ` +
          `${report.store.cache.pendingSummaries} pending`
      );
    }
    lines.push("--- Past memories -----------------------------");
    lines.push(
      `Retrieved:  ${report.memories.retrievedCandidates} candidates, ` +
        `${report.memories.injected} injected` +
        (report.memories.injectionRate !== null
          ? ` (rate ${report.memories.injectionRate})`
          : "")
    );
    lines.push("=============================================");
    return lines.join("\n");
  }

  /**
   * Build the report and write it to `dir` as `metrics-<timestamp>.json`.
   * Returns the report and the path written, or null when disabled.
   */
  async writeReport(dir: string): Promise<{ report: MetricsReport; jsonPath: string } | null> {
    if (!this.enabled) return null;
    const report = this.buildReport();
    await mkdir(dir, { recursive: true });
    const stamp = timestampStamp(new Date(this.startedAtMs || Date.now()));
    const jsonPath = join(dir, `metrics-${stamp}.json`);
    await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
    return { report, jsonPath };
  }
}
