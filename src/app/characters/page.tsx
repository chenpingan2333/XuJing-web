"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface CharacterRow {
  id: string;
  name: string;
  avatarUrl?: string;
  personality?: string;
  isOfficial: boolean;
}

export default function CharactersPage() {
  const { user, loading, token } = useAuth();
  const router = useRouter();
  const [fetching, setFetching] = useState(true);
  const [official, setOfficial] = useState<CharacterRow[]>([]);
  const [userChars, setUserChars] = useState<CharacterRow[]>([]);

  const isVip = user?.subscription === "vip";
  const charCount = userChars.length;
  const atLimit = !isVip && charCount >= 12;

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  const fetchCharacters = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/characters", {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (data.success) {
        setOfficial(data.data.official || []);
        setUserChars(data.data.user || []);
      }
    } catch { /* ignore */ }
    setFetching(false);
  }, [token]);

  useEffect(() => { if (user) fetchCharacters(); }, [fetchCharacters, user]);

  // Loading / redirecting
  if (loading || !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <div className="text-sm text-stone-300">加载中</div>
      </div>
    );
  }

  // Still fetching characters
  if (fetching) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <div className="text-sm text-stone-300">加载中</div>
      </div>
    );
  }

  // Authenticated + loaded
  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-12 pb-4">
        <h1 className="text-lg font-semibold text-neutral-900">角色</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/characters/new"
            className={`rounded-xl px-4 py-2 text-xs font-medium transition-colors ${
              atLimit
                ? "bg-stone-100 text-stone-300 cursor-not-allowed pointer-events-none"
                : "bg-neutral-900 text-stone-50 hover:bg-neutral-800"
            }`}
          >
            新建
          </Link>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-8">
        {official.length > 0 && (
          <section>
            <h2 className="text-xs font-medium text-stone-400 tracking-wide mb-3">
              叙境专属角色
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {official.map((c) => (
                <Link
                  key={c.id}
                  href={"/characters/" + c.id}
                  className="rounded-xl border border-stone-200 bg-white p-4 hover:bg-stone-50 transition-colors"
                >
                  <Avatar name={c.name} url={c.avatarUrl} size="lg" />
                  <div className="text-sm font-medium text-neutral-900 truncate mt-2">
                    {c.name}
                  </div>
                  <div className="text-[11px] text-stone-400 mt-0.5">官方</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium text-stone-400 tracking-wide">
              我的角色
            </h2>
            <span className={`text-xs ${atLimit ? "text-red-400" : "text-stone-400"}`}>
              {charCount}{isVip ? "" : "/12"}
            </span>
          </div>

          {userChars.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="text-sm text-stone-300">还没有角色</div>
              <div className="text-xs text-stone-200 mt-1">
                点击右上角「新建」来创建第一个角色
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {userChars.map((c) => (
                <Link
                  key={c.id}
                  href={"/characters/" + c.id}
                  className="rounded-xl border border-stone-200 bg-white p-4 hover:bg-stone-50 transition-colors"
                >
                  <Avatar name={c.name} url={c.avatarUrl} size="lg" />
                  <div className="text-sm font-medium text-neutral-900 truncate mt-2">
                    {c.name}
                  </div>
                  {c.personality && (
                    <div className="text-xs text-stone-400 mt-0.5 truncate">
                      {c.personality.slice(0, 20)}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <BottomNav current="characters" />
    </div>
  );
}

function Avatar({ name, url, size }: { name: string; url?: string; size: "sm" | "lg" }) {
  const dims = size === "lg" ? "w-14 h-14 rounded-2xl" : "w-9 h-9 rounded-lg";
  return (
    <div className={`${dims} bg-stone-100 overflow-hidden flex-shrink-0`}>
      {url ? (
        <img src={url} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-stone-400 text-lg font-medium">
          {name.charAt(0)}
        </div>
      )}
    </div>
  );
}

function BottomNav({ current }: { current: "characters" | "chat" | "shop" | "me" }) {
  const tabs = [
    { key: "characters", label: "角色", href: "/characters", icon: CharactersIcon },
    { key: "chat", label: "聊天", href: "/chat", icon: ChatIcon },
    { key: "shop", label: "商店", href: "/shop", icon: ShopIcon },
    { key: "me", label: "我的", href: "/me", icon: MeIcon },
  ] as const;

  return (
    <nav className="flex-shrink-0 flex items-center justify-around border-t border-stone-200 bg-stone-50 h-14">
      {tabs.map((tab) => {
        const isActive = tab.key === current;
        return (
          <a
            key={tab.key}
            href={tab.href}
            className={`flex flex-col items-center justify-center gap-0.5 w-16 h-full text-[10px] transition-colors ${
              isActive ? "text-neutral-900" : "text-stone-300 hover:text-stone-400"
            }`}
          >
            <tab.icon active={isActive} />
            <span>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function CharactersIcon({ active }: { active: boolean }) {
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