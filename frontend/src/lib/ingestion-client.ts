import type { DocumentVisibility } from "./auth-types";
import type { IngestionTask } from "./ingestion-types";

interface ApiErrorPayload {
  detail?: string;
  code?: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as (T & ApiErrorPayload) | null;
  if (!response.ok) {
    const error = new Error(payload?.detail ?? `请求失败（HTTP ${response.status}）`) as Error & { code?: string; status?: number };
    error.code = payload?.code;
    error.status = response.status;
    throw error;
  }
  if (!payload) throw new Error("服务返回了空响应");
  return payload;
}

export async function listIngestionTasks(): Promise<IngestionTask[]> {
  const response = await fetch("/api/ingestion/tasks", { cache: "no-store" });
  const payload = await readResponse<{ tasks: IngestionTask[] }>(response);
  return payload.tasks;
}

export async function uploadIngestionDocument(input: {
  file: File;
  visibility: DocumentVisibility;
  teamId?: string | null;
  sourceUrl?: string;
  licenseNote?: string;
}): Promise<IngestionTask> {
  const body = new FormData();
  body.append("file", input.file);
  body.append("visibility", input.visibility);
  if (input.visibility === "team" && input.teamId) body.append("teamId", input.teamId);
  if (input.sourceUrl?.trim()) body.append("sourceUrl", input.sourceUrl.trim());
  if (input.licenseNote?.trim()) body.append("licenseNote", input.licenseNote.trim());
  const response = await fetch("/api/ingestion/upload", { method: "POST", body });
  const payload = await readResponse<{ task: IngestionTask }>(response);
  return payload.task;
}

export async function retryIngestionTask(taskId: string): Promise<IngestionTask> {
  const response = await fetch(`/api/ingestion/tasks/${encodeURIComponent(taskId)}/retry`, { method: "POST" });
  const payload = await readResponse<{ task: IngestionTask }>(response);
  return payload.task;
}

export async function deleteIngestionTask(taskId: string): Promise<void> {
  const response = await fetch(`/api/ingestion/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
  await readResponse<{ deleted: boolean }>(response);
}
