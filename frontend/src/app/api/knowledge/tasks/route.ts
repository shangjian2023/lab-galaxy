import { NextResponse } from "next/server";
import { checkSameOrigin, readJsonObject } from "../../../../lib/auth-http";
import { getCurrentViewer } from "../../../../lib/server-auth";
import {
  KNOWLEDGE_DEFAULT_CHUNKS,
  KNOWLEDGE_MAX_CHUNKS,
  createKnowledgeExtractionTask,
  getKnowledgeTasks,
} from "../../../../lib/knowledge-store";
import { getModelConfig } from "../../../../lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await getCurrentViewer();
  if (!viewer) return NextResponse.json({ detail: "请先登录" }, { status: 401 });
  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  return NextResponse.json({ tasks: getKnowledgeTasks(viewer, status) });
}

export async function POST(request: Request) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const viewer = await getCurrentViewer();
  if (!viewer) return NextResponse.json({ detail: "请先登录" }, { status: 401 });
  if (body.confirmCost !== true) {
    return NextResponse.json({ detail: "必须显式确认模型调用成本", code: "COST_CONFIRMATION_REQUIRED" }, { status: 400 });
  }
  if (body.documentId !== undefined && typeof body.documentId !== "string") {
    return NextResponse.json({ detail: "documentId 必须是字符串" }, { status: 400 });
  }
  const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
  if (!documentId) return NextResponse.json({ detail: "请提供 documentId" }, { status: 400 });
  const maxChunksInput = body.maxChunks ?? KNOWLEDGE_DEFAULT_CHUNKS;
  if (typeof maxChunksInput !== "number" || !Number.isInteger(maxChunksInput) || maxChunksInput < 1 || maxChunksInput > KNOWLEDGE_MAX_CHUNKS) {
    return NextResponse.json({ detail: `maxChunks 必须是 1-${KNOWLEDGE_MAX_CHUNKS} 的整数`, code: "INVALID_MAX_CHUNKS" }, { status: 400 });
  }
  if (body.model !== undefined && typeof body.model !== "string") {
    return NextResponse.json({ detail: "model 必须是字符串" }, { status: 400 });
  }
  try {
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : getModelConfig().model;
    const result = await createKnowledgeExtractionTask({ documentId, viewer, maxChunks: maxChunksInput, model });
    if ("error" in result) {
      const map = {
        DOCUMENT_NOT_VISIBLE: [404, "文档不存在、未解析完成或当前账号不可见"],
        NO_CHUNKS: [422, "该文档没有可用于抽取的文本块"],
      } as const;
      const [status, detail] = map[result.error];
      return NextResponse.json({ detail, code: result.error }, { status });
    }
    return NextResponse.json(result.task, { status: 201 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "知识抽取服务暂时不可用";
    return NextResponse.json({ detail }, { status: 503 });
  }
}
