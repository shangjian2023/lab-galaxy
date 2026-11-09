import { NextResponse } from "next/server";
import { getCorpusStats, listCorpusDocuments } from "@/lib/corpus-db";
import { getCurrentViewer } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const viewer = await getCurrentViewer();
    return NextResponse.json({
      stats: getCorpusStats(viewer),
      recentDocuments: listCorpusDocuments("", "parsed", 5, viewer),
      demo: false,
    });
  } catch (error) {
    return NextResponse.json({ detail: error instanceof Error ? error.message : "无法读取语料统计" }, { status: 503 });
  }
}
