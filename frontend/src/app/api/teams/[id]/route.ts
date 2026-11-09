import { NextResponse } from "next/server";
import { getTeamDetail, leaveTeam } from "@/lib/team-service";
import { authError, checkSameOrigin } from "@/lib/auth-http";
import { getCurrentViewer } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  try {
    const viewer = await getCurrentViewer();
    const { id } = await context.params;
    return NextResponse.json({ team: getTeamDetail(viewer, id) });
  } catch (error) {
    return authError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  try {
    const viewer = await getCurrentViewer();
    const { id } = await context.params;
    return NextResponse.json({ team: leaveTeam(viewer, id) });
  } catch (error) {
    return authError(error);
  }
}
