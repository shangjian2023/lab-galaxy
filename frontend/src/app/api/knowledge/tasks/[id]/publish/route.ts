import { NextResponse } from "next/server";
import { checkSameOrigin, readJsonObject } from "@/lib/auth-http";
import { getCurrentViewer } from "@/lib/server-auth";
import { publishKnowledgeTask } from "@/lib/knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const viewer = await getCurrentViewer();
  if (!viewer) return NextResponse.json({ detail: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const result = publishKnowledgeTask(id, viewer);
  if ("error" in result) {
    const [status, detail] = result.error === "TASK_NOT_FOUND"
      ? [404, "抽取任务不存在或无权访问"]
      : [409, "只有校验成功的草稿可以发布"];
    return NextResponse.json({ detail, code: result.error }, { status });
  }
  return NextResponse.json(result.task);
}
