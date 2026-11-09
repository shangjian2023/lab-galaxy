import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveDatabasePath } from "@/lib/server-database";
import type { CorpusSource } from "@/lib/corpus-db";
import type { Viewer } from "@/lib/auth-types";
import type {
  ConversationMessage,
  ConversationMessagePage,
  ConversationMessageStatus,
  ConversationSource,
  ConversationSummary,
} from "./conversation-types";

const readyDatabases = new Set<string>();
export const CONVERSATION_TITLE_MAX = 120;
export const CONVERSATION_MESSAGE_LIMIT = 50;
export const CONVERSATION_TEXT_LIMIT = 20_000;
const CONVERSATION_LIST_LIMIT = 100;
const PENDING_STALE_MS = 100_000;

type ConversationRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  question: string;
  answer: string | null;
  sources_json: string;
  model: string | null;
  grounded: number;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

function openConversationDatabase(): DatabaseSync {
  const filename = resolveDatabasePath();
  mkdirSync(path.dirname(filename), { recursive: true });
  if (!readyDatabases.has(filename)) {
    const database = new DatabaseSync(filename);
    try {
      database.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;

        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS conversation_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          question TEXT NOT NULL,
          answer TEXT,
          sources_json TEXT NOT NULL DEFAULT '[]',
          model TEXT,
          grounded INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'incomplete', 'failed')),
          error TEXT,
          created_at TEXT NOT NULL,
          completed_at TEXT,
          answer_length INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_conversations_owner
          ON conversations(owner_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation
          ON conversation_messages(conversation_id, created_at DESC, id DESC);
      `);
      readyDatabases.add(filename);
    } finally {
      database.close();
    }
  }
  const database = new DatabaseSync(filename);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return database;
}

function now(): string {
  return new Date().toISOString();
}

function clampText(value: string, limit = CONVERSATION_TEXT_LIMIT): string {
  return value.length <= limit ? value : value.slice(0, limit);
}

function normalizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim().replace(/\s+/g, " ");
  return title ? title.slice(0, CONVERSATION_TITLE_MAX) : null;
}

function conversationFromRow(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: Number(row.message_count),
  };
}

export function listConversations(viewer: Viewer): ConversationSummary[] {
  const database = openConversationDatabase();
  try {
    const rows = database.prepare(`
      SELECT c.id, c.title, c.created_at, c.updated_at, COUNT(m.id) AS message_count
      FROM conversations c
      LEFT JOIN conversation_messages m ON m.conversation_id = c.id
      WHERE c.owner_id = ?
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT ?
    `).all(viewer.id, CONVERSATION_LIST_LIMIT) as ConversationRow[];
    return rows.map(conversationFromRow);
  } finally {
    database.close();
  }
}

export function createConversation(viewer: Viewer, title: string): ConversationSummary {
  const safeTitle = normalizeTitle(title) ?? "新会话";
  const timestamp = now();
  const conversation: ConversationSummary = {
    id: randomUUID(),
    title: safeTitle,
    createdAt: timestamp,
    updatedAt: timestamp,
    messageCount: 0,
  };
  const database = openConversationDatabase();
  try {
    database.prepare(`
      INSERT INTO conversations (id, owner_id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(conversation.id, viewer.id, safeTitle, timestamp, timestamp);
    return conversation;
  } finally {
    database.close();
  }
}

function getConversationRow(database: DatabaseSync, ownerId: string, id: string): ConversationRow | undefined {
  return database.prepare(`
    SELECT c.id, c.title, c.created_at, c.updated_at,
           (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id) AS message_count
    FROM conversations c
    WHERE c.id = ? AND c.owner_id = ?
  `).get(id, ownerId) as ConversationRow | undefined;
}

export function getConversation(viewer: Viewer, id: string): ConversationSummary | null {
  const database = openConversationDatabase();
  try {
    const row = getConversationRow(database, viewer.id, id);
    return row ? conversationFromRow(row) : null;
  } finally {
    database.close();
  }
}

export function renameConversation(viewer: Viewer, id: string, title: unknown): ConversationSummary | null {
  const safeTitle = normalizeTitle(title);
  if (!safeTitle) return null;
  const database = openConversationDatabase();
  try {
    const result = database.prepare(`
      UPDATE conversations SET title = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(safeTitle, now(), id, viewer.id);
    if (!result.changes) return null;
    const row = getConversationRow(database, viewer.id, id);
    return row ? conversationFromRow(row) : null;
  } finally {
    database.close();
  }
}

export function deleteConversation(viewer: Viewer, id: string): boolean {
  const database = openConversationDatabase();
  try {
    const result = database.prepare("DELETE FROM conversations WHERE id = ? AND owner_id = ?")
      .run(id, viewer.id);
    return result.changes > 0;
  } finally {
    database.close();
  }
}

export function isConversationOwner(viewer: Viewer, id: string): boolean {
  const database = openConversationDatabase();
  try {
    return Boolean(database.prepare("SELECT 1 FROM conversations WHERE id = ? AND owner_id = ?")
      .get(id, viewer.id));
  } finally {
    database.close();
  }
}

export function storeSources(sources: CorpusSource[]): ConversationSource[] {
  return sources.map((source) => ({
    chunkId: source.chunkId,
    documentId: source.documentId,
    title: source.title,
    sourceUrl: source.sourceUrl,
    institution: source.institution,
    pageStart: source.pageStart,
    pageEnd: source.pageEnd,
    text: clampText(source.text),
    matchedTerms: source.matchedTerms.slice(0, 20),
    available: true,
  }));
}

export function createPendingMessage(
  viewer: Viewer,
  conversationId: string,
  question: string,
): ConversationMessage | null {
  const database = openConversationDatabase();
  try {
    if (!database.prepare("SELECT 1 FROM conversations WHERE id = ? AND owner_id = ?")
      .get(conversationId, viewer.id)) return null;
    const timestamp = now();
    const message: ConversationMessage = {
      id: randomUUID(),
      conversationId,
      question: clampText(question),
      answer: null,
      sources: [],
      model: null,
      grounded: false,
      status: "pending",
      error: null,
      createdAt: timestamp,
      completedAt: null,
    };
    database.prepare(`
      INSERT INTO conversation_messages (
        id, conversation_id, question, answer, sources_json, model, grounded,
        status, error, created_at, completed_at
      ) VALUES (?, ?, ?, NULL, '[]', NULL, 0, 'pending', NULL, ?, NULL)
    `).run(message.id, conversationId, message.question, timestamp);
    database.prepare("UPDATE conversations SET updated_at = ? WHERE id = ? AND owner_id = ?")
      .run(timestamp, conversationId, viewer.id);
    return message;
  } finally {
    database.close();
  }
}

export function updateMessageSources(
  viewer: Viewer,
  messageId: string,
  sources: ConversationSource[],
  model: string | null,
): boolean {
  const database = openConversationDatabase();
  try {
    const result = database.prepare(`
      UPDATE conversation_messages
      SET sources_json = ?, model = ?, grounded = 1
      WHERE id = ?
        AND EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_messages.conversation_id AND c.owner_id = ?)
    `).run(JSON.stringify(sources), model, messageId, viewer.id);
    return result.changes > 0;
  } finally {
    database.close();
  }
}

export function completeMessage(
  viewer: Viewer,
  messageId: string,
  answer: string,
  status: ConversationMessageStatus = "completed",
  error: string | null = null,
): boolean {
  const safeAnswer = clampText(answer);
  const timestamp = now();
  const database = openConversationDatabase();
  try {
    const result = database.prepare(`
      UPDATE conversation_messages
      SET answer = ?, answer_length = ?, status = ?, error = ?, completed_at = ?
      WHERE id = ?
        AND EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_messages.conversation_id AND c.owner_id = ?)
    `).run(safeAnswer, safeAnswer.length, status, error, timestamp, messageId, viewer.id);
    if (result.changes) {
      database.prepare(`
        UPDATE conversations SET updated_at = ?
        WHERE id = (SELECT conversation_id FROM conversation_messages WHERE id = ?)
          AND owner_id = ?
      `).run(timestamp, messageId, viewer.id);
    }
    return result.changes > 0;
  } finally {
    database.close();
  }
}

export function failPendingMessage(viewer: Viewer, messageId: string, error: string): boolean {
  return completeMessage(viewer, messageId, "", "failed", error);
}

export function listMessages(
  viewer: Viewer,
  conversationId: string,
  limit = CONVERSATION_MESSAGE_LIMIT,
): ConversationMessagePage | null {
  const safeLimit = Math.max(
    1,
    Math.min(CONVERSATION_MESSAGE_LIMIT, Math.trunc(limit) || CONVERSATION_MESSAGE_LIMIT),
  );
  const database = openConversationDatabase();
  try {
    const conversation = getConversationRow(database, viewer.id, conversationId);
    if (!conversation) return null;
    const staleBefore = new Date(Date.now() - PENDING_STALE_MS).toISOString();
    database.prepare(`
      UPDATE conversation_messages
      SET status = 'incomplete', error = COALESCE(error, '服务重启或请求中断'), completed_at = ?
      WHERE conversation_id = ? AND status = 'pending' AND created_at <= ?
    `).run(now(), conversationId, staleBefore);
    const rows = database.prepare(`
      SELECT * FROM (
        SELECT * FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      )
      ORDER BY created_at ASC, id ASC
    `).all(conversationId, safeLimit) as MessageRow[];
    const visibleIds = new Set(
      (database.prepare(`
        SELECT d.id FROM documents d
        LEFT JOIN team_members tm ON tm.team_id = d.team_id
        WHERE d.status = 'parsed'
          AND (
            d.visibility = 'public'
            OR d.owner_id = ?
            OR (d.visibility = 'team' AND tm.user_id = ?)
          )
      `).all(viewer.id, viewer.id) as Array<{ id: string }>).map((row) => row.id),
    );
    const messages = rows.map((row) => serializeMessage(row, visibleIds));
    return { conversationId, messages, limit: safeLimit };
  } finally {
    database.close();
  }
}

function parseSources(value: string): ConversationSource[] {
  try {
    const parsed = JSON.parse(value) as ConversationSource[];
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch {
    return [];
  }
}

function serializeMessage(row: MessageRow, visibleDocumentIds: Set<string>): ConversationMessage {
  const sources = parseSources(row.sources_json).map((source) => {
    if (visibleDocumentIds.has(source.documentId)) return source;
    return {
      ...source,
      title: null,
      sourceUrl: null,
      institution: null,
      text: null,
      matchedTerms: [],
      available: false,
      accessDenied: true,
    };
  });
  return {
    id: row.id,
    conversationId: row.conversation_id,
    question: row.question,
    answer: row.answer,
    sources,
    model: row.model,
    grounded: Boolean(row.grounded),
    status: row.status as ConversationMessageStatus,
    error: row.error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}
