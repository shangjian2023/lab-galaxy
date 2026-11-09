import { NextRequest, NextResponse } from "next/server";
import { logoutUser } from "@/lib/auth-service";
import { authError, checkSameOrigin, clearSessionCookie } from "@/lib/auth-http";
import { SESSION_COOKIE } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  try {
    logoutUser(request.cookies.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return authError(error);
  }
}
