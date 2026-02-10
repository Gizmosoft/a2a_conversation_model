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

#### Adjusting Summarization Threshold

Set `MAX_CONTEXT_MESSAGES` in `.env`:
```env
MAX_CONTEXT_MESSAGES=30  # Summarize after 30 messages
```

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
