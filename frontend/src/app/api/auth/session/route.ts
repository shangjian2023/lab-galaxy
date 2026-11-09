import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth-service";
import { authError, clearSessionCookie, setSessionCookie } from "@/lib/auth-http";
import { SESSION_COOKIE } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = resolveSession(token, true);
    const response = NextResponse.json({ user: session?.user ?? null }, { headers: { "Cache-Control": "no-store" } });
    if (session && token && session.refreshed) setSessionCookie(response, request, token, session.expiresAt);
    if (!session && token) clearSessionCookie(response);
    return response;
  } catch (error) {
    return authError(error);
  }
}
