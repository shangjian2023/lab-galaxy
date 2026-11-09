import { NextResponse } from "next/server";
import { IngestionError } from "@/lib/ingestion-errors";

export function ingestionError(error: unknown) {
  if (error instanceof IngestionError) {
    return NextResponse.json({ detail: error.message, code: error.code }, { status: error.status });
  }
  const detail = error instanceof Error ? error.message : "上传处理失败";
  return NextResponse.json({ detail, code: "INGESTION_FAILED" }, { status: 500 });
}
