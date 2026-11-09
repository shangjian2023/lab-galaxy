import { NextResponse } from "next/server";
import { setUserStatus } from "@/lib/auth-service";
import { authError, checkSameOrigin, readJsonObject } from "@/lib/auth-http";
import { getCurrentViewer } from "@/lib/server-auth";
import type { UserStatus } from "@/lib/auth-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  try {
    const viewer = await getCurrentViewer();
    if (!viewer) return NextResponse.json({ detail: "请先登录" }, { status: 401 });
    const { id } = await context.params;
    const user = setUserStatus(viewer, id, body.status as UserStatus);
    return NextResponse.json({ user });
  } catch (error) {
    return authError(error);
  }
}
