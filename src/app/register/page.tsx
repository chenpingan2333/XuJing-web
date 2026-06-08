"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// 鈹€鈹€鈹€ Types 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

type Step = "email" | "verifyCode" | "setPassword" | "success";

// 鈹€鈹€鈹€ Page 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export default function RegisterPage() {
  const { user, loading, registerRequestCode, registerVerify } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Captcha
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);

  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/characters");
  }, [loading, user, router]);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  useEffect(() => {
    if (step === "verifyCode") codeInputRef.current?.focus();
  }, [step]);

  // 鈹€鈹€鈹€ Validation 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  const passwordValid =
    password.length >= 6 &&
    /[a-zA-Z]/.test(password) &&
    /[0-9]/.test(password);

  const passwordsMatch =
    password === confirmPassword && confirmPassword.length > 0;

  const canRegister =
    code.length === 6 && passwordValid && passwordsMatch;

  // 鈹€鈹€鈹€ Fetch captcha 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  const fetchCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaError(null);
    setCaptchaInput("");
    try {
      const res = await fetch("/api/auth/captcha");
      const data = await res.json();
      if (data.success) {
        setCaptchaId(data.data.id);
        setCaptchaSvg(data.data.svg);
      } else {
        setCaptchaError(data.error || "鑾峰彇楠岃瘉鐮佸け璐?);
      }
    } catch {
      setCaptchaError("缃戠粶閿欒锛岃閲嶈瘯");
    }
    setCaptchaLoading(false);
  }, []);

  // 鈹€鈹€鈹€ Submit captcha 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  const submitCaptcha = async () => {
    if (!captchaInput.trim()) return;
    setCaptchaError(null);
    setBusy(true);
    try {
      const err = await registerRequestCode(email.trim(), captchaId, captchaInput.trim());
      if (err) {
        setCaptchaError(err);
        fetchCaptcha();
      } else {
        setCaptchaOpen(false);
        setStep("verifyCode");
        setCountdown(60);
        setError(null);
      }
    } catch {
      setCaptchaError("楠岃瘉澶辫触锛岃閲嶈瘯");
      fetchCaptcha();
    }
    setBusy(false);
  };

  // 鈹€鈹€鈹€ Open captcha 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  const handleRequestCode = () => {
    if (!email.trim() || busy || countdown > 0) return;
    if (!email.includes("@")) { setError("璇疯緭鍏ユ湁鏁堢殑閭鍦板潃"); return; }
    setError(null);
    setCaptchaOpen(true);
    fetchCaptcha();
  };

  // 鈹€鈹€鈹€ Register 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  const handleRegister = async () => {
    if (!canRegister || busy) return;
    setError(null);
    setBusy(true);
    try {
      const err = await registerVerify(email.trim(), code, password);
      if (err) {
        setError(err);
      } else {
        setStep("success");
        setTimeout(() => router.push("/login"), 2000);
      }
    } catch {
      setError("娉ㄥ唽澶辫触锛岃绋嶅悗閲嶈瘯");
    }
    setBusy(false);
  };

  // 鈹€鈹€鈹€ Loading 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  if (loading || user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <div className="text-sm text-stone-300">鍔犺浇涓?/div>
      </div>
    );
  }

  // 鈹€鈹€鈹€ Render 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 px-6 bg-stone-50">
      {/* Brand */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight">鍙欏</h1>
        <p className="text-sm text-stone-400">鍒涘缓浣犵殑鍙欏璐︽埛</p>
      </div>

      <div className="w-8 h-px bg-stone-200" />

      {/* Form */}
      <div className="w-full max-w-xs space-y-3">
        {/* Email */}
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          placeholder="杈撳叆閭鍦板潃"
          autoComplete="email"
          disabled={step !== "email"}
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-stone-300 outline-none focus:border-stone-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onKeyDown={(e) => { if (e.key === "Enter") handleRequestCode(); }}
        />

        {/* Request code */}
        {step === "email" && (
          <button
            onClick={handleRequestCode}
            disabled={busy || countdown > 0 || !email.trim()}
            className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-medium text-stone-50 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "鍙戦€佷腑..."
              : countdown > 0 ? `${countdown}s 鍚庡彲閲嶆柊鍙戦€乣
              : "鑾峰彇楠岃瘉鐮?}
          </button>
        )}

        {/* Verify code */}
        {step === "verifyCode" && (
          <>
            <input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
              placeholder="杈撳叆 6 浣嶉獙璇佺爜"
              autoComplete="one-time-code"
              maxLength={6}
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-stone-300 text-center tracking-[0.5em] outline-none focus:border-stone-400 transition-colors"
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.length === 6) setStep("setPassword");
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400">楠岃瘉鐮佸凡鍙戦€佽嚦 {email}</span>
              <button
                onClick={handleRequestCode}
                disabled={countdown > 0}
                className="text-xs text-stone-500 hover:text-stone-700 transition-colors"
              >
                {countdown > 0 ? `${countdown}s` : "閲嶆柊鍙戦€?}
              </button>
            </div>
            <button
              onClick={() => setStep("setPassword")}
              disabled={code.length !== 6}
              className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-medium text-stone-50 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              涓嬩竴姝?            </button>
          </>
        )}

        {/* Set password */}
        {step === "setPassword" && (
          <>
            <div className="flex items-center justify-between text-xs text-stone-400 px-1">
              <span>{email}</span>
              <button
                onClick={() => { setStep("email"); setCode(""); setPassword(""); setConfirmPassword(""); }}
                className="text-stone-500 hover:text-stone-700 transition-colors"
              >
                鏇存崲閭
              </button>
            </div>

            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="杈撳叆瀵嗙爜"
              autoComplete="new-password"
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-stone-300 outline-none focus:border-stone-400 transition-colors"
            />

            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
              placeholder="纭瀵嗙爜"
              autoComplete="new-password"
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-stone-300 outline-none focus:border-stone-400 transition-colors"
            />

            <div className="space-y-1 px-1">
              <div className={`text-xs ${password.length >= 6 ? "text-stone-400 line-through" : "text-stone-400"}`}>
                鑷冲皯 6 涓瓧绗?              </div>
              <div className={`text-xs ${/[a-zA-Z]/.test(password) ? "text-stone-400 line-through" : "text-stone-400"}`}>
                鍖呭惈瀛楁瘝
              </div>
              <div className={`text-xs ${/[0-9]/.test(password) ? "text-stone-400 line-through" : "text-stone-400"}`}>
                鍖呭惈鏁板瓧
              </div>
              {confirmPassword.length > 0 && (
                <div className={`text-xs ${passwordsMatch ? "text-stone-400 line-through" : "text-red-400"}`}>
                  涓ゆ瀵嗙爜杈撳叆涓€鑷?                </div>
              )}
            </div>

            <button
              onClick={handleRegister}
              disabled={!canRegister || busy}
              className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-medium text-stone-50 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? "娉ㄥ唽涓?.." : "娉ㄥ唽"}
            </button>
          </>
        )}

        {/* Success */}
        {step === "success" && (
          <div className="text-center space-y-4">
            <div className="text-4xl text-stone-600">&#10003;</div>
            <div className="text-sm font-medium text-neutral-900">娉ㄥ唽鎴愬姛</div>
            <div className="text-xs text-stone-400">鍗冲皢璺宠浆鑷崇櫥褰曢〉...</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-red-500 text-center">{error}</p>
        )}

        {/* Login link */}
        {step !== "success" && (
          <p className="text-center text-xs text-stone-400 pt-4">
            宸叉湁璐︽埛锛焮" "}
            <Link href="/login" className="underline underline-offset-2 hover:text-stone-600 transition-colors">
              鐧诲綍
            </Link>
          </p>
        )}
      </div>

      {/* 鈹€鈹€鈹€ Captcha Modal 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */}

      {captchaOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { if (!busy) setCaptchaOpen(false); }}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-sm font-semibold text-neutral-900">瀹夊叏楠岃瘉</h2>
              <button
                onClick={() => setCaptchaOpen(false)}
                disabled={busy}
                className="text-stone-300 hover:text-stone-500 transition-colors text-lg leading-none disabled:opacity-30"
              >
                &times;
              </button>
            </div>

            <div className="px-5 pb-5 space-y-4">
              <p className="text-xs text-stone-400">璇疯緭鍏ヤ笅鏂圭畻寮忕殑缁撴灉锛屼互楠岃瘉浣犱笉鏄満鍣ㄤ汉</p>

              <div className="flex items-center justify-center rounded-xl bg-stone-50 py-5 border border-stone-100 min-h-[80px]">
                {captchaLoading ? (
                  <div className="text-sm text-stone-300">鍔犺浇涓?..</div>
                ) : captchaSvg ? (
                  <div dangerouslySetInnerHTML={{ __html: captchaSvg }} className="[&>svg]:h-14" />
                ) : (
                  <div className="text-sm text-stone-300">鍔犺浇澶辫触</div>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={captchaInput}
                  onChange={(e) => { setCaptchaInput(e.target.value); setCaptchaError(null); }}
                  placeholder="杈撳叆缁撴灉"
                  autoFocus
                  className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-neutral-900 text-center placeholder:text-stone-300 outline-none focus:border-stone-400 transition-colors"
                  onKeyDown={(e) => { if (e.key === "Enter") submitCaptcha(); }}
                />
                <button
                  onClick={submitCaptcha}
                  disabled={busy || !captchaInput.trim()}
                  className="rounded-xl bg-neutral-900 px-6 py-2.5 text-sm font-medium text-stone-50 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {busy ? "楠岃瘉涓? : "纭"}
                </button>
              </div>

              {captchaError && (
                <p className="text-xs text-red-500 text-center">{captchaError}</p>
              )}

              <button
                onClick={fetchCaptcha}
                disabled={captchaLoading || busy}
                className="w-full text-center text-xs text-stone-400 hover:text-stone-600 transition-colors"
              >
                鐪嬩笉娓咃紵鎹竴寮?              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
