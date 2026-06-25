import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../_base/auth";

/**
 * Seed API Key 路由 — 已禁用
 * 免费用户不再分发平台共享 Key，必须自行配置 API Key。
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  return NextResponse.json(
    { status: "DISABLED", message: "请前往 API 连接页面配置您自己的 API Key" },
    { status: 403 }
  );
}
