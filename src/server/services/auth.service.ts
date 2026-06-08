/**
 * AuthService — V2.0
 *
 * 密码登录 + 注册（captcha 防刷 + 邮箱验证）+ 原验证码登录保留。
 * 邮件验证码发送依赖 Resend API key（通过 getEnv() 安全读取）。
 */

import bcrypt from "bcryptjs";
import svgCaptcha from "svg-captcha";
import { createAccessToken } from "../auth/jwt";
import {
  setRefreshToken,
  getRefreshToken,
  revokeRefreshToken,
  blacklistJti,
  setVerificationCode,
  getVerificationCode,
  deleteVerificationCode,
  setCaptcha,
  getCaptcha,
  deleteCaptcha,
} from "../auth/redis-session";
import { Resend } from "resend";
import { userRepository } from "../repositories/user.repository";
import { getEnv } from "@/lib/env";

const BCRYPT_ROUNDS = 12;

export interface TokenPair {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

export interface AuthError {
  error: string;
  status: number;
}

// ─── Captcha ───

export async function generateCaptcha(): Promise<{ id: string; svg: string }> {
  const captcha = svgCaptcha.createMathExpr({
    mathMin: 1,
    mathMax: 20,
    mathOperator: "+",
  });
  const id = crypto.randomUUID();
  await setCaptcha(id, captcha.text);
  console.log("[auth:captcha] generated id:", id, "| answer:", captcha.text);
  return { id, svg: captcha.data };
}

// ─── Registration ───

/**
 * 校验图形验证码 + 发送邮箱验证码。
 * captcha 校验通过后立即删除，防止重放。
 */
export async function verifyCaptchaAndSendCode(
  email: string,
  captchaId: string,
  captchaText: string
): Promise<AuthError | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return { error: "邮箱格式不正确", status: 400 };

  const answer = await getCaptcha(captchaId);
  if (!answer) return { error: "图形验证码已过期，请重新获取", status: 400 };

  // 大小写不敏感、去除空格比较
  if (answer.trim().toLowerCase() !== captchaText.trim().toLowerCase()) {
    await deleteCaptcha(captchaId);
    return { error: "图形验证码错误，请重新获取", status: 400 };
  }

  // 验证通过，删除 captcha 防重放
  await deleteCaptcha(captchaId);

  // 检查邮箱是否已注册
  const existing = await userRepository.findByEmail(normalized);
  if (existing) return { error: "该邮箱已注册，请直接登录", status: 409 };

  // 发送邮箱验证码
  return sendVerificationCode(normalized);
}

/**
 * 注册：校验邮箱验证码 + 创建用户（含 bcrypt 密码哈希）。
 */
export async function registerWithCode(
  email: string,
  code: string,
  password: string
): Promise<{ message: string } | AuthError> {
  const normalized = email.trim().toLowerCase();

  // 校验邮箱验证码
  const stored = await getVerificationCode(normalized);
  if (!stored || stored !== code) {
    return { error: "邮箱验证码错误或已过期", status: 400 };
  }
  await deleteVerificationCode(normalized);

  // 强密码校验
  if (password.length < 6) return { error: "密码至少 6 位", status: 400 };
  if (!/[a-zA-Z]/.test(password)) return { error: "密码需包含字母", status: 400 };
  if (!/[0-9]/.test(password)) return { error: "密码需包含数字", status: 400 };

  // bcrypt 哈希
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // 创建用户
  await userRepository.create({
    email: normalized,
    passwordHash,
    role: "USER",
    status: "ACTIVE",
    starDiamonds: 0,
    hasPurchasedVip: false,
  });

  console.log("[auth:register] User created:", normalized);
  return { message: "注册成功，请使用新密码登录" };
}

// ─── Password Login ───

/**
 * 密码登录：bcrypt 比对 → 签发 token pair。
 */
export async function loginWithPassword(
  email: string,
  password: string
): Promise<TokenPair | AuthError> {
  const normalized = email.trim().toLowerCase();

  const user = await userRepository.findByEmail(normalized);
  if (!user) return { error: "邮箱或密码错误", status: 401 };
  if (user.status === "BANNED") return { error: "账户已被停用", status: 403 };

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return { error: "邮箱或密码错误", status: 401 };

  console.log("[auth:login] Password verified for:", normalized);
  return issueTokens(user.id, user.role);
}

// ─── Verification Code Login (retained) ───

/**
 * 发送验证码。
 * 优先使用 Resend 邮件服务；未配置 RESEND_API_KEY 时降级为控制台输出。
 */
export async function sendVerificationCode(email: string): Promise<AuthError | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return { error: "Invalid email", status: 400 };

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await setVerificationCode(normalized, code);
  console.log("[auth:send-code] email:", normalized, "| code:", code);

  const apiKey = getEnv().RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[auth] RESEND_API_KEY not set — verification code for", normalized, ":", code);
    return null;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: "叙境 Xujing <noreply@xujing.modelbridge.top>",
      to: normalized,
      subject: "【叙境 Xujing】登录验证码",
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 400px; margin: 0 auto; padding: 32px 24px;">
          <div style="font-size: 18px; font-weight: 600; color: #1C1C1C; margin-bottom: 24px;">
            叙境 Xujing
          </div>
          <div style="font-size: 14px; color: #57534E; line-height: 1.6; margin-bottom: 24px;">
            你的登录验证码是：
          </div>
          <div style="font-size: 32px; font-weight: 700; color: #1C1C1C; letter-spacing: 8px; margin-bottom: 24px; padding: 16px 24px; background: #F5F5F4; border-radius: 8px; text-align: center;">
            ${code}
          </div>
          <div style="font-size: 12px; color: #A8A29E;">
            15 分钟内有效。如非本人操作，请忽略此邮件。
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("[auth] Resend send failed:", error.message);
      console.log("[auth] Verification code for", normalized, ":", code);
      return { error: "邮件发送失败，请稍后重试", status: 500 };
    }
  } catch (err) {
    console.error("[auth] Resend exception:", err instanceof Error ? err.message : String(err));
    console.log("[auth] Verification code for", normalized, ":", code);
    return { error: "邮件服务暂不可用，请稍后重试", status: 500 };
  }

  return null;
}

/**
 * 验证码登录：校验 code → 查找或创建用户 → 签发 token pair。
 */
export async function loginWithCode(email: string, code: string): Promise<TokenPair | AuthError> {
  const normalized = email.trim().toLowerCase();

  const stored = await getVerificationCode(normalized);
  console.log("[auth:login] email:", normalized, "| code:", code, "| stored:", stored);
  if (!stored || stored !== code) {
    return { error: "Invalid or expired verification code", status: 401 };
  }

  console.log("[auth:login] Code verified for:", normalized);
  await deleteVerificationCode(normalized);

  let user = await userRepository.findByEmail(normalized);
  if (!user) {
    // 纯验证码登录不再创建用户 — 用户必须通过注册流程
    return { error: "该邮箱未注册，请先注册", status: 404 };
  }

  if (user.status === "BANNED") {
    return { error: "Account suspended", status: 403 };
  }

  console.log("[auth:login] Issuing tokens for userId:", user.id);
  return issueTokens(user.id, user.role);
}

/**
 * Dev-only：跳过验证码，直接为已知测试用户签发 token。
 */
export async function devLogin(email: string): Promise<TokenPair | AuthError> {
  const normalized = email.trim().toLowerCase();
  const user = await userRepository.findByEmail(normalized);
  if (!user) return { error: "User not found", status: 404 };
  if (user.status === "BANNED") return { error: "Account suspended", status: 403 };
  console.log("[auth:login] Issuing tokens for userId:", user.id);
  return issueTokens(user.id, user.role);
}

/**
 * 刷新 access token。
 */
export async function refreshAccessToken(
  userId: string,
  refreshToken: string
): Promise<TokenPair | AuthError> {
  const storedHash = await getRefreshToken(userId);
  if (!storedHash) return { error: "No active refresh token", status: 401 };

  const providedHash = await hashToken(refreshToken);
  if (storedHash !== providedHash) return { error: "Invalid refresh token", status: 401 };

  const user = await userRepository.findById(userId);
  if (!user) return { error: "User not found", status: 401 };
  if (user.status === "BANNED") return { error: "Account suspended", status: 403 };

  console.log("[auth:login] Issuing tokens for userId:", user.id);
  return issueTokens(user.id, user.role);
}

/**
 * 登出：撤销 refresh token + 将当前 JTI 加入黑名单。
 */
export async function logout(userId: string, jti: string): Promise<void> {
  await revokeRefreshToken(userId);
  if (jti) await blacklistJti(jti);
}

// ─── Internal ───

async function issueTokens(userId: string, role: string): Promise<TokenPair> {
  const accessToken = await createAccessToken({ id: userId, role });

  const refreshToken = crypto.randomUUID();
  const refreshHash = await hashToken(refreshToken);
  await setRefreshToken(userId, refreshHash);

  return { userId, accessToken, refreshToken };
}

async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder().encode(token);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const authService = {
  generateCaptcha,
  verifyCaptchaAndSendCode,
  registerWithCode,
  loginWithPassword,
  sendVerificationCode,
  loginWithCode,
  devLogin,
  refreshAccessToken,
  logout,
};
