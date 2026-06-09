"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ConfigRow {
  id: string;
  name: string;
  platform: string;
  modelId: string;
  apiUrl: string;
  isActive: boolean;
  isDefault: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  OPENAI: "OpenAI", ANTHROPIC: "Claude", GEMINI: "Gemini",
  DEEPSEEK: "DeepSeek", GROK: "Grok",
  CUSTOM_OPENAI: "OpenAI 兼容", CUSTOM_ANTHROPIC: "Anthropic 兼容",
  CUSTOM_GEMINI: "Gemini 兼容",
};

export default function ApiConnectionsPage() {
  // ═══════════════════ HOOKS ZONE ═══════════════════
  const { user, loading: authLoading, token } = useAuth();
  const router = useRouter();
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);

  const fetchConfigs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/api-configs", { headers: { Authorization: "Bearer " + token } });
      const data = await res.json();
      if (data.success) setConfigs(Array.isArray(data.data) ? data.data : []);
    } catch { /* ignore */ }
    setFetching(false);
  }, [token]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const usePlatform = useCallback(async () => {
    if (!token) return;
    setActivating("__platform__");
    try {
      const res = await fetch("/api/api-configs/use-platform", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      });
      if (res.ok) {
        setConfigs(prev => prev.map(c => ({ ...c, isActive: false })));
      }
    } catch { /* ignore */ }
    setActivating(null);
  }, [token]);

  const setActive = useCallback(async (id: string) => {
    if (!token) return;
    setActivating(id);
    try {
      const res = await fetch("/api/api-configs/" + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ action: "activate" }),
      });
      if (res.ok) {
        setConfigs(prev => prev.map(c => ({
          ...c,
          isActive: c.id === id,
          isDefault: c.id === id ? true : c.isDefault,
        })));
      }
    } catch { /* ignore */ }
    setActivating(null);
  }, [token]);

  const setDefault = useCallback(async (id: string) => {
    if (!token) return;
    setActivating(id);
    try {
      const res = await fetch("/api/api-configs/" + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ action: "set_default" }),
      });
      if (res.ok) {
        setConfigs(prev => prev.map(c => ({ ...c, isDefault: c.id === id })));
      }
    } catch { /* ignore */ }
    setActivating(null);
  }, [token]);

  // ═══════════════════ DERIVED ═══════════════════
  const isVip = user?.subscription === "vip";
  const hasConfigs = configs.length > 0;
  const platformActive = !configs.some(c => c.isActive);

  // ═══════════════════ EARLY RETURNS ═══════════════════
  if (authLoading || fetching) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-sm text-stone-300">加载中…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-sm text-stone-300">跳转中…</span>
      </div>
    );
  }

  // ═══════════════════ RENDER ═══════════════════
  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      <header className="shrink-0 flex items-center justify-between px-5 pt-12 pb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/characters")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4L6 9l5 5" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">API 配置</h1>
        </div>
        <button
          onClick={() => router.push("/api-connections/new")}
          className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-stone-50 transition-colors hover:bg-neutral-800 active:scale-[0.98]"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M6 2v8M2 6h8" />
          </svg>
          新建
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-12">
        {/* Section: 模型通道 */}
        <section className="mb-8">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
            {isVip ? "选择模型通道" : "自定义配置"}
          </h2>

          {/* VIP: platform model card */}
          {isVip && (
            <div className="mb-2.5">
              <div
                className={`rounded-xl border px-4 py-3.5 transition-colors ${
                  platformActive
                    ? "border-stone-300 bg-stone-50 ring-1 ring-stone-200"
                    : "border-stone-100 bg-white hover:border-stone-200 hover:bg-stone-50/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-amber-500 text-lg shrink-0">&#9733;</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-800 truncate">叙境专属模型</div>
                      <div className="mt-0.5 text-[11px] text-stone-400">VIP 专属通道</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {platformActive ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">使用中</span>
                    ) : (
                      <button
                        onClick={usePlatform}
                        disabled={activating === "__platform__"}
                        className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[10px] font-medium text-stone-500 hover:border-stone-300 hover:text-stone-700 transition-colors disabled:opacity-50"
                      >
                        {activating === "__platform__" ? "…" : "启用"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Non-VIP empty */}
          {!isVip && !hasConfigs && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6 6V5a4 4 0 018 0v1" />
                  <rect x="4" y="8" width="12" height="9" rx="2" />
                  <circle cx="10" cy="12.5" r="1" />
                </svg>
              </div>
              <p className="text-sm text-stone-400">尚未配置 API</p>
              <p className="mt-1 text-[11px] text-stone-300">点击右上角「新建」添加你的模型配置</p>
            </div>
          )}

          {/* Self configs */}
          {hasConfigs && (
            <div className="space-y-2.5">
              {isVip && (
                <p className="text-[10px] text-stone-300 mb-1">自备 API 密钥</p>
              )}
              {configs.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-xl border px-4 py-3.5 transition-colors ${
                    c.isActive
                      ? "border-stone-300 bg-stone-50 ring-1 ring-stone-200"
                      : "border-stone-100 bg-white hover:border-stone-200 hover:bg-stone-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => router.push("/api-connections/" + c.id)}
                      className="text-left flex-1 min-w-0"
                    >
                      <div className="text-sm font-medium text-neutral-800 truncate">{c.name}</div>
                      <div className="mt-0.5 text-[11px] text-stone-400">
                        {PLATFORM_LABELS[c.platform] || c.platform} · {c.modelId}
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {c.isActive ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">使用中</span>
                      ) : (
                        <button
                          onClick={() => setActive(c.id)}
                          disabled={activating === c.id}
                          className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[10px] font-medium text-stone-500 hover:border-stone-300 hover:text-stone-700 transition-colors disabled:opacity-50"
                        >
                          {activating === c.id ? "…" : "启用"}
                        </button>
                      )}
                      {!c.isDefault && (
                        <button
                          onClick={() => setDefault(c.id)}
                          disabled={activating === c.id}
                          className="rounded-full border border-stone-100 bg-stone-50 px-2 py-0.5 text-[10px] text-stone-400 hover:border-stone-200 hover:text-stone-500 transition-colors disabled:opacity-50"
                        >
                          设为默认
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}