import Database from "better-sqlite3";
import type { ConversationRecord, MessageRecord, PastConversationSummary } from "./types.js";

// ============================================
// EPISODIC MEMORY STORE
// ============================================
export class EpisodicMemoryStore {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = "conversations.db") {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  // ============================================
  // DATABASE INITIALIZATION
  // ============================================
  private initializeSchema(): void {
    // Enable foreign keys
    this.db.pragma("foreign_keys = ON");

    // Create conversations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_a_id TEXT NOT NULL,
        agent_b_id TEXT NOT NULL,
        agent_a_name TEXT NOT NULL,
        agent_b_name TEXT NOT NULL,
        max_turns INTEGER NOT NULL,
        total_turns INTEGER DEFAULT 0,
        is_complete BOOLEAN DEFAULT 0,
        llm_provider TEXT,
        model_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `);

    // Create messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        turn_number INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation 
      ON messages(conversation_id);
      
      CREATE INDEX IF NOT EXISTS idx_messages_turn 
      ON messages(conversation_id, turn_number);
      
      CREATE INDEX IF NOT EXISTS idx_conversations_agents 
      ON conversations(agent_a_id, agent_b_id);
    `);
  }

  // ============================================
  // CONVERSATION OPERATIONS
  // ============================================

  /**
   * Create a new conversation record
   */
  createConversation(conversation: ConversationRecord): number {
    const stmt = this.db.prepare(`
      INSERT INTO conversations (
        agent_a_id, agent_b_id, agent_a_name, agent_b_name,
        max_turns, total_turns, is_complete, llm_provider, model_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      conversation.agentAId,
      conversation.agentBId,
      conversation.agentAName,
      conversation.agentBName,
      conversation.maxTurns,
      conversation.totalTurns,
      conversation.isComplete ? 1 : 0,
      conversation.llmProvider ?? null,
      conversation.modelName ?? null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Update conversation metadata
   */
  updateConversation(
    conversationId: number,
    updates: Partial<Pick<ConversationRecord, "totalTurns" | "isComplete">>
  ): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.totalTurns !== undefined) {
      fields.push("total_turns = ?");
      values.push(updates.totalTurns);
    }

    if (updates.isComplete !== undefined) {
      fields.push("is_complete = ?");
      values.push(updates.isComplete ? 1 : 0);

      if (updates.isComplete) {
        fields.push("completed_at = CURRENT_TIMESTAMP");
      }
    }

    if (fields.length === 0) return;

    values.push(conversationId);
    const stmt = this.db.prepare(`UPDATE conversations SET ${fields.join(", ")} WHERE id = ?`);
    stmt.run(...values);
  }

  /**
   * Get a conversation by ID
   */
  getConversation(conversationId: number): ConversationRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT 
        id, agent_a_id as agentAId, agent_b_id as agentBId,
        agent_a_name as agentAName, agent_b_name as agentBName,
        max_turns as maxTurns, total_turns as totalTurns,
        is_complete as isComplete, llm_provider as llmProvider,
        model_name as modelName, created_at as createdAt,
        completed_at as completedAt
      FROM conversations
      WHERE id = ?
    `);

    const row = stmt.get(conversationId) as
      | {
          id: number;
          agentAId: string;
          agentBId: string;
          agentAName: string;
          agentBName: string;
          maxTurns: number;
          totalTurns: number;
          isComplete: number;
          llmProvider?: string;
          modelName?: string;
          createdAt: string;
          completedAt?: string | null;
        }
      | undefined;
    if (!row) return undefined;

    const record: ConversationRecord = {
      id: row.id,
      agentAId: row.agentAId,
      agentBId: row.agentBId,
      agentAName: row.agentAName,
      agentBName: row.agentBName,
      maxTurns: row.maxTurns,
      totalTurns: row.totalTurns,
      isComplete: row.isComplete === 1,
    };

    if (row.llmProvider) record.llmProvider = row.llmProvider;
    if (row.modelName) record.modelName = row.modelName;
    if (row.createdAt) record.createdAt = new Date(row.createdAt);
    if (row.completedAt) record.completedAt = new Date(row.completedAt);

    return record;
  }

  // ============================================
  // MESSAGE OPERATIONS
  // ============================================

  /**
   * Save a message to the database
   */
  saveMessage(message: MessageRecord): number {
    const stmt = this.db.prepare(`
      INSERT INTO messages (
        conversation_id, turn_number, role, content, agent_id
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      message.conversationId,
      message.turnNumber,
      message.role,
      message.content,
      message.agentId
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get all messages for a conversation
   */
  getMessages(conversationId: number): MessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, conversation_id as conversationId, turn_number as turnNumber,
        role, content, agent_id as agentId, created_at as createdAt
      FROM messages
      WHERE conversation_id = ?
      ORDER BY turn_number ASC, id ASC
    `);

    const rows = stmt.all(conversationId) as Array<{
      id: number;
      conversationId: number;
      turnNumber: number;
      role: string;
      content: string;
      agentId: string;
      createdAt: string;
    }>;
    return rows.map((row) => {
      const message: MessageRecord = {
        id: row.id,
        conversationId: row.conversationId,
        turnNumber: row.turnNumber,
        role: row.role as "user" | "assistant",
        content: row.content,
        agentId: row.agentId,
      };
      if (row.createdAt) message.createdAt = new Date(row.createdAt);
      return message;
    });
  }

  // ============================================
  // MEMORY RETRIEVAL OPERATIONS
  // ============================================

  /**
   * Get past conversation summaries for an agent pair
   */
  getPastConversations(
    agentAId: string,
    agentBId: string,
    limit: number = 5
  ): PastConversationSummary[] {
    // Get conversations where these agents participated
    const stmt = this.db.prepare(`
      SELECT 
        c.id as conversationId,
        c.agent_a_name as agentAName,
        c.agent_b_name as agentBName,
        c.total_turns as totalTurns,
        c.created_at as createdAt
      FROM conversations c
      WHERE (
        (c.agent_a_id = ? AND c.agent_b_id = ?) OR
        (c.agent_a_id = ? AND c.agent_b_id = ?)
      )
      AND c.is_complete = 1
      ORDER BY c.created_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(agentAId, agentBId, agentBId, agentAId, limit) as Array<{
      conversationId: number;
      totalTurns: number;
      createdAt: string;
      agentAName: string;
      agentBName: string;
    }>;

    // Enrich with first and last messages
    return rows.map((row) => {
      const messages = this.getMessages(row.conversationId);
      const firstMessage = messages[0]?.content;
      const lastMessage = messages[messages.length - 1]?.content;

      const summary: PastConversationSummary = {
        conversationId: row.conversationId,
        agentAName: row.agentAName,
        agentBName: row.agentBName,
        totalTurns: row.totalTurns,
        createdAt: new Date(row.createdAt),
      };

      if (firstMessage) summary.firstMessage = firstMessage;
      if (lastMessage) summary.lastMessage = lastMessage;

      return summary;
    });
  }

  /**
   * Get relevant messages from past conversations for context
   */
  getRelevantPastMessages(
    agentAId: string,
    agentBId: string,
    limit: number = 10
  ): Array<{ conversationId: number; turnNumber: number; content: string; agentId: string }> {
    // Get recent messages from past conversations between these agents
    const stmt = this.db.prepare(`
      SELECT 
        m.conversation_id as conversationId,
        m.turn_number as turnNumber,
        m.content,
        m.agent_id as agentId
      FROM messages m
      INNER JOIN conversations c ON m.conversation_id = c.id
      WHERE (
        (c.agent_a_id = ? AND c.agent_b_id = ?) OR
        (c.agent_a_id = ? AND c.agent_b_id = ?)
      )
      AND c.is_complete = 1
      ORDER BY m.created_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(agentAId, agentBId, agentBId, agentAId, limit) as Array<{
      conversationId: number;
      turnNumber: number;
      content: string;
      agentId: string;
    }>;
    return rows.map((row) => ({
      conversationId: row.conversationId,
      turnNumber: row.turnNumber,
      content: row.content,
      agentId: row.agentId,
    }));
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
