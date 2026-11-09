import { NextResponse } from "next/server";
import { loginUser } from "@/lib/auth-service";
import { authError, checkRateLimit, checkSameOrigin, readJsonObject, setSessionCookie } from "@/lib/auth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "invalid";
  const limited = checkRateLimit(request, `login:${email}`);
  if (limited) return limited;
  try {
    const result = await loginUser(body);
    const response = NextResponse.json({ user: result.user });
    if (result.token) setSessionCookie(response, request, result.token);
    return response;
  } catch (error) {
    return authError(error);
  }
}
