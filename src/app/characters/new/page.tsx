"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect, useCallback, useRef, type DragEvent } from "react";
import { useRouter } from "next/navigation";

// ─── Constants ────────────────────────────────────────────────

const LIMITS = {
  name: 10,
  greeting: 200,
  setting: 10000,
  personality: 10000,
  scenario: 10000,
  dialogue_examples: 500,
  nickname: 10,
  group_greeting: 200,
  main_prompt: 10000,
  post_history_instructions: 10000,
} as const;

const ALLOWED_IMAGE = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// ─── JSON Template Parser ─────────────────────────────────────

interface ParsedCharacter {
  name?: string;
  setting?: string;
  greeting?: string;
  personality?: string;
  scenario?: string;
  dialogueExamples?: string;
  nickname?: string;
  groupGreeting?: string;
  mainPrompt?: string;
  postHistoryInstructions?: string;
}

function parseCharacterJSON(raw: unknown): ParsedCharacter | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const result: ParsedCharacter = {};

  // Flat fields (legacy Xujing / Tavern-flat)
  if (typeof obj.name === "string") result.name = obj.name;
  if (typeof obj.setting === "string") result.setting = obj.setting;
  if (typeof obj.greeting === "string") result.greeting = obj.greeting;
  if (typeof obj.personality === "string") result.personality = obj.personality;
  if (typeof obj.scenario === "string") result.scenario = obj.scenario;
  if (typeof obj.dialogue_examples === "string") result.dialogueExamples = obj.dialogue_examples;
  if (typeof obj.nickname === "string") result.nickname = obj.nickname;
  if (typeof obj.group_greeting === "string") result.groupGreeting = obj.group_greeting;
  if (typeof obj.main_prompt === "string") result.mainPrompt = obj.main_prompt;
  if (typeof obj.post_history_instructions === "string") result.postHistoryInstructions = obj.post_history_instructions;

  // Nested template: advanced_definitions
  const adv = obj.advanced_definitions;
  if (adv && typeof adv === "object" && !Array.isArray(adv)) {
    const a = adv as Record<string, unknown>;
    if (typeof a.personality === "string" && !result.personality) result.personality = a.personality;
    if (typeof a.scenario === "string" && !result.scenario) result.scenario = a.scenario;
    if (typeof a.dialogueExamples === "string" && !result.dialogueExamples) result.dialogueExamples = a.dialogueExamples;
  }

  // Nested template: extended_fields
  const ext = obj.extended_fields;
  if (ext && typeof ext === "object" && !Array.isArray(ext)) {
    const e = ext as Record<string, unknown>;
    if (typeof e.nickname === "string" && !result.nickname) result.nickname = e.nickname;
    if (typeof e.groupGreeting === "string" && !result.groupGreeting) result.groupGreeting = e.groupGreeting;
  }

  // Nested template: system_instructions
  const sys = obj.system_instructions;
  if (sys && typeof sys === "object" && !Array.isArray(sys)) {
    const s = sys as Record<string, unknown>;
    if (typeof s.mainPrompt === "string" && !result.mainPrompt) result.mainPrompt = s.mainPrompt;
    if (typeof s.postHistoryInstructions === "string" && !result.postHistoryInstructions) result.postHistoryInstructions = s.postHistoryInstructions;
  }

  // Tavern v2: data.*
  if (obj.spec === "chara_card_v2" && obj.data && typeof obj.data === "object") {
    const d = obj.data as Record<string, unknown>;
    if (typeof d.name === "string" && !result.name) result.name = d.name;
    if (typeof d.description === "string" && !result.setting) result.setting = d.description;
    if (typeof d.first_mes === "string" && !result.greeting) result.greeting = d.first_mes;
    if (typeof d.personality === "string" && !result.personality) result.personality = d.personality;
    if (typeof d.scenario === "string" && !result.scenario) result.scenario = d.scenario;
    if (typeof d.mes_example === "string" && !result.dialogueExamples) result.dialogueExamples = d.mes_example;
    if (typeof d.system_prompt === "string" && !result.mainPrompt) result.mainPrompt = d.system_prompt;
    if (typeof d.post_history_instructions === "string" && !result.postHistoryInstructions) result.postHistoryInstructions = d.post_history_instructions;
  }

  // Must have at least one field
  if (Object.keys(result).length === 0) return null;
  return result;
}

// ─── Page ─────────────────────────────────────────────────────

export default function NewCharacterPage() {
  const { user, loading, token } = useAuth();
  const router = useRouter();
  const dropRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  // ── Form state ──
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("");
  const [setting, setSetting] = useState("");
  const [personality, setPersonality] = useState("");
  const [scenario, setScenario] = useState("");
  const [dialogueExamples, setDialogueExamples] = useState("");
  const [nickname, setNickname] = useState("");
  const [groupGreeting, setGroupGreeting] = useState("");
  const [mainPrompt, setMainPrompt] = useState("");
  const [postHistoryInstructions, setPostHistoryInstructions] = useState("");

  // ── Avatar state ──
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // ── UI state ──
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [jsonParsedName, setJsonParsedName] = useState("");

  // ── Auth guard ──
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const canSave = name.trim().length > 0 && setting.trim().length > 0 && greeting.trim().length > 0;

  // ── Avatar handler ──
  const handleAvatarSelect = useCallback((file: File) => {
    setError("");
    if (file.size > MAX_IMAGE_BYTES) {
      setError("头像文件不能超过 10MB");
      return;
    }
    if (!ALLOWED_IMAGE.includes(file.type as typeof ALLOWED_IMAGE[number])) {
      setError("仅支持 jpg / png / webp 格式");
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  // ── JSON drag-and-drop ──
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    const hasJson = Array.from(e.dataTransfer.types).some(
      (t) => t === "Files" || t === "application/json"
    );
    if (hasJson || e.dataTransfer.types.includes("Files")) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Image drop → use as avatar
    if (ALLOWED_IMAGE.includes(file.type as typeof ALLOWED_IMAGE[number])) {
      handleAvatarSelect(file);
      return;
    }

    // JSON drop → parse and fill form
    if (file.name.endsWith(".json") || file.type === "application/json") {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const data = parseCharacterJSON(parsed);
        if (!data) {
          setError("无法识别此 JSON 的角色卡格式");
          return;
        }
        // Fill fields (only overwrite empty ones to avoid data loss)
        if (data.name && !name) setName(data.name.slice(0, LIMITS.name));
        if (data.setting && !setting) setSetting(data.setting.slice(0, LIMITS.setting));
        if (data.greeting && !greeting) setGreeting(data.greeting.slice(0, LIMITS.greeting));
        if (data.personality && !personality) setPersonality(data.personality.slice(0, LIMITS.personality));
        if (data.scenario && !scenario) setScenario(data.scenario.slice(0, LIMITS.scenario));
        if (data.dialogueExamples && !dialogueExamples) setDialogueExamples(data.dialogueExamples.slice(0, LIMITS.dialogue_examples));
        if (data.nickname && !nickname) setNickname(data.nickname.slice(0, LIMITS.nickname));
        if (data.groupGreeting && !groupGreeting) setGroupGreeting(data.groupGreeting.slice(0, LIMITS.group_greeting));
        if (data.mainPrompt && !mainPrompt) setMainPrompt(data.mainPrompt.slice(0, LIMITS.main_prompt));
        if (data.postHistoryInstructions && !postHistoryInstructions) setPostHistoryInstructions(data.postHistoryInstructions.slice(0, LIMITS.post_history_instructions));

        // Auto-expand sections that have content
        if (data.personality || data.scenario || data.dialogueExamples || data.nickname || data.groupGreeting) {
          setShowAdvanced(true);
        }
        if (data.mainPrompt || data.postHistoryInstructions) {
          setShowSystem(true);
        }

        setJsonParsedName(data.name || file.name.replace(".json", ""));
        setError("");
      } catch {
        setError("JSON 解析失败，请检查文件格式");
      }
      return;
    }

    setError("仅支持 .json 角色卡或 jpg/png/webp 头像");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleAvatarSelect, name, setting, greeting, personality, scenario, dialogueExamples, nickname, groupGreeting, mainPrompt, postHistoryInstructions]);

  // ── Save ──
  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");

    try {
      let avatarUrl = "";

      if (avatarFile) {
        setAvatarUploading(true);
        try {
          const fd = new FormData();
          fd.append("file", avatarFile);
          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          const uploadData = await uploadRes.json();
          if (!uploadData.success) {
            setError(uploadData.error || "头像上传失败");
            setSaving(false);
            setAvatarUploading(false);
            return;
          }
          avatarUrl = uploadData.data.url;
        } catch {
          setError("头像上传失败，请重试");
          setSaving(false);
          setAvatarUploading(false);
          return;
        }
        setAvatarUploading(false);
      }

      const res = await fetch("/api/characters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          setting,
          greeting,
          avatar_url: avatarUrl || undefined,
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
      if (!data.success) {
        setError(data.error || "创建失败");
        setSaving(false);
        return;
      }

      router.push("/characters");
    } catch {
      setError("网络异常，请检查连接后重试");
    } finally {
      setSaving(false);
    }
  };

  // ── Loading state ──
  if (loading || !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-xs text-stone-300">—</span>
      </div>
    );
  }

  // ── Render ──
  return (
    <div
      ref={dropRef}
      className="relative flex h-dvh flex-col bg-stone-50"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* ── JSON drop overlay ── */}
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-stone-50/70 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3 px-10 py-12 border border-dashed border-stone-300 rounded-lg">
            <span className="text-xs text-stone-400 tracking-[0.15em] uppercase">
              释放以导入角色卡
            </span>
            <span className="text-[10px] text-stone-300">
              支持 .json 角色卡或图片
            </span>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="shrink-0 flex items-center gap-4 px-8 pt-16 pb-6">
        <button
          onClick={() => router.back()}
          className="shrink-0 w-8 h-8 flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors"
          aria-label="返回"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-base font-medium tracking-tight text-neutral-900">
            创建角色
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="shrink-0 px-5 py-1.5 text-xs font-medium text-stone-50 bg-neutral-800 rounded-lg transition-all duration-200 hover:bg-neutral-700 active:scale-[0.98] disabled:opacity-25 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {saving ? "…" : "保存"}
        </button>
      </header>

      {/* ── Error (inline, muted) ── */}
      {error && (
        <div className="mx-8 mb-4">
          <p className="text-[11px] text-stone-400">{error}</p>
        </div>
      )}

      {/* ── Form body ── */}
      <div className="flex-1 overflow-y-auto px-8 pb-32 space-y-14">
        {/* Core */}
        <section>
          <SectionLabel>核心设定</SectionLabel>
          <div className="mt-6 space-y-7">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs text-stone-400">
                  角色名称<span className="text-stone-300 ml-0.5">*</span>
                </span>
                <span className="text-[10px] text-stone-300 tabular-nums">
                  {name.length}/{LIMITS.name}
                </span>
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  if (e.target.value.length <= LIMITS.name) setName(e.target.value);
                }}
                placeholder="为角色命名"
                className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-300"
                autoFocus
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs text-stone-400">
                  开场白<span className="text-stone-300 ml-0.5">*</span>
                </span>
                <span className="text-[10px] text-stone-300 tabular-nums">
                  {greeting.length}/{LIMITS.greeting}
                </span>
              </div>
              <textarea
                value={greeting}
                onChange={(e) => {
                  if (e.target.value.length <= LIMITS.greeting) setGreeting(e.target.value);
                }}
                placeholder="角色第一次和你说话时会说……"
                rows={3}
                className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-300 resize-none"
              />
              <p className="text-[10px] text-stone-300 mt-1.5">
                用 &lt;START&gt; 分隔多个开场白
              </p>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs text-stone-400">
                  角色设定<span className="text-stone-300 ml-0.5">*</span>
                </span>
                <span className="text-[10px] text-stone-300 tabular-nums">
                  {setting.length}/{LIMITS.setting}
                </span>
              </div>
              <textarea
                value={setting}
                onChange={(e) => {
                  if (e.target.value.length <= LIMITS.setting) setSetting(e.target.value);
                }}
                placeholder="描述角色的外貌、性格与背景故事……"
                rows={5}
                className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-300 resize-none"
              />
            </div>
          </div>
        </section>

        {/* Avatar */}
        <section>
          <SectionLabel>头像</SectionLabel>
          <div className="mt-5 flex items-center gap-5">
            {/* Preview */}
            <div className="w-16 h-16 shrink-0 bg-stone-100 overflow-hidden flex items-center justify-center">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#d6d3d1" strokeWidth="1.2" strokeLinecap="round">
                  <circle cx="11" cy="8" r="3.5" />
                  <path d="M5.5 19a5.5 5.5 0 0111 0" />
                </svg>
              )}
            </div>
            {/* Upload trigger */}
            <label className="cursor-pointer text-xs text-stone-400 hover:text-stone-500 transition-colors duration-200">
              选择图片
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarSelect(file);
                }}
                className="hidden"
              />
            </label>
            {avatarFile && (
              <button
                onClick={() => {
                  setAvatarFile(null);
                  setAvatarPreview("");
                }}
                className="text-[10px] text-stone-300 hover:text-stone-400 transition-colors"
              >
                移除
              </button>
            )}
            <span className="text-[10px] text-stone-300">jpg / png / webp</span>
          </div>
        </section>

        {/* Advanced */}
        <section>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 group"
          >
            <span className="text-[11px] font-medium text-stone-400 tracking-[0.15em] uppercase group-hover:text-stone-500 transition-colors">
              高级定义
            </span>
            <svg
              width="8" height="8" viewBox="0 0 8 8"
              className={`text-stone-300 transition-transform duration-200 ${showAdvanced ? "rotate-90" : ""}`}
            >
              <path d="M3 1.5L5.5 4 3 6.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showAdvanced && (
            <div className="mt-6 space-y-7">
              <TextField
                label="性格特点"
                value={personality}
                onChange={setPersonality}
                max={LIMITS.personality}
                placeholder="角色的性格、说话方式与偏好……"
                rows={3}
              />
              <TextField
                label="情景设定"
                value={scenario}
                onChange={setScenario}
                max={LIMITS.scenario}
                placeholder="当前对话发生的场景与背景……"
                rows={3}
              />
              <TextField
                label="对话示例"
                value={dialogueExamples}
                onChange={setDialogueExamples}
                max={LIMITS.dialogue_examples}
                placeholder={"{{char}}: …\n{{user}}: …"}
                rows={3}
                mono
                hint={"格式：{{char}}: / {{user}}:"}
              />
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs text-stone-400">昵称</span>
                  <span className="text-[10px] text-stone-300 tabular-nums">
                    {nickname.length}/{LIMITS.nickname}
                  </span>
                </div>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => {
                    if (e.target.value.length <= LIMITS.nickname) setNickname(e.target.value);
                  }}
                  placeholder="角色的昵称或别名"
                  className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-300"
                />
              </div>
              <TextField
                label="群聊开场白"
                value={groupGreeting}
                onChange={setGroupGreeting}
                max={LIMITS.group_greeting}
                placeholder="群聊场景下的开场白"
                rows={2}
              />
            </div>
          )}
        </section>

        {/* System instructions */}
        <section>
          <button
            onClick={() => setShowSystem(!showSystem)}
            className="flex items-center gap-2 group"
          >
            <span className="text-[11px] font-medium text-stone-400 tracking-[0.15em] uppercase group-hover:text-stone-500 transition-colors">
              系统指令
            </span>
            <svg
              width="8" height="8" viewBox="0 0 8 8"
              className={`text-stone-300 transition-transform duration-200 ${showSystem ? "rotate-90" : ""}`}
            >
              <path d="M3 1.5L5.5 4 3 6.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showSystem && (
            <div className="mt-6 space-y-7">
              <TextField
                label="Main Prompt"
                value={mainPrompt}
                onChange={setMainPrompt}
                max={LIMITS.main_prompt}
                placeholder={"自定义系统提示词，使用 {{original}} 引用默认提示词"}
                rows={5}
                mono
                hint={"支持 {{original}}"}
              />
              <TextField
                label="Post History Instructions"
                value={postHistoryInstructions}
                onChange={setPostHistoryInstructions}
                max={LIMITS.post_history_instructions}
                placeholder={"在对话历史之后添加的指令"}
                rows={4}
                mono
                hint={"支持 {{original}}"}
              />
            </div>
          )}
        </section>
      </div>

      {/* ── Bottom bar ── */}
      <div className="shrink-0 bg-stone-50/90 backdrop-blur-sm border-t border-stone-100 px-8 py-4">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full py-2.5 text-xs font-medium text-stone-50 bg-neutral-800 rounded-lg transition-all duration-200 hover:bg-neutral-700 active:scale-[0.99] disabled:opacity-25 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {saving
            ? avatarUploading
              ? "上传头像…"
              : "保存中…"
            : "保存角色"}
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-medium text-stone-400 tracking-[0.15em] uppercase">
      {children}
    </h2>
  );
}

function TextField({
  label,
  value,
  onChange,
  max,
  placeholder,
  rows = 3,
  mono = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs text-stone-400">{label}</span>
        <span className="text-[10px] text-stone-300 tabular-nums">
          {value.length}/{max}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          if (e.target.value.length <= max) onChange(e.target.value);
        }}
        placeholder={placeholder}
        rows={rows}
        className={`w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-300 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-300 resize-none ${mono ? "font-mono text-xs" : ""}`}
      />
      {hint && (
        <p className="text-[10px] text-stone-300 mt-1.5">{hint}</p>
      )}
    </div>
  );
}
