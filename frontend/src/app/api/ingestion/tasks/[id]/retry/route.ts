import { NextResponse } from "next/server";
import { checkSameOrigin } from "@/lib/auth-http";
import { ingestionError } from "@/lib/ingestion-api";
import { retryIngestionTask } from "@/lib/ingestion-store";
import { getCurrentAccount } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  try {
    const account = await getCurrentAccount();
    if (!account) return NextResponse.json({ detail: "请先登录", code: "LOGIN_REQUIRED" }, { status: 401 });
    const { id } = await context.params;
    const task = await retryIngestionTask(account, id);
    return NextResponse.json({ task });
  } catch (error) {
    return ingestionError(error);
  }
}
