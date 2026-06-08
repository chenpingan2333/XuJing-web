import { jsonOk, jsonErr } from "../../_base/response";
import { requireAuth } from "../../_base/auth";
import { authService } from "@/server/services/auth.service";

async function sendCode(req: Request) {
  let body: { email?: string };
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON", 400); }
  if (!body.email) return jsonErr("email is required", 400);
  const result = await authService.sendVerificationCode(body.email);
  if (result) return jsonErr(result.error, result.status);
  return jsonOk({ message: "Verification code sent" });
}

async function login(req: Request) {
  let body: { email?: string; code?: string };
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON", 400); }
  if (!body.email || !body.code) return jsonErr("email and code are required", 400);
  const result = await authService.loginWithCode(body.email, body.code);
  if ("error" in result) return jsonErr(result.error, result.status);
  return jsonOk(result);
}

async function refresh(req: Request) {
  let body: { userId?: string; refreshToken?: string };
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON", 400); }
  if (!body.userId || !body.refreshToken) return jsonErr("userId and refreshToken are required", 400);
  const result = await authService.refreshAccessToken(body.userId, body.refreshToken);
  if ("error" in result) return jsonErr(result.error, result.status);
  return jsonOk(result);
}

async function logout(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  await authService.logout(auth.userId, auth.jti);
  return jsonOk({ message: "Logged out" });
}

async function devToken(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return jsonErr("Not available in production", 403);
  }
  let body: { email?: string };
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON", 400); }
  if (!body.email) return jsonErr("email is required", 400);
  const result = await authService.devLogin(body.email);
  if ("error" in result) return jsonErr(result.error, result.status);
  return jsonOk(result);
}

const handlers: Record<string, (req: Request) => Promise<Response>> = {
  "send-code": sendCode,
  login,
  refresh,
  logout,
  "dev/token": devToken,
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const key = path.join("/");
  const handler = handlers[key];
  if (!handler) return jsonErr("Unknown auth endpoint: " + key, 404);
  return handler(req);
}

export async function GET() {
  return jsonOk({ message: "Auth API - use POST endpoints" });
}