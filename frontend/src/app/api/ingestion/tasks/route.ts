import { NextResponse } from "next/server";
import { ingestionError } from "@/lib/ingestion-api";
import { listIngestionTasks } from "@/lib/ingestion-store";
import { getCurrentAccount } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const account = await getCurrentAccount();
    if (!account) return NextResponse.json({ detail: "请先登录", code: "LOGIN_REQUIRED" }, { status: 401 });
    const tasks = listIngestionTasks(account);
    return NextResponse.json({ tasks, total: tasks.length });
  } catch (error) {
    return ingestionError(error);
  }
}
