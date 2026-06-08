import { jsonOk } from "../_base/response";
import { requireAuth } from "../_base/auth";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  return jsonOk({ userId: auth.userId, role: auth.role, subscription: auth.subscription });
}
