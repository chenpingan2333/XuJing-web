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

  const fetchConfigs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/api-configs", {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (data.success) setConfigs(Array.isArray(data.data) ? data.data : []);
    } catch { /* ignore */ }
    setFetching(false);
  }, [token]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const isVip = user?.subscription === "vip";
  const hasCustomConfig = configs.length > 0;

  // ═══════════════════ RENDER ZONE ═══════════════════

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

  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      {/* Header */}
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
        {!isVip && (
          <button
            onClick={() => router.push("/api-connections/new")}
            className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-stone-50 transition-colors hover:bg-neutral-800 active:scale-[0.98]"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M6 2v8M2 6h8" />
            </svg>
            新建
          </button>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-12">
        {/* VIP Status */}
        {isVip && (
          <section className="mb-8">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
              当前通道
            </h2>
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="text-amber-500 text-lg">&#9733;</span>
                <div>
                  <div className="text-sm font-medium text-amber-900">叙境专属模型</div>
                  <div className="mt-0.5 text-xs text-amber-600">
                    DeepSeek-V4-Flash · VIP 自动使用，无需配置
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Free user: config list */}
        {!isVip && (
          <section>
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
              自定义配置
            </h2>

            {!hasCustomConfig ? (
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
            ) : (
              <div className="space-y-2.5">
                {configs.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => router.push("/api-connections/" + c.id)}
                    className="cursor-pointer rounded-xl border border-stone-100 bg-white px-4 py-3.5 transition-colors hover:border-stone-200 hover:bg-stone-50/50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-neutral-800">{c.name}</div>
                        <div className="mt-0.5 text-[11px] text-stone-400">
                          {PLATFORM_LABELS[c.platform] || c.platform} · {c.modelId}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {c.isDefault && (
                          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">默认</span>
                        )}
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#d6d3d1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 3l4 4-4 4" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}