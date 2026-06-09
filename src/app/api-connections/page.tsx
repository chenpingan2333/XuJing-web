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

const DEEPSEEK_DEFAULTS = {
  platform: "DEEPSEEK",
  apiUrl: "https://api.deepseek.com",
  modelId: "deepseek-chat",
  name: "DeepSeek",
} as const;

export default function ApiConnectionsPage() {
  // ═══════════════════ HOOKS ZONE ═══════════════════
  const { user, loading: authLoading, token } = useAuth();
  const router = useRouter();
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

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

  const existingConfig = configs.length > 0 ? configs[0] : null;
  const isConfigured = existingConfig !== null;
  const maskedSuffix = existingConfig?.name
    ? existingConfig.name.slice(-4)
    : null;

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2500);
  };

  const handleSave = async () => {
    if (!apiKey.trim() || apiKey.length < 8) {
      showToast("error", "API Key 至少 8 个字符");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/api-configs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          name: DEEPSEEK_DEFAULTS.name,
          platform: DEEPSEEK_DEFAULTS.platform,
          apiUrl: DEEPSEEK_DEFAULTS.apiUrl,
          apiKey: apiKey.trim(),
          modelId: DEEPSEEK_DEFAULTS.modelId,
          isDefault: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "保存成功");
        setApiKey("");
        fetchConfigs();
      } else {
        showToast("error", data.error || "保存失败");
      }
    } catch {
      showToast("error", "网络错误，请重试");
    }
    setSaving(false);
  };


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
      <header className="shrink-0 flex items-center gap-4 px-5 pt-12 pb-4">
        <button
          onClick={() => router.push("/settings")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4L6 9l5 5" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">API 配置</h1>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-12">
        {/* Status section */}
        <section className="mb-8">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
            连接状态
          </h2>
          <div className={`rounded-xl px-5 py-4 ${isConfigured ? "bg-stone-100" : "bg-stone-100"}`}>
            <div className="flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full ${isConfigured ? "bg-emerald-500" : "bg-stone-300"}`} />
              <div>
                <div className="text-sm font-medium text-neutral-800">
                  {isConfigured ? "已配置" : "未配置"}
                </div>
                <div className="mt-0.5 text-xs text-stone-400">
                  {isConfigured
                    ? `DeepSeek  ·  ${existingConfig.modelId}  ·  尾号 ${maskedSuffix}`
                    : "请配置 DeepSeek API Key 以开始使用 AI 对话"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Form section */}
        <section>
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
            DeepSeek 配置
          </h2>

          <div className="space-y-4">
            {/* Provider (locked to DeepSeek) */}
            <div>
              <label className="block mb-1.5 text-xs font-medium text-stone-500">
                模型供应商
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2.5">
                <span className="text-sm text-neutral-800 font-medium">DeepSeek</span>
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-400">
                  默认
                </span>
              </div>
              <p className="mt-1 text-[11px] text-stone-300">
                api.deepseek.com  ·  deepseek-chat
              </p>
            </div>

            {/* API Key */}
            <div>
              <label className="block mb-1.5 text-xs font-medium text-stone-500">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-neutral-800 placeholder-stone-300 outline-none transition-colors focus:border-stone-400"
              />
              <p className="mt-1 text-[11px] text-stone-300">
                密钥加密存储，仅你可见
              </p>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-stone-50 transition-all duration-200 hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "保存中…" : isConfigured ? "更新密钥" : "保存并连接"}
            </button>

            {isConfigured && (
              <p className="text-center text-[11px] text-stone-300">
                已保存配置将被覆盖更新
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`rounded-full px-5 py-2.5 text-xs font-medium shadow-lg transition-all duration-300 ${
              toast.type === "success"
                ? "bg-neutral-900 text-stone-50"
                : "bg-red-50 text-red-600 border border-red-100"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
