"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { invalidateApiStatus } from "@/lib/use-api-status";

const PLATFORM_PRESETS: Record<string, { label: string; url: string; modelHint: string; isCustom: boolean }> = {
  OPENAI:           { label: "GPT (OpenAI)",         url: "https://api.openai.com",                      modelHint: "gpt-4.1",                isCustom: false },
  ANTHROPIC:        { label: "Claude (Anthropic)",   url: "https://api.anthropic.com",                   modelHint: "claude-sonnet-4-20250514", isCustom: false },
  GEMINI:           { label: "Gemini (Google)",      url: "https://generativelanguage.googleapis.com",    modelHint: "gemini-2.5-pro",         isCustom: false },
  DEEPSEEK:         { label: "DeepSeek",             url: "https://api.deepseek.com",                     modelHint: "deepseek-chat",          isCustom: false },
  GROK:             { label: "Grok (xAI)",           url: "https://api.x.ai",                             modelHint: "grok-4",                 isCustom: false },
  CUSTOM_OPENAI:    { label: "自定义 (OpenAI 兼容)",  url: "",                                            modelHint: "",                        isCustom: true },
  CUSTOM_ANTHROPIC: { label: "自定义 (Anthropic 兼容)", url: "",                                          modelHint: "",                        isCustom: true },
  CUSTOM_GEMINI:    { label: "自定义 (Gemini 兼容)",  url: "",                                            modelHint: "",                        isCustom: true },
};

const PLATFORM_OPTIONS = Object.entries(PLATFORM_PRESETS).map(([value, info]) => ({
  value,
  label: info.label,
  isCustom: info.isCustom,
}));

const PRESET_OPTIONS = PLATFORM_OPTIONS.filter(o => !o.isCustom);
const CUSTOM_OPTIONS = PLATFORM_OPTIONS.filter(o => o.isCustom);

export default function NewApiConnectionPage() {
  // ═══════════════════ HOOKS ZONE ═══════════════════
  const { user, loading: authLoading, token } = useAuth();
  const router = useRouter();

  const [platform, setPlatform] = useState("DEEPSEEK");
  const [name, setName] = useState("");
  const [apiUrl, setApiUrl] = useState(PLATFORM_PRESETS.DEEPSEEK.url);
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const preset = PLATFORM_PRESETS[platform];
  const isCustomPlatform = preset?.isCustom ?? false;

  const handlePlatformChange = (value: string) => {
    setPlatform(value);
    const def = PLATFORM_PRESETS[value];
    if (def) {
      setApiUrl(def.url);
      if (!modelId && def.modelHint) setModelId(def.modelHint);
    }
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2500);
  };

  const handleSubmit = async () => {
    setError("");

    if (!name.trim()) { setError("请输入配置名称"); return; }
    if (!apiUrl.trim()) { setError("请输入 API 地址"); return; }
    if (!apiKey || apiKey.length < 8) { setError("API Key 至少 8 个字符"); return; }
    if (!modelId.trim()) { setError("请输入模型 ID"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/api-configs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          name: name.trim(),
          platform,
          apiUrl: apiUrl.trim(),
          apiKey: apiKey.trim(),
          modelId: modelId.trim(),
          isDefault: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "创建成功");
        invalidateApiStatus();
        setTimeout(() => router.push("/api-connections"), 800);
      } else {
        setError(data.error || "创建失败");
      }
    } catch {
      setError("网络错误，请重试");
    }
    setSubmitting(false);
  };

  // ═══════════════════ RENDER ZONE ═══════════════════

  if (authLoading) {
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
          onClick={() => router.push("/api-connections")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4L6 9l5 5" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">新建配置</h1>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-12">
        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="block mb-1.5 text-xs font-medium text-stone-500">
              名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：我的 DeepSeek"
              maxLength={50}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-neutral-800 placeholder-stone-300 outline-none transition-colors focus:border-stone-400"
            />
          </div>

          {/* Platform */}
          <div>
            <label className="block mb-1.5 text-xs font-medium text-stone-500">
              模型平台
            </label>
            <select
              value={platform}
              onChange={(e) => handlePlatformChange(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-neutral-800 outline-none transition-colors focus:border-stone-400"
            >
              <optgroup label="预设平台">
                {PRESET_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
              <optgroup label="自定义协议">
                {CUSTOM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* API URL */}
          <div>
            <label className="block mb-1.5 text-xs font-medium text-stone-500">
              API 接口地址 {isCustomPlatform ? "" : <span className="text-stone-300">· 自动填充</span>}
            </label>
            {isCustomPlatform ? (
              <input
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://your-api-endpoint.com"
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-neutral-800 placeholder-stone-300 outline-none transition-colors focus:border-stone-400"
              />
            ) : (
              <div className="flex items-center rounded-lg border border-stone-100 bg-stone-50 px-3 py-2.5">
                <span className="text-sm text-stone-500">{apiUrl}</span>
                <span className="ml-auto rounded bg-stone-200 px-1.5 py-0.5 text-[10px] text-stone-400">已锁定</span>
              </div>
            )}
          </div>

          {/* API Key */}
          <div>
            <label className="block mb-1.5 text-xs font-medium text-stone-500">
              API 密钥
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

          {/* Model ID */}
          <div>
            <label className="block mb-1.5 text-xs font-medium text-stone-500">
              模型 ID
            </label>
            <input
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder={PLATFORM_PRESETS[platform]?.modelHint || "输入模型 ID"}
              maxLength={100}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-neutral-800 placeholder-stone-300 outline-none transition-colors focus:border-stone-400"
            />
            {PLATFORM_PRESETS[platform]?.modelHint && (
              <p className="mt-1 text-[11px] text-stone-300">
                建议：{PLATFORM_PRESETS[platform].modelHint}
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-stone-50 transition-all duration-200 hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "保存中…" : "保存配置"}
          </button>
        </div>
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
