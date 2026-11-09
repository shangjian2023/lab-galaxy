import type { KnowledgeGraphData, KnowledgeTask } from "./knowledge-types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null) as (T & { detail?: string; code?: string }) | null;
  if (!response.ok) throw new Error(payload?.detail ?? `知识服务请求失败（HTTP ${response.status}）`);
  if (!payload) throw new Error("知识服务返回了空响应");
  return payload;
}

export async function listKnowledgeTasks(): Promise<KnowledgeTask[]> {
  const payload = await request<{ tasks: KnowledgeTask[] }>("/api/knowledge/tasks", { cache: "no-store" });
  return payload.tasks;
}

export function createKnowledgeTask(documentId: string, maxChunks: number): Promise<KnowledgeTask> {
  return request<KnowledgeTask>("/api/knowledge/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, maxChunks, confirmCost: true }),
  });
}

export function publishKnowledgeTask(taskId: string): Promise<KnowledgeTask> {
  return request<KnowledgeTask>(`/api/knowledge/tasks/${encodeURIComponent(taskId)}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export function retryKnowledgeTask(taskId: string): Promise<KnowledgeTask> {
  return request<KnowledgeTask>(`/api/knowledge/tasks/${encodeURIComponent(taskId)}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmCost: true }),
  });
}

export function getKnowledgeGraph(): Promise<KnowledgeGraphData> {
  return request<KnowledgeGraphData>("/api/knowledge/graph", { cache: "no-store" });
}
