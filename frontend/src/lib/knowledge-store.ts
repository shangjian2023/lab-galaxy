import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { mkdirSync } from "node:fs";
import type { Viewer } from "./auth-types";
import { resolveDatabasePath } from "./server-database";
import type {
  KnowledgeChunkInput,
  KnowledgeDocumentSummary,
  KnowledgeEntityCandidate,
  KnowledgeGraphData,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeModel,
  KnowledgeRelationCandidate,
  KnowledgeTask,
  KnowledgeTaskEntity,
  KnowledgeTaskRelation,
} from "./knowledge-types";
import { validateKnowledgeModelOutput } from "./knowledge-validation";
import { requestKnowledgeExtraction } from "./knowledge-model";

export const KNOWLEDGE_DEFAULT_CHUNKS = 4;
export const KNOWLEDGE_MAX_CHUNKS = 8;
export const MAX_KNOWLEDGE_TOKEN_ESTIMATE = 12000;

let configuredModel: KnowledgeModel | undefined;

export function setKnowledgeModelForTests(model: KnowledgeModel | undefined) {
  configuredModel = model;
}

export function resolveKnowledgeModel(): KnowledgeModel {
  if (configuredModel) return configuredModel;
  return requestKnowledgeExtraction;
}

function now() {
  return new Date().toISOString();
}

function documentAccess(viewer: Viewer | null, alias = "d") {
  if (!viewer) return { sql: `${alias}.visibility = 'public'`, params: [] as string[] };
  return {
    sql: `(${alias}.visibility = 'public' OR ${alias}.owner_id = ? OR (${alias}.visibility = 'team' AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = ${alias}.team_id AND tm.user_id = ?)))`,
    params: [viewer.id, viewer.id],
  };
}

function openDatabase(): DatabaseSync {
  const filename = resolveDatabasePath();
  mkdirSync(path.dirname(filename), { recursive: true });
  const database = new DatabaseSync(filename);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS knowledge_extraction_tasks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'failed')),
      result_ready INTEGER NOT NULL DEFAULT 0 CHECK (result_ready IN (0, 1)),
      model TEXT NOT NULL,
      max_chunks INTEGER NOT NULL CHECK (max_chunks BETWEEN 1 AND 8),
      attempt INTEGER NOT NULL CHECK (attempt >= 1),
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT
    );
    CREATE TABLE IF NOT EXISTS knowledge_entities (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES knowledge_extraction_tasks(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      type TEXT NOT NULL,
      group_name TEXT NOT NULL CHECK (group_name IN ('experiment', 'resource', 'knowledge')),
      summary TEXT NOT NULL,
      confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
      source_document_id TEXT NOT NULL,
      source_chunk_id TEXT NOT NULL,
      source_page_start INTEGER,
      source_page_end INTEGER,
      UNIQUE (task_id, normalized_name)
    );
    CREATE TABLE IF NOT EXISTS knowledge_relations (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES knowledge_extraction_tasks(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      source_entity_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      target_entity_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      relation TEXT NOT NULL,
      confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
      source_document_id TEXT NOT NULL,
      source_chunk_id TEXT NOT NULL,
      source_page_start INTEGER,
      source_page_end INTEGER,
      UNIQUE (task_id, source_entity_id, target_entity_id, relation)
    );
    CREATE TABLE IF NOT EXISTS knowledge_evidence (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES knowledge_extraction_tasks(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL CHECK (item_type IN ('entity', 'relation')),
      item_id TEXT NOT NULL,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_id TEXT NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
      page_start INTEGER,
      page_end INTEGER,
      text TEXT NOT NULL,
      UNIQUE (item_type, item_id, chunk_id)
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_tasks_document ON knowledge_extraction_tasks(document_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_tasks_owner ON knowledge_extraction_tasks(owner_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_entities_document ON knowledge_entities(document_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_relations_document ON knowledge_relations(document_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_evidence_chunk ON knowledge_evidence(chunk_id);
  `);
  return database;
}

export function openKnowledgeDatabaseForTests(): DatabaseSync {
  return openDatabase();
}

export function getVisibleKnowledgeDocument(
  documentId: string,
  viewer: Viewer,
): { document: KnowledgeDocumentSummary; chunks: KnowledgeChunkInput[] } | null {
  const database = openDatabase();
  try {
    const access = documentAccess(viewer);
    const document = database.prepare(`
      SELECT id, title, visibility, owner_id FROM documents d
      WHERE d.id = ? AND d.status = 'parsed' AND ${access.sql}
    `).get(documentId, ...access.params) as KnowledgeDocumentSummary | undefined;
    if (!document) return null;
    const chunks = database.prepare(`
      SELECT id AS chunkId, page_start AS pageStart, page_end AS pageEnd, text
      FROM document_chunks WHERE document_id = ? ORDER BY chunk_index
    `).all(documentId).map((row) => {
      const chunk = row as Record<string, unknown>;
      return {
        chunkId: String(chunk.chunkId),
        pageStart: chunk.pageStart === null ? null : Number(chunk.pageStart),
        pageEnd: chunk.pageEnd === null ? null : Number(chunk.pageEnd),
        text: String(chunk.text),
      } satisfies KnowledgeChunkInput;
    });
    return { document, chunks };
  } finally {
    database.close();
  }
}

export function getKnowledgeTasks(viewer: Viewer, status?: string): KnowledgeTask[] {
  if (status && !["draft", "published", "failed"].includes(status)) return [];
  const database = openDatabase();
  try {
    const rows = database.prepare(`
      SELECT t.*, d.title AS document_title FROM knowledge_extraction_tasks t
      JOIN documents d ON d.id = t.document_id
      WHERE t.owner_id = ? AND (? = '' OR t.status = ?) AND EXISTS (
        SELECT 1 FROM documents d2 WHERE d2.id = t.document_id AND ${documentAccess(viewer, "d2").sql}
      )
      ORDER BY t.created_at DESC LIMIT 100
    `).all(viewer.id, status ?? "", status ?? "", ...documentAccess(viewer, "d2").params) as Array<Record<string, unknown>>;
    return rows.map((row) => serializeTask(database, row));
  } finally {
    database.close();
  }
}

export function getKnowledgeTask(taskId: string, viewer: Viewer): KnowledgeTask | null {
  const database = openDatabase();
  try {
    const row = database.prepare(`
      SELECT t.*, d.title AS document_title FROM knowledge_extraction_tasks t
      JOIN documents d ON d.id = t.document_id
      WHERE t.id = ? AND t.owner_id = ? AND EXISTS (
        SELECT 1 FROM documents d2 WHERE d2.id = t.document_id AND ${documentAccess(viewer, "d2").sql}
      )
    `).get(taskId, viewer.id, ...documentAccess(viewer, "d2").params) as Record<string, unknown> | undefined;
    return row ? serializeTask(database, row) : null;
  } finally {
    database.close();
  }
}

function selectedChunks(chunks: KnowledgeChunkInput[], maxChunks: number) {
  const selected = chunks.slice(0, maxChunks);
  let tokens = 0;
  const limited: KnowledgeChunkInput[] = [];
  for (const chunk of selected) {
    const estimate = Math.ceil(chunk.text.length / 3);
    if (tokens + estimate > MAX_KNOWLEDGE_TOKEN_ESTIMATE) continue;
    tokens += estimate;
    limited.push(chunk);
  }
  return limited;
}

export async function createKnowledgeExtractionTask(input: {
  documentId: string;
  viewer: Viewer;
  maxChunks: number;
  model: string;
}): Promise<{ task: KnowledgeTask } | { error: "DOCUMENT_NOT_VISIBLE" | "NO_CHUNKS" }> {
  const source = getVisibleKnowledgeDocument(input.documentId, input.viewer);
  if (!source) return { error: "DOCUMENT_NOT_VISIBLE" };
  const chunks = selectedChunks(source.chunks, input.maxChunks);
  if (!chunks.length) return { error: "NO_CHUNKS" };
  const model = resolveKnowledgeModel();
  const timestamp = now();
  const taskId = randomUUID();
  let database = openDatabase();
  try {
    database.prepare(`
      INSERT INTO knowledge_extraction_tasks
      (id, document_id, owner_id, status, result_ready, model, max_chunks, attempt, created_at, updated_at)
      VALUES (?, ?, ?, 'draft', 0, ?, ?, 1, ?, ?)
    `).run(taskId, input.documentId, input.viewer.id, input.model, chunks.length, timestamp, timestamp);
  } finally {
    database.close();
  }

  try {
    const content = await model({ model: input.model, chunks });
    const result = validateKnowledgeModelOutput(content, chunks);
    database = openDatabase();
    try {
      database.exec("BEGIN IMMEDIATE");
      saveExtraction(database, taskId, input.documentId, result, chunks);
      database.exec("COMMIT");
    } catch (error) {
      if (database.isTransaction) database.exec("ROLLBACK");
      throw error;
    } finally {
      database.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "知识抽取失败";
    database = openDatabase();
    try {
      database.prepare("UPDATE knowledge_extraction_tasks SET status = 'failed', result_ready = 0, error_message = ?, updated_at = ? WHERE id = ?")
        .run(message.slice(0, 1000), now(), taskId);
    } finally {
      database.close();
    }
  }
  const task = getKnowledgeTask(taskId, input.viewer);
  return task ? { task } : { error: "DOCUMENT_NOT_VISIBLE" };
}

function saveExtraction(
  database: DatabaseSync,
  taskId: string,
  documentId: string,
  result: { entities: KnowledgeEntityCandidate[]; relations: KnowledgeRelationCandidate[] },
  chunks: readonly KnowledgeChunkInput[],
) {
  const chunkById = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  const entityIds = new Map<string, string>();
  const timestamp = now();
  for (const entity of result.entities) {
    const entityId = randomUUID();
    entityIds.set(entity.normalizedName, entityId);
    const chunk = chunkById.get(entity.evidenceChunkId)!;
    database.prepare(`
      INSERT INTO knowledge_entities
      (id, task_id, document_id, name, normalized_name, type, group_name, summary, confidence,
       source_document_id, source_chunk_id, source_page_start, source_page_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entityId, taskId, documentId, entity.name, entity.normalizedName, entity.type, entity.group,
      entity.summary, entity.confidence, documentId, entity.evidenceChunkId, chunk.pageStart, chunk.pageEnd,
    );
    database.prepare(`
      INSERT INTO knowledge_evidence
      (id, task_id, item_type, item_id, document_id, chunk_id, page_start, page_end, text)
      VALUES (?, ?, 'entity', ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), taskId, entityId, documentId, entity.evidenceChunkId, chunk.pageStart, chunk.pageEnd, chunk.text);
  }
  for (const relation of result.relations) {
    const relationId = randomUUID();
    const source = entityIds.get(result.entities.find((entity) => entity.name === relation.sourceName)?.normalizedName ?? "")!;
    const target = entityIds.get(result.entities.find((entity) => entity.name === relation.targetName)?.normalizedName ?? "")!;
    database.prepare(`
      INSERT INTO knowledge_relations
      (id, task_id, document_id, source_entity_id, target_entity_id, relation, confidence,
       source_document_id, source_chunk_id, source_page_start, source_page_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      relationId, taskId, documentId, source, target, relation.relation,
      relation.confidence, documentId, relation.evidenceChunkId,
      chunkById.get(relation.evidenceChunkId)!.pageStart, chunkById.get(relation.evidenceChunkId)!.pageEnd,
    );
    database.prepare(`
      INSERT INTO knowledge_evidence
      (id, task_id, item_type, item_id, document_id, chunk_id, page_start, page_end, text)
      VALUES (?, ?, 'relation', ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), taskId, relationId, documentId, relation.evidenceChunkId,
      chunkById.get(relation.evidenceChunkId)!.pageStart, chunkById.get(relation.evidenceChunkId)!.pageEnd,
      chunkById.get(relation.evidenceChunkId)!.text);
  }
  database.prepare(`
    UPDATE knowledge_extraction_tasks SET result_ready = 1, error_message = NULL, updated_at = ? WHERE id = ?
  `).run(timestamp, taskId);
}

export async function retryKnowledgeExtraction(taskId: string, viewer: Viewer): Promise<{ task: KnowledgeTask } | { error: "TASK_NOT_FOUND" | "DOCUMENT_NOT_VISIBLE" | "NO_CHUNKS" | "TASK_NOT_FAILED" }> {
  const prior = getKnowledgeTask(taskId, viewer);
  if (!prior) return { error: "TASK_NOT_FOUND" };
  if (prior.status !== "failed") return { error: "TASK_NOT_FAILED" };
  const database = openDatabase();
  let documentId = "";
  try {
    database.exec("BEGIN IMMEDIATE");
    database.prepare("DELETE FROM knowledge_extraction_tasks WHERE id = ? AND owner_id = ?").run(taskId, viewer.id);
    const selected = database.prepare("SELECT changes() AS count").get() as { count: number };
    if (selected.count !== 1) {
      database.exec("ROLLBACK");
      return { error: "TASK_NOT_FOUND" };
    }
    documentId = prior.documentId;
    database.exec("COMMIT");
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
  const result = await createKnowledgeExtractionTask({
    documentId,
    viewer,
    maxChunks: prior.maxChunks,
    model: prior.model,
  });
  if ("error" in result) return result;
  const database2 = openDatabase();
  try {
    database2.prepare("UPDATE knowledge_extraction_tasks SET attempt = ? WHERE id = ?").run(prior.attempt + 1, result.task.id);
  } finally {
    database2.close();
  }
  return { task: getKnowledgeTask(result.task.id, viewer)! };
}

export function publishKnowledgeTask(taskId: string, viewer: Viewer): { task: KnowledgeTask } | { error: "TASK_NOT_FOUND" | "TASK_NOT_DRAFT" } {
  const database = openDatabase();
  try {
    const prior = getKnowledgeTask(taskId, viewer);
    if (!prior) return { error: "TASK_NOT_FOUND" };
    if (prior.status !== "draft" || !prior.resultReady) return { error: "TASK_NOT_DRAFT" };
    database.prepare(`
      UPDATE knowledge_extraction_tasks
      SET status = 'published', published_at = ?, updated_at = ?
      WHERE id = ? AND owner_id = ? AND status = 'draft' AND result_ready = 1
    `).run(now(), now(), taskId, viewer.id);
    return { task: getKnowledgeTask(taskId, viewer)! };
  } finally {
    database.close();
  }
}

function serializeTask(database: DatabaseSync, row: Record<string, unknown>): KnowledgeTask {
  const taskId = String(row.id);
  const entities = database.prepare(`
    SELECT * FROM knowledge_entities WHERE task_id = ? ORDER BY name
  `).all(taskId) as Array<Record<string, unknown>>;
  const entityById = new Map(entities.map((entity) => [String(entity.id), entity]));
  const relations = database.prepare(`
    SELECT * FROM knowledge_relations WHERE task_id = ? ORDER BY relation
  `).all(taskId) as Array<Record<string, unknown>>;
  const evidence = database.prepare(`
    SELECT * FROM knowledge_evidence WHERE task_id = ? ORDER BY item_type, item_id, chunk_id
  `).all(taskId) as Array<Record<string, unknown>>;
  return {
    id: taskId,
    documentId: String(row.document_id),
    documentTitle: String(row.document_title),
    ownerId: String(row.owner_id),
    status: row.status as KnowledgeTask["status"],
    resultReady: row.result_ready === 1,
    model: String(row.model),
    maxChunks: Number(row.max_chunks),
    attempt: Number(row.attempt),
    errorMessage: row.error_message === null ? null : String(row.error_message),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    publishedAt: row.published_at === null ? null : String(row.published_at),
    entities: entities.map((entity) => ({
      id: String(entity.id),
      taskId,
      documentId: String(entity.document_id),
      name: String(entity.name),
      type: String(entity.type),
      group: String(entity.group_name) as KnowledgeTaskEntity["group"],
      summary: String(entity.summary),
      confidence: Number(entity.confidence),
      sourceDocumentId: String(entity.source_document_id),
      sourceChunkId: String(entity.source_chunk_id),
      sourcePageStart: entity.source_page_start === null ? null : Number(entity.source_page_start),
      sourcePageEnd: entity.source_page_end === null ? null : Number(entity.source_page_end),
    })),
    relations: relations.map((relation) => ({
      id: String(relation.id),
      taskId,
      documentId: String(relation.document_id),
      sourceEntityId: String(relation.source_entity_id),
      sourceName: String(entityById.get(String(relation.source_entity_id))?.name ?? ""),
      targetEntityId: String(relation.target_entity_id),
      targetName: String(entityById.get(String(relation.target_entity_id))?.name ?? ""),
      relation: String(relation.relation),
      confidence: Number(relation.confidence),
      sourceDocumentId: String(relation.source_document_id),
      sourceChunkId: String(relation.source_chunk_id),
      sourcePageStart: relation.source_page_start === null ? null : Number(relation.source_page_start),
      sourcePageEnd: relation.source_page_end === null ? null : Number(relation.source_page_end),
    })),
    evidence: evidence.map((item) => ({
      id: String(item.id),
      itemType: String(item.item_type) as "entity" | "relation",
      itemId: String(item.item_id),
      chunkId: String(item.chunk_id),
      documentId: String(item.document_id),
      pageStart: item.page_start === null ? null : Number(item.page_start),
      pageEnd: item.page_end === null ? null : Number(item.page_end),
      text: String(item.text),
    })),
  };
}

export function getKnowledgeGraph(viewer: Viewer | null): KnowledgeGraphData {
  const database = openDatabase();
  try {
    const access = documentAccess(viewer);
    const nodeRows = database.prepare(`
      SELECT e.*, t.status, d.updated_at FROM knowledge_entities e
      JOIN knowledge_extraction_tasks t ON t.id = e.task_id
      JOIN documents d ON d.id = e.document_id
      WHERE t.status = 'published' AND ${documentAccess(viewer, "d").sql}
      ORDER BY e.name
    `).all(...access.params) as Array<Record<string, unknown>>;
    const nodes: KnowledgeGraphNode[] = nodeRows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      type: String(row.type),
      group: String(row.group_name) as KnowledgeGraphNode["group"],
      summary: String(row.summary),
      year: new Date(Date.parse(String(row.updated_at))).getUTCFullYear() || 0,
      documentId: String(row.document_id),
      taskId: String(row.task_id),
      sourceDocumentId: String(row.source_document_id),
      sourceChunkId: String(row.source_chunk_id),
      sourcePageStart: row.source_page_start === null ? null : Number(row.source_page_start),
      sourcePageEnd: row.source_page_end === null ? null : Number(row.source_page_end),
    }));
    const visibleNodeIds = new Set(nodes.map((node) => node.id));
    const edgeRows = database.prepare(`
      SELECT r.*, t.status FROM knowledge_relations r
      JOIN knowledge_extraction_tasks t ON t.id = r.task_id
      WHERE t.status = 'published'
    `).all() as Array<Record<string, unknown>>;
    const edges: KnowledgeGraphEdge[] = edgeRows
      .filter((row) => visibleNodeIds.has(String(row.source_entity_id)) && visibleNodeIds.has(String(row.target_entity_id)))
      .map((row) => ({
        id: String(row.id),
        source: String(row.source_entity_id),
        target: String(row.target_entity_id),
        relation: String(row.relation),
        confidence: Number(row.confidence),
        taskId: String(row.task_id),
        documentId: String(row.document_id),
        sourceDocumentId: String(row.source_document_id),
        sourceChunkId: String(row.source_chunk_id),
        sourcePageStart: row.source_page_start === null ? null : Number(row.source_page_start),
        sourcePageEnd: row.source_page_end === null ? null : Number(row.source_page_end),
      }));
    return { nodes, edges };
  } finally {
    database.close();
  }
}
