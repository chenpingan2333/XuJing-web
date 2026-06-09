import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../_base/auth";
import { apiConfigService } from "@/server/services/api-config.service";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const existing = await apiConfigService.listConfigs(auth.userId);
    const dup = existing.find((c: { name: string }) => c.name === "DeepSeek");
    if (dup) {
      return NextResponse.json({ status: "EXISTS", id: dup.id, message: "DeepSeek config already exists" });
    }

    const config = await apiConfigService.createConfig(auth.userId, {
      name: "DeepSeek",
      platform: "DEEPSEEK",
      apiUrl: "https://api.deepseek.com",
      apiKey: "sk-9d7c2558fad9451eb444601b0b7cc779",
      modelId: "deepseek-chat",
      isDefault: existing.length === 0,
    });

    return NextResponse.json({ status: "CREATED", id: config.id });
  } catch (err) {
    return NextResponse.json({ status: "ERROR", message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}