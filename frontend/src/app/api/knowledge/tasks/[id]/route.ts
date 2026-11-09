import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/server-auth";
import { getKnowledgeTask } from "@/lib/knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();
  if (!viewer) return NextResponse.json({ detail: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const task = getKnowledgeTask(id, viewer);
  if (!task) return NextResponse.json({ detail: "抽取任务不存在或无权访问", code: "TASK_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(task);
}
