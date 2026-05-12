import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://backend:8000";
const HOP_BY_HOP_HEADERS = new Set(["connection", "content-encoding", "transfer-encoding"]);

type RouteContext = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  return proxy(req, ctx, "GET");
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return proxy(req, ctx, "POST");
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return proxy(req, ctx, "PUT");
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return proxy(req, ctx, "PATCH");
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return proxy(req, ctx, "DELETE");
}

async function proxy(req: NextRequest, ctx: RouteContext, method: string) {
  const params = await ctx.params;
  const path = (params.path || []).join("/");
  const targetUrl = `${BACKEND_URL}/api/v1/${path}${req.nextUrl.search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  const authorization = req.headers.get("authorization");
  if (contentType) headers.set("Content-Type", contentType);
  if (authorization) headers.set("Authorization", authorization);

  const res = await fetch(targetUrl, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer(),
  });

  const responseHeaders = new Headers();
  res.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(res.body, {
    status: res.status,
    headers: responseHeaders,
  });
}
