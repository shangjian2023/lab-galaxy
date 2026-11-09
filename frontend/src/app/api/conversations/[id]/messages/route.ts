import { NextResponse } from "next/server";
import { checkSameOrigin } from "@/lib/auth-http";
import { getCurrentViewer } from "@/lib/server-auth";
import { CONVERSATION_MESSAGE_LIMIT, listMessages } from "@/lib/conversation-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  try {
    const viewer = await getCurrentViewer();
    if (!viewer) return NextResponse.json({ detail: "请先登录" }, { status: 401 });
    const { id } = await context.params;
    const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? CONVERSATION_MESSAGE_LIMIT);
    if (!Number.isFinite(requestedLimit) || requestedLimit < 1 || requestedLimit > CONVERSATION_MESSAGE_LIMIT) {
      return NextResponse.json(
        { detail: `消息条数应为 1-${CONVERSATION_MESSAGE_LIMIT}` },
        { status: 400 },
      );
    }
    const page = listMessages(viewer, id, requestedLimit);
    if (!page) return NextResponse.json({ detail: "会话不存在" }, { status: 404 });
    return NextResponse.json(page);
  } catch {
    return NextResponse.json({ detail: "会话历史暂时不可用" }, { status: 503 });
  }
}
