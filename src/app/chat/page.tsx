"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ChatPreview {
  characterId: string;
  characterName: string;
  avatarUrl?: string;
  lastMessage: string;
  lastMessageAt?: string;
}

export default function ChatListPage() {
  const { user, loading, token } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const fetchChats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/characters", {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (data.success) {
        const all = [...(data.data.official || []), ...(data.data.user || [])];
        // Enrich with real last messages from backend
        const enriched = await Promise.all(
          all.map(async (c: any) => {
            try {
              const msgRes = await fetch("/api/chat/" + c.id, {
                headers: { Authorization: "Bearer " + token },
              });
              const msgData = await msgRes.json();
              if (msgData.success && msgData.data) {
                const msgs: any[] = msgData.data.messages ?? [];
                const last = msgs[msgs.length - 1];
                return {
                  characterId: c.id,
                  characterName: c.name,
                  avatarUrl: c.avatarUrl,
                  lastMessage: last?.content ?? "",
                  lastMessageAt: last?.createdAt ?? undefined,
                };
              }
            } catch { /* skip */ }
            return {
              characterId: c.id,
              characterName: c.name,
              avatarUrl: c.avatarUrl,
              lastMessage: "",
              lastMessageAt: undefined,
            };
          })
        );
        setChats(enriched);
      }
    } catch { /* ignore */ }
    setFetching(false);
  }, [token]);

  useEffect(() => { if (user) fetchChats(); }, [fetchChats, user]);

  if (loading || !user || fetching) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-sm text-stone-300">加载中...</span>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      <header className="shrink-0 px-6 pt-12 pb-4">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">聊天</h1>
      </header>

      {chats.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-24">
          <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-sm text-stone-400 mb-1">暂时没有对话</p>
          <p className="text-xs text-stone-300 mb-8">去角色列表看看吧</p>
          <Link
            href="/characters"
            className="rounded-xl bg-neutral-900 px-6 py-2.5 text-sm font-medium text-stone-50 hover:bg-neutral-800 transition-colors"
          >
            浏览角色
          </Link>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-24">
          {chats.map((chat) => (
            <Link
              key={chat.characterId}
              href={"/chat/" + chat.characterId}
              className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/60 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
                {chat.avatarUrl ? (
                  <img src={chat.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-stone-400 text-sm font-medium">{chat.characterName.slice(0, 2)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-800 truncate">{chat.characterName}</span>
                  {chat.lastMessageAt && <span className="text-[11px] text-stone-300 shrink-0 ml-2">{fmt(chat.lastMessageAt)}</span>}
                </div>
                {chat.lastMessage ? <p className="text-xs text-stone-400 truncate mt-0.5">{chat.lastMessage}</p> : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      <BottomNav current="chat" />
    </div>
  );
}

function fmt(iso: string): string {
  try {
    const d = new Date(iso), n = new Date();
    const m = Math.floor((n.getTime() - d.getTime()) / 60000);
    if (m < 1) return "刚刚";
    if (m < 60) return m + "分钟前";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "小时前";
    const dy = Math.floor(h / 24);
    if (dy < 7) return dy + "天前";
    return (d.getMonth() + 1) + "/" + d.getDate();
  } catch { return ""; }
}

// ─── Bottom Navigation ───

function BottomNav({ current }: { current: string }) {
  const tabs = [
    { key: "characters", label: "角色", href: "/characters", icon: CharsIcon },
    { key: "chat", label: "聊天", href: "/chat", icon: ChatIcon },
    { key: "shop", label: "商店", href: "/shop", icon: ShopIcon },
    { key: "me", label: "我的", href: "/me", icon: MeIcon },
  ] as const;

  return (
    <nav className="shrink-0 flex items-center justify-around border-t border-stone-100 bg-stone-50 h-14">
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