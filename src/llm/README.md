# LLM Service - Gemini Integration

This module provides a Gemini LLM client for the Agent2Agent conversation system.

## Setup

1. **Install dependencies:**

   ```bash
   npm install @google/generative-ai dotenv
   ```

2. **Get a Gemini API Key:**
   - Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Create an API key
   - Copy the key

3. **Create a `.env` file in the project root:**
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

## Usage

```typescript
import { createGeminiClient } from "./llm/index.js";
import type { LLMMessage } from "./llm/index.js";

// Initialize the client
const client = createGeminiClient(); // Reads GEMINI_API_KEY from .env
// Or pass the key directly:
// const client = createGeminiClient("your-api-key");

// Generate a response
const messages: LLMMessage[] = [{ role: "user", content: "Hello, how are you?" }];

const response = await client.generate({
  systemPrompt: "You are a friendly assistant.",
  messages: messages,
  temperature: 0.8,
  maxTokens: 300,
});

console.log(response.content);
```

## API

### `createGeminiClient(apiKey?: string, modelName?: string): GeminiClient`

Creates a new Gemini client instance.

- `apiKey`: Optional API key (defaults to `process.env.GEMINI_API_KEY`)
- `modelName`: Optional model name (defaults to `"gemini-pro"`)

### `client.generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse>`

Generates a response from the LLM.

**Options:**

- `systemPrompt`: System instruction for the model
- `messages`: Array of conversation messages
- `temperature`: Optional temperature (0-1, default: 0.8)
- `maxTokens`: Optional max output tokens (default: 300)

**Returns:**

- `content`: The generated text
- `finishReason`: Why generation stopped
- `usage`: Token usage information

## Models

Supported Gemini models:

- `gemini-pro` (default)
- `gemini-1.5-pro`
- `gemini-1.5-flash`
