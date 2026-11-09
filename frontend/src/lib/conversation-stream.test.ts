import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/lib/auth-types";
import { createConversation, createPendingMessage, listMessages } from "./conversation-store";
import { streamAsk } from "./conversation-stream";

vi.mock("@/lib/server-database", () => import("./server-database"));
vi.mock("@/lib/corpus-db", async () => import("./corpus-db"));
vi.mock("@/lib/server-env", () => ({
  getModelConfig: () => ({ baseUrl: "https://model.invalid/v1", model: "test-model", apiKey: "test-key" }),
}));

const schema = readFileSync(path.resolve(__dirname, "../../../db/sqlite/001_research_corpus.sql"), "utf8");
let directory: string;
const viewer: Viewer = { id: "user-owner", role: "member" };

function withDatabase(operation: (database: DatabaseSync) => void) {
  const database = new DatabaseSync(process.env.CORPUS_DB_PATH!);
  try {
    operation(database);
  } finally {
    database.close();
  }
}

function upstreamResponse(chunks: string[]) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function source() {
  return {
    chunkId: "public-chunk",
    documentId: "public",
    title: "Public",
    sourceUrl: "test:public",
    institution: null,
    pageStart: null,
    pageEnd: null,
    text: "tcp evidence",
    score: 1,
    matchedTerms: ["tcp"],
  };
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "conversation-stream-"));
  process.env.CORPUS_DB_PATH = path.join(directory, "corpus.db");
  withDatabase((database) => {
    database.exec(schema);
    const timestamp = "2026-01-01T00:00:00.000Z";
    database.prepare("INSERT INTO users (id, email, display_name, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?)")
      .run(viewer.id, "owner@test.invalid", "Owner", "hash", timestamp, timestamp);
    database.prepare("INSERT INTO documents (id, title, source_url, format, status, text_length, created_at, updated_at) VALUES ('public', 'Public', 'test:public', 'pdf', 'parsed', 1, ?, ?)")
      .run(timestamp, timestamp);
    database.prepare("INSERT INTO document_chunks (id, document_id, chunk_index, text, char_count, token_estimate) VALUES ('public-chunk', 'public', 0, 'tcp evidence', 11, 1)")
      .run();
  });
});

afterEach(() => {
  delete process.env.CORPUS_DB_PATH;
  rmSync(directory, { recursive: true, force: true });
});

async function readSse(response: Response) {
  const text = await response.text();
  return text.split(/\r?\n\r?\n/).filter(Boolean).map((block) => {
    const event = block.match(/^event: (.+)$/m)?.[1];
    const data = block.match(/^data: (.+)$/m)?.[1];
    return { event, data: data ? JSON.parse(data) as Record<string, unknown> : null };
  });
}

describe("conversation streaming", () => {
  it("emits meta, sources, deltas, done and persists the answer", async () => {
    const conversation = createConversation(viewer, "Stream");
    const message = createPendingMessage(viewer, conversation.id, "tcp protocol")!;
    vi.stubGlobal("fetch", vi.fn(async () => upstreamResponse([
      "data: ", JSON.stringify({ choices: [{ delta: { content: "Hello " } }] }), "\n\n",
      "data: ", JSON.stringify({ choices: [{ delta: { content: "world" } }] }), "\n\n",
      "data: [DONE]\n\n",
    ])));
    const response = await streamAsk(
      viewer,
      "tcp protocol",
      conversation.id,
      message,
      [source()],
      new Request("https://model.invalid/v1/chat/completions", { headers: { "X-Conversation-Model": "test-model" } }),
      null,
    );
    const events = await readSse(response);
    expect(events.map((event) => event.event)).toEqual(["meta", "sources", "delta", "delta", "done"]);
    expect(events.at(-1)?.data).toMatchObject({ status: "completed", model: "test-model", answer: "Hello world" });
    const history = listMessages(viewer, conversation.id)!.messages[0];
    expect(history).toMatchObject({ answer: "Hello world", model: "test-model", grounded: true, status: "completed" });
    expect(history.sources[0]).toMatchObject({ documentId: "public", text: "tcp evidence" });
    vi.unstubAllGlobals();
  });

  it("parses CRLF event boundaries incrementally", async () => {
    const conversation = createConversation(viewer, "CRLF");
    const message = createPendingMessage(viewer, conversation.id, "tcp protocol")!;
    vi.stubGlobal("fetch", vi.fn(async () => upstreamResponse([
      "data: ", JSON.stringify({ choices: [{ delta: { content: "Hello " } }] }), "\r\n\r\n",
      "data: ", JSON.stringify({ choices: [{ delta: { content: "world" } }] }), "\r\n\r\ndata: [DONE]\r\n\r\n",
    ])));
    const response = await streamAsk(
      viewer,
      "tcp protocol",
      conversation.id,
      message,
      [source()],
      new Request("https://model.invalid/v1/chat/completions", { headers: { "X-Conversation-Model": "test-model" } }),
      null,
    );
    const events = await readSse(response);
    expect(events.map((event) => event.event)).toEqual(["meta", "sources", "delta", "delta", "done"]);
    expect(events.at(-1)?.data).toMatchObject({ answer: "Hello world", status: "completed" });
    vi.unstubAllGlobals();
  });

  it("reports upstream errors without faking success", async () => {
    const conversation = createConversation(viewer, "Error");
    const message = createPendingMessage(viewer, conversation.id, "tcp protocol")!;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    const response = await streamAsk(
      viewer,
      "tcp protocol",
      conversation.id,
      message,
      [source()],
      new Request("https://model.invalid/v1/chat/completions"),
      null,
    );
    const events = await readSse(response);
    expect(events.at(-1)).toMatchObject({ event: "error", data: { code: "MODEL_HTTP_ERROR", messageId: message.id } });
    expect(listMessages(viewer, conversation.id)!.messages[0]).toMatchObject({ status: "failed" });
    vi.unstubAllGlobals();
  });

  it("aborts the upstream request and stores partial output as incomplete", async () => {
    const conversation = createConversation(viewer, "Abort");
    const message = createPendingMessage(viewer, conversation.id, "tcp protocol")!;
    const clientController = new AbortController();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_resolve, reject) => {
      setTimeout(() => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, 0);
    })));
    const responsePromise = await streamAsk(
      viewer,
      "tcp protocol",
      conversation.id,
      message,
      [source()],
      new Request("https://model.invalid/v1/chat/completions"),
      clientController.signal,
    );
    clientController.abort();
    const events = await readSse(responsePromise);
    expect(events.at(-1)).toMatchObject({ event: "error", data: { code: "ABORTED" } });
    expect(listMessages(viewer, conversation.id)!.messages[0].status).toBe("incomplete");
    vi.unstubAllGlobals();
  });
});
