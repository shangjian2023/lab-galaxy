import { NextRequest, NextResponse } from "next/server";
import { listCorpusDocuments } from "@/lib/corpus-db";
import { getCurrentViewer } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const viewer = await getCurrentViewer();
    const documents = listCorpusDocuments(
      params.get("query")?.trim() ?? "",
      params.get("status") ?? "all",
      Number(params.get("limit") ?? 100),
      viewer,
    );
    return NextResponse.json({ documents, total: documents.length, demo: false });
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "无法读取研究语料库" },
      { status: 503 },
    );
  }
}
