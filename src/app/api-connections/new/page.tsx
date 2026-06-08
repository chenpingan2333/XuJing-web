"use client";

import { useAuth } from "@/lib/use-auth";
import { useState } from "react";

const PLATFORM_DEFAULTS: Record<string, { url: string; modelHint: string }> = {
  OPENAI: { url: "https://api.openai.com", modelHint: "gpt-4.1" },
  ANTHROPIC: { url: "https://api.anthropic.com", modelHint: "claude-sonnet-4-20250514" },
  GEMINI: { url: "https://generativelanguage.googleapis.com", modelHint: "gemini-2.5-pro" },
  DEEPSEEK: { url: "https://api.deepseek.com", modelHint: "deepseek-chat" },
  GROK: { url: "https://api.x.ai", modelHint: "grok-4" },
  CUSTOM_OPENAI: { url: "", modelHint: "" },
  CUSTOM_ANTHROPIC: { url: "", modelHint: "" },
  CUSTOM_GEMINI: { url: "", modelHint: "" },
};

const PLATFORM_OPTIONS = [
  { value: "OPENAI", label: "OpenAI" },
  { value: "ANTHROPIC", label: "Claude (Anthropic)" },
  { value: "GEMINI", label: "Gemini (Google)" },
  { value: "DEEPSEEK", label: "DeepSeek" },
  { value: "GROK", label: "Grok (xAI)" },
  { value: "CUSTOM_OPENAI", label: "自定义 (OpenAI 兼容)" },
  { value: "CUSTOM_ANTHROPIC", label: "自定义 (Anthropic 兼容)" },
  { value: "CUSTOM_GEMINI", label: "自定义 (Gemini 兼容)" },
];

export default function NewApiConnectionPage() {
  const { user, token } = useAuth();
  const [platform, setPlatform] = useState("OPENAI");
  const [name, setName] = useState("");
  const [apiUrl, setApiUrl] = useState("https://api.openai.com");
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  if (!user) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3">
        <div className="text-sm text-gray-500">请先登录</div>
        <button onClick={() => { window.location.href = "/me"; }} className="text-sm text-gray-900 underline">前往登录</button>
      </div>
    );
  }

  const handlePlatformChange = (value: string) => {
    setPlatform(value);
    const def = PLATFORM_DEFAULTS[value];
    setApiUrl(def?.url || "");
    if (!modelId && def?.modelHint) setModelId(def.modelHint);
  };

  const handleSubmit = async () => {
    setError("");
    setTestResult(null);

    if (!name.trim()) { setError("请输入名称"); return; }
    if (!apiUrl.trim()) { setError("请输入 API 地址"); return; }
    if (!apiKey || apiKey.length < 8) { setError("API Key 至少 8 个字符"); return; }
    if (!modelId.trim()) { setError("请输入模型 ID"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/api-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ name: name.trim(), platform, apiUrl, apiKey, modelId, isDefault }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "创建失败"); setSubmitting(false); return; }

      const newId = data.data.id;
      // Test connection
      try {
        const testRes = await fetch("/api/api-configs/" + newId + "/test", {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
        });
        const testData = await testRes.json();
        setTestResult(testData.data || testData);
      } catch {
        setTestResult({ ok: false, error: "测试请求失败" });
      }

      setSubmitting(false);
    } catch {
      setError("网络错误");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center gap-3 px-5 pt-12 pb-4">
        <button onClick={() => { window.location.href = "/api-connections"; }} className="text-gray-400 text-lg">&larr;</button>
        <h1 className="text-lg font-semibold text-gray-900">添加 Provider</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">
        {/* Platform */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Provider 类型</label>
          <select value={platform} onChange={(e) => handlePlatformChange(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-400">
            {PLATFORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">名称</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="例如: 我的 OpenAI" maxLength={50}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
        </div>

        {/* API URL */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">API 地址</label>
          <input type="url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://api.openai.com"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
        </div>

        {/* API Key */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">API Key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..." minLength={8}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
          <div className="mt-0.5 text-xs text-gray-400">密钥加密存储，不会明文保存</div>
        </div>

        {/* Model ID */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">模型 ID</label>
          <input type="text" value={modelId} onChange={(e) => setModelId(e.target.value)}
            placeholder={PLATFORM_DEFAULTS[platform]?.modelHint || "model-id"} maxLength={100}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
        </div>

        {/* Default toggle */}
        <label className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 cursor-pointer">
          <span className="text-sm text-gray-700">设为默认 Provider</span>
          <button onClick={() => setIsDefault(!isDefault)}
            className={`relative h-6 w-11 rounded-full transition-colors ${isDefault ? "bg-green-500" : "bg-gray-300"}`}>
            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isDefault ? "translate-x-5" : ""}`} />
          </button>
        </label>

        {/* Error */}
        {error && <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>}

        {/* Test result */}
        {testResult && (
          <div className={`rounded-lg px-4 py-3 ${testResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
            <div className="text-sm font-medium">{testResult.ok ? "&#10004; 连接成功" : "&#10008; 连接失败"}</div>
            {testResult.error && <div className="mt-0.5 text-xs opacity-80">{testResult.error}</div>}
          </div>
        )}

        {/* Submit */}
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full rounded-lg bg-gray-900 py-3 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? "保存中..." : "保存并测试"}
        </button>
      </div>
    </div>
  );
}