import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMClient, LLMGenerateOptions, LLMGenerateResponse } from "./types.js";

// ============================================
// GEMINI CLIENT IMPLEMENTATION
// ============================================
export class GeminiClient implements LLMClient {
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string = "gemini-pro") {
    if (!apiKey) {
      throw new Error("API Key is required. Set it in your .env file.");
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse> {
    const { systemPrompt, messages, temperature = 0.8, maxTokens = 300 } = options;

    // Filter out system messages and convert to Gemini format
    const conversationMessages = messages.filter((msg) => msg.role !== "system");
    const chatHistory = this.convertMessagesToGeminiFormat(conversationMessages);

    // Get the model with system instruction
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemPrompt, // Use systemInstruction parameter
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    });

    try {
      // Use chat API for conversations (supports history better)
      const history = chatHistory.length > 1 ? chatHistory.slice(0, -1) : [];
      const lastMessage = chatHistory[chatHistory.length - 1];

      const chat = model.startChat({
        history: history,
      });

      const result = await chat.sendMessage(lastMessage?.parts[0]?.text ?? "");
      const response = await result.response;

      return this.formatResponse(response);
    } catch (error) {
      throw new Error(`Gemini API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private formatResponse(response: any): LLMGenerateResponse {
    const text = response.text();

    // Extract token usage if available
    const usage = response.usageMetadata
      ? {
          promptTokens: response.usageMetadata.promptTokenCount,
          completionTokens: response.usageMetadata.candidatesTokenCount,
          totalTokens: response.usageMetadata.totalTokenCount,
        }
      : undefined;

    return {
      content: text,
      finishReason: response.candidates?.[0]?.finishReason,
      ...(usage && { usage }), // Conditionally include usage only if defined
    };
  }

  /**
   * Converts LLM messages to Gemini's chat format
   * Maps "assistant" role to "model" role for Gemini API
   */
  private convertMessagesToGeminiFormat(
    messages: Array<{ role: string; content: string }>
  ): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
    const geminiHistory: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === "user") {
        geminiHistory.push({
          role: "user",
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === "assistant") {
        geminiHistory.push({
          role: "model",
          parts: [{ text: msg.content }],
        });
      }
    }

    return geminiHistory;
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================
export function createGeminiClient(apiKey?: string, modelName?: string): GeminiClient {
  console.log("apiKey", apiKey);

  if (!apiKey || typeof apiKey !== "string") {
    throw new Error(
      "GEMINI_API_KEY is required. Either pass it as an argument or set it in your .env file."
    );
  }
  return new GeminiClient(apiKey, modelName);
}

