import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Document, Packer, Paragraph } from "docx";
import { registerUser, setUserStatus, type AuthResult } from "./auth-service";
import type { Viewer } from "./auth-types";
import { getCorpusDocument, listCorpusDocuments, searchCorpus } from "./corpus-db";
import { IngestionError } from "./ingestion-errors";
import {
  deleteIngestionTask,
  getIngestionTask,
  listIngestionTasks,
  retryIngestionTask,
  uploadDocument,
} from "./ingestion-store";

const schema = readFileSync(path.resolve(__dirname, "../../../db/sqlite/001_research_corpus.sql"), "utf8");

vi.mock("@/lib/server-database", () => import("./server-database"));
const password = "test-pass-10";
let directory: string;
let users: Awaited<ReturnType<typeof seedUsers>>;

async function seedUsers() {
  const first = await registerUser({ email: "admin@test.invalid", password, displayName: "Admin" });
  const admin = first.user;
  const owner = await activeUser("owner@test.invalid", "Owner", admin);
  const mate = await activeUser("mate@test.invalid", "Mate", admin);
  const other = await activeUser("other@test.invalid", "Other", admin);
  withDatabase((database) => {
    const timestamp = new Date().toISOString();
    database.prepare("INSERT INTO teams (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)")
      .run("team-a", "A", owner.id, timestamp);
    const statement = database.prepare("INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)");
    statement.run("team-a", owner.id, "owner", timestamp);
    statement.run("team-a", mate.id, "member", timestamp);
  });
  return { admin, owner, mate, other };
}

function viewer(user: AuthResult["user"]): Viewer {
  return { id: user.id, role: user.role };
}

function withDatabase<T>(operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(path.join(directory, "corpus.db"));
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

async function activeUser(email: string, displayName: string, admin: AuthResult["user"]) {
  const registration = await registerUser({ email, password, displayName });
  return setUserStatus(viewer(admin), registration.user.id, "active");
}

function makePdf(filename: string, text: string) {
  const generator = path.join(directory, "make_pdf.py");
  if (!existsSync(generator)) {
    writeFileSync(generator, [
      "from pathlib import Path",
      "import pymupdf",
      "target = Path(__import__('sys').argv[1])",
      "text = __import__('sys').argv[2]",
      "document = pymupdf.open()",
      "page = document.new_page()",
      "page.insert_textbox(page.rect + (36, 36, -36, -36), text, fontname='china-s', fontsize=10)",
      "document.save(target)",
      "document.close()",
    ].join("\n"));
  }
  const target = path.join(directory, filename);
  const result = spawnSync(process.env.CORPUS_PYTHON ?? "python", ["-I", generator, target, text], { encoding: "utf8" });
  expect(result.error ?? result.stderr).toBeFalsy();
  return readFileSync(target);
}

async function makeDocx(text: string) {
  const document = new Document({
    sections: [{ children: [new Paragraph(text)] }],
  });
  return Buffer.from(await Packer.toBuffer(document));
}

async function expectFailure(operation: Promise<unknown> | (() => unknown), code: string, status: number) {
  let value: Promise<unknown> | unknown;
  try {
    value = typeof operation === "function" ? operation() : operation;
  } catch (error) {
    value = Promise.reject(error);
  }
  await expect(value).rejects.toMatchObject({ code, status });
}

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "ingestion-store-"));
  process.env.CORPUS_DB_PATH = path.join(directory, "corpus.db");
  process.env.CORPUS_UPLOAD_DIR = path.join(directory, "uploads");
  mkdirSync(process.env.CORPUS_UPLOAD_DIR, { recursive: true });
  delete process.env.CORPUS_INGESTION_SCRIPT;
  withDatabase((database) => database.exec(schema));
  users = await seedUsers();
});

afterEach(() => {
  delete process.env.CORPUS_DB_PATH;
  delete process.env.CORPUS_UPLOAD_DIR;
  delete process.env.CORPUS_INGESTION_SCRIPT;
  rmSync(directory, { recursive: true, force: true });
});

describe("上传解析流水线", () => {
  it("真实解析 PDF/DOCX、保存元数据并保持私有边界", async () => {
    const richTextValue = richText();
    const pdf = Buffer.from(makePdf("rich.pdf", richTextValue));
    const task = await uploadDocument({
      actor: users.owner, filename: "..\\private-report.pdf", bytes: pdf,
      visibility: "private", teamId: null, sourceUrl: "https://example.test/report.pdf", licenseNote: "上传者确认",
    });
    expect(task).toMatchObject({ status: "completed", progress: 100, attempts: 1, visibility: "private" });
    const documentRow = withDatabase((database) => database.prepare("SELECT * FROM documents WHERE id = ?").get(task.documentId)) as Record<string, unknown>;
    expect(documentRow).toMatchObject({
      title: "private-report",
      owner_id: users.owner.id,
      visibility: "private",
      parser: "PyMuPDF",
      page_count: 1,
      byte_size: pdf.length,
    });
    expect(task.sourceUrl).toBe("https://example.test/report.pdf");
    expect(String(documentRow.local_path)).toBe(path.join(directory, "uploads", users.owner.id, task.documentId, "source.pdf"));
    expect(existsSync(String(documentRow.local_path))).toBe(true);
    expect(withDatabase((database) => database.prepare("SELECT COUNT(*) AS count FROM document_chunks WHERE document_id = ?").get(task.documentId)))
      .toMatchObject({ count: expect.any(Number) });
    expect(getCorpusDocument(task.documentId, viewer(users.owner))?.document.id).toBe(task.documentId);
    expect(listCorpusDocuments("", "all", 100, viewer(users.other)).map((row) => row.id)).not.toContain(task.documentId);
    expect(searchCorpus("持久解析", 10, viewer(users.other)).map((row) => row.documentId)).not.toContain(task.documentId);

    const docx = await makeDocx(richTextValue);
    const publicTask = await uploadDocument({
      actor: users.admin, filename: "public.docx", bytes: docx,
      visibility: "public", teamId: null, sourceUrl: "", licenseNote: null,
    });
    expect(publicTask.status).toBe("completed");
    const publicDocument = getCorpusDocument(publicTask.documentId, viewer(users.other));
    expect(publicDocument?.document.parser).toBe("python-docx");
    expect(publicDocument?.document.textLength).toBeGreaterThanOrEqual(200);
  });

  it("拒绝假文件、无效团队和成员公开上传，且失败任务真实落库", async () => {
    await expectFailure(() => uploadDocument({
      actor: users.owner, filename: "fake.pdf", bytes: Buffer.from("%PDF-fake"), visibility: "private",
      teamId: null, sourceUrl: "", licenseNote: null,
    }), "INVALID_PDF", 400);
    await expectFailure(() => uploadDocument({
      actor: users.owner, filename: "fake.docx", bytes: Buffer.from([0x50, 0x4b, 3, 4, 0, 0]), visibility: "private",
      teamId: null, sourceUrl: "", licenseNote: null,
    }), "INVALID_DOCX_ZIP", 400);
    await expectFailure(() => uploadDocument({
      actor: users.owner, filename: "member.pdf", bytes: Buffer.from(makePdf("member.pdf", richText())), visibility: "public",
      teamId: null, sourceUrl: "", licenseNote: null,
    }), "ADMIN_REQUIRED", 403);
    await expectFailure(() => uploadDocument({
      actor: users.owner, filename: "team.pdf", bytes: Buffer.from(makePdf("team.pdf", richText())), visibility: "team",
      teamId: "missing-team", sourceUrl: "", licenseNote: null,
    }), "NOT_TEAM_MEMBER", 403);
    expect(listIngestionTasks(users.owner)).toHaveLength(0);

    const small = Buffer.from(makePdf("small.pdf", "太短"));
    await expectFailure(() => uploadDocument({
      actor: users.owner, filename: "small.pdf", bytes: small, visibility: "private",
      teamId: null, sourceUrl: "", licenseNote: null,
    }), "PARSER_FAILED", 422);
    const failed = listIngestionTasks(users.owner)[0];
    expect(failed).toMatchObject({ status: "failed", attempts: 1, progress: 40 });
    expect(typeof failed.errorMessage).toBe("string");
    expect(withDatabase((database) => database.prepare("SELECT status FROM documents WHERE id = ?").get(failed.documentId)))
      .toMatchObject({ status: "failed" });
    await expectFailure(retryIngestionTask(users.owner, failed.id), "PARSER_FAILED", 422);
    expect(getIngestionTask(users.owner, failed.id).attempts).toBe(2);
  });

  it("同一账号按 SHA-256 幂等，失败后可重试，跨账号不能操作", async () => {
    const bytes = Buffer.from(makePdf("idempotent.pdf", richText()));
    const failureScript = path.join(directory, "fail_once.py");
    writeFileSync(failureScript, [
      "import json, sys",
      "print(json.dumps({'event': 'failed'}))",
      "sys.exit(1)",
    ].join("\n"));
    process.env.CORPUS_INGESTION_SCRIPT = failureScript;
    await expectFailure(() => uploadDocument({
      actor: users.owner, filename: "report.pdf", bytes, visibility: "private",
      teamId: null, sourceUrl: "", licenseNote: null,
    }), "PARSER_FAILED", 422);
    const failed = listIngestionTasks(users.owner)[0];
    await expectFailure(retryIngestionTask(users.other, failed.id), "TASK_NOT_FOUND", 404);
    delete process.env.CORPUS_INGESTION_SCRIPT;
    const completed = await retryIngestionTask(users.owner, failed.id);
    expect(completed).toMatchObject({ id: failed.id, status: "completed", attempts: 2 });
    const duplicate = await uploadDocument({
      actor: users.owner, filename: "renamed.pdf", bytes, visibility: "private",
      teamId: null, sourceUrl: "", licenseNote: null,
    });
    expect(duplicate.id).toBe(completed.id);
    expect(listIngestionTasks(users.owner)).toHaveLength(1);
    const chunkCount = withDatabase((database) => database.prepare(
      "SELECT COUNT(*) AS count FROM document_chunks WHERE document_id = ?",
    ).get(completed.documentId)) as { count: number };
    expect(chunkCount.count).toBeGreaterThan(0);
    expect(withDatabase((database) => database.prepare("SELECT COUNT(*) AS count FROM upload_tasks WHERE owner_id = ?").get(users.owner.id)))
      .toMatchObject({ count: 1 });
  });

  it("重启遗留 processing 被标记 incomplete，团队成员可见团队文档", async () => {
    const task = await uploadDocument({
      actor: users.owner, filename: "stale.pdf", bytes: Buffer.from(makePdf("stale.pdf", richText())),
      visibility: "team", teamId: "team-a", sourceUrl: "", licenseNote: null,
    });
    expect(task.status).toBe("completed");
    expect(listCorpusDocuments("", "all", 100, viewer(users.mate)).map((row) => row.id)).toContain(task.documentId);
    withDatabase((database) => database.prepare("UPDATE upload_tasks SET status = 'processing', updated_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 20 * 60_000).toISOString(), task.id));
    expect(getIngestionTask(users.owner, task.id)).toMatchObject({ status: "incomplete", attempts: 1 });
    const retried = await retryIngestionTask(users.owner, task.id);
    expect(retried).toMatchObject({ status: "completed", attempts: 2 });
  });

  it("仅所有者删除，并保持数据库与受限上传目录一致", async () => {
    const task = await uploadDocument({
      actor: users.owner, filename: "delete.pdf", bytes: Buffer.from(makePdf("delete.pdf", richText())),
      visibility: "private", teamId: null, sourceUrl: "", licenseNote: null,
    });
    const source = withDatabase((database) => database.prepare("SELECT local_path FROM upload_tasks WHERE id = ?").get(task.id)) as { local_path: string };
    await expectFailure(() => deleteIngestionTask(users.other, task.id), "TASK_NOT_FOUND", 404);
    deleteIngestionTask(users.owner, task.id);
    expect(existsSync(source.local_path)).toBe(false);
    expect(existsSync(path.dirname(source.local_path))).toBe(false);
    expect(withDatabase((database) => database.prepare("SELECT COUNT(*) AS count FROM documents WHERE id = ?").get(task.documentId)))
      .toMatchObject({ count: 0 });
    expect(withDatabase((database) => database.prepare("SELECT COUNT(*) AS count FROM document_chunks WHERE document_id = ?").get(task.documentId)))
      .toMatchObject({ count: 0 });
    expect(listIngestionTasks(users.owner)).toHaveLength(0);
    expect(() => getIngestionTask(users.owner, task.id)).toThrow(IngestionError);
  });
});

function richText() {
  return "实验目的 " + "持久解析测试。".repeat(50);
}
