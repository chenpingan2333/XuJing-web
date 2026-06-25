"use client";

import { useAuth } from "@/lib/use-auth";
import { safeDate } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toAbsoluteUrl } from "@/lib/image-utils";
import ImportCharacterModal from "@/components/ImportCharacterModal";

interface CharacterRow {
  id: string;
  name: string;
  avatarUrl?: string;
  setting?: string;
  personality?: string;
  isOfficial: boolean;
  lastMessage?: string;
  lastChatAt?: string;
}

const FREE_LIMIT = 2;

function formatChatTime(iso: string): string {
  if (!iso) return "";
  const d = safeDate(iso);
  if (!d) return "";
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  if (isYesterday) return "昨天";

  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return diffDays + "天前";
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function truncateMsg(text: string, max = 12): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export default function CharactersPage() {
  // ═══════════════════════════════════════════════════════════
  // SECTION 1: ALL HOOKS — absolute top, no if/return/switch
  // ═══════════════════════════════════════════════════════════

  const { user, loading, token } = useAuth();
  const router = useRouter();
  const [fetching, setFetching] = useState(true);
  const [official, setOfficial] = useState<CharacterRow[]>([]);
  const [userChars, setUserChars] = useState<CharacterRow[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const enrichWithChatInfo = useCallback(async (chars: CharacterRow[]): Promise<CharacterRow[]> => {
    if (!token || chars.length === 0) return chars;
    try {
      const enriched = await Promise.all(
        chars.map(async (c) => {
          try {
            const res = await fetch("/api/chat/" + c.id, {
              headers: { Authorization: "Bearer " + token },
            });
            const data = await res.json();
            if (data.success && data.data) {
              const msgs: any[] = data.data.messages ?? [];
              const last = msgs[msgs.length - 1];
              return {
                ...c,
                lastMessage: last?.content ?? undefined,
                lastChatAt: last?.createdAt ?? undefined,
              };
            }
          } catch { /* skip */ }
          return c;
        })
      );
      return enriched;
    } catch { return chars; }
  }, [token]);

  const fetchCharacters = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/characters", {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (data.success) {
        const rawOfficial: CharacterRow[] = data.data.official || [];
        const rawUser: CharacterRow[] = data.data.user || [];
        const [enrichedOfficial, enrichedUser] = await Promise.all([
          enrichWithChatInfo(rawOfficial),
          enrichWithChatInfo(rawUser),
        ]);
        setOfficial(enrichedOfficial);
        setUserChars(enrichedUser);
      }
    } catch { /* ignore */ }
    setFetching(false);
  }, [token, enrichWithChatInfo]);

  useEffect(() => { if (user) fetchCharacters(); }, [fetchCharacters, user]);

  const handleOpenCreate = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  const handleImported = useCallback(() => {
    setFetching(true);
    fetchCharacters();
  }, [fetchCharacters]);

  // ═══════════════════════════════════════════════════════════
  // SECTION 2: Derived values (non-hook, after all hooks)
  // ═══════════════════════════════════════════════════════════

  const isVip = user?.subscription === "vip";
  const privateCount = userChars.filter(c => !c.isOfficial).length;
  const atLimit = !isVip && privateCount >= FREE_LIMIT;

  // ═══════════════════════════════════════════════════════════
  // SECTION 3: EARLY RETURNS — after all hooks
  // ═══════════════════════════════════════════════════════════

  if (loading || !user || fetching) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-sm text-stone-300">加载中…</span>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 4: RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      {/* Header */}
      <header className="shrink-0 px-6 pt-12 pb-3 flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">叙境</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-stone-400">
              {isVip ? "已创建" + privateCount + " 个角色" : privateCount + " / " + FREE_LIMIT}
            </span>
            {atLimit && (
              <span className="text-[10px] text-stone-300 bg-stone-100 px-1.5 py-0.5 rounded-full">已满</span>
            )}
          </div>
        </div>
        <button
          onClick={handleOpenCreate}
          disabled={atLimit}
          className={
            "inline-flex items-center gap-1 rounded-xl px-4 py-2 text-xs font-medium transition-colors duration-200 " +
            (atLimit
              ? "bg-stone-100 text-stone-300 cursor-not-allowed"
              : "bg-neutral-900 text-stone-50 hover:bg-neutral-800 active:scale-[0.98]")
          }
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          新建
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {official.length > 0 && (
          <section className="mb-8">
            <h2 className="px-2 mb-3 text-[11px] font-medium text-stone-400 tracking-wider uppercase">
              叙境专属角色
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {official.map((c) => (
                <CharacterCard key={c.id} character={c} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="px-2 mb-3 text-[11px] font-medium text-stone-400 tracking-wider uppercase">
            我的角色
          </h2>
          {userChars.filter(c => !c.isOfficial).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="11" cy="8" r="4" />
                  <path d="M5 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                </svg>
              </div>
              <p className="text-sm text-stone-400">还没有角色</p>
              <p className="text-xs text-stone-300 mt-1">点击右上角「新建」开始创建</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {userChars.filter(c => !c.isOfficial).map((c) => (
                <CharacterCard key={c.id} character={c} />
              ))}
            </div>
          )}

          {/* API 连接入口 */}
          {!isVip ? (
            <div className="mt-8 mb-4">
              <button
                onClick={() => router.push("/api-connections")}
                className="w-full rounded-xl border border-dashed border-stone-200 bg-white/60 py-4 text-center transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 active:scale-[0.99]"
              >
                <div className="flex items-center justify-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M5 6V5a3 3 0 016 0v1" />
                    <rect x="3" y="6" width="10" height="7" rx="1.5" />
                    <circle cx="8" cy="9.5" r="0.75" fill="#a8a29e" />
                  </svg>
                  <span className="text-sm font-medium text-stone-500">API 连接</span>
                </div>
                <span className="block mt-0.5 text-[11px] text-stone-300">配置你自己的模型 API Key</span>
              </button>
            </div>
          ) : (
            <div className="mt-8 mb-4 rounded-xl bg-amber-50/60 border border-amber-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-amber-500 text-sm">&#9733;</span>
                <div>
                  <span className="text-xs font-medium text-amber-800">叙境专属模型</span>
                  <span className="block text-[10px] text-amber-600">VIP已接入叙境专属对话大模型，可在api key设置里自主选择</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <BottomNav current="characters" />

      <ImportCharacterModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onImported={handleImported}
        token={token}
      />
    </div>
  );
}

function CharacterCard({ character: c }: { character: CharacterRow }) {
  const desc = c.setting || c.personality || "";
  return (
    <Link
      href={"/characters/" + c.id}
      className="group flex flex-col rounded-2xl bg-white p-3.5 transition-all duration-200 hover:bg-stone-50/80 active:scale-[0.98]"
    >
      <div className="relative w-full aspect-square rounded-xl bg-stone-100 overflow-hidden mb-3">
        {c.avatarUrl ? (
          <Image src={toAbsoluteUrl(c.avatarUrl!)} alt={c.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-stone-300 text-3xl font-light select-none">{c.name?.charAt(0) ?? "?"}</span>
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-1">
        <h3 className="text-sm font-medium text-neutral-800 truncate leading-snug flex-1 min-w-0">{c.name ?? "…"}</h3>
        {c.lastChatAt && (
          <span className="text-[10px] text-stone-300 whitespace-nowrap mt-0.5">{formatChatTime(c.lastChatAt)}</span>
        )}
      </div>

      {c.lastMessage ? (
        <p className="text-[11px] text-stone-400 leading-relaxed mt-1 line-clamp-2">{truncateMsg(c.lastMessage, 10)}</p>
      ) : desc ? (
        <p className="text-[11px] text-stone-400 leading-relaxed mt-0.5 line-clamp-2">{desc}</p>
      ) : null}

      {c.isOfficial && (
        <span className="inline-block mt-1.5 text-[10px] text-stone-300 bg-stone-50 px-1.5 py-0.5 rounded-md">官方</span>
      )}
    </Link>
  );
}

function BottomNav({ current }: { current: string }) {
  const tabs = [
    { key: "characters", label: "角色", href: "/characters", icon: CharsIcon },
    { key: "chat", label: "聊天", href: "/chat", icon: ChatIcon },
    { key: "shop", label: "广场", href: "/plaza", icon: ShopIcon },
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