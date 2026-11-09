import { NextRequest, NextResponse } from "next/server";
import { searchCorpus } from "@/lib/corpus-db";
import { getCurrentViewer } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 500) {
    return NextResponse.json({ detail: "检索词长度应为 2–500 个字符" }, { status: 400 });
  }
  try {
    const viewer = await getCurrentViewer();
    const sources = searchCorpus(query, Number(request.nextUrl.searchParams.get("limit") ?? 8), viewer);
    return NextResponse.json({ sources, total: sources.length, demo: false });
  } catch (error) {
    return NextResponse.json({ detail: error instanceof Error ? error.message : "全文检索失败" }, { status: 503 });
  }
}
