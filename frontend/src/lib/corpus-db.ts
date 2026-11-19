import { openReadonlyDatabase } from "@/lib/server-database";
import type { DocumentVisibility, Viewer } from "@/lib/auth-types";

export interface CorpusDocumentRow {
  id: string;
  title: string;
  sourceUrl: string;
  sourcePage: string | null;
  institution: string | null;
  format: "pdf" | "docx";
  licenseNote: string | null;
  status: "downloaded" | "parsed" | "failed";
  parser: string | null;
  pageCount: number | null;
  textLength: number | null;
  byteSize: number | null;
  error: string | null;
  ownerId: string | null;
  visibility: DocumentVisibility;
  teamId: string | null;
  updatedAt: string;
  chunkCount: number;
  sectionCount: number;
}

function documentAccess(viewer: Viewer | null, alias = "d") {
  if (!viewer) return { sql: `${alias}.visibility = 'public'`, params: [] as string[] };
  return {
    sql: `(${alias}.visibility = 'public' OR ${alias}.owner_id = ? OR (${alias}.visibility = 'team' AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = ${alias}.team_id AND tm.user_id = ?)))`,
    params: [viewer.id, viewer.id],
  };
}

export function listCorpusDocuments(query = "", status = "all", limit = 100, viewer: Viewer | null = null): CorpusDocumentRow[] {
  const database = openReadonlyDatabase();
  try {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit) || 100));
    const access = documentAccess(viewer);
    const rows = database.prepare(`
      SELECT d.*, COUNT(DISTINCT c.id) AS chunk_count, COUNT(DISTINCT s.id) AS section_count
      FROM documents d
      LEFT JOIN document_chunks c ON c.document_id = d.id
      LEFT JOIN document_sections s ON s.document_id = d.id
      WHERE ${access.sql}
        AND (? = '' OR d.title LIKE '%' || ? || '%' OR d.institution LIKE '%' || ? || '%')
        AND (? = 'all' OR d.status = ?)
      GROUP BY d.id
      ORDER BY d.updated_at DESC, d.title ASC
      LIMIT ?
    `).all(...access.params, query, query, query, status, status, safeLimit) as Array<Record<string, unknown>>;
    return rows.map(serializeDocument);
  } finally {
    database.close();
  }
}

export function getCorpusDocument(id: string, viewer: Viewer | null = null) {
  const database = openReadonlyDatabase();
  try {
    const access = documentAccess(viewer);
    const row = database.prepare(`
      SELECT d.*, COUNT(DISTINCT c.id) AS chunk_count, COUNT(DISTINCT s.id) AS section_count
      FROM documents d
      LEFT JOIN document_chunks c ON c.document_id = d.id
      LEFT JOIN document_sections s ON s.document_id = d.id
      WHERE d.id = ? AND ${access.sql} GROUP BY d.id
    `).get(id, ...access.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    const sections = database.prepare(`
      SELECT ordinal, title, text FROM document_sections WHERE document_id = ? ORDER BY ordinal
    `).all(id);
    const chunks = database.prepare(`
      SELECT id, chunk_index AS chunkIndex, page_start AS pageStart, page_end AS pageEnd,
             text, char_count AS charCount, token_estimate AS tokenEstimate
      FROM document_chunks WHERE document_id = ? ORDER BY chunk_index LIMIT 200
    `).all(id);
    return { document: serializeDocument(row), sections, chunks };
  } finally {
    database.close();
  }
}

export interface CorpusSource {
  chunkId: string;
  documentId: string;
  title: string;
  sourceUrl: string;
  institution: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  text: string;
  score: number;
  matchedTerms: string[];
}

function searchTerms(question: string): string[] {
  const cleaned = question.trim().slice(0, 500);
  const terms = new Map<string, number>();
  if (cleaned.length >= 2 && cleaned.length <= 40) terms.set(cleaned, 8);
  for (const match of cleaned.matchAll(/[A-Za-z][A-Za-z0-9_+.-]{1,}/g)) terms.set(match[0], 4);
  const stopwords = /(?:请问|我想|查找|哪些|什么|如何|为什么|怎么|比较|区别|分别|内容|关注|情况|特点|过程|术语|相关|介绍|分析|总结|一下|实验报告|实验|报告|方法|步骤|结果|结论|的|和|与|及|在|有|是|了|吗|呢|中|对|个|或|都|也|要|从|到|用|做|进行|实现|原理)/g;
  for (const match of cleaned.matchAll(/[㐀-鿿]{2,}/g)) {
    for (const part of match[0].split(stopwords)) {
      if (part.length >= 2) terms.set(part, part.length >= 4 ? 5 : 3);
      if (part.length > 8) {
        for (let index = 0; index < part.length - 1; index += 2) {
          const bigram = part.slice(index, index + 2);
          if (!terms.has(bigram)) terms.set(bigram, 1);
        }
      }
    }
  }
  return [...terms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([term]) => term);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function searchCorpus(question: string, limit = 6, viewer: Viewer | null = null): CorpusSource[] {
  const database = openReadonlyDatabase();
  try {
    const terms = searchTerms(question);
    const access = documentAccess(viewer);
    const matches = new Map<string, CorpusSource & { matched: Set<string> }>();
    const statement = database.prepare(`
      SELECT c.id AS chunk_id, c.document_id, c.page_start, c.page_end, c.text,
             d.title, d.source_url, d.institution
      FROM document_chunks c JOIN documents d ON d.id = c.document_id
      WHERE d.status = 'parsed' AND ${access.sql} AND c.text LIKE ? ESCAPE '\\' LIMIT 80
    `);
    for (const term of terms) {
      const rows = statement.all(...access.params, `%${escapeLike(term)}%`) as Array<Record<string, unknown>>;
      for (const row of rows) {
        const chunkId = String(row.chunk_id);
        const existing = matches.get(chunkId);
        if (existing) {
          existing.matched.add(term);
          existing.score += term.length >= 4 ? 5 : 3;
          existing.matchedTerms = [...existing.matched];
          continue;
        }
        const matched = new Set([term]);
        matches.set(chunkId, {
          chunkId,
          documentId: String(row.document_id),
          title: String(row.title),
          sourceUrl: String(row.source_url),
          institution: row.institution ? String(row.institution) : null,
          pageStart: row.page_start === null ? null : Number(row.page_start),
          pageEnd: row.page_end === null ? null : Number(row.page_end),
          text: String(row.text),
          score: term.length >= 4 ? 5 : 3,
          matchedTerms: [term],
          matched,
        });
      }
    }
    return [...matches.values()]
      .sort((a, b) => b.matched.size - a.matched.size || b.score - a.score || a.chunkId.localeCompare(b.chunkId))
      .slice(0, Math.max(1, Math.min(12, limit)))
      .map(({ matched: _matched, ...source }) => source);
  } finally {
    database.close();
  }
}

export function getCorpusSourcesByChunkIds(chunkIds: readonly string[], viewer: Viewer | null = null): CorpusSource[] {
  const ids = [...new Set(chunkIds.filter((id) => typeof id === "string" && id.length > 0))].slice(0, 8);
  if (!ids.length) return [];
  const database = openReadonlyDatabase();
  try {
    const access = documentAccess(viewer);
    const placeholders = ids.map(() => "?").join(",");
    const rows = database.prepare(`
      SELECT c.id AS chunk_id, c.document_id, c.page_start, c.page_end, c.text,
             d.title, d.source_url, d.institution
      FROM document_chunks c JOIN documents d ON d.id = c.document_id
      WHERE d.status = 'parsed' AND ${access.sql} AND c.id IN (${placeholders})
    `).all(...access.params, ...ids) as Array<Record<string, unknown>>;
    const byId = new Map(rows.map((row) => [String(row.chunk_id), row]));
    return ids.flatMap((chunkId) => {
      const row = byId.get(chunkId);
      if (!row) return [];
      return [{
        chunkId,
        documentId: String(row.document_id),
        title: String(row.title),
        sourceUrl: String(row.source_url),
        institution: row.institution ? String(row.institution) : null,
        pageStart: row.page_start === null ? null : Number(row.page_start),
        pageEnd: row.page_end === null ? null : Number(row.page_end),
        text: String(row.text),
        score: 100,
        matchedTerms: ["@节点原文"],
      }];
    });
  } finally {
    database.close();
  }
}

export function getCorpusStats(viewer: Viewer | null = null) {
  const database = openReadonlyDatabase();
  try {
    const access = documentAccess(viewer);
    const row = database.prepare(`
      WITH visible_documents AS (
        SELECT d.* FROM documents d WHERE d.status = 'parsed' AND ${access.sql}
      )
      SELECT
        (SELECT COUNT(*) FROM visible_documents) AS documents,
        (SELECT COUNT(*) FROM document_chunks c JOIN visible_documents d ON d.id = c.document_id) AS chunks,
        (SELECT COUNT(DISTINCT NULLIF(institution, '')) FROM visible_documents) AS institutions,
        (SELECT COALESCE(SUM(text_length), 0) FROM visible_documents) AS characters
    `).get(...access.params) as Record<string, unknown>;
    return { documents: Number(row.documents), chunks: Number(row.chunks), institutions: Number(row.institutions), characters: Number(row.characters) };
  } finally {
    database.close();
  }
}

function serializeDocument(row: Record<string, unknown>): CorpusDocumentRow {
  return {
    id: String(row.id),
    title: String(row.title),
    sourceUrl: String(row.source_url),
    sourcePage: row.source_page ? String(row.source_page) : null,
    institution: row.institution ? String(row.institution) : null,
    format: String(row.format) as "pdf" | "docx",
    licenseNote: row.license_note ? String(row.license_note) : null,
    status: String(row.status) as CorpusDocumentRow["status"],
    parser: row.parser ? String(row.parser) : null,
    pageCount: row.page_count === null ? null : Number(row.page_count),
    textLength: row.text_length === null ? null : Number(row.text_length),
    byteSize: row.byte_size === null ? null : Number(row.byte_size),
    error: row.error_message ? String(row.error_message) : null,
    ownerId: row.owner_id ? String(row.owner_id) : null,
    visibility: String(row.visibility ?? "public") as DocumentVisibility,
    teamId: row.team_id ? String(row.team_id) : null,
    updatedAt: String(row.updated_at),
    chunkCount: Number(row.chunk_count ?? 0),
    sectionCount: Number(row.section_count ?? 0),
  };
}
