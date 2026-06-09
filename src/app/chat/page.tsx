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
  lastMessageAt: string;
}

export default function ChatListPage() {
  const { user, loading, token } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  const fetchChats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/characters", {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (data.success) {
        const allChars = [...(data.data.official || []), ...(data.data.user || [])];
        // Show all characters as potential chat targets
        const previews: ChatPreview[] = allChars.map((c: any) => ({
          characterId: c.id,
          characterName: c.name,
          avatarUrl: c.avatarUrl,
          lastMessage: c.lastMessage || "开始对话吧",
          lastMessageAt: c.lastMessageAt || c.updatedAt || c.createdAt,
        }));
        setChats(previews);
      }
    } catch { /* ignore */ }
    setFetching(false);
  }, [token]);

  useEffect(() => {
    if (user) fetchChats();
  }, [fetchChats, user]);

  if (loading || !user || fetching) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-sm text-stone-300">加载中...</span>
      </div>
    );
  }

  const isEmpty = chats.length === 0;

  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      {/* Header */}
      <div className="px-6 pt-12 pb-4">
        <h1 className="text-lg font-semibold text-neutral-900">聊天</h1>
      </div>

      {/* Content */}
      {isEmpty ? (
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
        <div className="flex-1 overflow-y-auto px-4">
          {chats.map((chat) => (
            <Link
              key={chat.characterId}
              href={`/chat/${chat.characterId}`}
              className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/60 transition-colors"
            >
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full bg-stone-200 flex items-center justify-center overflow-hidden shrink-0">
                {chat.avatarUrl ? (
                  <img src={chat.avatarUrl} alt={chat.characterName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-stone-400 text-sm font-medium">
                    {chat.characterName.slice(0, 2)}
                  </span>
                )}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-800 truncate">
                    {chat.characterName}
                  </span>
                  <span className="text-[11px] text-stone-300 shrink-0 ml-2">
                    {formatTime(chat.lastMessageAt)}
                  </span>
                </div>
                <p className="text-xs text-stone-400 truncate mt-0.5">
                  {chat.lastMessage}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return "";
  }
}
