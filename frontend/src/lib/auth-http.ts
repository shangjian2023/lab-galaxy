import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth-service";
import { SESSION_COOKIE } from "@/lib/server-auth";

const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if ((origin && origin !== new URL(request.url).origin) || fetchSite === "cross-site" || (!origin && fetchSite && !["same-origin", "none"].includes(fetchSite))) {
    return NextResponse.json({ detail: "拒绝跨站请求" }, { status: 403 });
  }
  return null;
}

export function checkRateLimit(request: Request, scope: string): NextResponse | null {
  const forwarded = process.env.TRUST_PROXY === "1" ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : "";
  const address = forwarded || "local";
  const key = `${scope}:${address}`;
  const timestamp = Date.now();
  for (const [entryKey, value] of attempts) {
    if (value.resetAt <= timestamp) attempts.delete(entryKey);
  }
  if (attempts.size >= 1000 && !attempts.has(key)) {
    const oldest = attempts.keys().next().value as string | undefined;
    if (oldest) attempts.delete(oldest);
  }
  const current = attempts.get(key);
  if (!current) {
    attempts.set(key, { count: 1, resetAt: timestamp + 10 * 60 * 1000 });
    return null;
  }
  current.count += 1;
  if (current.count > 20) {
    return NextResponse.json({ detail: "尝试过于频繁，请十分钟后再试" }, { status: 429, headers: { "Retry-After": "600" } });
  }
  return null;
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | NextResponse> {
  try {
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ detail: "请求必须是 JSON 对象" }, { status: 400 });
    }
    return body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ detail: "请求必须是有效的 JSON" }, { status: 400 });
  }
}

export function setSessionCookie(response: NextResponse, request: Request, token: string, expiresAt?: string) {
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export function authError(error: unknown): NextResponse {
  if (error instanceof AuthError) return NextResponse.json({ detail: error.message, code: error.code }, { status: error.status });
  console.error("Authentication request failed", error);
  return NextResponse.json({ detail: "账户服务暂时不可用" }, { status: 500 });
}
