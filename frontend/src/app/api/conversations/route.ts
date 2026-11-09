import { NextResponse } from "next/server";
import { checkSameOrigin, readJsonObject } from "@/lib/auth-http";
import { getCurrentViewer } from "@/lib/server-auth";
import { createConversation, listConversations } from "@/lib/conversation-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  try {
    const viewer = await getCurrentViewer();
    if (!viewer) return NextResponse.json({ detail: "请先登录" }, { status: 401 });
    return NextResponse.json({ conversations: listConversations(viewer) });
  } catch {
    return NextResponse.json({ detail: "会话服务暂时不可用" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  try {
    const viewer = await getCurrentViewer();
    if (!viewer) return NextResponse.json({ detail: "请先登录" }, { status: 401 });
    return NextResponse.json(
      { conversation: createConversation(viewer, typeof body.title === "string" ? body.title : "") },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ detail: "会话服务暂时不可用" }, { status: 503 });
  }
}
