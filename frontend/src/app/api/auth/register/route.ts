import { NextResponse } from "next/server";
import { registerUser } from "@/lib/auth-service";
import { authError, checkRateLimit, checkSameOrigin, readJsonObject, setSessionCookie } from "@/lib/auth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = checkSameOrigin(request) ?? checkRateLimit(request, "register");
  if (rejected) return rejected;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  try {
    const result = await registerUser(body);
    const response = NextResponse.json({
      user: result.user,
      requiresApproval: result.requiresApproval,
      message: result.requiresApproval ? "注册成功，请等待管理员审核后登录" : "初始管理员已创建并登录",
    }, { status: 201 });
    if (result.token) setSessionCookie(response, request, result.token);
    return response;
  } catch (error) {
    return authError(error);
  }
}
