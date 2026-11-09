import { NextResponse } from "next/server";
import { checkSameOrigin } from "@/lib/auth-http";
import { ingestionError } from "@/lib/ingestion-api";
import { IngestionError } from "@/lib/ingestion-errors";
import { normalizeUploadMetadata, uploadDocument } from "@/lib/ingestion-store";
import { getCurrentAccount } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = checkSameOrigin(request);
  if (rejected) return rejected;
  try {
    const account = await getCurrentAccount();
    if (!account) return NextResponse.json({ detail: "请先登录", code: "LOGIN_REQUIRED" }, { status: 401 });
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 31 * 1024 * 1024) {
      return NextResponse.json({ detail: "上传文件不能超过 30 MiB", code: "FILE_TOO_LARGE" }, { status: 413 });
    }
    const form = await request.formData();
    const files = form.getAll("file").filter((value): value is File => value instanceof File);
    if (files.length !== 1) throw new IngestionError("必须且只能上传一个文件", 400, "FILE_REQUIRED");
    if (files[0].size > 30 * 1024 * 1024) {
      return NextResponse.json({ detail: "上传文件不能超过 30 MiB", code: "FILE_TOO_LARGE" }, { status: 413 });
    }
    const metadata = normalizeUploadMetadata({
      visibility: form.get("visibility") ?? undefined,
      teamId: form.get("teamId") ?? undefined,
      sourceUrl: form.get("sourceUrl") ?? undefined,
      licenseNote: form.get("licenseNote") ?? undefined,
    });
    const bytes = Buffer.from(await files[0].arrayBuffer());
    const task = await uploadDocument({
      actor: account,
      filename: files[0].name,
      bytes,
      ...metadata,
    });
    return NextResponse.json({ task }, { status: task.attempts === 0 ? 201 : 200 });
  } catch (error) {
    return ingestionError(error);
  }
}
