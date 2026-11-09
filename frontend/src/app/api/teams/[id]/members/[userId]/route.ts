import { NextResponse } from "next/server";
import { removeTeamMember, setTeamMemberRole } from "@/lib/team-service";
import { authError, checkSameOrigin, readJsonObject } from "@/lib/auth-http";
import { getCurrentViewer } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; userId: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  try {
    const viewer = await getCurrentViewer();
    const { id, userId } = await context.params;
    return NextResponse.json({ team: removeTeamMember(viewer, id, userId) });
  } catch (error) {
    return authError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  try {
    const viewer = await getCurrentViewer();
    const { id, userId } = await context.params;
    return NextResponse.json({ member: setTeamMemberRole(viewer, id, userId, body.role) });
  } catch (error) {
    return authError(error);
  }
}
