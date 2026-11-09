import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/lib/auth-types";
import { completeMessage, createConversation, listMessages } from "./conversation-store";
import { askNonStream, prepareAsk } from "./conversation-ask";
import { POST as askPost } from "../app/api/corpus/ask/route";
import { getCurrentViewer } from "@/lib/server-auth";

vi.mock("@/lib/server-auth", () => ({ getCurrentViewer: vi.fn() }));
vi.mock("@/lib/auth-http", () => ({ checkSameOrigin: () => null }));
vi.mock("@/lib/conversation-ask", async () => import("./conversation-ask"));
vi.mock("@/lib/conversation-request", () => ({ createModelStreamRequest: vi.fn() }));
vi.mock("@/lib/conversation-stream", () => ({ streamAsk: vi.fn() }));

vi.mock("@/lib/server-database", () => import("./server-database"));
vi.mock("@/lib/server-env", () => ({
  getModelConfig: () => ({ baseUrl: "https://model.invalid/v1", model: "test-model", apiKey: "test-key" }),
}));
vi.mock("@/lib/corpus-db", async () => {
  const actual = await import("./corpus-db");
  return actual;
});

const schema = readFileSync(path.resolve(__dirname, "../../../db/sqlite/001_research_corpus.sql"), "utf8");
let directory: string;
const viewer: Viewer = { id: "user-owner", role: "member" };
const other: Viewer = { id: "user-other", role: "member" };

function withDatabase(operation: (database: DatabaseSync) => void) {
  const database = new DatabaseSync(process.env.CORPUS_DB_PATH!);
  try {
    operation(database);
  } finally {
    database.close();
  }
}

beforeEach(() => {
  vi.mocked(getCurrentViewer).mockResolvedValue(viewer);
  directory = mkdtempSync(path.join(tmpdir(), "conversation-ask-"));
  process.env.CORPUS_DB_PATH = path.join(directory, "corpus.db");
  withDatabase((database) => {
    database.exec(schema);
    const timestamp = "2026-01-01T00:00:00.000Z";
    for (const user of [viewer, other]) {
      database.prepare("INSERT INTO users (id, email, display_name, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?)")
        .run(user.id, `${user.id}@test.invalid`, user.id, "hash", timestamp, timestamp);
    }
    database.prepare("INSERT INTO documents (id, title, source_url, format, status, text_length, created_at, updated_at) VALUES ('public', 'Public', 'test:public', 'pdf', 'parsed', 1, ?, ?)")
      .run(timestamp, timestamp);
    database.prepare("INSERT INTO document_chunks (id, document_id, chunk_index, text, char_count, token_estimate) VALUES ('public-chunk', 'public', 0, 'tcp evidence', 11, 1)")
      .run();
  });
  process.env.LLM_BASE_URL = "https://model.invalid/v1";
  process.env.LLM_MODEL = "test-model";
  process.env.LLM_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.CORPUS_DB_PATH;
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_MODEL;
  delete process.env.LLM_API_KEY;
  rmSync(directory, { recursive: true, force: true });
});

describe("conversation ask", () => {
  it("rejects another owner's conversation", async () => {
    const conversation = createConversation(other, "Other");
    const outcome = await prepareAsk(viewer, "tcp protocol", conversation.id);
    if ("prepare" in outcome) throw new Error("expected ownership rejection");
    expect(outcome.status).toBe(404);
  });

  it("returns 404 instead of an empty success for another owner's conversation", async () => {
    const conversation = createConversation(other, "Other");
    const response = await askPost(new Request("http://localhost/api/corpus/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "unmatched question", conversationId: conversation.id }),
    }));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ detail: "会话不存在" });
  });

  it("does not call the model when there is no evidence", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await prepareAsk(viewer, "unmatched question", undefined, false);
    if ("prepare" in outcome) throw new Error("expected no-evidence result");
    expect(outcome.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("persists a complete JSON answer", async () => {
    const conversation = createConversation(viewer, "Session");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: " grounded answer " } }],
      usage: { total_tokens: 12 },
    }), { status: 200 })));
    const prepared = await prepareAsk(viewer, "tcp protocol", conversation.id);
    if (!("prepare" in prepared)) throw new Error("expected prepare result");
    const outcome = await askNonStream(prepared);
    expect(outcome.status).toBe(200);
    expect(outcome.payload.answer).toBe("grounded answer");
    const history = listMessages(viewer, conversation.id)!;
    expect(history.messages[0]).toMatchObject({
      answer: "grounded answer",
      model: "test-model",
      grounded: true,
      status: "completed",
    });
    expect(history.messages[0].sources[0].documentId).toBe("public");
    vi.unstubAllGlobals();
  });

  it("persists upstream failures without faking success", async () => {
    const conversation = createConversation(viewer, "Session");
    const fetchMock = vi.fn(async () => new Response("upstream down", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const prepared = await prepareAsk(viewer, "tcp protocol", conversation.id);
    if (!("prepare" in prepared)) throw new Error("expected prepare result");
    expect((await askNonStream(prepared)).status).toBe(502);
    expect(listMessages(viewer, conversation.id)!.messages[0]).toMatchObject({ status: "failed" });
    vi.unstubAllGlobals();
  });
});
