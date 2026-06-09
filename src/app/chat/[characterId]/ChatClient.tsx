"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { CharacterHeader } from "./CharacterHeader";
import { MessageList } from "./MessageList";
import { InputBar, type InputBarHandle } from "./InputBar";

// ─── Types ────────────────────────────────────────────────────

interface CharacterData {
  id: string;
  name: string;
  avatarUrl?: string;
  greeting?: string;
}

interface MessageData {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

interface MemoryStatus {
  used: number;
  limit: number;
}

type StreamAction = "send" | "regenerate" | "continue" | "suggest" | null;

// ─── SSE stream consumer ──────────────────────────────────────

async function consumeSSEStream(
  res: Response,
  onDelta: (content: string) => void,
  onError: (message: string) => void,
  onDone: () => void,
) {
  const reader = res.body?.getReader();
  if (!reader) {
    onError("无法读取服务器响应");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "delta") {
            onDelta(evt.content);
          } else if (evt.type === "done") {
            onDone();
            return;
          } else if (evt.type === "error") {
            onError(evt.message || "AI 响应出错");
            return;
          }
        } catch { /* skip */ }
      }
    }
  } catch {
    onError("网络连接异常，请重试");
  }
  onDone();
}

// ─── Main Component ───────────────────────────────────────────

export function ChatClient({ characterId }: { characterId: string }) {
  // ──────── ALL HOOKS FIRST ────────
  const { user, loading: authLoading, token } = useAuth();
  const router = useRouter();
  const inputBarRef = useRef<InputBarHandle>(null);

  const [character, setCharacter] = useState<CharacterData | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [memory, setMemory] = useState<MemoryStatus>({ used: 0, limit: 100 });
  const [fetching, setFetching] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeAction, setActiveAction] = useState<StreamAction>(null);
  const [hasApiConfigured, setHasApiConfigured] = useState(true);
  const [needsApiConfig, setNeedsApiConfig] = useState(false);
  const [greetingDismissed, setGreetingDismissed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<"restart" | "stats" | "export" | null>(null);
  const [restarting, setRestarting] = useState(false);

  const isVip = user?.subscription === "vip";

  const stats = (() => {
    if (!character || messages.length === 0) return null;
    // Safe read — intersect with optional createdAt fields, compatible with snake_case
    const charData = character as CharacterData & { createdAt?: string | Date; created_at?: string | Date };
    const rawDate = charData.createdAt || charData.created_at;
    // Fallback to first message time or current time
    const firstMsgDate = messages[0]?.createdAt;
    const fallbackDate = firstMsgDate ? new Date(firstMsgDate) : new Date();
    const createdAt = rawDate ? new Date(rawDate as string | Date) : fallbackDate;
    const now = new Date();
    const diffDays = Math.max(1, Math.ceil((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
    const totalWords = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
    return { diffDays, totalMessages: messages.length, totalWords, createdAt };
  })();

  const hasGreeting = !!character?.greeting;
  const showGreeting = hasGreeting && messages.length === 0 && !greetingDismissed;

  // ── Redirect unauthenticated users ──
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  // ── Check API configuration ──
  useEffect(() => {
    if (!token || !user) return;
    if (isVip) {
      setHasApiConfigured(true);
      setNeedsApiConfig(false);
      return;
    }
    fetch("/api/api-configs", {
      headers: { Authorization: "Bearer " + token },
    })
      .then((r) => r.json())
      .then((data) => {
        const configs = Array.isArray(data.data) ? data.data : [];
        const hasConfig = configs.length > 0;
        setHasApiConfigured(hasConfig);
        setNeedsApiConfig(!hasConfig);
      })
      .catch(() => {
        setHasApiConfigured(false);
        setNeedsApiConfig(true);
      });
  }, [token, user, isVip]);

  // ── Fetch character + messages ──
  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const headers = { Authorization: "Bearer " + token };
      const charRes = await fetch("/api/characters/" + characterId, { headers });
      const charData = await charRes.json();
      if (charData.success && charData.data) {
        setCharacter({
          id: charData.data.id,
          name: charData.data.name,
          avatarUrl: charData.data.avatarUrl,
          greeting: charData.data.greeting,
        });
      }

      const chatRes = await fetch("/api/chat/" + characterId, { headers });
      const chatData = await chatRes.json();
      console.log('[ChatClient] GET /api/chat/', characterId, '→ messages:', chatData.data?.messages?.length ?? 0, 'success:', chatData.success);
      if (chatData.success && chatData.data) {
        setMessages(chatData.data.messages ?? []);
        setMemory(chatData.data.memory ?? { used: 0, limit: 100 });
      } else {
        console.warn('[ChatClient] Chat history API returned error or no data:', chatData);
      }
    } catch (err) {


    }
    setFetching(false);
  }, [token, characterId]);

  useEffect(() => {
    if (token) fetchData();
    else if (!authLoading) setFetching(false);
  }, [token, authLoading, fetchData]);

  // ── Auth headers helper ──
  const authHeaders = useCallback(
    () => ({ "Content-Type": "application/json", Authorization: "Bearer " + token! }),
    [token],
  );

  // ── handleSend ──
  const handleSend = useCallback(async (content: string) => {
    if (!token || isStreaming) return;
    setIsStreaming(true);
    setActiveAction("send");

    const tempId = "temp-" + Date.now();
    setMessages((prev) => [...prev, { id: tempId, role: "USER", content, createdAt: new Date().toISOString() }]);

    const aiMsgId = "ai-" + Date.now();
    setMessages((prev) => [...prev, { id: aiMsgId, role: "ASSISTANT", content: "", createdAt: new Date().toISOString() }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ characterId, content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "发送失败" }));
        setMessages((prev) => prev.map((m) => (m.id === aiMsgId ? { ...m, content: err.error || "发送失败" } : m)));
        return;
      }
      let aiContent = "";
      await consumeSSEStream(
        res,
        (delta) => { aiContent += delta; setMessages((prev) => prev.map((m) => (m.id === aiMsgId ? { ...m, content: aiContent } : m))); },
        (errMsg) => { setMessages((prev) => prev.map((m) => (m.id === aiMsgId ? { ...m, content: errMsg } : m))); },
        () => refreshMemory(),
      );
    } finally {
      setIsStreaming(false);
      setActiveAction(null);
    }
  }, [token, characterId, isStreaming, authHeaders]);

  // ── handleRegenerate ──
  const handleRegenerate = useCallback(async () => {
    if (!token || isStreaming || messages.length === 0) return;
    setIsStreaming(true);
    setActiveAction("regenerate");

    const lastAiIdx = findLastAiIndex(messages);
    const targetId = lastAiIdx >= 0 ? messages[lastAiIdx].id : "ai-" + Date.now();

    setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, content: "" } : m)));

    try {
      const res = await fetch("/api/chat/" + characterId + "/regenerate", {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "重新生成失败" }));
        setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, content: err.error || "重新生成失败" } : m)));
        return;
      }
      let aiContent = "";
      await consumeSSEStream(
        res,
        (delta) => { aiContent += delta; setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, content: aiContent } : m))); },
        (errMsg) => { setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, content: errMsg } : m))); },
        () => refreshMemory(),
      );
    } finally {
      setIsStreaming(false);
      setActiveAction(null);
    }
  }, [token, characterId, messages, isStreaming, authHeaders]);

  // ── handleContinue ──
  const handleContinue = useCallback(async () => {
    if (!token || isStreaming) return;
    setIsStreaming(true);
    setActiveAction("continue");

    const aiMsgId = "ai-" + Date.now();
    setMessages((prev) => [...prev, { id: aiMsgId, role: "ASSISTANT", content: "", createdAt: new Date().toISOString() }]);

    try {
      const res = await fetch("/api/chat/" + characterId + "/continue", {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "续写失败" }));
        setMessages((prev) => prev.map((m) => (m.id === aiMsgId ? { ...m, content: err.error || "续写失败" } : m)));
        return;
      }
      let aiContent = "";
      await consumeSSEStream(
        res,
        (delta) => { aiContent += delta; setMessages((prev) => prev.map((m) => (m.id === aiMsgId ? { ...m, content: aiContent } : m))); },
        (errMsg) => { setMessages((prev) => prev.map((m) => (m.id === aiMsgId ? { ...m, content: errMsg } : m))); },
        () => refreshMemory(),
      );
    } finally {
      setIsStreaming(false);
      setActiveAction(null);
    }
  }, [token, characterId, isStreaming, authHeaders]);

  // ── handleSuggest ──
  const handleSuggest = useCallback(async () => {
    if (!token || isStreaming) return;
    setIsStreaming(true);
    setActiveAction("suggest");

    try {
      const res = await fetch("/api/chat/" + characterId + "/suggest", {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.data?.suggestion) {
        inputBarRef.current?.fillText?.(data.data.suggestion);
      }
    } catch { /* silent */ }
    finally {
      setIsStreaming(false);
      setActiveAction(null);
    }
  }, [token, characterId, isStreaming, authHeaders]);

  // ── Refresh memory ──
  const handleRestart = useCallback(async () => {
    if (!token) return;
    setRestarting(true);
    try {
      await fetch("/api/chat/" + characterId, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
      });
      setMessages([]);
      setGreetingDismissed(false);
      setActiveModal(null);
    } catch { /* ignore */ }
    setRestarting(false);
  }, [token, characterId]);

  const handleExport = useCallback((format: "txt" | "json") => {
    if (messages.length === 0) return;
    const charName = character?.name ?? "角色";
    let blob: Blob;
    if (format === "json") {
      blob = new Blob([JSON.stringify(messages, null, 2)], { type: "application/json" });
    } else {
      const text = messages.map(m =>
        (m.role === "USER" ? "User" : charName) + ": " + m.content
      ).join("\n\n");
      blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "与" + charName + "的聊天记录." + format;
    a.click();
    URL.revokeObjectURL(url);
    setActiveModal(null);
  }, [messages, character]);

  const refreshMemory = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/chat/" + characterId, {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (data.success) {
        setMemory(data.data.memory ?? { used: 0, limit: 100 });
      }
    } catch { /* ignore */ }
  }, [token, characterId]);

  // ──────── RENDER ────────

  if (authLoading || fetching) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <div className="text-sm text-stone-300">加载中…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <div className="text-sm text-stone-300">跳转中…</div>
      </div>
    );
  }

  // ── API 密钥未配置引导页 ──
  if (needsApiConfig) {
    return (
      <div className="flex h-dvh flex-col bg-stone-50">
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mb-6">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round">
              <path d="M6 6V5a4 4 0 018 0v1" />
              <rect x="4" y="8" width="12" height="9" rx="2" />
              <circle cx="10" cy="12.5" r="1" />
            </svg>
          </div>
          <p className="text-sm text-stone-400 text-center leading-relaxed mb-8">
            请先配置 API 密钥以开启对话
          </p>
          <button
            onClick={() => router.push("/api-connections")}
            className="rounded-lg bg-neutral-800 px-6 py-2.5 text-xs font-medium text-stone-50 transition-colors hover:bg-neutral-700 active:scale-[0.98]"
          >
            前往配置 API
          </button>
        </div>
        <BottomNav current="chat" />
      </div>
    );
  }

  // ── Main chat layout ──
  return (
    <div className="flex flex-col h-dvh bg-stone-50">
      {character && !showGreeting && (
        <CharacterHeader
          name={character.name ?? ""}
          avatarUrl={character.avatarUrl ?? null}
          memoryUsed={memory.used}
          onMenuClick={() => setMenuOpen((p) => !p)}
        />
      )}

      {/* ── Management Menu Dropdown ── */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-4 top-14 z-40 w-44 rounded-xl border border-stone-200 bg-white shadow-lg py-1.5">
            <button onClick={() => { setMenuOpen(false); setActiveModal("restart"); }} className="w-full text-left px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50 transition-colors flex items-center gap-2.5">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 7.5a5 5 0 019.3-2.5M12.5 7.5a5 5 0 01-9.3 2.5"/><path d="M2.5 3.5v4h4M12.5 11.5v-4h-4"/></svg>
              重启
            </button>
            <button onClick={() => { setMenuOpen(false); setActiveModal("stats"); }} className="w-full text-left px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50 transition-colors flex items-center gap-2.5">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1.5" y="10" width="3" height="3.5" rx="0.5"/><rect x="6" y="6.5" width="3" height="7" rx="0.5"/><rect x="10.5" y="3" width="3" height="10.5" rx="0.5"/></svg>
              统计
            </button>
            <button onClick={() => { setMenuOpen(false); setActiveModal("export"); }} className="w-full text-left px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50 transition-colors flex items-center gap-2.5">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M7.5 1.5v9M4.5 7l3 3.5 3-3.5"/><path d="M2.5 12v1a1 1 0 001 1h8a1 1 0 001-1v-1"/></svg>
              导出
            </button>
          </div>
        </>
      )}

      {/* Opening Ceremony */}
      {showGreeting && character && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-16">
          {/* Avatar with blur glow */}
          <div className="relative mb-8">
            <div className="absolute inset-0 rounded-full bg-stone-300/40 blur-2xl scale-150" />
            <div className="relative w-24 h-24 rounded-full bg-stone-200 overflow-hidden ring-4 ring-white/80 shadow-lg">
              {character.avatarUrl ? (
                <img
                  src={character.avatarUrl}
                  alt={character.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-stone-400 text-3xl font-light select-none">
                  {character.name?.charAt(0) ?? "?"}
                </div>
              )}
            </div>
          </div>

          {/* Name */}
          <h2 className="text-xl font-semibold tracking-tight text-neutral-900 mb-3">
            {character.name ?? "—"}
          </h2>

          {/* Greeting */}
          <p className="text-sm text-stone-400 text-center leading-relaxed max-w-xs mb-10">
            {character.greeting ?? ""}
          </p>

          {/* Start button */}
          <button
            onClick={() => setGreetingDismissed(true)}
            className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-8 py-3 text-sm font-medium text-stone-50 transition-all duration-200 hover:bg-neutral-800 active:scale-[0.97] shadow-lg shadow-neutral-900/10"
          >
            开始对话
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 7h10M8 3l4 4-4 4" />
            </svg>
          </button>
        </div>
      )}

      {/* Normal chat (hidden during greeting) */}
      {!showGreeting && (
        <MessageList
          messages={messages}
          loading={isStreaming}
          activeAction={activeAction}
          onRegenerate={handleRegenerate}
          onContinue={handleContinue}
          onSuggest={handleSuggest}
        />
      )}

      <InputBar ref={inputBarRef} onSend={handleSend} disabled={isStreaming} />

      {/* ── Restart Modal ── */}
      {activeModal === "restart" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setActiveModal(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-sm font-medium text-neutral-900 mb-2">确定要重启该角色聊天吗？</p>
            <p className="text-xs text-stone-400 leading-relaxed mb-6">此操作将清空本地和云端当前角色的所有消息，且无法恢复。</p>
            <div className="flex gap-2.5">
              <button onClick={() => setActiveModal(null)} className="flex-1 rounded-lg border border-stone-200 bg-white py-2.5 text-sm text-stone-500 hover:bg-stone-50 transition-colors">取消</button>
              <button onClick={handleRestart} disabled={restarting} className="flex-1 rounded-lg bg-red-500 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors">{restarting ? "…" : "重启聊天"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats Modal ── */}
      {activeModal === "stats" && character && stats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setActiveModal(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-base font-semibold text-neutral-900 text-center mb-4">{character.name}</p>
            <div className="flex items-center justify-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-stone-200 overflow-hidden flex items-center justify-center ring-2 ring-stone-100">
                {character.avatarUrl ? <img src={character.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-stone-400 text-xl">{(character.name ?? "?").charAt(0)}</span>}
              </div>
              <span className="text-2xl">{String.fromCodePoint(0x1F493)}</span>
              <div className="w-14 h-14 rounded-full bg-stone-200 overflow-hidden flex items-center justify-center ring-2 ring-stone-100">
                {character.avatarUrl ? <img src={character.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-stone-400 text-xl">{(character.name ?? "?").charAt(0)}</span>}
              </div>
            </div>
            <p className="text-xs text-stone-400 text-center mb-5">
              {stats.createdAt.toISOString().slice(0, 10)} - {new Date().toISOString().slice(0, 10)}
            </p>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm"><span className="text-stone-400">陪伴天数</span><span className="text-neutral-800 font-medium">{stats.diffDays} 天</span></div>
              <div className="flex justify-between text-sm"><span className="text-stone-400">双方互发消息</span><span className="text-neutral-800 font-medium">{stats.totalMessages} 条</span></div>
              <div className="flex justify-between text-sm"><span className="text-stone-400">聊天字数</span><span className="text-neutral-800 font-medium">{stats.totalWords} 字</span></div>
            </div>
            <button onClick={() => setActiveModal(null)} className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-stone-50 hover:bg-neutral-800 transition-colors">确定</button>
          </div>
        </div>
      )}

      {/* ── Export Modal ── */}
      {activeModal === "export" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setActiveModal(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-sm font-medium text-neutral-900 mb-4">导出聊天记录</p>
            <p className="text-xs text-stone-400 mb-5">共 {messages.length} 条消息</p>
            <div className="flex gap-2.5">
              <button onClick={() => handleExport("txt")} disabled={messages.length === 0} className="flex-1 rounded-lg border border-stone-200 bg-white py-2.5 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-40 transition-colors">导出为 TXT</button>
              <button onClick={() => handleExport("json")} disabled={messages.length === 0} className="flex-1 rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-stone-50 hover:bg-neutral-800 disabled:opacity-40 transition-colors">导出为 JSON</button>
            </div>
          </div>
        </div>
      )}
      <BottomNav current="chat" />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function findLastAiIndex(msgs: MessageData[]): number {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "ASSISTANT") return i;
  }
  return -1;
}

// ─── Bottom Navigation ────────────────────────────────────────

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

// ─── SVG Icons ────────────────────────────────────────────────

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
