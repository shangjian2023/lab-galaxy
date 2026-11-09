import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/server-auth";
import { getKnowledgeGraph } from "@/lib/knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getKnowledgeGraph(await getCurrentViewer()));
}
