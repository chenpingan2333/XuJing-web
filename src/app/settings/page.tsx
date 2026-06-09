"use client";

import { useAuth } from "@/lib/use-auth";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDisplayId } from "@/lib/utils";

export default function SettingsPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [nickname, setNickname] = useState("叙境旅人");
  const [saved, setSaved] = useState(false);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center text-gray-400">
        加载中...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3">
        <div className="text-sm text-gray-500">请先登录</div>
        <button
          onClick={() => { window.location.href = "/me"; }}
          className="text-sm text-gray-900 underline"
        >
          前往登录
        </button>
      </div>
    );
  }

  const displayId =
    user.createdAt && user.uid
      ? formatDisplayId(user.createdAt, user.uid)
      : null;

  const roleLabel =
    user.role === "ADMIN"
      ? "管理员"
      : user.subscription === "vip"
        ? "VIP 用户"
        : "普通用户";
  const roleColor =
    user.role === "ADMIN"
      ? "bg-red-100 text-red-700"
      : user.subscription === "vip"
        ? "bg-amber-100 text-amber-700"
        : "bg-gray-100 text-gray-600";

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-12 pb-4">
        <button
          onClick={() => { window.location.href = "/me"; }}
          className="text-gray-400 text-lg"
        >
          &larr;
        </button>
        <h1 className="text-lg font-semibold text-gray-900">设置</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 space-y-5">
        {/* Avatar */}
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            头像
          </h2>
          <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-lg text-gray-400">
              {user.userId.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-sm text-gray-500">点击更换头像</div>
              <div className="text-xs text-gray-300">（开发中）</div>
            </div>
          </div>
        </section>

        {/* Nickname */}
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            昵称
          </h2>
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-4">
            <input
              type="text"
              value={nickname}
              onChange={(e) => { setNickname(e.target.value); setSaved(false); }}
              className="flex-1 bg-transparent text-sm text-gray-900 outline-none"
              placeholder="输入昵称"
            />
            <button
              onClick={() => setSaved(true)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${saved ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}
            >
              {saved ? "已保存" : "保存"}
            </button>
          </div>
        </section>

        {/* Account Info */}
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            账户信息
          </h2>
          <div className="rounded-xl bg-gray-50 divide-y divide-gray-100">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-600">邮箱</span>
              <span className="text-sm text-gray-400">开发模式</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-600">用户 ID</span>
              <span className="text-xs text-gray-400 font-mono">
                {displayId ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-600">角色</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleColor}`}
              >
                {roleLabel}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-600">订阅</span>
              <span
                className={`text-sm font-medium ${user.subscription === "vip" ? "text-amber-600" : "text-gray-500"}`}
              >
                {user.subscription === "vip" ? "VIP" : "免费"}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-600">API Key 状态</span>
              <span
                className={`text-sm ${user.subscription === "vip" ? "text-green-600" : "text-red-500"}`}
              >
                {user.subscription === "vip"
                  ? "可使用系统模型 + 可选自带 Key"
                  : "请配置 API Key 才能使用 AI"}
              </span>
            </div>
            <div
              onClick={() => router.push("/api-connections")}
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
            >
              <span className="text-sm text-gray-600">API 配置</span>
              <span className="text-sm text-gray-400">&rarr;</span>
            </div>
          </div>
        </section>

        {/* VIP Info */}
        {user.subscription === "vip" && (
          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              VIP 权益
            </h2>
            <div className="rounded-xl bg-amber-50 p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-amber-800">
                <span className="text-amber-500">&bull;</span> 可使用叙境模型
              </div>
              <div className="flex items-center gap-2 text-sm text-amber-800">
                <span className="text-amber-500">&bull;</span> 可使用角色系统
              </div>
              <div className="flex items-center gap-2 text-sm text-amber-800">
                <span className="text-amber-500">&bull;</span> 10000 条长期记忆
              </div>
            </div>
          </section>
        )}

        {/* ADMIN Info */}
        {user.role === "ADMIN" && (
          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              管理权限
            </h2>
            <div className="rounded-xl bg-red-50 p-4">
              <div className="text-sm text-red-800">管理员权限</div>
              <div className="mt-1 text-xs text-red-500">
                用户管理 &middot; 角色管理 &middot; 订单审核 &middot; VIP 管理
              </div>
            </div>
          </section>
        )}

        {/* Non-VIP reminder */}
        {user.subscription === "free" && user.role !== "ADMIN" && (
          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              升级提示
            </h2>
            <div className="rounded-xl bg-blue-50 p-4">
              <div className="text-sm text-blue-800">成为 VIP 解锁全部功能</div>
              <div className="mt-1 text-xs text-blue-500">
                系统模型 &middot; 角色系统 &middot; 10000 条记忆
              </div>
            </div>
          </section>
        )}

        {/* Logout */}
        <section className="pb-8">
          <button
            onClick={async () => { await logout(); window.location.href = "/me"; }}
            className="w-full rounded-xl bg-red-50 py-3 text-sm font-medium text-red-600"
          >
            退出登录
          </button>
        </section>
      </div>
    </div>
  );
}
