import type { LLMClient, LLMGenerateOptions, LLMGenerateResponse } from "./types.js";

// ============================================
// OLLAMA CLIENT IMPLEMENTATION
// ============================================
export class OllamaClient implements LLMClient {
  private baseUrl: string;
  private modelName: string;

  constructor(baseUrl: string = "http://localhost:11434", modelName: string = "llama3") {
    this.baseUrl = baseUrl;
    this.modelName = modelName;
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse> {
    const { systemPrompt, messages, temperature = 0.8, maxTokens = 300 } = options;

    // Convert messages to Ollama format
    // Ollama supports system/user/assistant roles directly
    const ollamaMessages = this.convertMessagesToOllamaFormat(messages, systemPrompt);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: ollamaMessages,
          options: {
            temperature,
            num_predict: maxTokens, // Ollama uses num_predict instead of max_tokens
          },
          stream: false, // We want the complete response
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      return this.formatResponse(data);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Ollama API error: ${error.message}`);
      }
      throw new Error(`Ollama API error: ${String(error)}`);
    }
  }

  private formatResponse(response: any): LLMGenerateResponse {
    // Ollama response structure: { message: { content: string, role: string }, ... }
    const content = response.message?.content || "";

    // Ollama may provide token usage in response.prompt_eval_count and response.eval_count
    const usage = response.prompt_eval_count !== undefined
      ? {
          promptTokens: response.prompt_eval_count,
          completionTokens: response.eval_count,
          totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
        }
      : undefined;

    return {
      content,
      finishReason: response.done ? "stop" : "incomplete",
      ...(usage !== undefined ? { usage } : {}),
    };
  }

  /**
   * Converts LLM messages to Ollama format
   * Ollama supports system/user/assistant roles directly
   */
  private convertMessagesToOllamaFormat(
    messages: Array<{ role: string; content: string }>,
    systemPrompt: string
  ): Array<{ role: "system" | "user" | "assistant"; content: string }> {
    const ollamaMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

    // Add system prompt as the first message if provided
    if (systemPrompt) {
      ollamaMessages.push({
        role: "system",
        content: systemPrompt,
      });
    }

    // Convert conversation messages
    for (const msg of messages) {
      if (msg.role === "system") {
        // System messages are already handled above, skip duplicates
        continue;
      } else if (msg.role === "user" || msg.role === "assistant") {
        ollamaMessages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    return ollamaMessages;
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================
export function createOllamaClient(
  baseUrl?: string,
  modelName?: string
): OllamaClient {
  // Access process.env via globalThis to avoid TypeScript errors when types: [] is set
  const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  
  const url = baseUrl || env?.["OLLAMA_BASE_URL"] || "http://localhost:11434";
  const model = modelName || env?.["OLLAMA_MODEL"] || "llama3";

  return new OllamaClient(url, model);
}

