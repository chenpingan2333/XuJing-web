import { jsonOk } from "../_base/response";
import { requireAuth, guardAdmin } from "../_base/auth";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = guardAdmin(auth);
  if (denied) return denied;
  return jsonOk({ message: "Admin API", userId: auth.userId });
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = guardAdmin(auth);
  if (denied) return denied;
  return jsonOk({ message: "Admin API", userId: auth.userId });
}
