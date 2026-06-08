"use client";

import { useAuth } from "@/lib/use-auth";
import { useState } from "react";

export default function MePage() {
  const { user, loading, login, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [logging, setLogging] = useState(false);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center text-gray-400">
        加载中...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6">
        <div className="text-lg font-medium text-gray-800">叙境 Xujing</div>
        <div className="text-sm text-gray-500">AI 恋爱陪伴平台</div>
        <div className="mt-4 w-full max-w-xs space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="输入邮箱登录（开发模式）"
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-gray-400"
          />
          <button
            onClick={async () => {
              if (!email) return;
              setLogging(true);
              try { await login(email); } catch { /* ignore */ }
              setLogging(false);
            }}
            disabled={logging || !email}
            className="w-full rounded-lg bg-gray-900 py-2.5 text-sm text-white disabled:opacity-50"
          >
            {logging ? "登录中..." : "登录"}
          </button>
        </div>
      </div>
    );
  }

  const roleLabel = user.role === "ADMIN" ? "管理员" : user.subscription === "vip" ? "VIP 用户" : "普通用户";
  const roleColor = user.role === "ADMIN" ? "bg-red-100 text-red-700" : user.subscription === "vip" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600";

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <h1 className="text-lg font-semibold text-gray-900">我的</h1>
        <button
          onClick={() => { window.location.href = "/settings"; }}
          className="text-sm text-gray-500"
        >
          设置
        </button>
      </div>

      {/* Profile Card */}
      <div className="mx-5 rounded-xl bg-gray-50 p-5">
        <div className="flex items-center gap-4">
          {/* Avatar placeholder */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-xl text-gray-400">
            {user.userId.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-medium text-gray-900 truncate">
              叙境旅人
            </div>
            <div className="mt-0.5 text-xs text-gray-400 truncate">
              ID: {user.userId.slice(0, 8)}...
            </div>
            <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${roleColor}`}>
              {roleLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Status info */}
      <div className="mx-5 mt-4 space-y-2">
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
          <span className="text-sm text-gray-600">角色</span>
          <span className="text-sm text-gray-900">{user.role === "ADMIN" ? "ADMIN" : "USER"}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
          <span className="text-sm text-gray-600">订阅</span>
          <span className={`text-sm font-medium ${user.subscription === "vip" ? "text-amber-600" : "text-gray-500"}`}>
            {user.subscription === "vip" ? "VIP" : "免费"}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
          <span className="text-sm text-gray-600">API Key</span>
          <span className={`text-sm ${user.subscription === "vip" ? "text-green-600" : "text-red-500"}`}>
            {user.subscription === "vip" ? "可使用系统模型" : "未配置"}
          </span>
        </div>
      </div>
    </div>
  );
}