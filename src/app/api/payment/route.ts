import { jsonOk } from "../_base/response";
import { requireAuth } from "../_base/auth";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  return jsonOk({ message: "Payment API", userId: auth.userId });
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  return jsonOk({ message: "Payment API", userId: auth.userId });
}
