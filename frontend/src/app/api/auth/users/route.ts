import { NextResponse } from "next/server";
import { listUsers } from "@/lib/auth-service";
import { authError } from "@/lib/auth-http";
import { getCurrentViewer } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const viewer = await getCurrentViewer();
    if (!viewer) return NextResponse.json({ detail: "请先登录" }, { status: 401 });
    return NextResponse.json({ users: listUsers(viewer) });
  } catch (error) {
    return authError(error);
  }
}
