import { NextResponse } from "next/server";
import { checkSameOrigin, readJsonObject } from "@/lib/auth-http";
import { getCurrentViewer } from "@/lib/server-auth";
import { retryKnowledgeExtraction } from "@/lib/knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  if (body.confirmCost !== true) {
    return NextResponse.json({ detail: "重试必须显式确认模型调用成本", code: "COST_CONFIRMATION_REQUIRED" }, { status: 400 });
  }
  const viewer = await getCurrentViewer();
  if (!viewer) return NextResponse.json({ detail: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const result = await retryKnowledgeExtraction(id, viewer);
  if ("error" in result) {
    const map = {
      TASK_NOT_FOUND: [404, "抽取任务不存在或无权访问"],
      DOCUMENT_NOT_VISIBLE: [404, "原文已不可见，禁止重试"],
      NO_CHUNKS: [422, "该文档没有可用于抽取的文本块"],
      TASK_NOT_FAILED: [409, "只有失败任务可以重试"],
    } as const;
    const [status, detail] = map[result.error];
    return NextResponse.json({ detail, code: result.error }, { status });
  }
  return NextResponse.json(result.task);
}
