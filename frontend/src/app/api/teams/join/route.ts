import { NextResponse } from "next/server";
import { joinTeam } from "@/lib/team-service";
import { authError, checkSameOrigin, readJsonObject } from "@/lib/auth-http";
import { getCurrentViewer } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  try {
    const viewer = await getCurrentViewer();
    return NextResponse.json({ team: joinTeam(viewer, body) });
  } catch (error) {
    return authError(error);
  }
}
