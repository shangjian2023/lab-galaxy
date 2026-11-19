import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/server-auth";
import { checkSameOrigin } from "@/lib/auth-http";
import { askNonStream, prepareAsk, wantsStream } from "@/lib/conversation-ask";
import { createModelStreamRequest } from "@/lib/conversation-request";
import { streamAsk } from "@/lib/conversation-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AskRequest {
  question?: unknown;
  conversationId?: unknown;
}

export async function POST(request: Request) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  let body: AskRequest;
  try {
    body = await request.json() as AskRequest;
  } catch {
    return NextResponse.json({ detail: "请求必须是 JSON" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const conversationId = typeof body.conversationId === "string" && body.conversationId
    ? body.conversationId
    : undefined;
  if (question.length < 2 || question.length > 500) {
    return NextResponse.json({ detail: "问题长度应为 2–500 个字符" }, { status: 400 });
  }
  const streaming = wantsStream(request);
  try {
    const viewer = await getCurrentViewer();
    if (!viewer) {
      return NextResponse.json({
        detail: "请登录后使用研究助手，公开文档仍可免登录阅读。",
        code: "LOGIN_REQUIRED",
      }, { status: 401 });
    }
    const prepared = await prepareAsk(viewer, question, conversationId);
    if (!("prepare" in prepared)) {
      if (prepared.status === 404) {
        return NextResponse.json({ detail: "会话不存在" }, { status: 404 });
      }
      if (!prepared.payload.sources.length) {
        return NextResponse.json({
          answer: prepared.payload.answer,
          sources: [],
          model: null,
          grounded: false,
          messageId: prepared.payload.messageId,
        });
      }
      return NextResponse.json({ detail: "会话不存在" }, { status: prepared.status === 404 ? 404 : 500 });
    }
    if (!streaming) {
      const outcome = await askNonStream(prepared, request.signal);
      if (outcome.status >= 400) {
        return NextResponse.json(
          { detail: "模型服务暂时不可用", sources: outcome.payload.sources },
          { status: outcome.status },
        );
      }
      return NextResponse.json(outcome.payload);
    }
    const controller = new AbortController();
    const upstreamRequest = createModelStreamRequest(prepared.question, prepared.sources, controller.signal);
    return streamAsk(
      viewer,
      question,
      conversationId,
      prepared.message ?? {
        id: `ephemeral-${Date.now()}`,
        conversationId: "",
        question,
        answer: null,
        sources: [],
        model: null,
        grounded: false,
        status: "pending",
        error: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      },
      prepared.sources,
      upstreamRequest,
      request.signal,
    );
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "模型请求超时，请稍后重试"
      : error instanceof Error ? error.message : "研究助手请求失败";
    return NextResponse.json({ detail: message }, { status: 503 });
  }
}
