# Agent-to-Agent Conversation Model

A sophisticated system that enables autonomous conversations between AI agents with advanced context management, memory persistence, and conversation orchestration capabilities.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Components](#components)
  - [Agents](#agents)
  - [Orchestrators](#orchestrators)
  - [Memory System](#memory-system)
  - [LLM Integration](#llm-integration)
  - [Topic Management](#topic-management)
  - [Engagement Tracking](#engagement-tracking)
  - [Flow Management](#flow-management)
  - [Logging System](#logging-system)
  - [Plugin System](#plugin-system)
- [How Memory Storage Works](#how-memory-storage-works)
- [Installation & Setup](#installation--setup)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Component Interactions](#component-interactions)
- [Database Schema](#database-schema)
- [Logging](#logging)
- [Future Enhancements](#future-enhancements)
- [Contributing](#contributing)
- [License](#license)

## Introduction

This project implements an autonomous conversation system where two AI agents (Alice and Bob) engage in natural, context-aware dialogues. The system features intelligent context management, episodic memory storage, topic detection, engagement tracking, and advanced conversation orchestration through a dedicated orchestrator agent called "Cipher."

The system is designed to:
- Maintain long-running conversations with context preservation
- Learn from past conversations through episodic memory
- Dynamically manage context windows using LLM-based summarization
- Track conversation quality and engagement metrics  

The goal is to make these two AI agents communicate as humans would do.

## Features

### Core Features

- **Autonomous Agent Conversations**: Two AI agents (Alice and Bob) engage in natural, context-aware dialogues
- **Episodic Memory**: Storage of conversation history from the current chat in a cache
- **Persistent Memory**: Persistent storage of all conversations in SQLite database
- **Context Summarization**: LLM-based summarization to manage context windows efficiently with less token usage
- **Incremental Caching**: Smart caching system that only summarizes new messages
- **Past Memory Retrieval**: Agents can recall and reference past conversations
- **Topic Detection**: Automatic detection and tracking of conversation topics
- **Engagement Tracking**: Real-time monitoring of conversation quality and engagement
- **Flow Management**: Natural conversation flow with pauses, thinking, and acknowledgments
- **Dual Logging**: Separate logs for chat messages and system metrics

### Advanced Features

- **Hybrid Caching**: In-memory caching with database persistence for conversation summaries
- **Dynamic Brevity Reminders**: Automatic prompts to maintain concise responses
- **Response Length Trimming**: Automatic truncation of overly verbose responses
- **Graceful Shutdown**: Proper cleanup of resources on program termination

## Tech Stack

### Core Technologies

- **TypeScript** (v5.9.3): Primary programming language
- **Node.js**: Runtime environment
- **SQLite** (better-sqlite3 v11.10.0): Episodic memory storage
- **Ollama**: Local LLM provider (primary)
- **Google Gemini API** (@google/generative-ai v0.24.1): Alternative LLM provider

### Development Tools

- **tsx** (v4.21.0): TypeScript execution and watch mode
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **dotenv**: Environment variable management

### Project Structure

```
a2a_conv_model/
├── src/
│   ├── agents/          # Agent definitions and personalities
│   ├── orchestrator/    # Conversation orchestration logic
│   ├── memory/          # Episodic memory store
│   ├── llm/             # LLM client implementations
│   ├── topics/          # Topic detection and management
│   ├── metrics/         # Engagement tracking
│   ├── conversation/    # Flow management
│   ├── logger/          # Logging system
│   ├── config/          # Configuration management
│   └── index.ts         # Main entry point
├── conversations.db     # SQLite database
├── src/logs/            # Log files
└── package.json
```

## Architecture Overview

The system follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    ConversationOrchestrator                 │
│              (Main conversation flow controller)            │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Agent A    │ │   Agent B    │ │    Cipher    │
│   (Alice)    │ │    (Bob)     │ │ Orchestrator │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  LLM Client  │ │   Memory     │ │   Topic      │
│  (Ollama/    │ │    Store     │ │   Manager    │
│   Gemini)    │ │  (SQLite)    │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
```

### Key Architectural Principles

1. **Separation of Concerns**: Each component has a single, well-defined responsibility
2. **Dependency Injection**: Components receive dependencies through constructors
3. **Event-Driven**: Components communicate through events and callbacks
4. **Graceful Degradation**: System continues to function even if optional components fail

## Components

### Agents

**Location**: `src/agents/`

The agent system defines AI personalities that participate in conversations.

#### Agent Builder (`agent-builder.ts`)
- Creates agent instances with personality configurations
- Manages agent metadata (ID, name, personality traits)

#### Personalities
- **Alice** (`personalities/alice.ts`): A curious, thoughtful high-school history teacher from Acton, Massachusetts
- **Bob** (`personalities/bob.ts`): An easygoing, witty marketing professional from New York City
- **Cipher** (`personalities/cipher.ts`): The orchestrator agent (doesn't participate in conversations)

#### Prompt Builder (`prompt-builder.ts`)
- Constructs system prompts from personality configurations
- Builds context injection prompts with:
  - Past conversation memories
  - Topic guidance
  - Engagement reminders
  - Brevity prompts

#### Key Features
- Personality-based response generation
- Context-aware prompt construction
- Dynamic brevity reminders
- Natural conversation flow

### Orchestrators

**Location**: `src/orchestrator/`

#### ConversationOrchestrator (`index.ts`)

The main orchestrator that manages the conversation flow between agents.

**Responsibilities**:
- Alternating turns between agents
- Building conversation context
- Managing conversation state
- Retrieving past memories
- Handling conversation completion
- Writing chat logs

**Key Methods**:
- `run()`: Main conversation loop
- `executeTurn()`: Executes a single conversation turn
- `buildMessagesForLLM()`: Converts conversation state to LLM format
- `retrievePastMemories()`: Fetches relevant past conversations

#### CipherOrchestrator (`cipher-orchestrator.ts`)

The background orchestration agent that handles all non-conversational tasks.

**Responsibilities**:
- Context window management
- LLM-based summarization (current and past conversations)
- Incremental summary caching
- Memory retrieval with weighting
- Quality evaluation
- Plugin management
- Event logging

**Key Features**:
- **Incremental Summarization**: Only summarizes new messages, merges with previous summaries
- **Hybrid Caching**: In-memory cache with database persistence
- **Smart Context Management**: Automatically summarizes when context exceeds threshold
- **Past Memory Summarization**: Efficiently summarizes past conversations for context

**Key Methods**:
- `manageContextWindow()`: Manages conversation context, triggers summarization when needed
- `summarizeContextWithLLM()`: Summarizes current conversation context
- `summarizePastMemories()`: Summarizes past conversation memories
- `summarizeIncremental()`: Incrementally summarizes new messages
- `retrieveMemories()`: Retrieves weighted memories from past conversations
- `cleanup()`: Persists summaries to database on shutdown

### Memory System

**Location**: `src/memory/`

#### EpisodicMemoryStore (`store.ts`)

Manages persistent storage of conversations and messages in SQLite.

**Database Tables**:
1. **conversations**: Stores conversation metadata
   - Agent IDs and names
   - Turn counts
   - Completion status
   - LLM provider and model

2. **messages**: Stores individual messages
   - Conversation ID (foreign key)
   - Turn number
   - Role (user/assistant)
   - Content
   - Agent ID
   - Timestamps

3. **conversation_summaries**: Stores summarized contexts
   - Conversation ID (foreign key)
   - Message range (start-end)
   - Summary text
   - Timestamps

**Key Features**:
- Foreign key constraints for data integrity
- Indexed queries for performance
- Weighted memory retrieval
- Topic-based relevance scoring
- Summary persistence and retrieval

**Key Methods**:
- `createConversation()`: Creates a new conversation record
- `saveMessage()`: Saves a message to the database
- `getWeightedMemories()`: Retrieves weighted memories from past conversations
- `saveSummary()`: Persists conversation summaries
- `getSummaryByHash()`: Retrieves summaries by conversation and range
- `completeConversation()`: Marks conversation as complete

## How Memory Storage Works

This section explains in detail how the system stores, manages, and retrieves memory — both for the ongoing conversation and across past sessions.

---

### Two Types of Memory

The system maintains two conceptually distinct types of memory that work together:

**Episodic Memory** — the raw record of what was actually said:
- Every message generated by Alice or Bob is saved verbatim to the SQLite `messages` table immediately after it is produced
- Each record includes the conversation ID, turn number, the agent who spoke, the role (user/assistant), the full message content, and a timestamp
- This is the ground truth — it is never modified, deleted, or overwritten
- It represents the literal history of every conversation the agents have ever had

**Semantic Memory** — a compressed, meaning-preserving representation of what was discussed:
- As a conversation grows long, the system uses the LLM to produce concise summaries of older messages that have scrolled outside the active context window
- These summaries are stored in the `conversation_summaries` table in SQLite, keyed by the conversation ID and the message range they cover (e.g., messages 0–24)
- Summaries are not a replacement for raw messages — both exist simultaneously in the database
- The summaries serve as efficient, token-friendly stand-ins for older context when feeding history back to the LLM

---

### What Lives in the In-Memory Cache

During an active program run, `CipherOrchestrator` maintains a `summaryCache` — a plain JavaScript `Map` held in process memory:

- The cache maps a range key (e.g., `range-0-24`) to the summary text produced for that range of messages
- It is populated in two ways: either freshly generated during the current run, or loaded from the SQLite database at the start of a conversation
- Every time the context window needs to be managed, the cache is checked first before any LLM call is made — this avoids redundant summarization work
- The cache also tracks `lastSummarizedCount`, an integer that records how many older messages have already been summarized, so only truly new messages are processed on subsequent calls
- Summaries generated during the run are queued in a `pendingSummaries` list and are not written to the database immediately — they are held in memory for the duration of the session

---

### What Lives in the SQLite Database

The database is the durable, persistent layer. It stores three categories of data:

- **`conversations` table**: One row per conversation session, recording which agents participated, how many turns occurred, whether the conversation completed, and which LLM was used
- **`messages` table**: One row per message, storing the full verbatim content of every turn across all conversations — this is the episodic record
- **`conversation_summaries` table**: One row per summarized range, storing the compressed semantic summary alongside the message range it covers and the conversation it belongs to — this is the semantic record

The database is written to at two distinct moments:
- **Per-turn**: Every message is saved to the `messages` table immediately after the LLM generates it, so no message is ever lost even if the program crashes
- **On shutdown**: All summaries accumulated in the `pendingSummaries` queue are flushed to the `conversation_summaries` table during `CipherOrchestrator.cleanup()`, which is triggered by the graceful shutdown handler

---

### How Summarization Works (Batched Incremental Strategy)

Summarization is triggered by `CipherOrchestrator.manageContextWindow()` whenever the number of messages in the active conversation exceeds the `MAX_CONTEXT_MESSAGES` threshold (default: 25):

- The most recent N messages are kept as-is and passed directly to the LLM — these form the "active window"
- All messages older than that window form the "older segment" and are represented by a single rolling summary instead of raw messages
- The system uses a **batched incremental approach** controlled by `SUMMARIZATION_BATCH_SIZE` (default: 5):
  - As each new turn runs, one more message slides from the active window into the older segment
  - The LLM summarization merge is **not triggered on every turn** — it only fires once at least `SUMMARIZATION_BATCH_SIZE` new messages have accumulated in the older segment since the last merge
  - Between batches, the existing summary is reused as-is with no LLM call, keeping per-turn cost to a single LLM call (the conversation response itself)
  - When the batch threshold is reached, only those new batch messages are sent to the LLM alongside the existing summary — the LLM merges them into a single updated 2–3 sentence summary that replaces the previous one
- When the threshold is first crossed (no prior summary exists), a full summarization of all current older messages is performed immediately regardless of batch size
- If the LLM is unavailable or the call fails, the system falls back to a keyword-frequency-based summarization that extracts the most common meaningful words and the first/last message snippets

The final output is always a **single summary string** prepended to the active message window before being sent to the LLM — the LLM receives `[1 summary message] + [N active messages]` regardless of how long the conversation has been running.

---

### How and When the Summary Is Stored

The summary goes through two storage stages during its lifecycle:

1. **In-memory cache first** — the moment a new summary is generated (either the initial full summary or a batched incremental merge), it is immediately stored in `summaryCache`, a `Map` held in process memory, keyed by its message range (e.g., `range-0-30`). It is also placed in a `pendingSummaries` queue. Only the latest summary is kept in this queue — any prior pending entry is replaced, so only one row per conversation ever needs to be written to the database
2. **SQLite database on shutdown** — when the program terminates (graceful SIGINT/SIGTERM or normal completion), `CipherOrchestrator.cleanup()` flushes the `pendingSummaries` queue to the `conversation_summaries` table via `saveSummary()`. This write-back strategy means the database always ends up with exactly one summary row per conversation, representing the most up-to-date merged state at the time of shutdown

Between these two stages, the in-memory cache is the sole source of truth for the active session. The database is only consulted at startup (to restore a prior summary) and written to at shutdown (to persist the final summary).

---

### How the Cache Is Checked Before Summarizing

Before making any LLM call for summarization, the system follows a strict three-step lookup:

1. **In-memory cache first** — check `summaryCache` for the exact range key. If found, return immediately with no LLM call and no database query
2. **Database cache second** — if not in memory, query the `conversation_summaries` table for the most recent summary for this conversation. If found, load it into the in-memory cache and return it
3. **Generate incrementally** — only if neither cache has a match and the batch threshold has been reached, perform the batched incremental LLM merge, store the result in the in-memory cache, and replace the pending database entry

This three-tier lookup combined with the batch gate ensures that across a long-running infinite conversation, the LLM is called for summarization only once every `SUMMARIZATION_BATCH_SIZE` turns after the context threshold is crossed — not on every turn.

---

### How Past Conversation Memories Are Retrieved and Fed Back

When a new conversation starts, the system can optionally retrieve memories from **previous, completed conversations** between the same two agents:

- `EpisodicMemoryStore.getWeightedMemories()` queries the `messages` table across all past completed conversations for the agent pair
- Each retrieved message is scored using a weighted formula:
  - **Recency (40%)**: Messages from more recent conversations score higher; scores decay linearly over 7 days
  - **Quality (30%)**: Messages from longer conversations score higher, as longer conversations indicate more substantive exchanges
  - **Frequency (20%)**: Uses conversation length as a proxy for topic frequency
  - **Relevance (10%)**: If the current topic is known, keyword overlap between the message and the topic boosts the score
- The top-weighted messages are selected and passed to `CipherOrchestrator.summarizePastMemories()`
- The LLM is asked to produce a 1–2 sentence summary for each retrieved memory, focusing on key points and context that would be useful for natural conversation continuation
- These summarized memories are returned as concise strings and injected into the agent's system prompt as subtle background knowledge — phrased as things the agent "naturally remembers," never as explicit memory retrieval

---

### How Memory Is Restored on Program Restart

When the program starts a new run and a conversation is initialized:

- `CipherOrchestrator.setConversationId()` is called with the new conversation's database ID
- This immediately triggers `loadSummariesFromDatabase()`, which queries the `conversation_summaries` table for any summaries already persisted for that conversation
- All found summaries are loaded into the in-memory `summaryCache` and `lastSummarizedCount` is set to the highest range end found
- This means that if a long-running conversation was interrupted and restarted, the system picks up exactly where summarization left off — it does not re-summarize messages that were already summarized in a previous run

For past conversation memories (from entirely different sessions), no special restoration is needed — they are always queried fresh from the `messages` table at the start of each new conversation.

---

### LLM Integration

**Location**: `src/llm/`

Supports multiple LLM providers through a unified interface.

#### Ollama Client (`ollama-client.ts`)
- Local LLM provider
- Default provider for the system
- Configured via `OLLAMA_HOST_URL` environment variable

#### Gemini Client (`gemini-client.ts`)
- Google Gemini API integration
- Alternative LLM provider
- Requires `GEMINI_API_KEY` environment variable

#### LLM Interface (`types.ts`)
- Unified interface for all LLM providers
- Standardized message format
- Response structure with usage metrics

**Key Features**:
- Provider abstraction
- Consistent API across providers
- Token usage tracking
- Error handling

### Topic Management

**Location**: `src/topics/`

#### TopicManager (`manager.ts`)

Detects and tracks conversation topics in real-time.

**Features**:
- Real-time topic detection
- Topic transition tracking
- Lull detection (conversation stagnation)
- Topic suggestion for engagement

**Key Methods**:
- `analyzeMessage()`: Analyzes message for topic content
- `detectTopic()`: Detects dominant topic in message
- `detectLull()`: Detects conversation lulls
- `suggestTopic()`: Suggests topics to revive conversation

#### TopicDetector (`topic-detector.ts`)
- Keyword-based topic detection
- Topic scoring and ranking
- Customizable topic definitions

### Engagement Tracking

**Location**: `src/metrics/`

#### EngagementTracker (`engagement-tracker.ts`)

Monitors conversation quality and engagement levels.

**Metrics Tracked**:
- Message length (too short or too long)
- Response quality
- Engagement score (0-1)
- Low/high engagement thresholds

**Features**:
- Sliding window analysis
- Real-time engagement scoring
- Automatic quality warnings
- Engagement-based interventions

### Flow Management

**Location**: `src/conversation/`

#### FlowManager (`flow-manager.ts`)

Manages natural conversation flow and pacing.

**Features**:
- Pause insertion for natural pacing
- Thinking indicators
- Acknowledgment generation
- Interruption handling (optional)

**Configurable Options**:
- Enable/disable pauses
- Thinking probability
- Acknowledgment probability
- Pause duration ranges

### Logging System

**Location**: `src/logger/`

#### Logger (`logger.ts`)

Comprehensive logging system with file and console output.

**Log Levels**:
- `DEBUG`: Detailed debugging information
- `INFO`: General information
- `WARN`: Warning messages
- `ERROR`: Error messages

#### ChatLogWriter (`chat-log-writer.ts`)

Dedicated writer for chat messages only (separate from system logs).

**Features**:
- Separate log file for chat messages
- Timestamped entries
- Agent identification
- Clean formatting

**Log Files**:
- `chat-{timestamp}.log`: Chat messages only
- `info-{timestamp}.log`: Info-level system logs
- `warn-{timestamp}.log`: Warning-level system logs

### Plugin System

**Location**: `src/orchestrator/plugins/`

Extensible plugin architecture for future integrations.

#### BasePlugin (`base-plugin.ts`)
- Abstract base class for all plugins
- Standardized plugin interface
- Event hook system

#### VectorDBPlugin (`vector-db-plugin.ts`)
- Stub for future vector database integration
- Enables semantic search capabilities

#### LangfusePlugin (`langfuse-plugin.ts`)
- Stub for future Langfuse integration
- Enables LLM observability and analytics

## Installation & Setup

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Ollama (for local LLM) or Google Gemini API key

### Installation Steps

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd a2a_conversation_model
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a `.env` file in the root directory by following the `.env.text` file for reference:
   ```env
   # LLM Configuration
   OLLAMA_HOST_URL=http://localhost:11434
   MODEL_NAME=llama2
   # Or for Gemini:
   # GEMINI_API_KEY=your_api_key_here
   
   # Node Build
   NODE_BUILD=development
   
   # Logging
   LOG_LEVEL=info
   LOG_DIR=src/logs
   
   # Context Management
   MAX_CONTEXT_MESSAGES=25
   SUMMARIZATION_BATCH_SIZE=5
   
   # Server (optional)
   PORT=3000
   ```

4. **Start Ollama** (if using local LLM):
   ```bash
   ollama serve
   ```

5. **Run the application**:
   ```bash
   # Development mode (with watch)
   npm run dev
   
   # Production mode
   npm start
   ```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OLLAMA_HOST_URL` | Ollama server URL | - | Yes (if using Ollama) |
| `GEMINI_API_KEY` | Google Gemini API key | - | Yes (if using Gemini) |
| `MODEL_NAME` | LLM model name | - | Yes |
| `NODE_BUILD` | Build environment | - | Yes |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | `info` | No |
| `LOG_DIR` | Directory for log files | `src/logs` | No |
| `MAX_CONTEXT_MESSAGES` | Messages before summarization | `25` | No |
| `SUMMARIZATION_BATCH_SIZE` | New messages in older segment before a summary merge fires | `5` | No |
| `PORT` | Server port | `3000` | No |

### Configuration File

Configuration is managed in `src/config/config.ts`:
- Loads environment variables
- Provides type-safe configuration
- Validates required variables
- Sets sensible defaults

## Usage

### Basic Usage

The system runs autonomously once started. Agents will:
1. Initialize with their personalities
2. Retrieve past memories (if available)
3. Begin conversation with a greeting
4. Alternate turns automatically
5. Save all messages to the database
6. Manage context through summarization
7. Track engagement and topics
8. Log all activity

### Programmatic Usage

```typescript
import { ConversationOrchestrator } from "./orchestrator/index.js";
import { createAgent } from "./agents/agent-builder.js";
import { alicePersonality, bobPersonality } from "./agents/personalities/index.js";

// Create agents
const alice = createAgent("alice", alicePersonality, "Bob");
const bob = createAgent("bob", bobPersonality, "Alice");

// Create orchestrator
const orchestrator = new ConversationOrchestrator({
  agentA: alice,
  agentB: bob,
  llmClient: llmClient,
  memoryStore: memoryStore,
  // ... other config
});

// Run conversation
await orchestrator.run();
```

### Customization

#### Changing Agent Personalities

Edit personality files in `src/agents/personalities/`:
- Modify traits, background, speaking style
- Adjust interests and quirks
- Customize avoidances

#### Adjusting Summarization Threshold and Batch Size

Set these in `.env` to control how context is managed:
```env
MAX_CONTEXT_MESSAGES=30    # Keep 30 most recent messages in the active window
SUMMARIZATION_BATCH_SIZE=5 # Trigger a summary merge every 5 new messages in the older segment
```

A smaller `SUMMARIZATION_BATCH_SIZE` keeps the summary more up-to-date at the cost of more LLM calls. A larger value reduces LLM overhead but means the summary may lag slightly behind the most recent older messages.

#### Enabling/Disabling Features

Modify `src/index.ts`:
- `usePastMemories`: Enable past memory retrieval
- `infiniteMode`: Run conversation indefinitely
- `enablePauses`: Enable natural pauses
- `enableThinking`: Enable thinking indicators

## Component Interactions

### Conversation Flow

```
1. ConversationOrchestrator.run()
   │
   ├─> Initialize conversation state
   ├─> Retrieve past memories (turns 2-3)
   │   └─> CipherOrchestrator.retrieveMemories()
   │       └─> EpisodicMemoryStore.getWeightedMemories()
   │           └─> CipherOrchestrator.summarizePastMemories()
   │
   ├─> Loop: For each turn
   │   │
   │   ├─> Get current agent
   │   ├─> Build conversation context
   │   │   └─> CipherOrchestrator.manageContextWindow()
   │   │       ├─> Check if summarization needed
   │   │       ├─> Summarize if threshold exceeded
   │   │       └─> Update context
   │   │
   │   ├─> Build prompt
   │   │   └─> PromptBuilder.buildFullPrompt()
   │   │       ├─> System prompt from personality
   │   │       ├─> Context injection
   │   │       └─> Topic/engagement guidance
   │   │
   │   ├─> Generate response
   │   │   └─> LLMClient.generate()
   │   │
   │   ├─> Process response
   │   │   ├─> FlowManager.applyFlow()
   │   │   ├─> EngagementTracker.track()
   │   │   └─> TopicManager.analyzeMessage()
   │   │
   │   ├─> Save message
   │   │   └─> EpisodicMemoryStore.saveMessage()
   │   │
   │   └─> Write chat log
   │       └─> ChatLogWriter.write()
   │
   └─> Cleanup
       ├─> CipherOrchestrator.cleanup()
       │   └─> Persist summaries to database
       └─> EpisodicMemoryStore.close()
```

### Context Management Flow

```
When conversation exceeds MAX_CONTEXT_MESSAGES:
│
├─> CipherOrchestrator.manageContextWindow()
│   │
│   ├─> Check if summary exists in cache
│   │   └─> summaryCache.get(rangeKey)
│   │
│   ├─> If not cached:
│   │   ├─> Get previous summary (if exists)
│   │   ├─> Get new messages since last summary
│   │   ├─> SummarizeIncremental()
│   │   │   └─> LLMClient.generate() (summarization prompt)
│   │   ├─> Merge with previous summary
│   │   └─> Store in summaryCache
│   │
│   └─> Return summarized context
│
└─> On program termination:
    └─> CipherOrchestrator.cleanup()
        └─> Persist all summaries to database
            └─> EpisodicMemoryStore.saveSummary()
```

### Memory Retrieval Flow

```
ConversationOrchestrator.retrievePastMemories()
│
└─> CipherOrchestrator.retrieveMemories()
    │
    ├─> EpisodicMemoryStore.getWeightedMemories()
    │   ├─> Query past conversations
    │   ├─> Calculate weights (recency, relevance, quality)
    │   └─> Return top N memories
    │
    ├─> If summarization enabled:
    │   └─> CipherOrchestrator.summarizePastMemories()
    │       ├─> Batch memories
    │       ├─> LLMClient.generate() (summarization prompt)
    │       └─> Return summarized memories
    │
    └─> Return weighted memories
```

## Database Schema

### conversations Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `agent_a_id` | TEXT | First agent ID |
| `agent_b_id` | TEXT | Second agent ID |
| `agent_a_name` | TEXT | First agent name |
| `agent_b_name` | TEXT | Second agent name |
| `max_turns` | INTEGER | Maximum turns |
| `total_turns` | INTEGER | Actual turn count |
| `is_complete` | BOOLEAN | Completion status |
| `llm_provider` | TEXT | LLM provider used |
| `model_name` | TEXT | Model name used |
| `created_at` | DATETIME | Creation timestamp |
| `completed_at` | DATETIME | Completion timestamp |

### messages Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `conversation_id` | INTEGER | Foreign key to conversations |
| `turn_number` | INTEGER | Turn number in conversation |
| `role` | TEXT | Role (user/assistant) |
| `content` | TEXT | Message content |
| `agent_id` | TEXT | Agent who sent message |
| `created_at` | DATETIME | Creation timestamp |

### conversation_summaries Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `conversation_id` | INTEGER | Foreign key to conversations |
| `message_range_start` | INTEGER | Start of message range |
| `message_range_end` | INTEGER | End of message range |
| `summary` | TEXT | Summarized content |
| `created_at` | DATETIME | Creation timestamp |

### Indexes

- `idx_messages_conversation`: Index on `messages.conversation_id`
- `idx_messages_turn`: Index on `messages(conversation_id, turn_number)`
- `idx_conversations_agents`: Index on `conversations(agent_a_id, agent_b_id)`
- `idx_summaries_conversation`: Index on `conversation_summaries.conversation_id`
- `idx_summaries_range`: Index on `conversation_summaries(conversation_id, message_range_start, message_range_end)`

## Logging

### Log Files

The system generates multiple log files per run:

1. **Chat Log** (`chat-{timestamp}.log`):
   - Contains only chat messages
   - Clean, readable format
   - Timestamped entries
   - Agent identification

2. **Info Log** (`info-{timestamp}.log`):
   - General system information
   - Component initialization
   - Conversation events
   - Memory operations

3. **Warning Log** (`warn-{timestamp}.log`):
   - Warning messages
   - Non-critical errors
   - Degraded functionality notices

### Log Format

```
[YYYY-MM-DD HH:MM:SS] [LEVEL] [COMPONENT] Message
```

Example:
```
[2026-02-08 15:17:05] [INFO] [ConversationOrchestrator] Turn 1: Alice speaking
[2026-02-08 15:17:06] [INFO] [CipherOrchestrator] Context window managed: 5 messages
```

## Future Enhancements

### Planned Features

1. **Vector Database Integration**
   - Semantic search for memories
   - Improved relevance scoring
   - Vector embeddings for messages

2. **Langfuse Integration**
   - LLM observability
   - Token usage analytics
   - Performance monitoring

3. **Multi-Agent Conversations**
   - Support for 3+ agents
   - Group conversation dynamics
   - Role-based interactions

4. **Advanced Topic Modeling**
   - NLP-based topic extraction
   - Topic evolution tracking
   - Sentiment analysis

5. **Web Interface**
   - Real-time conversation viewer
   - Memory browser
   - Analytics dashboard

6. **Export/Import**
   - Conversation export formats
   - Memory backup/restore
   - Configuration templates

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Follow code style**: Run `npm run lint` and `npm run format`
4. **Write tests**: Add tests for new features
5. **Commit changes**: Use clear, descriptive commit messages
6. **Push to branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**: Provide detailed description of changes

### Development Workflow

```bash
# Install dependencies
npm install

# Run type checking
npm run typecheck

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Run in development mode
npm run dev
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ by Kartikey Hebbar**
