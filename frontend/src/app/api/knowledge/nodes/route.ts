import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/server-auth";
import { searchKnowledgeNodes } from "@/lib/knowledge-nodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, 120);
  const id = (params.get("id") ?? "").trim().slice(0, 80);
  const requestedLimit = Number(params.get("limit") ?? 8);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 20) {
    return NextResponse.json({ detail: "limit 必须是 1-20 的整数" }, { status: 400 });
  }
  return NextResponse.json({ nodes: searchKnowledgeNodes(await getCurrentViewer(), query, requestedLimit, id) });
}
