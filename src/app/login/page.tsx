"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const { user, loading, loginWithPassword } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already authenticated → redirect
  useEffect(() => {
    if (!loading && user) {
      router.replace("/characters");
    }
  }, [loading, user, router]);

  // Loading
  if (loading || user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <div className="text-sm text-stone-300">加载中</div>
      </div>
    );
  }

  const canLogin = email.trim() && password.length > 0;

  const handleLogin = async () => {
    if (!canLogin || busy) return;
    setError(null);
    setBusy(true);
    try {
      const err = await loginWithPassword(email.trim(), password);
      if (err) {
        setError(err);
      } else {
        router.replace("/characters");
      }
    } catch {
      setError("登录失败，请稍后重试");
    }
    setBusy(false);
  };

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 px-6 bg-stone-50">
      {/* Brand */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight">
          叙境
        </h1>
        <p className="text-sm text-stone-400">登录你的叙境账户</p>
      </div>

      <div className="w-8 h-px bg-stone-200" />

      {/* Form */}
      <div className="w-full max-w-xs space-y-3">
        {/* Email */}
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          placeholder="输入邮箱地址"
          autoComplete="email"
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-stone-300 outline-none focus:border-stone-400 transition-colors"
          onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
        />

        {/* Password with toggle */}
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            placeholder="输入密码"
            autoComplete="current-password"
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 pr-12 text-sm text-neutral-900 placeholder:text-stone-300 outline-none focus:border-stone-400 transition-colors"
            onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-300 hover:text-stone-500 transition-colors text-sm select-none"
            tabIndex={-1}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-500 text-center">{error}</p>
        )}

        {/* Login button */}
        <button
          onClick={handleLogin}
          disabled={!canLogin || busy}
          className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-medium text-stone-50 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? "登录中..." : "登录"}
        </button>

        {/* Register link */}
        <p className="text-center text-xs text-stone-400 pt-4">
          还未注册？{" "}
          <Link
            href="/register"
            className="underline underline-offset-2 hover:text-stone-600 transition-colors"
          >
            请点击此处注册
          </Link>
        </p>
      </div>

      {/* Footer */}
      <p className="text-xs text-stone-300 mt-8">
        登录即表示同意服务条款
      </p>
    </div>
  );
}
