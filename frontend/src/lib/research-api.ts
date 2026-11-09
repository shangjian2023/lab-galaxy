import type { ResearchDocument } from "./research-types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

interface CorpusDocumentDto {
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
  updatedAt: string;
  chunkCount: number;
  sectionCount: number;
  ownerId: string | null;
  visibility: "private" | "team" | "public";
  teamId: string | null;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export async function listResearchDocuments(): Promise<ResearchDocument[]> {
  const response = await fetch("/api/corpus/documents?limit=200", { cache: "no-store" });
  const payload = await response.json().catch(() => null) as { documents?: CorpusDocumentDto[]; detail?: string } | null;
  if (!response.ok) throw new Error(payload?.detail ?? `文档库读取失败（HTTP ${response.status}）`);
  return (payload?.documents ?? []).map((document) => ({
    id: document.id,
    title: document.title,
    fileType: document.format.toUpperCase(),
    size: formatFileSize(document.byteSize),
    status: document.status === "parsed" ? "completed" : document.status === "failed" ? "failed" : "processing",
    updatedAt: new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(document.updatedAt)),
    entities: 0,
    relations: 0,
    owner: document.institution || "公开语料",
    error: document.error ?? undefined,
    sourceUrl: document.sourceUrl,
    sourcePage: document.sourcePage ?? undefined,
    institution: document.institution ?? undefined,
    parser: document.parser ?? undefined,
    pageCount: document.pageCount ?? undefined,
    textLength: document.textLength ?? undefined,
    chunkCount: document.chunkCount,
    sectionCount: document.sectionCount,
    licenseNote: document.licenseNote ?? undefined,
    ownerId: document.ownerId,
    visibility: document.visibility,
    teamId: document.teamId,
  }));
}

export interface ResearchDocumentPreview {
  sections: Array<{ ordinal: number; title: string; text: string }>;
  chunks: Array<{ id: string; chunkIndex: number; pageStart: number | null; pageEnd: number | null; text: string; charCount: number }>;
}

export async function getResearchDocumentPreview(id: string): Promise<ResearchDocumentPreview> {
  const response = await fetch(`/api/corpus/documents/${encodeURIComponent(id)}`, { cache: "no-store" });
  const payload = await response.json().catch(() => null) as (ResearchDocumentPreview & { detail?: string }) | null;
  if (!response.ok) throw new Error(payload?.detail ?? `原文读取失败（HTTP ${response.status}）`);
  return { sections: payload?.sections ?? [], chunks: payload?.chunks ?? [] };
}

export interface UploadDocumentResult {
  id: string;
  status?: string;
  title?: string;
}

export async function uploadDocument(file: File): Promise<UploadDocumentResult> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${API_BASE}/documents/upload`, { method: "POST", body });
  const payload = await response.json().catch(() => null) as { detail?: string; id?: string; document_id?: string; status?: string; title?: string } | null;
  if (!response.ok) throw new Error(payload?.detail ?? `上传失败（HTTP ${response.status}）`);
  const id = payload?.id ?? payload?.document_id;
  if (!id) throw new Error("服务未返回文档 ID，请检查后端接口契约。");
  return { id, status: payload?.status, title: payload?.title };
}
