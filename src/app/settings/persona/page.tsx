"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function PersonaPage() {
  const { user, loading, token } = useAuth();
  const router = useRouter();
  const [persona, setPersona] = useState("");
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchPersona = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/users", {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (data.success && data.data) {
        setPersona(data.data.personaSetting ?? "");
      }
    } catch { /* ignore */ }
    setFetching(false);
  }, [token]);

  useEffect(() => { if (token) fetchPersona(); }, [fetchPersona, token]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ personaSetting: persona.trim() }),
      });
      const data = await res.json();
      if (data.success) setSaved(true);
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (loading || fetching) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-sm text-stone-300">加载中...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-sm text-stone-300">跳转中...</span>
      </div>
    );
  }

  const charCount = persona.length;
  const maxChars = 10000;

  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-4 px-5 pt-12 pb-4">
        <button
          onClick={() => router.push("/me")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4L6 9l5 5" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">用户人设</h1>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-12">
        {/* Guidance card */}
        <div className="rounded-xl bg-white border border-stone-100 px-4 py-3.5 mb-5">
          <p className="text-xs text-stone-400 leading-relaxed">
            在这里描述你自己，角色会「认识」你。可以写你的名字、职业、兴趣、说话风格，或任何你希望角色了解的信息。
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              onClick={() => setPersona((p) => p ? p + "\n姓名：小明" : "姓名：小明")}
              className="rounded-full bg-stone-50 px-2.5 py-1 text-[11px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >+ 姓名</button>
            <button
              onClick={() => setPersona((p) => p ? p + "\n职业：大学生，喜欢摄影" : "职业：大学生，喜欢摄影")}
              className="rounded-full bg-stone-50 px-2.5 py-1 text-[11px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >+ 职业</button>
            <button
              onClick={() => setPersona((p) => p ? p + "\n说话风格：轻松幽默" : "说话风格：轻松幽默")}
              className="rounded-full bg-stone-50 px-2.5 py-1 text-[11px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >+ 风格</button>
            <button
              onClick={() => setPersona((p) => p ? p + "\n兴趣：ACG、咖啡、城市漫步" : "兴趣：ACG、咖啡、城市漫步")}
              className="rounded-full bg-stone-50 px-2.5 py-1 text-[11px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >+ 兴趣</button>
          </div>
        </div>

        {/* Textarea */}
        <div className="rounded-xl bg-white border border-stone-100 overflow-hidden">
          <textarea
            value={persona}
            onChange={(e) => { setPersona(e.target.value); setSaved(false); }}
            placeholder={"示例：\n我叫林小艺，今年22岁，是一名平面设计师。\n我平时喜欢逛展览、喝手冲咖啡，周末会去公园散步。\n说话比较随性，偶尔会自嘲，不习惯太正式的语气。"}
            maxLength={maxChars}
            rows={12}
            className="w-full resize-none bg-transparent px-4 py-3.5 text-sm text-neutral-800 placeholder-stone-300 outline-none leading-relaxed"
          />
          <div className="flex items-center justify-between px-4 py-2 border-t border-stone-50">
            <span className={"text-[11px] " + (charCount > maxChars * 0.9 ? "text-red-400" : "text-stone-300")}>
              {charCount} / {maxChars}
            </span>
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={
            "w-full mt-5 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 " +
            (saved
              ? "bg-green-50 text-green-700 border border-green-100"
              : "bg-neutral-900 text-stone-50 hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            )
          }
        >
          {saving ? "保存中..." : saved ? "已保存" : "保存人设"}
        </button>

        {/* Footer note */}
        <p className="mt-4 text-center text-[11px] text-stone-300 leading-relaxed">
          角色会在对话中根据你设定的人设来回应你，让对话更有沉浸感。
        </p>
      </div>
    </div>
  );
}