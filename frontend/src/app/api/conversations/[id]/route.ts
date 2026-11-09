import { NextResponse } from "next/server";
import { checkSameOrigin, readJsonObject } from "@/lib/auth-http";
import { getCurrentViewer } from "@/lib/server-auth";
import { deleteConversation, getConversation, renameConversation } from "@/lib/conversation-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function unauthenticated() {
  return NextResponse.json({ detail: "请先登录" }, { status: 401 });
}

export async function GET(request: Request, context: RouteContext) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  try {
    const viewer = await getCurrentViewer();
    if (!viewer) return unauthenticated();
    const { id } = await context.params;
    const conversation = getConversation(viewer, id);
    if (!conversation) return NextResponse.json({ detail: "会话不存在" }, { status: 404 });
    return NextResponse.json({ conversation });
  } catch {
    return NextResponse.json({ detail: "会话服务暂时不可用" }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  try {
    const viewer = await getCurrentViewer();
    if (!viewer) return unauthenticated();
    const { id } = await context.params;
    const conversation = renameConversation(viewer, id, body.title);
    if (!conversation) return NextResponse.json({ detail: "会话不存在或标题无效" }, { status: 404 });
    return NextResponse.json({ conversation });
  } catch {
    return NextResponse.json({ detail: "会话服务暂时不可用" }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  try {
    const viewer = await getCurrentViewer();
    if (!viewer) return unauthenticated();
    const { id } = await context.params;
    if (!deleteConversation(viewer, id)) return NextResponse.json({ detail: "会话不存在" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ detail: "会话服务暂时不可用" }, { status: 503 });
  }
}
