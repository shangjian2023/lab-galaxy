import { modelRequest } from "./conversation-ask";
import type { CorpusSource } from "@/lib/corpus-db";

import { getModelConfig } from "@/lib/server-env";

export function createModelStreamRequest(question: string, sources: CorpusSource[], signal: AbortSignal): Request {
  const config = getModelConfig();
  const request = modelRequest(question, sources, true, signal);
  const headers = new Headers(request.headers);
  headers.set("X-Conversation-Model", config.model);
  return new Request(request, { headers });
}

export function extractModel(request: Request): string {
  return request.headers.get("X-Conversation-Model") ?? "";
}
