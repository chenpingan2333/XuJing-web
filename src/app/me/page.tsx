"use client";

import { useAuth } from "@/lib/use-auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDisplayId } from "@/lib/utils";
import { useApiStatus } from "@/lib/use-api-status";

export default function MePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const { configured, configName } = useApiStatus();

  const [editNickname, setEditNickname] = useState(user?.nickname || "");
  const [editAvatar, setEditAvatar] = useState(user?.avatarUrl || "");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex h-dvh items-center justify-center text-gray-400">
        加载中...
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

  const isVip = user.subscription === "vip";

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("xujing_token");
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ nickname: editNickname, avatarUrl: editAvatar }),
      });
      const d = await res.json();
      if (d.success) {
        alert("创作者档案资料保存成功！");
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("xujing_token");
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const d = await res.json();
      if (d.success && d.url) {
        setEditAvatar(d.url);
        alert("头像上传就绪，请点击下方保存！");
      }
    } catch (err) {
      console.error(err);
    }
  };

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
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-xl text-gray-400 overflow-hidden">
            {editAvatar ? (
              <img src={editAvatar} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              user.userId.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-medium text-gray-900 truncate">
              {user.nickname || "叙境旅人"}
            </div>
            <div className="mt-0.5 text-xs text-gray-400 truncate font-mono">
              {displayId ?? "—"}
            </div>
            <span
              className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${roleColor}`}
            >
              {roleLabel}
            </span>
          </div>
        </div>

        {/* Avatar Upload */}
        <div className="mt-3">
          <label className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-xs text-stone-50 cursor-pointer hover:bg-neutral-800 transition-colors">
            <span>更换头像</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </label>
        </div>

        {/* Nickname Edit */}
        <div className="mt-3 flex flex-col gap-1.5">
          <label className="text-xs text-gray-500">创作者昵称</label>
          <input
            type="text"
            value={editNickname}
            onChange={(e) => setEditNickname(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-neutral-900"
            placeholder="输入你的尊贵昵称..."
          />
        </div>

        {/* Save Button */}
        <button
          onClick={handleSaveProfile}
          disabled={savingProfile}
          className="mt-3 w-full rounded-lg bg-neutral-900 py-2.5 text-xs font-medium text-stone-50 hover:bg-neutral-800 disabled:bg-gray-300 transition-colors"
        >
          {savingProfile ? "正在同步境域..." : "保存个人资料"}
        </button>
      </div>

      {/* Status info */}
      <div className="mx-5 mt-4 space-y-2">
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
          <span className="text-sm text-gray-600">订阅</span>
          <span
            className={`text-sm font-medium ${isVip ? "text-amber-600" : "text-gray-500"}`}
          >
            {isVip ? "VIP" : "免费"}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
          <span className="text-sm text-gray-600">API Key</span>
          <span className={`text-sm ${isVip ? "text-green-600" : configured ? "text-green-600" : "text-red-500"}`}>
            {isVip ? "叙境专属模型" : configured ? (configName ?? "已配置") : "未配置"}
          </span>
        </div>
      </div>

      
      {/* 管理后台入口 — 仅 admin 可见 */}
      {user.role === 'ADMIN' && (
        <div className="mx-5 mt-4">
          <div
            onClick={() => router.push('/admin')}
            className="flex items-center justify-between rounded-lg bg-neutral-900 px-4 py-3 cursor-pointer hover:bg-neutral-800 transition-colors"
          >
            <span className="text-sm text-stone-50">管理后台</span>
            <span className="text-sm text-stone-400">&rarr;</span>
          </div>
        </div>
      )}{/* 用户人设 */}
      <div className="mx-5 mt-4">
        <div
          onClick={() => router.push("/settings/persona")}
          className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
        >
          <span className="text-sm text-gray-600">用户人设</span>
          <span className="text-sm text-gray-400">&rarr;</span>
        </div>
      </div>

      <BottomNav current="me" />
    </div>
  );
}

function BottomNav({ current }: { current: string }) {
  const tabs = [
    { key: "characters", label: "角色", href: "/characters", icon: CharsIcon },
    { key: "chat", label: "聊天", href: "/chat", icon: ChatIcon },
    { key: "shop", label: "商店", href: "/shop", icon: ShopIcon },
    { key: "me", label: "我的", href: "/me", icon: MeIcon },
  ] as const;

  return (
    <nav className="shrink-0 flex items-center justify-around border-t border-stone-100 bg-stone-50 h-14 mt-auto">
      {tabs.map((tab) => {
        const active = tab.key === current;
        return (
          <a
            key={tab.key}
            href={tab.href}
            className={
              "flex flex-col items-center justify-center gap-0.5 w-16 h-full text-[10px] transition-colors duration-200 " +
              (active ? "text-neutral-900" : "text-stone-300 hover:text-stone-400")
            }
          >
            <tab.icon active={active} />
            <span>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function CharsIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="7" r="3.5" stroke={active ? "#1C1C1C" : "#D6D3D1"} strokeWidth="1.5" />
      <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke={active ? "#1C1C1C" : "#D6D3D1"} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M6 5h8M6 9h5" stroke={active ? "#1C1C1C" : "#D6D3D1"} strokeWidth="1.5" strokeLinecap="round" />
      <rect x="3" y="2" width="14" height="12" rx="2" stroke={active ? "#1C1C1C" : "#D6D3D1"} strokeWidth="1.5" />
      <path d="M7 14l-2 3h10l-2-3" stroke={active ? "#1C1C1C" : "#D6D3D1"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ShopIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 7l1-4h10l1 4M4 7v9a1 1 0 001 1h10a1 1 0 001-1V7M4 7h12" stroke={active ? "#1C1C1C" : "#D6D3D1"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function MeIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="6" r="3" stroke={active ? "#1C1C1C" : "#D6D3D1"} strokeWidth="1.5" />
      <path d="M4 17c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" stroke={active ? "#1C1C1C" : "#D6D3D1"} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}