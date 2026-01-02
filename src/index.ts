// Load environment variables
import "dotenv/config";

import { createGeminiClient } from "./llm/index.js";

// Example: Initialize Gemini client
// This will be used by the orchestrator later
const geminiClient = createGeminiClient();

console.log("Gemini LLM client initialized successfully!");

// TODO: Initialize agents and start orchestrator here
