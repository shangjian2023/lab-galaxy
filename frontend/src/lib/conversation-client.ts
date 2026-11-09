import type { ConversationMessage, ConversationMessageStatus, ConversationSource, ConversationSummary } from "./conversation-types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null) as (T & { detail?: string }) | null;
  if (!response.ok) {
    const error = new Error(payload?.detail ?? `会话请求失败（HTTP ${response.status}）`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  if (!payload) throw new Error("会话服务返回了空响应");
  return payload;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const payload = await request<{ conversations: ConversationSummary[] }>("/api/conversations", { cache: "no-store" });
  return payload.conversations;
}

export async function createConversation(title = ""): Promise<ConversationSummary> {
  const payload = await request<{ conversation: ConversationSummary }>("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return payload.conversation;
}

export async function listConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  const payload = await request<{ messages: ConversationMessage[] }>(`/api/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`, { cache: "no-store" });
  return payload.messages;
}

export async function renameConversation(conversationId: string, title: string): Promise<ConversationSummary> {
  const payload = await request<{ conversation: ConversationSummary }>(`/api/conversations/${encodeURIComponent(conversationId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return payload.conversation;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await request<{ deleted: boolean }>(`/api/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
}

export interface ConversationAskResult {
  messageId?: string;
  answer: string;
  sources: ConversationSource[];
  model: string | null;
  grounded: boolean;
  status: ConversationMessageStatus;
  error: string | null;
}

interface StreamHandlers {
  onMeta?: (event: { messageId?: string; conversationId?: string }) => void;
  onSources?: (sources: ConversationSource[]) => void;
  onDelta?: (text: string) => void;
}

function normalizeSources(value: unknown): ConversationSource[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((item) => {
    const source = item as Partial<ConversationSource>;
    return {
      chunkId: String(source.chunkId ?? ""),
      documentId: String(source.documentId ?? ""),
      title: source.title ?? null,
      sourceUrl: source.sourceUrl ?? null,
      institution: source.institution ?? null,
      pageStart: source.pageStart ?? null,
      pageEnd: source.pageEnd ?? null,
      text: source.text ?? null,
      matchedTerms: Array.isArray(source.matchedTerms) ? source.matchedTerms.map(String) : [],
      available: source.available !== false,
      accessDenied: source.accessDenied,
    };
  });
}

function parseEvent(block: string): { event: string; data: Record<string, unknown> } | null {
  const event = block.split(/\r?\n/).find((line) => line.startsWith("event:"))?.slice(6).trim();
  const dataText = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
  if (!event || !dataText) return null;
  try {
    const data = JSON.parse(dataText) as Record<string, unknown>;
    return { event, data };
  } catch {
    return null;
  }
}

export async function streamConversationAsk(input: {
  question: string;
  conversationId: string;
  signal: AbortSignal;
}, handlers: StreamHandlers = {}): Promise<ConversationAskResult> {
  const response = await fetch("/api/corpus/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ question: input.question, conversationId: input.conversationId }),
    signal: input.signal,
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("text/event-stream")) {
    const payload = await response.json().catch(() => null) as { detail?: string; answer?: string; messageId?: string; sources?: unknown; model?: string | null; grounded?: boolean } | null;
    if (!response.ok) throw new Error(payload?.detail ?? `问答请求失败（HTTP ${response.status}）`);
    return {
      messageId: payload?.messageId,
      answer: payload?.answer ?? "服务未返回回答。",
      sources: normalizeSources(payload?.sources),
      model: payload?.model ?? null,
      grounded: payload?.grounded === true,
      status: "completed",
      error: null,
    };
  }
  if (!response.body) throw new Error("浏览器未收到可读取的流式响应");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let answer = "";
  let sources: ConversationSource[] = [];
  let messageId: string | undefined;
  let result: ConversationAskResult | null = null;

  const consume = (block: string) => {
    const parsed = parseEvent(block);
    if (!parsed) return;
    const { event, data } = parsed;
    if (event === "meta") {
      messageId = typeof data.messageId === "string" ? data.messageId : undefined;
      handlers.onMeta?.({ messageId, conversationId: typeof data.conversationId === "string" ? data.conversationId : undefined });
    } else if (event === "sources") {
      sources = normalizeSources(data.sources);
      handlers.onSources?.(sources);
    } else if (event === "delta" && typeof data.text === "string") {
      answer += data.text;
      handlers.onDelta?.(data.text);
    } else if (event === "done") {
      const finalAnswer = typeof data.answer === "string" ? data.answer : answer.trim();
      result = {
        messageId: typeof data.messageId === "string" ? data.messageId : messageId,
        answer: finalAnswer,
        sources: normalizeSources(data.sources ?? sources),
        model: typeof data.model === "string" ? data.model : null,
        grounded: true,
        status: "completed",
        error: null,
      };
    } else if (event === "error") {
      const code = typeof data.code === "string" ? data.code : "MODEL_STREAM_ERROR";
      result = {
        messageId: typeof data.messageId === "string" ? data.messageId : messageId,
        answer: answer.trim(),
        sources,
        model: null,
        grounded: sources.length > 0,
        status: code === "ABORTED" ? "incomplete" : "failed",
        error: typeof data.detail === "string" ? data.detail : "模型流式回答失败",
      };
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    for (;;) {
      const delimiter = /\r?\n\r?\n/.exec(buffered);
      if (!delimiter || delimiter.index === undefined) break;
      const block = buffered.slice(0, delimiter.index);
      buffered = buffered.slice(delimiter.index + delimiter[0].length);
      consume(block);
    }
  }
  buffered += decoder.decode();
  if (buffered.trim()) consume(buffered);
  if (!result) throw new Error("流式响应在完成事件前结束");
  return result;
}
