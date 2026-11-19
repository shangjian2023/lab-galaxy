import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { DatabaseSync as SqliteDatabaseSync } from "node:sqlite";
import type { Viewer } from "./auth-types";
import { buildExtractionMessages } from "./knowledge-model";
import {
  KNOWLEDGE_DEFAULT_CHUNKS,
  KNOWLEDGE_MAX_CHUNKS,
  createKnowledgeExtractionTask,
  getKnowledgeGraph,
  getKnowledgeTask,
  getKnowledgeTasks,
  getVisibleKnowledgeDocument,
  publishKnowledgeTask,
  retryKnowledgeExtraction,
  setKnowledgeModelForTests,
} from "./knowledge-store";

const alice: Viewer = { id: "user-alice", role: "member" };
const bob: Viewer = { id: "user-bob", role: "member" };
const admin: Viewer = { id: "user-admin", role: "admin" };
let database: DatabaseSync;

function validOutput(documentId = "doc-a") {
  return JSON.stringify({
    entities: [
      { name: "TCP", type: "协议", group: "knowledge", summary: "可靠传输协议。", confidence: 0.9, evidenceChunkId: `${documentId}-chunk-0` },
      { name: "三次握手", type: "过程", group: "experiment", summary: "连接建立过程。", confidence: 0.85, evidenceChunkId: `${documentId}-chunk-0` },
    ],
    relations: [{ sourceName: "TCP", targetName: "三次握手", relation: "使用", confidence: 0.8, evidenceChunkId: `${documentId}-chunk-1` }],
  });
}

beforeEach(() => {
  const temporary = path.resolve("node_modules/.tmp", randomUUID());
  process.env.CORPUS_DB_PATH = path.join(temporary, "knowledge.db");
  mkdirSync(temporary, { recursive: true });
  database = new SqliteDatabaseSync(process.env.CORPUS_DB_PATH);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
      role TEXT CHECK (role IN ('admin','member')) NOT NULL, status TEXT CHECK (status IN ('pending','active','disabled')) NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT);
    CREATE TABLE documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, source_url TEXT UNIQUE NOT NULL, status TEXT NOT NULL,
      owner_id TEXT REFERENCES users(id), visibility TEXT DEFAULT 'public' CHECK (visibility IN ('private','team','public')) NOT NULL,
      team_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE document_chunks (id TEXT PRIMARY KEY, document_id TEXT REFERENCES documents(id), chunk_index INTEGER NOT NULL,
      page_start INTEGER, page_end INTEGER, text TEXT NOT NULL, char_count INTEGER NOT NULL, token_estimate INTEGER NOT NULL);
    CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE team_members (team_id TEXT REFERENCES teams(id), user_id TEXT REFERENCES users(id), role TEXT NOT NULL,
      created_at TEXT NOT NULL, PRIMARY KEY (team_id, user_id));
    INSERT INTO users VALUES ('user-alice','alice@example.test','Alice','x','member','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',NULL),
      ('user-bob','bob@example.test','Bob','x','member','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',NULL),
      ('user-admin','admin@example.test','Admin','x','admin','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',NULL);
    INSERT INTO teams VALUES ('team-1','Team','user-alice','2026-01-01T00:00:00Z');
    INSERT INTO team_members VALUES ('team-1','user-alice','owner','2026-01-01T00:00:00Z');
  `);
});

afterEach(() => {
  database.close();
  setKnowledgeModelForTests(undefined);
  const temporary = path.dirname(process.env.CORPUS_DB_PATH!);
  delete process.env.CORPUS_DB_PATH;
  rmSync(temporary, { recursive: true, force: true });
});

function addDocument(id: string, visibility: "private" | "team" | "public", ownerId: string | null, chunks = 2) {
  database.prepare(`
    INSERT INTO documents (id,title,source_url,status,owner_id,visibility,team_id,created_at,updated_at)
    VALUES (?,?,?,'parsed',?,?,CASE WHEN ?='team' THEN 'team-1' ELSE NULL END,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `).run(id, `${id} title`, `https://example.test/${id}`, ownerId, visibility, visibility);
  for (let index = 0; index < chunks; index += 1) {
    database.prepare(`
      INSERT INTO document_chunks (id,document_id,chunk_index,page_start,page_end,text,char_count,token_estimate)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(`${id}-chunk-${index}`, id, index, index + 1, index + 1, `${id} 原文 ${index}`, 10, 3);
  }
}

describe("knowledge store", () => {
  it("sends real chunk ids, pages and text to the model", async () => {
    addDocument("doc-a", "private", alice.id, 12);
    let captured: unknown;
    setKnowledgeModelForTests(async (_input) => {
      captured = _input.chunks;
      return validOutput();
    });
    const result = await createKnowledgeExtractionTask({ documentId: "doc-a", viewer: alice, maxChunks: 4, model: "qwen-test" });
    expect("error" in result && result.error).toBeFalsy();
    expect(captured).toContainEqual({ chunkId: "doc-a-chunk-0", pageStart: 1, pageEnd: 1, text: "doc-a 原文 0" });
    expect((captured as unknown[]).length).toBe(4);
  });

  it("creates owner-only draft and publishes visibility-aware graph", async () => {
    addDocument("doc-private", "private", alice.id, 2);
    setKnowledgeModelForTests(async (input) => validOutput(input.chunks[0]!.chunkId.replace(/-chunk-\d+$/, "")));
    const draftResult = await createKnowledgeExtractionTask({ documentId: "doc-private", viewer: alice, maxChunks: KNOWLEDGE_DEFAULT_CHUNKS, model: "qwen-test" });
    if (!("task" in draftResult)) throw new Error(draftResult.error);
    const draft = draftResult.task;
    expect(draft.errorMessage).toBeNull();
    expect(draft.status).toBe("draft");
    expect(draft.entities[0]).toMatchObject({ sourceDocumentId: "doc-private", sourceChunkId: "doc-private-chunk-0", sourcePageStart: 1 });
    expect(draft.evidence[0].text).toContain("doc-private 原文");
    expect(getKnowledgeGraph(null).nodes).toHaveLength(0);
    expect("error" in publishKnowledgeTask(draft.id, bob) ? "TASK_NOT_FOUND" : "unexpected").toBe("TASK_NOT_FOUND");
    const publishResult = publishKnowledgeTask(draft.id, alice);
    if (!("task" in publishResult)) throw new Error(publishResult.error);
    const published = publishResult.task;
    expect(published.status).toBe("published");
    expect(getKnowledgeGraph(null).nodes).toHaveLength(0);
    expect(getKnowledgeGraph(bob).nodes).toHaveLength(0);
    expect(getKnowledgeGraph(admin).nodes).toHaveLength(0);
    expect(getKnowledgeGraph(alice).nodes).toHaveLength(2);

    addDocument("doc-public", "public", alice.id, 2);
    addDocument("doc-team", "team", alice.id, 2);
    const publicResult = await createKnowledgeExtractionTask({ documentId: "doc-public", viewer: alice, maxChunks: 4, model: "qwen-test" });
    const teamResult = await createKnowledgeExtractionTask({ documentId: "doc-team", viewer: alice, maxChunks: 4, model: "qwen-test" });
    if (!("task" in publicResult) || !("task" in teamResult)) throw new Error("unexpected extraction failure");
    const publicDraft = publicResult.task;
    const teamDraft = teamResult.task;
    publishKnowledgeTask(publicDraft!.id, alice);
    publishKnowledgeTask(teamDraft!.id, alice);
    expect(getKnowledgeGraph(null).nodes).toHaveLength(2);
    expect(getKnowledgeGraph(bob).nodes).toHaveLength(2);
    expect(getKnowledgeGraph(admin).nodes).toHaveLength(2);
    expect(getKnowledgeGraph(alice).nodes).toHaveLength(6);
    expect(getKnowledgeGraph(alice, "mine").nodes).toHaveLength(6);
    expect(getKnowledgeGraph(alice, "corpus").nodes).toHaveLength(0);

    addDocument("doc-preloaded", "public", null, 2);
    const corpusResult = await createKnowledgeExtractionTask({ documentId: "doc-preloaded", viewer: alice, maxChunks: 4, model: "qwen-test" });
    if (!("task" in corpusResult)) throw new Error("unexpected corpus extraction failure");
    publishKnowledgeTask(corpusResult.task.id, alice);
    expect(getKnowledgeGraph(alice, "corpus").nodes).toHaveLength(2);
    expect(getKnowledgeGraph(alice, "mine").nodes).toHaveLength(6);
    expect(getKnowledgeGraph(null, "corpus").nodes).toHaveLength(2);
  });

  it("enforces private and team visibility", async () => {
    addDocument("doc-private", "private", alice.id, 2);
    addDocument("doc-team", "team", alice.id, 2);
    expect(getVisibleKnowledgeDocument("doc-private", bob)).toBeNull();
    expect(getVisibleKnowledgeDocument("doc-team", bob)).toBeNull();
    expect(getVisibleKnowledgeDocument("doc-team", alice)?.document.id).toBe("doc-team");
    const denied = await createKnowledgeExtractionTask({ documentId: "doc-private", viewer: bob, maxChunks: 4, model: "qwen-test" });
    if ("task" in denied) throw new Error("unexpected task");
    expect(denied.error).toBe("DOCUMENT_NOT_VISIBLE");
  });

  it("revokes task history and evidence when team membership is lost", async () => {
    addDocument("doc-team", "team", bob.id, 2);
    setKnowledgeModelForTests(async () => validOutput("doc-team"));
    const result = await createKnowledgeExtractionTask({ documentId: "doc-team", viewer: alice, maxChunks: 2, model: "qwen-test" });
    if (!("task" in result)) throw new Error(result.error);
    expect(getKnowledgeTasks(alice)).toHaveLength(1);
    database.prepare("DELETE FROM team_members WHERE team_id = 'team-1' AND user_id = ?").run(alice.id);
    expect(getKnowledgeTasks(alice)).toHaveLength(0);
    expect(getKnowledgeTask(result.task.id, alice)).toBeNull();
  });

  it("stores failed tasks without graph leakage and retries", async () => {
    addDocument("doc-a", "public", alice.id, 2);
    setKnowledgeModelForTests(async () => "{bad json");
    const failedResult = await createKnowledgeExtractionTask({ documentId: "doc-a", viewer: alice, maxChunks: 4, model: "qwen-test" });
    if (!("task" in failedResult)) throw new Error(failedResult.error);
    const failed = failedResult.task;
    expect(failed.status).toBe("failed");
    expect(failed.entities).toHaveLength(0);
    expect(getKnowledgeGraph(null).nodes).toHaveLength(0);
    setKnowledgeModelForTests(async () => validOutput());
    const retryResult = await retryKnowledgeExtraction(failed.id, alice);
    if (!("task" in retryResult)) throw new Error(retryResult.error);
    const retried = retryResult.task;
    expect(retried.errorMessage).toBeNull();
    expect(retried.status).toBe("draft");
    expect(retried.attempt).toBe(2);
    expect(retried.entities).toHaveLength(2);
  });
});

describe("knowledge model prompt", () => {
  it("includes exact schema and grounded chunks", () => {
    const messages = buildExtractionMessages([{ chunkId: "c1", pageStart: 7, pageEnd: 7, text: "原文" }]);
    expect(messages[0].content).toContain("只输出一个 JSON 对象");
    expect(messages[0].content).toContain("最多输出 12 个实体和 16 条关系");
    expect(messages[0].content).toContain("不要抽取学生或教师姓名");
    expect(messages[1].content).toContain("\"chunkId\":\"c1\"");
    expect(messages[1].content).toContain("\"text\":\"原文\"");
  });
});
