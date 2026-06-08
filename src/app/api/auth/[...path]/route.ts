import { jsonOk, jsonErr } from "../../_base/response";
import { requireAuth } from "../../_base/auth";
import { authService } from "@/server/services/auth.service";

// ─── POST handlers ───

async function sendCode(req: Request) {
  let body: { email?: string };
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON", 400); }
  if (!body.email) return jsonErr("email is required", 400);
  const result = await authService.sendVerificationCode(body.email);
  if (result) return jsonErr(result.error, result.status);
  return jsonOk({ message: "Verification code sent" });
}

async function login(req: Request) {
  let body: { email?: string; password?: string; code?: string };
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON", 400); }
  if (!body.email) return jsonErr("email is required", 400);

  // 密码登录优先
  if (body.password) {
    const result = await authService.loginWithPassword(body.email, body.password);
    if ("error" in result) return jsonErr(result.error, result.status);
    return jsonOk(result);
  }

  // 验证码登录（保留）
  if (body.code) {
    const result = await authService.loginWithCode(body.email, body.code);
    if ("error" in result) return jsonErr(result.error, result.status);
    return jsonOk(result);
  }

  return jsonErr("password or code is required", 400);
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

/**
 * 注册-第一步：验证图形验证码 + 发送邮箱验证码
 */
async function registerSendCode(req: Request) {
  let body: { email?: string; captchaId?: string; captchaText?: string };
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON", 400); }
  if (!body.email || !body.captchaId || !body.captchaText) {
    return jsonErr("email, captchaId, captchaText are required", 400);
  }
  const result = await authService.verifyCaptchaAndSendCode(
    body.email,
    body.captchaId,
    body.captchaText
  );
  if (result) return jsonErr(result.error, result.status);
  return jsonOk({ message: "Verification code sent" });
}

/**
 * 注册-第二步：校验邮箱验证码 + 创建账户
 */
async function registerVerify(req: Request) {
  let body: { email?: string; code?: string; password?: string };
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON", 400); }
  if (!body.email || !body.code || !body.password) {
    return jsonErr("email, code, password are required", 400);
  }
  const result = await authService.registerWithCode(body.email, body.code, body.password);
  if ("error" in result) return jsonErr(result.error, result.status);
  return jsonOk(result);
}

// ─── GET handlers ───

async function captcha(_req: Request) {
  const { id, svg } = await authService.generateCaptcha();
  return jsonOk({ id, svg });
}

// ─── Dispatch ───

const postHandlers: Record<string, (req: Request) => Promise<Response>> = {
  "send-code": sendCode,
  login,
  refresh,
  logout,
  "dev/token": devToken,
  "register/send-code": registerSendCode,
  "register/verify": registerVerify,
};

const getHandlers: Record<string, (req: Request) => Promise<Response>> = {
  captcha,
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const key = path.join("/");
  const handler = postHandlers[key];
  if (!handler) return jsonErr("Unknown auth endpoint: " + key, 404);
  return handler(req);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const key = path.join("/");
  const handler = getHandlers[key];
  if (!handler) return jsonOk({ message: "Auth API — use POST endpoints" });
  return handler(req);
}
