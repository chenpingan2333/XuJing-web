"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const PLATFORM_LABELS: Record<string, string> = {
  OPENAI: "OpenAI", ANTHROPIC: "Claude", GEMINI: "Gemini",
  DEEPSEEK: "DeepSeek", GROK: "Grok",
  CUSTOM_OPENAI: "OpenAI Compatible", CUSTOM_ANTHROPIC: "Anthropic Compatible",
  CUSTOM_GEMINI: "Gemini Compatible",
};

export default function EditApiConnectionPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const id = params.id as string;

  const [provider, setProvider] = useState<any>(null);
  const [name, setName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    fetch("/api/api-configs/" + id, { headers: { Authorization: "Bearer " + token } })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setProvider(d.data);
          setName(d.data.name);
          setApiUrl(d.data.apiUrl);
          setModelId(d.data.modelId);
          setIsDefault(d.data.isDefault);
        }
      })
      .finally(() => setLoading(false));
  }, [token, id]);

  const handleSave = async () => {
    setError(""); setSuccess("");
    if (!name.trim()) { setError("名称不能为空"); return; }
    setSaving(true);
    const body: any = { name: name.trim(), apiUrl, modelId };
    if (apiKey && apiKey.length >= 8) body.apiKey = apiKey;
    try {
      const res = await fetch("/api/api-configs/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) { setSuccess("已保存"); }
      else { setError(data.error || "保存失败"); }
    } catch { setError("网络错误"); }
    setSaving(false);
  };

  const handleTest = async () => {
    setTestResult(null); setTesting(true);
    try {
      const res = await fetch("/api/api-configs/" + id + "/test", {
        method: "POST", headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      setTestResult(data.data || data);
    } catch { setTestResult({ ok: false, error: "测试请求失败" }); }
    setTesting(false);
  };

  const handleSetDefault = async () => {
    try {
      const res = await fetch("/api/api-configs/" + id + "/default", {
        method: "PUT", headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (data.success) { setIsDefault(true); setSuccess("已设为默认"); }
    } catch { setError("操作失败"); }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch("/api/api-configs/" + id, {
        method: "DELETE", headers: { Authorization: "Bearer " + token },
      });
      if (res.ok) { window.location.href = "/api-connections"; }
      else { setError("删除失败"); }
    } catch { setError("网络错误"); }
  };

  if (loading) {
    return <div className="flex h-dvh items-center justify-center text-gray-400">加载中...</div>;
  }

  if (!user) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3">
        <div className="text-sm text-gray-500">请先登录</div>
        <button onClick={() => { window.location.href = "/me"; }} className="text-sm text-gray-900 underline">前往登录</button>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3">
        <div className="text-sm text-gray-500">Provider 不存在</div>
        <button onClick={() => { window.location.href = "/api-connections"; }} className="text-sm text-gray-900 underline">返回列表</button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center gap-3 px-5 pt-12 pb-4">
        <button onClick={() => { window.location.href = "/api-connections"; }} className="text-gray-400 text-lg">&larr;</button>
        <h1 className="text-lg font-semibold text-gray-900">编辑 Provider</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">
        {/* Platform (read-only) */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">类型</label>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
            {PLATFORM_LABELS[provider.platform] || provider.platform}
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">名称</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={50}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
        </div>

        {/* API URL */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">API 地址</label>
          <input type="url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
        </div>

        {/* API Key */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">API Key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="输入新 Key 以覆盖（留空保持不变）"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
          <div className="mt-0.5 text-xs text-gray-400">当前密钥已加密存储，输入新值覆盖</div>
        </div>

        {/* Model ID */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">模型 ID</label>
          <input type="text" value={modelId} onChange={(e) => setModelId(e.target.value)} maxLength={100}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
        </div>

        {/* Status + messages */}
        {error && <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>}
        {success && <div className="rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700">{success}</div>}

        {/* Test result */}
        {testResult && (
          <div className={`rounded-lg px-4 py-3 ${testResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
            <div className="text-sm font-medium">{testResult.ok ? "&#10004; 连接成功" : "&#10008; 连接失败"}</div>
            {testResult.error && <div className="mt-0.5 text-xs opacity-80">{testResult.error}</div>}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <button onClick={handleTest} disabled={testing}
            className="w-full rounded-lg border border-gray-200 py-2.5 text-sm text-gray-700 disabled:opacity-50">
            {testing ? "测试中..." : "测试连接"}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "保存中..." : "保存"}
          </button>
          {!isDefault && (
            <button onClick={handleSetDefault}
              className="w-full rounded-lg border border-green-200 py-2.5 text-sm text-green-700">
              设为默认 Provider
            </button>
          )}
        </div>

        {/* Delete */}
        <div className="pt-4 border-t border-gray-100">
          {!showDelete ? (
            <button onClick={() => setShowDelete(true)}
              className="w-full rounded-lg bg-red-50 py-2.5 text-sm font-medium text-red-600">
              删除此 Provider
            </button>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
              <div className="text-sm text-red-700">确定删除此 Provider？此操作不可撤销。</div>
              <div className="flex gap-2">
                <button onClick={() => setShowDelete(false)}
                  className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600">取消</button>
                <button onClick={handleDelete}
                  className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white">确定删除</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}