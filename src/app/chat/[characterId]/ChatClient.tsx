"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect, useCallback, useRef } from "react";
import { CharacterHeader } from "./CharacterHeader";
import { MessageList } from "./MessageList";
import { InputBar, type InputBarHandle } from "./InputBar";

interface CharacterData {
  id: string;
  name: string;
  avatarUrl?: string;
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

type StreamAction = "send" | "regenerate" | "continue" | null;

// ─── SSE stream consumer (shared by send / regenerate / continue) ───
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
        } catch {
          // skip unparseable chunks
        }
      }
    }
  } catch {
    onError("网络连接异常，请重试");
  }

  // Stream ended without explicit "done" — treat as done
  onDone();
}

// ─── Main Component ─────────────────────────────────

export function ChatClient({ characterId }: { characterId: string }) {
  const { user, loading: authLoading, token, login } = useAuth();
  const [email, setEmail] = useState("");
  const [logging, setLogging] = useState(false);

  const [character, setCharacter] = useState<CharacterData | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [memory, setMemory] = useState<MemoryStatus>({ used: 0, limit: 100 });
  const [fetching, setFetching] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeAction, setActiveAction] = useState<StreamAction>(null);

  const inputBarRef = useRef<InputBarHandle>(null);

  // --- Data fetching ---
  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const headers = { Authorization: "Bearer " + token };
      const charRes = await fetch("/api/characters/" + characterId, { headers });
      const charData = await charRes.json();
      if (charData.success) setCharacter(charData.data);

      const chatRes = await fetch("/api/chat/" + characterId, { headers });
      const chatData = await chatRes.json();
      if (chatData.success) {
        setMessages(chatData.data.messages ?? []);
        setMemory(chatData.data.memory ?? { used: 0, limit: 100 });
      }
    } catch {
      // ignore
    }
    setFetching(false);
  }, [token, characterId]);

  useEffect(() => {
    if (token) {
      fetchData();
    } else if (!authLoading) {
      setFetching(false);
    }
  }, [token, authLoading, fetchData]);

  // --- Shared auth headers helper ---
  const authHeaders = useCallback(
    () => ({ "Content-Type": "application/json", Authorization: "Bearer " + token! }),
    [token],
  );

  // --- handleSend (P0: regular chat) ---
  const handleSend = useCallback(async (content: string) => {
    if (!token || isStreaming) return;
    setIsStreaming(true);
    setActiveAction("send");

    const tempId = "temp-" + Date.now();
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "USER", content, createdAt: new Date().toISOString() },
    ]);

    const aiMsgId = "ai-" + Date.now();
    setMessages((prev) => [
      ...prev,
      { id: aiMsgId, role: "ASSISTANT", content: "", createdAt: new Date().toISOString() },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ characterId, content }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "发送失败" }));
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, content: err.error || "发送失败" } : m)),
        );
        return;
      }

      let aiContent = "";
      await consumeSSEStream(
        res,
        (delta) => {
          aiContent += delta;
          setMessages((prev) =>
            prev.map((m) => (m.id === aiMsgId ? { ...m, content: aiContent } : m)),
          );
        },
        (errMsg) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiMsgId ? { ...m, content: errMsg } : m)),
          );
        },
        () => {
          // Refresh memory count after message completes
          refreshMemory();
        },
      );
    } finally {
      setIsStreaming(false);
      setActiveAction(null);
    }
  }, [token, characterId, isStreaming, authHeaders]);

  // --- handleRegenerate ---
  const handleRegenerate = useCallback(async () => {
    if (!token || isStreaming || messages.length === 0) return;
    setIsStreaming(true);
    setActiveAction("regenerate");

    // Find last AI message to replace
    const lastAiIdx = findLastAiIndex(messages);
    const targetId = lastAiIdx >= 0 ? messages[lastAiIdx].id : "ai-" + Date.now();

    // Clear the last AI message content
    setMessages((prev) =>
      prev.map((m) =>
        m.id === targetId ? { ...m, content: "" } : m,
      ),
    );

    try {
      const res = await fetch("/api/chat/" + characterId + "/regenerate", {
        method: "POST",
        headers: authHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "重新生成失败" }));
        setMessages((prev) =>
          prev.map((m) => (m.id === targetId ? { ...m, content: err.error || "重新生成失败" } : m)),
        );
        return;
      }

      let aiContent = "";
      await consumeSSEStream(
        res,
        (delta) => {
          aiContent += delta;
          setMessages((prev) =>
            prev.map((m) => (m.id === targetId ? { ...m, content: aiContent } : m)),
          );
        },
        (errMsg) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === targetId ? { ...m, content: errMsg } : m)),
          );
        },
        () => refreshMemory(),
      );
    } finally {
      setIsStreaming(false);
      setActiveAction(null);
    }
  }, [token, characterId, messages, isStreaming, authHeaders]);

  // --- handleContinue ---
  const handleContinue = useCallback(async () => {
    if (!token || isStreaming) return;
    setIsStreaming(true);
    setActiveAction("continue");

    const aiMsgId = "ai-" + Date.now();
    setMessages((prev) => [
      ...prev,
      { id: aiMsgId, role: "ASSISTANT", content: "", createdAt: new Date().toISOString() },
    ]);

    try {
      const res = await fetch("/api/chat/" + characterId + "/continue", {
        method: "POST",
        headers: authHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "续写失败" }));
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, content: err.error || "续写失败" } : m)),
        );
        return;
      }

      let aiContent = "";
      await consumeSSEStream(
        res,
        (delta) => {
          aiContent += delta;
          setMessages((prev) =>
            prev.map((m) => (m.id === aiMsgId ? { ...m, content: aiContent } : m)),
          );
        },
        (errMsg) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiMsgId ? { ...m, content: errMsg } : m)),
          );
        },
        () => refreshMemory(),
      );
    } finally {
      setIsStreaming(false);
      setActiveAction(null);
    }
  }, [token, characterId, isStreaming, authHeaders]);

  // --- handleSuggest ---
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
        inputBarRef.current?.fillText(data.data.suggestion);
      }
    } catch {
      // silent fail for suggest
    } finally {
      setIsStreaming(false);
      setActiveAction(null);
    }
  }, [token, characterId, isStreaming, authHeaders]);

  // --- Refresh memory status after stream completes ---
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
    } catch {
      // ignore
    }
  }, [token, characterId]);

  // --- Auth loading ---
  if (authLoading || (fetching && !user)) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <div className="text-sm text-stone-300">加载中...</div>
      </div>
    );
  }

  // --- Unauthenticated ---
  if (!user) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 bg-stone-50">
        <div className="text-lg font-medium text-neutral-900">叙境 Xujing</div>
        <div className="text-sm text-stone-400">AI 恋爱陪伴平台</div>
        <div className="mt-4 w-full max-w-xs space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="输入邮箱登录"
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-neutral-900 placeholder:text-stone-300 outline-none focus:border-stone-400"
          />
          <button
            onClick={async () => {
              if (!email) return;
              setLogging(true);
              try { await login(email); } catch { /* ignore */ }
              setLogging(false);
            }}
            disabled={logging || !email}
            className="w-full rounded-xl bg-neutral-900 py-2.5 text-sm text-stone-50 disabled:opacity-50"
          >
            {logging ? "登录中..." : "登录"}
          </button>
        </div>
      </div>
    );
  }

  // --- Main chat layout ---
  return (
    <div className="flex flex-col h-dvh bg-stone-50">
      {character && (
        <CharacterHeader
          name={character.name}
          avatarUrl={character.avatarUrl}
          memoryUsed={memory.used}
          memoryLimit={memory.limit}
        />
      )}

      <MessageList
        messages={messages}
        loading={isStreaming}
        activeAction={activeAction}
        onRegenerate={handleRegenerate}
        onContinue={handleContinue}
        onSuggest={handleSuggest}
      />

      <InputBar ref={inputBarRef} onSend={handleSend} disabled={isStreaming} />

      <BottomNav current="chat" />
    </div>
  );
}

// --- Helpers ---
function findLastAiIndex(msgs: MessageData[]): number {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "ASSISTANT") return i;
  }
  return -1;
}

// --- Bottom Navigation ---
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

// --- Minimal SVG icons ---
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