import type { CorpusSource } from "@/lib/corpus-db";
import type { Viewer } from "@/lib/auth-types";
import type { ConversationMessage } from "./conversation-types";
import { completeMessage, failPendingMessage, storeSources, updateMessageSources } from "./conversation-store";
import { createModelStreamRequest, extractModel } from "./conversation-request";

const REQUEST_TIMEOUT_MS = 90_000;

type StreamEvent =
  | { type: "meta"; messageId?: string; conversationId?: string }
  | { type: "sources"; sources: CorpusSource[] }
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string; status: string; model: string; answer: string; sources: CorpusSource[] }
  | { type: "error"; code: string; detail: string; messageId?: string };

function encodeEvent(event: StreamEvent): Uint8Array {
  return new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

function parseDataMessage(chunk: string): Array<{ event?: string; data?: string }> {
  const events: Array<{ event?: string; data?: string }> = [];
  for (const block of chunk.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (data) events.push({ event, data });
  }
  return events;
}

function contentFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }> }).choices;
  const choice = choices?.[0];
  return choice?.delta?.content ?? choice?.message?.content ?? "";
}

export async function streamAsk(
  viewer: Viewer,
  question: string,
  conversationId: string | undefined,
  message: ConversationMessage,
  sources: CorpusSource[],
  upstreamRequest: Request,
  clientSignal: AbortSignal | null,
): Promise<Response> {
  const persist = message.conversationId !== "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onClientAbort = () => controller.abort();
  clientSignal?.addEventListener("abort", onClientAbort, { once: true });
  const model = extractModel(upstreamRequest);
  const stream = new ReadableStream<Uint8Array>({
    async start(controllerStream) {
      let streamOpen = true;
      const send = (event: StreamEvent) => {
        if (!streamOpen) return;
        try {
          controllerStream.enqueue(encodeEvent(event));
        } catch {
          streamOpen = false;
          controller.abort();
        }
      };
      let answer = "";
      try {
        send({ type: "meta", messageId: message.id, conversationId });
        send({ type: "sources", sources });
        const response = await fetch(new Request(upstreamRequest, { signal: controller.signal }));
        if (!response.ok || !response.body) {
          await response.text().catch(() => "");
          const error = `模型服务返回 HTTP ${response.status}`;
          if (persist) failPendingMessage(viewer, message.id, error);
          send({ type: "error", code: "MODEL_HTTP_ERROR", detail: error, messageId: message.id });
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffered = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffered += decoder.decode(value, { stream: true });
          for (;;) {
            const delimiter = /\r?\n\r?\n/.exec(buffered);
            if (!delimiter || delimiter.index === undefined) break;
            const complete = buffered.slice(0, delimiter.index);
            buffered = buffered.slice(delimiter.index + delimiter[0].length);
            for (const parsed of parseDataMessage(complete)) {
              if (parsed.data === "[DONE]") continue;
              try {
                const payload = JSON.parse(parsed.data ?? "") as unknown;
                const text = contentFromPayload(payload);
                if (!text) continue;
                answer += text;
                send({ type: "delta", text });
              } catch {
                continue;
              }
            }
          }
        }
        for (const parsed of parseDataMessage(buffered)) {
          if (parsed.data === "[DONE]") continue;
          try {
            const payload = JSON.parse(parsed.data ?? "") as unknown;
            const text = contentFromPayload(payload);
            if (!text) continue;
            answer += text;
            send({ type: "delta", text });
          } catch {
            continue;
          }
        }
        const configModel = model;
        const trimmed = answer.trim();
        if (!trimmed) {
          if (persist) failPendingMessage(viewer, message.id, "模型未返回可用回答");
          send({ type: "error", code: "MODEL_EMPTY_ANSWER", detail: "模型未返回可用回答", messageId: message.id });
          return;
        }
        if (persist) {
          updateMessageSources(viewer, message.id, storeSources(sources), configModel);
          completeMessage(viewer, message.id, trimmed, "completed");
        }
        send({ type: "done", messageId: message.id, status: "completed", model: configModel ?? "", answer: trimmed, sources });
      } catch (error) {
        const aborted = clientSignal?.aborted
          || (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"));
        const finalAnswer = answer.trim();
        const detail = error instanceof Error ? error.message : "研究助手流式请求失败";
        if (persist) {
          completeMessage(
            viewer,
            message.id,
            finalAnswer,
            finalAnswer ? "incomplete" : aborted ? "incomplete" : "failed",
            aborted ? "客户端取消或请求超时" : detail,
          );
        }
        send({
          type: "error",
          code: aborted ? "ABORTED" : "MODEL_STREAM_ERROR",
          detail: aborted ? "客户端取消或请求超时，回答已保存为 incomplete" : detail,
          messageId: message.id,
        });
      } finally {
        clearTimeout(timer);
        clientSignal?.removeEventListener("abort", onClientAbort);
        if (streamOpen) {
          try {
            controllerStream.close();
          } catch {
            // The browser may already have cancelled the response stream.
          }
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
