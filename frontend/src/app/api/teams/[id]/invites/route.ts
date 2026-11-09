import { NextResponse } from "next/server";
import { createTeamInvite } from "@/lib/team-service";
import { authError, checkSameOrigin, readJsonObject } from "@/lib/auth-http";
import { getCurrentViewer } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  try {
    const viewer = await getCurrentViewer();
    const { id } = await context.params;
    const invite = createTeamInvite(viewer, id, body);
    return NextResponse.json({ invite }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authError(error);
  }
}
