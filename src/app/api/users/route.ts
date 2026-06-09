import { jsonOk } from "../_base/response";
import { requireAuth } from "../_base/auth";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  // Fetch createdAt and uid from DB for display ID generation
  const [row] = await db
    .select({ createdAt: users.createdAt, uid: users.uid })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);

  return jsonOk({
    userId: auth.userId,
    role: auth.role,
    subscription: auth.subscription,
    createdAt: row?.createdAt ?? null,
    uid: row?.uid ?? null,
  });
}
