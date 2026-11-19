import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/server-auth";
import { getKnowledgeGraph } from "@/lib/knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") ?? "all";
  if (!["all", "corpus", "mine"].includes(scope)) {
    return NextResponse.json({ detail: "scope 必须是 all、corpus 或 mine" }, { status: 400 });
  }
  const viewer = await getCurrentViewer();
  if (scope === "mine" && !viewer) return NextResponse.json({ detail: "请先登录" }, { status: 401 });
  return NextResponse.json(getKnowledgeGraph(viewer, scope as "all" | "corpus" | "mine"));
}
