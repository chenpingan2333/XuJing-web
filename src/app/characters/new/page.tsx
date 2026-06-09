"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const LIMITS = {
  name: 10,
  setting: 10000,
  greeting: 200,
  personality: 10000,
  scenario: 10000,
  dialogue_examples: 500,
  nickname: 10,
  group_greeting: 200,
  main_prompt: 10000,
  post_history_instructions: 10000,
};

export default function NewCharacterPage() {
  const { user, loading, token } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Core fields (required)
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("");
  const [setting, setSetting] = useState("");

  // Optional fields
  const [avatarPreview, setAvatarPreview] = useState("");
  const [personality, setPersonality] = useState("");
  const [scenario, setScenario] = useState("");
  const [dialogueExamples, setDialogueExamples] = useState("");
  const [nickname, setNickname] = useState("");
  const [groupGreeting, setGroupGreeting] = useState("");
  const [mainPrompt, setMainPrompt] = useState("");
  const [postHistoryInstructions, setPostHistoryInstructions] = useState("");

  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSystem, setShowSystem] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const canSave = name.trim() && setting.trim() && greeting.trim();

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("头像文件不能超过 10MB"); return; }
    const reader = new FileReader();
    reader.onload = () => { setAvatarPreview(reader.result as string); };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          name,
          setting,
          greeting,
          personality: personality || undefined,
          scenario: scenario || undefined,
          dialogue_examples: dialogueExamples || undefined,
          nickname: nickname || undefined,
          group_greeting: groupGreeting || undefined,
          main_prompt: mainPrompt || undefined,
          post_history_instructions: postHistoryInstructions || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "创建失败"); return; }
      router.push("/characters");
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-sm text-stone-300">加载中...</span>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-4 px-6 pt-12 pb-4">
        <button
          onClick={() => router.back()}
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4L6 9l5 5" />
          </svg>
        </button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
            创建角色
          </h1>
          <p className="text-[11px] text-stone-400 mt-0.5">必填字段已标注</p>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="shrink-0 rounded-xl bg-neutral-900 px-5 py-2 text-xs font-medium text-stone-50 transition-all duration-200 hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saving ? (
            <span className="inline-flex items-center gap-1.5">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
                <path d="M7 1.5a5.5 5.5 0 015.2 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              保存
            </span>
          ) : "保存"}
        </button>
      </header>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mb-2 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Form body */}
      <div className="flex-1 overflow-y-auto px-6 pb-32 space-y-10">
        {/* ── Core Section ── */}
        <section>
          <h2 className="text-[11px] font-medium text-stone-400 tracking-wider uppercase mb-5">
            核心设定
          </h2>

          {/* Name */}
          <Field label="角色名称" required max={LIMITS.name} value={name} onChange={setName}>
            <input
              type="text"
              value={name}
              onChange={(e) => { if (e.target.value.length <= LIMITS.name) setName(e.target.value); }}
              placeholder="为你的角色取一个名字"
              className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-200"
              autoFocus
            />
          </Field>

          {/* Greeting */}
          <Field label="开场白" required max={LIMITS.greeting} value={greeting} onChange={setGreeting}>
            <textarea
              value={greeting}
              onChange={(e) => { if (e.target.value.length <= LIMITS.greeting) setGreeting(e.target.value); }}
              placeholder="角色第一次和你说话时会说..."
              rows={3}
              className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-200 resize-none"
            />
            <span className="block text-right text-[10px] text-stone-300 mt-1">
              用 {"<START>"} 分隔多个开场白
            </span>
          </Field>

          {/* Setting */}
          <Field label="角色设定" required max={LIMITS.setting} value={setting} onChange={setSetting}>
            <textarea
              value={setting}
              onChange={(e) => { if (e.target.value.length <= LIMITS.setting) setSetting(e.target.value); }}
              placeholder="描述角色的外貌、性格、背景故事..."
              rows={5}
              className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-200 resize-none"
            />
          </Field>
        </section>

        {/* ── Avatar Section ── */}
        <section>
          <h2 className="text-[11px] font-medium text-stone-400 tracking-wider uppercase mb-4">
            头像
          </h2>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-stone-100 overflow-hidden flex items-center justify-center shrink-0">
              {avatarPreview ? (
                <img src={avatarPreview} alt="头像预览" className="w-full h-full object-cover" />
              ) : (
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#d6d3d1" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="14" cy="10" r="4.5" />
                  <path d="M7 24c0-3.9 3.1-7 7-7s7 3.1 7 7" />
                </svg>
              )}
            </div>
            <label className="rounded-xl border border-stone-200 px-4 py-2 text-xs text-stone-500 cursor-pointer hover:bg-stone-100 transition-colors duration-200">
              选择图片
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarFile} className="hidden" />
            </label>
            <span className="text-[10px] text-stone-300">jpg/png/webp, ≤10MB</span>
          </div>
          <p className="text-[10px] text-stone-300 mt-2">头像上传功能即将上线，当前仅支持预览</p>
        </section>

        {/* ── Advanced Section ── */}
        <section>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-[11px] font-medium text-stone-400 tracking-wider uppercase hover:text-stone-500 transition-colors"
          >
            <svg
              width="10" height="10" viewBox="0 0 10 10"
              className={"transition-transform duration-200 " + (showAdvanced ? "rotate-90" : "")}
            >
              <path d="M3.5 1.5L7 5l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            高级定义
          </button>
          {showAdvanced && (
            <div className="mt-5 space-y-6">
              <Field label="性格特点" max={LIMITS.personality} value={personality} onChange={setPersonality}>
                <textarea
                  value={personality}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.personality) setPersonality(e.target.value); }}
                  placeholder="角色的性格、说话方式、喜好..."
                  rows={3}
                  className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-200 resize-none"
                />
              </Field>
              <Field label="情景设定" max={LIMITS.scenario} value={scenario} onChange={setScenario}>
                <textarea
                  value={scenario}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.scenario) setScenario(e.target.value); }}
                  placeholder="当前对话发生的场景..."
                  rows={3}
                  className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-200 resize-none"
                />
              </Field>
              <Field label="对话示例" max={LIMITS.dialogue_examples} value={dialogueExamples} onChange={setDialogueExamples}>
                <textarea
                  value={dialogueExamples}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.dialogue_examples) setDialogueExamples(e.target.value); }}
                  placeholder={"{{char}}: 你好，我是...\n{{user}}: 你好！很高兴认识你"}
                  rows={3}
                  className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-200 resize-none font-mono text-xs"
                />
                <span className="block text-right text-[10px] text-stone-300 mt-1">
                  格式：{"{{char}}:"} / {"{{user}}:"}
                </span>
              </Field>
              <Field label="昵称" max={LIMITS.nickname} value={nickname} onChange={setNickname}>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.nickname) setNickname(e.target.value); }}
                  placeholder="角色的昵称或别名"
                  className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-200"
                />
              </Field>
              <Field label="群聊开场白" max={LIMITS.group_greeting} value={groupGreeting} onChange={setGroupGreeting}>
                <textarea
                  value={groupGreeting}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.group_greeting) setGroupGreeting(e.target.value); }}
                  placeholder="群聊场景下的开场白（当前版本仅存储，不接入群聊）"
                  rows={2}
                  className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-200 resize-none"
                />
              </Field>
            </div>
          )}
        </section>

        {/* ── System Instructions Section ── */}
        <section>
          <button
            onClick={() => setShowSystem(!showSystem)}
            className="flex items-center gap-2 text-[11px] font-medium text-stone-400 tracking-wider uppercase hover:text-stone-500 transition-colors"
          >
            <svg
              width="10" height="10" viewBox="0 0 10 10"
              className={"transition-transform duration-200 " + (showSystem ? "rotate-90" : "")}
            >
              <path d="M3.5 1.5L7 5l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            系统指令
          </button>
          {showSystem && (
            <div className="mt-5 space-y-6">
              <Field label="Main Prompt" max={LIMITS.main_prompt} value={mainPrompt} onChange={setMainPrompt}>
                <textarea
                  value={mainPrompt}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.main_prompt) setMainPrompt(e.target.value); }}
                  placeholder={"自定义系统提示词，使用 {{original}} 引用默认提示词"}
                  rows={5}
                  className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-200 resize-none font-mono text-xs"
                />
                <span className="block text-right text-[10px] text-stone-300 mt-1">
                  支持 {"{{original}}"}
                </span>
              </Field>
              <Field label="Post History Instructions" max={LIMITS.post_history_instructions} value={postHistoryInstructions} onChange={setPostHistoryInstructions}>
                <textarea
                  value={postHistoryInstructions}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.post_history_instructions) setPostHistoryInstructions(e.target.value); }}
                  placeholder={"在对话历史之后添加的指令，支持 {{original}}"}
                  rows={4}
                  className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-200 resize-none font-mono text-xs"
                />
              </Field>
            </div>
          )}
        </section>
      </div>

      {/* Sticky bottom save */}
      <div className="shrink-0 bg-stone-50/90 backdrop-blur-sm border-t border-stone-100 px-6 py-3">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full rounded-xl bg-neutral-900 py-2.5 text-sm font-medium text-stone-50 transition-all duration-200 hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saving ? "保存中..." : "保存角色"}
        </button>
      </div>
    </div>
  );
}

// ─── Reusable Field wrapper ───

function Field({
  label,
  required,
  max,
  value,
  onChange,
  children,
}: {
  label: string;
  required?: boolean;
  max: number;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  const len = (typeof value === "string" ? value : "").length;
  const nearLimit = len > max * 0.85;
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-stone-500">
          {label}
          {required && <span className="text-stone-300 ml-0.5">*</span>}
        </span>
        <span className={"text-[10px] " + (nearLimit ? "text-amber-500" : "text-stone-300")}>
          {len} / {max}
        </span>
      </div>
      {children}
    </div>
  );
}
