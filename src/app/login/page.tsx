"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { user, loading, sendCode, loginWithCode } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [sending, setSending] = useState(false);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const codeInputRef = useRef<HTMLInputElement>(null);

  // Already authenticated — redirect to characters
  useEffect(() => {
    if (!loading && user) {
      router.replace("/characters");
    }
  }, [loading, user, router]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  // Auto-focus code input when step changes
  useEffect(() => {
    if (step === "code") {
      codeInputRef.current?.focus();
    }
  }, [step]);

  // Loading — minimal shell
  if (loading || user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <div className="text-sm text-stone-300">加载中</div>
      </div>
    );
  }

  const handleSendCode = async () => {
    if (!email.trim() || sending || countdown > 0) return;
    setError(null);
    setSending(true);
    try {
      const err = await sendCode(email.trim());
      if (err) {
        setError(err);
      } else {
        setStep("code");
        setCountdown(60);
      }
    } catch {
      setError("发送失败，请稍后重试");
    }
    setSending(false);
  };

  const handleLogin = async () => {
    if (!email.trim() || !code.trim() || code.trim().length !== 6 || logging) return;
    setError(null);
    setLogging(true);
    try {
      const err = await loginWithCode(email.trim(), code.trim());
      if (err) {
        setError(err);
      } else {
        router.replace("/characters");
      }
    } catch {
      setError("登录失败，请稍后重试");
    }
    setLogging(false);
  };

  const handleCodeChange = (value: string) => {
    // Only allow digits, max 6
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (error) setError(null);
  };

  const handleResend = () => {
    setStep("email");
    setCode("");
    setCountdown(0);
    setError(null);
  };

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 px-6 bg-stone-50">
      {/* Brand */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight">
          叙境
        </h1>
        <p className="text-sm text-stone-400">AI 恋爱陪伴平台</p>
      </div>

      {/* Divider */}
      <div className="w-8 h-px bg-stone-200" />

      {/* Form */}
      <div className="w-full max-w-xs space-y-3">
        {/* Email */}
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSendCode(); }}
          placeholder="输入邮箱地址"
          autoComplete="email"
          disabled={step === "code"}
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-stone-300 outline-none focus:border-stone-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        />

        {/* Code input — shown after send */}
        {step === "code" && (
          <input
            ref={codeInputRef}
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
            placeholder="输入 6 位验证码"
            autoComplete="one-time-code"
            maxLength={6}
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-stone-300 text-center tracking-[0.5em] outline-none focus:border-stone-400 transition-colors"
          />
        )}

        {/* Error message */}
        {error && (
          <p className="text-xs text-red-500 text-center">{error}</p>
        )}

        {/* Actions */}
        {step === "email" ? (
          <button
            onClick={handleSendCode}
            disabled={sending || countdown > 0 || !email.trim()}
            className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-medium text-stone-50 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? "发送中..." : countdown > 0 ? `${countdown}s 后可重发` : "发送验证码"}
          </button>
        ) : (
          <div className="space-y-2">
            <button
              onClick={handleLogin}
              disabled={logging || code.length !== 6}
              className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-medium text-stone-50 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {logging ? "验证中..." : "登录"}
            </button>
            <button
              onClick={handleResend}
              disabled={countdown > 0}
              className="w-full text-xs text-stone-400 hover:text-stone-600 transition-colors py-1"
            >
              {countdown > 0 ? `${countdown}s 后重新发送` : "更换邮箱"}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-xs text-stone-300 mt-8">
        登录即表示同意服务条款
      </p>
    </div>
  );
}
