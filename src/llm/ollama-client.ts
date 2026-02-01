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

  /**
   * Generate a response from the Ollama API using the provided messages and system prompt.
   * Handles timeout, connection errors, and converts responses to the standard format.
   */
  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse> {
    const { systemPrompt, messages, temperature = 0.8, maxTokens = 300 } = options;

    // Convert messages to Ollama format
    // Ollama supports system/user/assistant roles directly
    const ollamaMessages = this.convertMessagesToOllamaFormat(messages, systemPrompt);

    const url = `${this.baseUrl}/api/chat`;
    const requestBody = {
      model: this.modelName,
      messages: ollamaMessages,
      options: {
        temperature,
        num_predict: maxTokens, // Ollama uses num_predict instead of max_tokens
      },
      stream: false, // We want the complete response
    };

    try {
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 60000); // 60 second timeout

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error) {
          if (fetchError.name === "AbortError") {
            throw new Error(`Ollama API timeout: Request took longer than 60 seconds. Model: "${this.modelName}", URL: ${url}`);
          }
          throw new Error(`Ollama fetch error: ${fetchError.message} (URL: ${url}, Model: ${this.modelName})`);
        }
        throw new Error(`Ollama fetch error: ${String(fetchError)} (URL: ${url}, Model: ${this.modelName})`);
      }

      if (!response.ok) {
        let errorText = "";
        try {
          errorText = await response.text();
        } catch {
          errorText = "Could not read error response";
        }
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error(`Ollama response parsing error: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
      }

      return this.formatResponse(data);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("timeout")) {
          throw error; // Already formatted
        }
        if (error.message.includes("fetch") || error.message.includes("ECONNREFUSED")) {
          throw new Error(`Ollama connection error: ${error.message}. Check if Ollama is running at ${url}`);
        }
        // Re-throw if already formatted, otherwise wrap
        if (error.message.includes("Ollama")) {
          throw error;
        }
        throw new Error(`Ollama API error: ${error.message} (URL: ${url}, Model: ${this.modelName})`);
      }
      throw new Error(`Ollama API error: ${String(error)} (URL: ${url}, Model: ${this.modelName})`);
    }
  }

  /**
   * Format the Ollama API response into the standard LLM response format.
   * Extracts content, determines finish reason, and calculates token usage if available.
   */
  private formatResponse(response: any): LLMGenerateResponse {
    // Ollama response structure: { message: { content: string, role: string }, ... }
    const content = response.message?.content || "";

    // Ollama may provide token usage in response.prompt_eval_count and response.eval_count
    const usage =
      response.prompt_eval_count !== undefined
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

/**
 * Create an Ollama client instance with base URL and model configuration.
 * Falls back to environment variables or defaults if arguments are not provided.
 */
export function createOllamaClient(baseUrl?: string, modelName?: string): OllamaClient {
  // Access process.env via globalThis to avoid TypeScript errors when types: [] is set
  const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;

  const url = baseUrl || env?.["OLLAMA_BASE_URL"] || "http://localhost:11434";
  const model = modelName || env?.["OLLAMA_MODEL"] || "llama3";

  return new OllamaClient(url, model);
}
