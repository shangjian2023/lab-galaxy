import { NextResponse } from "next/server";
import { getCorpusDocument } from "@/lib/corpus-db";
import { getCurrentViewer } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const viewer = await getCurrentViewer();
    const result = getCorpusDocument(id, viewer);
    if (!result) return NextResponse.json({ detail: "文档不存在" }, { status: 404 });
    return NextResponse.json({ ...result, demo: false });
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "无法读取研究语料库" },
      { status: 503 },
    );
  }
}
