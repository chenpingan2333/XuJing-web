export const runtime = 'edge';

import { requireAuth } from "../../../_base/auth";
import { jsonErr } from "../../../_base/response";
import { chatService } from "@/server/services/chat.service";
import { sseResponse } from "../sse-helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { characterId } = await params;
  return sseResponse(chatService.regenerateLastAssistantMessage(auth.userId, characterId));
}
