import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";
import { openIdentityDatabase, resolveDatabasePath } from "@/lib/server-database";
import { IngestionError } from "./ingestion-errors";
import type { IngestionActor, IngestionTask, UploadInput } from "./ingestion-types";

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const PROCESS_TIMEOUT_MS = 120_000;
const STALE_PROCESSING_MS = 10 * 60_000;

type TaskRow = Record<string, unknown>;

function now() {
  return new Date().toISOString();
}

function requireText(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new IngestionError("元数据格式错误", 400, "INVALID_METADATA");
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maximum) throw new IngestionError(`元数据长度不能超过 ${maximum} 字符`, 400, "METADATA_TOO_LONG");
  return trimmed;
}

export function normalizeUploadMetadata(input: {
  visibility?: unknown;
  teamId?: unknown;
  sourceUrl?: unknown;
  licenseNote?: unknown;
}) {
  const visibility = input.visibility ?? "private";
  if (visibility !== "private" && visibility !== "team" && visibility !== "public") {
    throw new IngestionError("可见性仅支持 private、team 或 public", 400, "INVALID_VISIBILITY");
  }
  const safeVisibility = visibility as "private" | "team" | "public";
  const teamId = requireText(input.teamId, 128);
  if (visibility === "team" && !teamId) throw new IngestionError("团队文档必须提供团队 ID", 400, "TEAM_REQUIRED");
  if (visibility !== "team" && teamId) throw new IngestionError("仅团队文档可以提供团队 ID", 400, "TEAM_NOT_ALLOWED");
  const sourceUrl = requireText(input.sourceUrl, 2048);
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    throw new IngestionError("来源链接必须使用 HTTP(S)", 400, "INVALID_SOURCE_URL");
  }
  return { visibility: safeVisibility, teamId, sourceUrl: sourceUrl ?? "", licenseNote: requireText(input.licenseNote, 500) };
}

function titleFromFilename(filename: string) {
  const title = path.basename(filename.replace(/\\/g, "/")).replace(/\.(pdf|docx)$/i, "").trim();
  if (!title) return "未命名上传文档";
  return title.slice(0, 200);
}

function extensionFromFilename(filename: string) {
  const match = /\.([a-z0-9]+)$/i.exec(path.basename(filename.replace(/\\/g, "/")));
  return match?.[1]?.toLowerCase() ?? "";
}

function zipNames(bytes: Buffer) {
  const signature = bytes.subarray(0, 4).toString("latin1");
  if (signature !== "PK\u0003\u0004") throw new IngestionError("文件不是有效的 DOCX", 400, "INVALID_DOCX");
  let centralDirectoryEnd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 66_000); index -= 1) {
    if (bytes.subarray(index, index + 4).toString("latin1") === "PK\u0005\u0006") {
      centralDirectoryEnd = index;
      break;
    }
  }
  if (centralDirectoryEnd < 0) throw new IngestionError("DOCX ZIP 结构不完整", 400, "INVALID_DOCX_ZIP");
  if (centralDirectoryEnd + 22 > bytes.length) throw new IngestionError("DOCX ZIP 结构不完整", 400, "INVALID_DOCX_ZIP");
  const entryCount = bytes.readUInt16LE(centralDirectoryEnd + 10);
  let offset = bytes.readUInt32LE(centralDirectoryEnd + 16);
  const names = new Set<string>();
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || bytes.subarray(offset, offset + 4).toString("latin1") !== "PK\u0001\u0002") {
      throw new IngestionError("DOCX ZIP 中央目录损坏", 400, "INVALID_DOCX_ZIP");
    }
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > bytes.length) throw new IngestionError("DOCX ZIP 中央目录损坏", 400, "INVALID_DOCX_ZIP");
    names.add(bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset = next;
  }
  return names;
}

export function validateUploadBytes(bytes: Buffer, format: "pdf" | "docx") {
  if (bytes.length === 0) throw new IngestionError("上传文件不能为空", 400, "EMPTY_FILE");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new IngestionError("上传文件不能超过 30 MiB", 413, "FILE_TOO_LARGE");
  if (format === "pdf") {
    if (!/^%PDF-\d\.\d/.test(bytes.subarray(0, 10).toString("latin1"))) throw new IngestionError("文件不是有效的 PDF", 400, "INVALID_PDF");
    if (bytes.subarray(0, 4096).includes("/Encrypt")) throw new IngestionError("暂不支持加密 PDF", 400, "ENCRYPTED_PDF");
    return;
  }
  const names = zipNames(bytes);
  if (!names.has("[Content_Types].xml") || !names.has("word/document.xml")) {
    throw new IngestionError("DOCX 缺少必需的文档部件", 400, "INVALID_DOCX_PACKAGE");
  }
}

function ensureVisibility(database: DatabaseSync, actor: IngestionActor, visibility: string, teamId: string | null) {
  if (visibility === "public" && actor.role !== "admin") {
    throw new IngestionError("公开语料上传需要管理员权限", 403, "ADMIN_REQUIRED");
  }
  if (visibility === "team") {
    const member = database.prepare(`
      SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?
    `).get(teamId, actor.id);
    if (!member) throw new IngestionError("你不是该团队成员", 403, "NOT_TEAM_MEMBER");
  }
}

export function resolveUploadRoot() {
  if (process.env.CORPUS_UPLOAD_DIR) return path.resolve(process.env.CORPUS_UPLOAD_DIR);
  return path.resolve(path.dirname(resolveDatabasePath()), "uploads");
}

function safeSourcePath(root: string, ownerId: string, documentId: string, format: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(ownerId) || !/^[A-Za-z0-9_-]+$/.test(documentId)) {
    throw new IngestionError("上传路径组件无效", 400, "INVALID_PATH");
  }
  const ownerDirectory = path.resolve(root, ownerId);
  const documentDirectory = path.resolve(ownerDirectory, documentId);
  const source = path.resolve(documentDirectory, `source.${format}`);
  if (!source.startsWith(`${documentDirectory}${path.sep}`) || !documentDirectory.startsWith(`${ownerDirectory}${path.sep}`)) {
    throw new IngestionError("上传路径无效", 400, "INVALID_PATH");
  }
  return { ownerDirectory, documentDirectory, source };
}

export function serializeIngestionTask(row: TaskRow): IngestionTask {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    documentId: String(row.document_id),
    originalFilename: String(row.original_filename),
    format: String(row.format) as "pdf" | "docx",
    visibility: String(row.visibility) as IngestionTask["visibility"],
    teamId: row.team_id === null ? null : String(row.team_id),
    sourceUrl: String(row.source_url),
    licenseNote: row.license_note === null ? null : String(row.license_note),
    sha256: String(row.sha256),
    status: String(row.status) as IngestionTask["status"],
    progress: Number(row.progress),
    attempts: Number(row.attempts),
    errorMessage: row.error_message === null ? null : String(row.error_message),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    startedAt: row.started_at === null ? null : String(row.started_at),
    finishedAt: row.finished_at === null ? null : String(row.finished_at),
  };
}

function markStaleTasks(database: DatabaseSync, ownerId: string) {
  database.prepare(`
    UPDATE upload_tasks
    SET status = 'incomplete', error_message = COALESCE(error_message, '处理进程中断，任务未完成'),
        updated_at = ?
    WHERE owner_id = ? AND status = 'processing' AND updated_at <= ?
  `).run(now(), ownerId, new Date(Date.now() - STALE_PROCESSING_MS).toISOString());
}

function getTaskRow(database: DatabaseSync, taskId: string, ownerId: string) {
  return database.prepare("SELECT * FROM upload_tasks WHERE id = ? AND owner_id = ?").get(taskId, ownerId) as TaskRow | undefined;
}

function requireTask(database: DatabaseSync, taskId: string, ownerId: string) {
  const row = getTaskRow(database, taskId, ownerId);
  if (!row) throw new IngestionError("任务不存在", 404, "TASK_NOT_FOUND");
  return row;
}

function metadataJson(input: UploadInput) {
  return JSON.stringify({
    uploadedBy: input.actor.id,
    originalFilename: input.filename,
    originalSourceUrl: input.sourceUrl || null,
    uploadTaskId: null,
  });
}

export async function uploadDocument(input: UploadInput): Promise<IngestionTask> {
  if (input.actor.status !== "active") throw new IngestionError("账号未激活", 403, "ACCOUNT_NOT_ACTIVE");
  const format = extensionFromFilename(input.filename);
  if (format !== "pdf" && format !== "docx") {
    throw new IngestionError("仅支持 PDF 或 DOCX 文件", 415, "UNSUPPORTED_FORMAT");
  }
  validateUploadBytes(input.bytes, format);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const database = openIdentityDatabase();
  let created = false;
  let documentId = "";
  let taskId = "";
  let transactionActive = false;
  try {
    ensureVisibility(database, input.actor, input.visibility, input.teamId);
    database.exec("BEGIN IMMEDIATE");
    transactionActive = true;
    const existing = database.prepare("SELECT * FROM upload_tasks WHERE owner_id = ? AND sha256 = ?")
      .get(input.actor.id, sha256) as TaskRow | undefined;
    if (existing) {
      database.exec("COMMIT");
      transactionActive = false;
      return serializeIngestionTask(existing);
    }
    documentId = randomUUID();
    taskId = randomUUID();
    const timestamp = now();
    const internalUrl = `upload://${input.actor.id}/${sha256}`;
    const root = resolveUploadRoot();
    const { ownerDirectory, documentDirectory, source } = safeSourcePath(root, input.actor.id, documentId, format);
    const ownerStat = lstatSync(ownerDirectory, { throwIfNoEntry: false });
    if (ownerStat && (ownerStat.isSymbolicLink() || !ownerStat.isDirectory())) {
      throw new IngestionError("上传目录类型无效", 400, "UNSAFE_UPLOAD_PATH");
    }
    const documentStat = lstatSync(documentDirectory, { throwIfNoEntry: false });
    if (documentStat && (documentStat.isSymbolicLink() || !documentStat.isDirectory())) {
      throw new IngestionError("上传目录类型无效", 400, "UNSAFE_UPLOAD_PATH");
    }
    mkdirSync(documentDirectory, { recursive: true });
    try {
      writeFileSync(source, input.bytes, { flag: "wx" });
      created = true;
    } catch (error) {
      if (!created) rmSync(documentDirectory, { recursive: true, force: true });
      throw error;
    }
    const title = titleFromFilename(input.filename);
    database.prepare(`
      INSERT INTO documents (
        id, title, source_url, format, license_note, local_path, sha256, byte_size,
        status, metadata_json, owner_id, visibility, team_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'downloaded', ?, ?, ?, ?, ?, ?)
    `).run(
      documentId, title, internalUrl, format, input.licenseNote, source, sha256, input.bytes.length,
      metadataJson(input), input.actor.id, input.visibility, input.teamId, timestamp, timestamp,
    );
    database.prepare(`
      INSERT INTO upload_tasks (
        id, owner_id, document_id, original_filename, format, visibility, team_id,
        source_url, license_note, local_path, sha256, status, progress, attempts,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 5, 0, ?, ?)
    `).run(
      taskId, input.actor.id, documentId, input.filename.slice(0, 255), format, input.visibility, input.teamId,
      input.sourceUrl || internalUrl, input.licenseNote, source, sha256, timestamp, timestamp,
    );
    database.exec("COMMIT");
    transactionActive = false;
  } catch (error) {
    if (created && documentId) {
      const failedDirectory = path.dirname(safeSourcePath(resolveUploadRoot(), input.actor.id, documentId, format).source);
      rmSync(failedDirectory, { recursive: true, force: true });
    }
    try {
      if (transactionActive) database.exec("ROLLBACK");
    } catch {
      // Connection state is closed below; SQLite rolls the transaction back with it.
    }
    throw error;
  } finally {
    database.close();
  }
  return processTask(taskId, input.actor.id);
}

function ingestionScriptPath() {
  const configured = process.env.CORPUS_INGESTION_SCRIPT;
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), "..", "scripts", "process_upload.py");
}

function runPythonProcess(taskId: string, databasePath: string, documentId: string, source: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.env.CORPUS_PYTHON ?? "python",
      ["-I", ingestionScriptPath(), "--database", databasePath, "--task-id", taskId, "--document-id", documentId, "--source", source],
      { cwd: path.resolve(process.cwd()), env: process.env, windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    let outputExceeded = false;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
    }, PROCESS_TIMEOUT_MS);
    const append = (chunk: Buffer, current: string) => {
      if (current.length > MAX_OUTPUT_BYTES || outputExceeded) {
        outputExceeded = true;
        return current.slice(0, MAX_OUTPUT_BYTES);
      }
      return current + chunk.toString("utf8").slice(0, MAX_OUTPUT_BYTES - current.length);
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(chunk, stdout); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(chunk, stderr); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new IngestionError(`解析进程启动失败：${error.message}`, 502, "PARSER_START_FAILED"));
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (outputExceeded) {
        reject(new IngestionError("解析进程输出超过安全上限", 502, "PARSER_OUTPUT_TOO_LARGE"));
        return;
      }
      if (signal) {
        reject(new IngestionError(`解析进程超时或被终止（${signal}）`, 504, "PARSER_TIMEOUT"));
        return;
      }
      if (code !== 0) {
        const detail = (stderr || stdout || `退出码 ${code}`).trim().slice(0, 2000);
        reject(new IngestionError(`文档解析失败：${detail}`, 422, "PARSER_FAILED"));
        return;
      }
      try {
        const result = JSON.parse(stdout) as { taskId?: unknown; documentId?: unknown };
        if (result.taskId !== taskId || result.documentId !== documentId) {
          reject(new IngestionError("解析进程返回了不匹配的任务", 502, "PARSER_RESULT_MISMATCH"));
          return;
        }
        resolve();
      } catch {
        reject(new IngestionError("解析进程返回了无效结果", 502, "INVALID_PARSER_RESULT"));
      }
    });
  });
}

function markTaskProcessing(database: DatabaseSync, taskId: string) {
  const changed = database.prepare(`
    UPDATE upload_tasks
    SET status = 'processing', progress = 10, attempts = attempts + 1,
        started_at = COALESCE(started_at, ?), updated_at = ?, error_message = NULL
    WHERE id = ? AND status IN ('queued', 'failed', 'incomplete')
  `).run(now(), now(), taskId).changes;
  if (!changed) throw new IngestionError("任务当前不能重试", 409, "TASK_NOT_RETRYABLE");
}

async function processTask(taskId: string, ownerId: string) {
  const databasePath = resolveDatabasePath();
  let source = "";
  let documentId = "";
  let database = openIdentityDatabase();
  try {
    const task = requireTask(database, taskId, ownerId);
    markTaskProcessing(database, taskId);
    source = String(task.local_path);
    documentId = String(task.document_id);
  } finally {
    database.close();
  }
  try {
    await runPythonProcess(taskId, databasePath, documentId, source);
  } catch (error) {
    database = openIdentityDatabase();
    try {
      const message = error instanceof Error ? error.message : String(error);
      database.prepare(`
        UPDATE upload_tasks
        SET status = 'failed', progress = MAX(progress, 20), error_message = ?, updated_at = ?, finished_at = ?
        WHERE id = ? AND status = 'processing'
      `).run(message.slice(0, 2000), now(), now(), taskId);
      database.prepare("UPDATE documents SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?")
        .run(message.slice(0, 2000), now(), documentId);
    } finally {
      database.close();
    }
    throw error;
  }
  database = openIdentityDatabase();
  try {
    const task = requireTask(database, taskId, ownerId);
    if (task.status !== "completed") throw new IngestionError("解析任务未完成", 502, "PARSER_NOT_COMPLETED");
    return serializeIngestionTask(task);
  } finally {
    database.close();
  }
}

export function listIngestionTasks(actor: IngestionActor): IngestionTask[] {
  const database = openIdentityDatabase();
  try {
    markStaleTasks(database, actor.id);
    const rows = database.prepare(`
      SELECT * FROM upload_tasks
      WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100
    `).all(actor.id) as TaskRow[];
    return rows.map(serializeIngestionTask);
  } finally {
    database.close();
  }
}

export function getIngestionTask(actor: IngestionActor, taskId: string): IngestionTask {
  const database = openIdentityDatabase();
  try {
    markStaleTasks(database, actor.id);
    return serializeIngestionTask(requireTask(database, taskId, actor.id));
  } finally {
    database.close();
  }
}

export async function retryIngestionTask(actor: IngestionActor, taskId: string) {
  if (actor.status !== "active") throw new IngestionError("账号未激活", 403, "ACCOUNT_NOT_ACTIVE");
  const database = openIdentityDatabase();
  try {
    markStaleTasks(database, actor.id);
    requireTask(database, taskId, actor.id);
  } finally {
    database.close();
  }
  return processTask(taskId, actor.id);
}

export function deleteIngestionTask(actor: IngestionActor, taskId: string) {
  if (actor.status !== "active") throw new IngestionError("账号未激活", 403, "ACCOUNT_NOT_ACTIVE");
  const database = openIdentityDatabase();
  let localPath = "";
  try {
    const task = requireTask(database, taskId, actor.id);
    localPath = String(task.local_path);
    const root = resolveUploadRoot();
    const expected = safeSourcePath(root, actor.id, String(task.document_id), String(task.format));
    if (path.resolve(localPath) !== expected.source) {
      throw new IngestionError("任务文件路径不受上传目录约束", 400, "UNSAFE_UPLOAD_PATH");
    }
    const sourceStat = lstatSync(expected.source, { throwIfNoEntry: false });
    if (sourceStat && (sourceStat.isSymbolicLink() || !sourceStat.isFile())) {
      throw new IngestionError("任务文件路径类型无效", 400, "UNSAFE_UPLOAD_PATH");
    }
    const directoryStat = lstatSync(expected.documentDirectory, { throwIfNoEntry: false });
    if (!directoryStat || directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      throw new IngestionError("任务上传目录类型无效", 400, "UNSAFE_UPLOAD_PATH");
    }
    const unexpectedEntries = readdirSync(expected.documentDirectory).filter((entry) => entry !== path.basename(expected.source));
    if (unexpectedEntries.length > 0) {
      throw new IngestionError("任务上传目录包含意外文件", 400, "UNSAFE_UPLOAD_DIRECTORY");
    }
    database.exec("BEGIN IMMEDIATE");
    database.prepare("DELETE FROM documents WHERE id = ? AND owner_id = ?").run(String(task.document_id), actor.id);
    database.prepare("DELETE FROM upload_tasks WHERE id = ? AND owner_id = ?").run(taskId, actor.id);
    database.exec("COMMIT");
  } catch (error) {
    try {
      if (database.prepare("SELECT 1 FROM upload_tasks WHERE id = ?").get(taskId)) database.exec("ROLLBACK");
    } catch {
      // Closing an inconsistent connection causes SQLite to roll back.
    }
    throw error;
  } finally {
    database.close();
  }
  const source = path.resolve(localPath);
  const documentDirectory = path.dirname(source);
  if (existsSync(source)) unlinkSync(source);
  rmSync(documentDirectory, { recursive: true, force: true });
}
