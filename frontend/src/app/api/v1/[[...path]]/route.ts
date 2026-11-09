import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function legacyApiStopped() {
  return NextResponse.json({
    detail: "旧版部署接口已停用。新版账户与文档持久流水线接通前，不会转发上传或修改请求。",
    code: "LEGACY_API_STOPPED",
  }, { status: 410 });
}

export {
  legacyApiStopped as GET,
  legacyApiStopped as POST,
  legacyApiStopped as PUT,
  legacyApiStopped as PATCH,
  legacyApiStopped as DELETE,
};
