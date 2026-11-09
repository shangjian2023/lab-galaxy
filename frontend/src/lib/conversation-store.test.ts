import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/lib/auth-types";
import {
  CONVERSATION_MESSAGE_LIMIT,
  completeMessage,
  createConversation,
  createPendingMessage,
  deleteConversation,
  listConversations,
  listMessages,
  renameConversation,
  storeSources,
  updateMessageSources,
} from "./conversation-store";

vi.mock("@/lib/server-database", () => import("./server-database"));

const schema = readFileSync(path.resolve(__dirname, "../../../db/sqlite/001_research_corpus.sql"), "utf8");
let directory: string;
const owner: Viewer = { id: "user-owner", role: "member" };
const other: Viewer = { id: "user-other", role: "member" };

function withDatabase(operation: (database: DatabaseSync) => void) {
  const database = new DatabaseSync(process.env.CORPUS_DB_PATH!);
  try {
    operation(database);
  } finally {
    database.close();
  }
}

function seedCorpus() {
  withDatabase((database) => {
    const timestamp = "2026-01-01T00:00:00.000Z";
    database.prepare("INSERT INTO users (id, email, display_name, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?)")
      .run(owner.id, "owner@test.invalid", "Owner", "hash", timestamp, timestamp);
    database.prepare("INSERT INTO users (id, email, display_name, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?)")
      .run(other.id, "other@test.invalid", "Other", "hash", timestamp, timestamp);
    database.prepare("INSERT INTO documents (id, title, source_url, format, status, text_length, created_at, updated_at) VALUES ('public', 'Public', 'test:public', 'pdf', 'parsed', 1, ?, ?)")
      .run(timestamp, timestamp);
    database.prepare("INSERT INTO documents (id, title, source_url, format, status, text_length, owner_id, visibility, created_at, updated_at) VALUES ('private', 'Private', 'test:private', 'pdf', 'parsed', 1, ?, 'private', ?, ?)")
      .run(owner.id, timestamp, timestamp);
    for (const id of ["public", "private"]) {
      database.prepare("INSERT INTO document_chunks (id, document_id, chunk_index, text, char_count, token_estimate) VALUES (?, ?, 0, ?, ?, 1)")
        .run(`${id}-chunk`, id, `${id}-evidence`, 11);
    }
  });
}

function source(documentId: string, text: string) {
  return {
    chunkId: `${documentId}-chunk`,
    documentId,
    title: `${documentId}-title`,
    sourceUrl: `test:${documentId}`,
    institution: null,
    pageStart: null,
    pageEnd: null,
    text,
    score: 1,
    matchedTerms: [documentId],
  };
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "conversation-store-"));
  process.env.CORPUS_DB_PATH = path.join(directory, "corpus.db");
  withDatabase((database) => database.exec(schema));
  seedCorpus();
});

afterEach(() => {
  delete process.env.CORPUS_DB_PATH;
  rmSync(directory, { recursive: true, force: true });
});

describe("conversation storage", () => {
  it("isolates conversations, messages, rename and delete by owner", () => {
    const conversation = createConversation(owner, " Owner session ");
    expect(conversation.title).toBe("Owner session");
    const message = createPendingMessage(owner, conversation.id, "question");
    expect(message).not.toBeNull();
    completeMessage(owner, message!.id, "answer");

    expect(listConversations(owner).map((item) => item.id)).toEqual([conversation.id]);
    expect(listConversations(other)).toEqual([]);
    expect(listMessages(owner, conversation.id)?.messages).toHaveLength(1);
    expect(listMessages(other, conversation.id)).toBeNull();
    expect(renameConversation(other, conversation.id, "stolen")).toBeNull();
    expect(deleteConversation(other, conversation.id)).toBe(false);
    expect(renameConversation(owner, conversation.id, "renamed")?.title).toBe("renamed");
    expect(deleteConversation(owner, conversation.id)).toBe(true);
    expect(listMessages(owner, conversation.id)).toBeNull();
  });

  it("redacts sources whose documents are no longer visible and caps history", () => {
    const conversation = createConversation(owner, "history");
    const publicMessage = createPendingMessage(owner, conversation.id, "public question")!;
    updateMessageSources(owner, publicMessage.id, storeSources([source("public", "public evidence")]), "qwen");
    completeMessage(owner, publicMessage.id, "public answer");
    const privateMessage = createPendingMessage(owner, conversation.id, "private question")!;
    updateMessageSources(owner, privateMessage.id, storeSources([source("private", "secret evidence")]), "qwen");
    withDatabase((database) => {
      database.prepare("UPDATE documents SET visibility = 'private', owner_id = ? WHERE id = 'private'").run(other.id);
    });
    withDatabase((database) => {
      database.prepare("UPDATE conversation_messages SET created_at = ? WHERE id = ?")
        .run("2026-01-01T00:00:01.000Z", privateMessage.id);
      database.prepare("UPDATE conversation_messages SET created_at = ? WHERE id = ?")
        .run("2026-01-01T00:00:00.000Z", publicMessage.id);
    });
    completeMessage(owner, privateMessage.id, "private answer");

    const ownerHistory = listMessages(owner, conversation.id)!;
    expect(ownerHistory.messages[0].sources[0].text).toBe("public evidence");
    expect(ownerHistory.messages.find((item) => item.id === privateMessage.id)?.sources[0].text).toBeNull();
    expect(ownerHistory.messages.find((item) => item.id === privateMessage.id)?.sources[0].available).toBe(false);

    withDatabase((database) => {
      database.prepare("UPDATE documents SET visibility = 'private', owner_id = ? WHERE id = 'public'").run(other.id);
    });
    const revokedHistory = listMessages(owner, conversation.id)!;
    expect(revokedHistory.messages[0].sources[0].text).toBeNull();
    expect(revokedHistory.messages[0].sources[0].title).toBeNull();
    expect(revokedHistory.messages[0].sources[0].accessDenied).toBe(true);

    for (let index = 0; index < CONVERSATION_MESSAGE_LIMIT + 5; index += 1) {
      const extra = createPendingMessage(owner, conversation.id, `question-${index}`);
      completeMessage(owner, extra!.id, `answer-${index}`);
    }
    expect(listMessages(owner, conversation.id)!.messages).toHaveLength(CONVERSATION_MESSAGE_LIMIT);
  });

  it("marks stale pending messages incomplete after an interrupted server", () => {
    const conversation = createConversation(owner, "interrupted");
    const message = createPendingMessage(owner, conversation.id, "question")!;
    withDatabase((database) => {
      database.prepare("UPDATE conversation_messages SET created_at = ? WHERE id = ?")
        .run(new Date(Date.now() - 120_000).toISOString(), message.id);
    });
    expect(listMessages(owner, conversation.id)!.messages[0]).toMatchObject({
      id: message.id,
      status: "incomplete",
      error: "服务重启或请求中断",
    });
  });
});
