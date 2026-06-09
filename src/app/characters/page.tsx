"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ImportCharacterModal from "@/components/ImportCharacterModal";

interface CharacterRow {
  id: string;
  name: string;
  avatarUrl?: string;
  setting?: string;
  personality?: string;
  isOfficial: boolean;
}

const FREE_LIMIT = 12;

export default function CharactersPage() {
  const { user, loading, token } = useAuth();
  const router = useRouter();
  const [fetching, setFetching] = useState(true);
  const [official, setOfficial] = useState<CharacterRow[]>([]);
  const [userChars, setUserChars] = useState<CharacterRow[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const isVip = user?.subscription === "vip";
  const charCount = userChars.length;
  const atLimit = !isVip && charCount >= FREE_LIMIT;

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
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

  const handleOpenCreate = () => {
    if (atLimit) return;
    setShowCreateModal(true);
  };

  const handleImported = () => {
    setFetching(true);
    fetchCharacters();
  };

  if (loading || !user || fetching) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-sm text-stone-300">加载中...</span>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      {/* Header */}
      <header className="shrink-0 px-6 pt-12 pb-3 flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">叙境</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-stone-400">
              {isVip ? "已创建 " + charCount + " 个角色" : charCount + " / " + FREE_LIMIT}
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
          {userChars.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="11" cy="8" r="4" />
                  <path d="M5 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                </svg>
              </div>
              <p className="text-sm text-stone-400">还没有角色</p>
              <p className="text-xs text-stone-300 mt-1">点击右上角「新建」开始创造</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {userChars.map((c) => (
                <CharacterCard key={c.id} character={c} />
              ))}
            </div>
          )}
        </section>
      </div>

      <BottomNav current="characters" />

      {/* Create / Import Modal */}
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
      <div className="w-full aspect-square rounded-xl bg-stone-100 overflow-hidden mb-3">
        {c.avatarUrl ? (
          <img src={c.avatarUrl} alt={c.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-stone-300 text-3xl font-light select-none">{c.name.charAt(0)}</span>
          </div>
        )}
      </div>
      <h3 className="text-sm font-medium text-neutral-800 truncate leading-snug">{c.name}</h3>
      {desc && (
        <p className="text-[11px] text-stone-400 leading-relaxed mt-0.5 line-clamp-2">{desc}</p>
      )}
      {c.isOfficial && (
        <span className="inline-block mt-1.5 text-[10px] text-stone-300 bg-stone-50 px-1.5 py-0.5 rounded-md">官方</span>
      )}
    </Link>
  );
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
