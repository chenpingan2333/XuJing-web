"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ProviderRow {
  id: string;
  name: string;
  platform: string;
  modelId: string;
  apiUrl: string;
  isDefault: boolean;
  isActive: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  OPENAI: "OpenAI", ANTHROPIC: "Claude", GEMINI: "Gemini",
  DEEPSEEK: "DeepSeek", GROK: "Grok",
  CUSTOM_OPENAI: "OpenAI Compatible", CUSTOM_ANTHROPIC: "Anthropic Compatible",
  CUSTOM_GEMINI: "Gemini Compatible",
};

export default function ApiConnectionsPage() {
  const { user, loading, token } = useAuth();
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [fetching, setFetching] = useState(true);

  const fetchProviders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/api-configs", {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (data.success) setProviders(data.data || []);
    } catch { /* ignore */ }
    setFetching(false);
  }, [token]);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  if (loading || fetching) {
    return <div className="flex h-dvh items-center justify-center text-gray-400">加载中...</div>;
  }

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="flex h-dvh items-center justify-center text-gray-400">加载中...</div>;
  }

  const isVip = user.subscription === "vip";
  const isEmpty = providers.length === 0;
  const hasCustomDefault = providers.some((p) => p.isDefault);

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { window.location.href = "/me"; }} className="text-gray-400 text-lg">&larr;</button>
          <h1 className="text-lg font-semibold text-gray-900">API 连接</h1>
        </div>
        <button onClick={() => { window.location.href = "/api-connections/new"; }}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white">
          添加
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-3">
        {/* VIP System Model Card (virtual, not from DB) */}
        {isVip && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-amber-500 text-lg">★</span>
                <div>
                  <div className="text-sm font-medium text-amber-900">叙境平台专属模型</div>
                  <div className="text-xs text-amber-600">平台默认提供</div>
                </div>
              </div>
              {!hasCustomDefault && (
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">当前</span>
              )}
              {hasCustomDefault && (
                <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">可用</span>
              )}
            </div>
          </div>
        )}

        {/* FREE empty state */}
        {!isVip && isEmpty && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-3xl mb-3">&#9888;&#65039;</div>
            <div className="text-sm font-medium text-gray-700">未配置 API 接口</div>
            <div className="mt-1 text-xs text-gray-500">请配置至少一个 API Provider 才能开始使用 AI 聊天功能</div>
            <button onClick={() => { window.location.href = "/api-connections/new"; }}
              className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
              添加 Provider
            </button>
          </div>
        )}

        {/* Provider list */}
        {providers.map((p) => (
          <div key={p.id}
            onClick={() => { window.location.href = "/api-connections/" + p.id; }}
            className="cursor-pointer rounded-xl border border-gray-100 bg-gray-50 p-4 hover:border-gray-200 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={p.isDefault ? "text-green-500" : "text-gray-300"}>{p.isDefault ? "●" : "○"}</span>
                <div>
                  <div className="text-sm font-medium text-gray-900">{p.name}</div>
                  <div className="text-xs text-gray-500">{PLATFORM_LABELS[p.platform] || p.platform} · {p.modelId}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {p.isDefault && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">默认</span>}
                <span className="text-gray-300 text-sm">&rarr;</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
