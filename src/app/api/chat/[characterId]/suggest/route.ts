import { requireAuth } from "../../../_base/auth";
import { jsonOk, jsonErr } from "../../../_base/response";
import { chatService } from "@/server/services/chat.service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { characterId } = await params;
  try {
    const suggestion = await chatService.getSuggestedReply(auth.userId, characterId);
    return jsonOk({ suggestion });
  } catch {
    return jsonErr("生成建议失败", 500);
  }
}