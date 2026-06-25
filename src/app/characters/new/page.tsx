"use client";

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect, useCallback, useMemo, useRef, type DragEvent } from "react";
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
  const obj = raw as Record<string, string | undefined>;
  const result: ParsedCharacter = {};

  // 基础字段映射
  if (typeof obj.name === "string") result.name = obj.name;
  if (typeof obj.setting === "string") result.setting = obj.setting;
  if (typeof obj.greeting === "string") result.greeting = obj.greeting;
  if (typeof obj.personality === "string") result.personality = obj.personality;
  if (typeof obj.scenario === "string") result.scenario = obj.scenario;
  if (typeof obj.dialogue_examples === "string") result.dialogueExamples = obj.dialogue_examples;
  if (typeof obj.nickname === "string") result.nickname = obj.nickname;
  if (typeof obj.group_greeting === "string") result.groupGreeting = obj.groupGreeting;
  if (typeof obj.main_prompt === "string") result.mainPrompt = obj.mainPrompt;
  if (typeof obj.post_history_instructions === "string") result.postHistoryInstructions = obj.post_history_instructions;

  // Character Card V1 格式兼容
  if (typeof obj.first_mes === "string" && !result.greeting) result.greeting = obj.first_mes;
  if (typeof obj.mes_example === "string" && !result.dialogueExamples) result.dialogueExamples = obj.mes_example;
  if (typeof obj.description === "string" && !result.setting) result.setting = obj.description;

  // advanced_definitions 字段
  const adv = obj.advanced_definitions;
  if (adv && typeof adv === "object" && !Array.isArray(adv)) {
    const a = adv as Record<string, unknown>;
    if (typeof a.personality === "string" && !result.personality) result.personality = a.personality;
    if (typeof a.scenario === "string" && !result.scenario) result.scenario = a.scenario;
    if (typeof a.dialogueExamples === "string" && !result.dialogueExamples) result.dialogueExamples = a.dialogueExamples;
  }

  // extended_fields 字段
  const ext = obj.extended_fields;
  if (ext && typeof ext === "object" && !Array.isArray(ext)) {
    const e = ext as Record<string, unknown>;
    if (typeof e.nickname === "string" && !result.nickname) result.nickname = e.nickname;
    if (typeof e.groupGreeting === "string" && !result.groupGreeting) result.groupGreeting = e.groupGreeting;
  }

  // system_instructions 字段
  const sys = obj.system_instructions;
  if (sys && typeof sys === "object" && !Array.isArray(sys)) {
    const s = sys as Record<string, unknown>;
    if (typeof s.mainPrompt === "string" && !result.mainPrompt) result.mainPrompt = s.mainPrompt;
    if (typeof s.postHistoryInstructions === "string" && !result.postHistoryInstructions) result.postHistoryInstructions = s.postHistoryInstructions;
  }

  // TavernV2 格式 (chara_card_v2)
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

  // Chub 格式兼容 (有 data 字段但无 spec 标记)
  if (!obj.spec && obj.data && typeof obj.data === "object") {
    const d = obj.data as Record<string, unknown>;
    if (typeof d.name === "string" && !result.name) result.name = d.name;
    if (typeof d.description === "string" && !result.setting) result.setting = d.description;
    if (typeof d.first_mes === "string" && !result.greeting) result.greeting = d.first_mes;
    if (typeof d.personality === "string" && !result.personality) result.personality = d.personality;
    if (typeof d.scenario === "string" && !result.scenario) result.scenario = d.scenario;
    if (typeof d.mes_example === "string" && !result.dialogueExamples) result.dialogueExamples = d.mes_example;
  }

  // 如果没有任何有效字段，返回 null
  if (Object.keys(result).length === 0) return null;
  return result;
}

// ─── Page ─────────────────────────────────────────────────────

export default function NewCharacterPage() {
  // ═══════════════════════════════════════════════════════════
  // SECTION 1: ALL HOOKS — absolute top, no if/return/switch
  // ═══════════════════════════════════════════════════════════

  const { user, loading, token } = useAuth();
  const router = useRouter();

  const dropRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

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
  const [oneLineIntro, setOneLineIntro] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [publicityFields, setPublicityFields] = useState<string[]>([]);

  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const [showExtended, setShowExtended] = useState(false);
  const [showPublic, setShowPublic] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [jsonParsedName, setJsonParsedName] = useState("");

  const formRef = useRef({
    name, greeting, setting, personality, scenario,
    dialogueExamples, nickname, groupGreeting, mainPrompt, postHistoryInstructions,
    oneLineIntro, isPublic, publicityFields,
  });

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleAvatarSelect = useCallback((file: File) => {
    setError("");
    if (file.size > MAX_IMAGE_BYTES) { 
      setError("头像文件不能超过 10MB");
      showToast("error", "头像文件不能超过 10MB");
      return; 
    }
    if (!ALLOWED_IMAGE.includes(file.type as typeof ALLOWED_IMAGE[number])) { 
      setError("仅支持 jpg / png / webp 格式");
      showToast("error", "仅支持 jpg / png / webp 格式");
      return; 
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
    showToast("success", "头像选择成功");
  }, [showToast]);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current += 1;
    const hasJson = Array.from(e.dataTransfer.types).some(t => t === "Files" || t === "application/json");
    if (hasJson || e.dataTransfer.types.includes("Files")) setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOver(false); }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (ALLOWED_IMAGE.includes(file.type as typeof ALLOWED_IMAGE[number])) {
      handleAvatarSelect(file);
      return;
    }

    if (file.name.endsWith(".json") || file.type === "application/json") {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const data = parseCharacterJSON(parsed);
        
        if (!data) { 
          setError("无法识别此 JSON 的角色卡格式");
          showToast("error", "无法识别此 JSON 的角色卡格式，请检查文件内容");
          return; 
        }

        // 使用当前状态值而不是 ref（ref 可能不是最新的）
        const currentName = name;
        const currentSetting = setting;
        const currentGreeting = greeting;
        const currentPersonality = personality;
        const currentScenario = scenario;
        const currentDialogueExamples = dialogueExamples;
        const currentNickname = nickname;
        const currentGroupGreeting = groupGreeting;
        const currentMainPrompt = mainPrompt;
        const currentPostHistoryInstructions = postHistoryInstructions;

        // 智能填充：仅当目标字段为空时才填充
        if (data.name && !currentName) setName(data.name.slice(0, LIMITS.name));
        if (data.setting && !currentSetting) setSetting(data.setting.slice(0, LIMITS.setting));
        if (data.greeting && !currentGreeting) setGreeting(data.greeting.slice(0, LIMITS.greeting));
        if (data.personality && !currentPersonality) setPersonality(data.personality.slice(0, LIMITS.personality));
        if (data.scenario && !currentScenario) setScenario(data.scenario.slice(0, LIMITS.scenario));
        if (data.dialogueExamples && !currentDialogueExamples) setDialogueExamples(data.dialogueExamples.slice(0, LIMITS.dialogue_examples));
        if (data.nickname && !currentNickname) setNickname(data.nickname.slice(0, LIMITS.nickname));
        if (data.groupGreeting && !currentGroupGreeting) setGroupGreeting(data.groupGreeting.slice(0, LIMITS.group_greeting));
        if (data.mainPrompt && !currentMainPrompt) setMainPrompt(data.mainPrompt.slice(0, LIMITS.main_prompt));
        if (data.postHistoryInstructions && !currentPostHistoryInstructions) setPostHistoryInstructions(data.postHistoryInstructions.slice(0, LIMITS.post_history_instructions));

        // 自动展开相关面板
        if (data.personality || data.scenario || data.dialogueExamples) setShowAdvanced(true);
        if (data.nickname || data.groupGreeting) setShowExtended(true);
        if (data.mainPrompt || data.postHistoryInstructions) setShowSystem(true);

        setJsonParsedName(data.name || file.name.replace(".json", ""));
        setError("");
        
        // 统计成功导入的字段数量
        const importedFields = Object.values(data).filter(Boolean).length;
        showToast("success", `角色卡导入成功！已填充 ${importedFields} 个字段`);
        
      } catch (error) { 
        const errorMessage = error instanceof SyntaxError 
          ? "JSON 语法错误，请检查文件格式"
          : "文件读取失败，请重试";
        setError(errorMessage);
        showToast("error", errorMessage);
      }
      return;
    }

    setError("仅支持 .json 角色卡或 jpg/png/webp 头像");
    showToast("error", "仅支持 .json 角色卡或 jpg/png/webp 头像");
  }, [handleAvatarSelect, showToast, name, setting, greeting, personality, scenario, dialogueExamples, nickname, groupGreeting, mainPrompt, postHistoryInstructions]);

  const canSave = useMemo(
    () => name.trim().length > 0 && setting.trim().length > 0 && greeting.trim().length > 0,
    [name, setting, greeting]
  );

  const saveRef = useRef({
    canSave, token, avatarFile,
    name, greeting, setting, personality, scenario,
    dialogueExamples, nickname, groupGreeting, mainPrompt, postHistoryInstructions,
    oneLineIntro, isPublic, publicityFields,
  });

  const handleSave = useCallback(async () => {
    const s = saveRef.current;
    if (!s.canSave) return;
    setSaving(true);
    setError("");

    try {
      let avatarUrl = "";

      if (s.avatarFile) {
        setAvatarUploading(true);
        try {
          const fd = new FormData();
          fd.append("file", s.avatarFile);
          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            headers: { Authorization: "Bearer " + s.token },
            body: fd,
          });
          const uploadData = await uploadRes.json();
          if (!uploadData.success) { setError(uploadData.error || "头像上传失败"); setSaving(false); setAvatarUploading(false); return; }
          // 将相对路径转为完整URL，确保后端Zod url()验证通过
          avatarUrl = new URL(uploadData.data.url, window.location.origin).href;
        } catch { setError("头像上传失败，请重试"); setSaving(false); setAvatarUploading(false); return; }
        setAvatarUploading(false);
      }

      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.token },
        body: JSON.stringify({
          name: s.name, setting: s.setting, greeting: s.greeting,
          avatar_url: avatarUrl || undefined,
          personality: s.personality || undefined,
          scenario: s.scenario || undefined,
          dialogue_examples: s.dialogueExamples || undefined,
          nickname: s.nickname || undefined,
          group_greeting: s.groupGreeting || undefined,
          main_prompt: s.mainPrompt || undefined,
          post_history_instructions: s.postHistoryInstructions || undefined,
          one_line_intro: s.oneLineIntro || undefined,
          is_public: s.isPublic,
          publicity_fields: s.publicityFields.length > 0 ? s.publicityFields : undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) { setError(data.error || "创建失败"); setSaving(false); return; }

      // 同步头像到用户资料
      if (avatarUrl) {
        try {
          await fetch("/api/user/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.token },
            body: JSON.stringify({ avatarUrl }),
          });
        } catch { /* 用户资料更新失败不影响角色创建流程 */ }
      }

      router.push(`/characters/${data.data.id}`);
    } catch { setError("网络异常，请检查连接后重试"); }
    finally { setSaving(false); }
  }, [router]);

  // ═══════════════════════════════════════════════════════════
  // SECTION 2: REF SYNC — non-hook, after all hooks
  // ═══════════════════════════════════════════════════════════

  formRef.current = {
    name, greeting, setting, personality, scenario,
    dialogueExamples, nickname, groupGreeting, mainPrompt, postHistoryInstructions,
    oneLineIntro, isPublic, publicityFields,
  };

  saveRef.current = {
    canSave, token, avatarFile,
    name, greeting, setting, personality, scenario,
    dialogueExamples, nickname, groupGreeting, mainPrompt, postHistoryInstructions,
    oneLineIntro, isPublic, publicityFields,
  };

  // ═══════════════════════════════════════════════════════════
  // SECTION 3: EARLY RETURNS — after all hooks
  // ═══════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-xs text-stone-300">—</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-xs text-stone-300">请先登录</span>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 4: RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div
      ref={dropRef}
      className="relative flex h-dvh flex-col bg-stone-50"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-stone-50/70 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3 px-10 py-12 border border-dashed border-stone-300 rounded-lg">
            <span className="text-xs text-stone-400 tracking-[0.15em] uppercase">释放以导入角色卡</span>
            <span className="text-[10px] text-stone-300">支持 .json 角色卡或图片</span>
          </div>
        </div>
      )}

      <header className="shrink-0 flex items-center gap-4 px-8 pt-16 pb-6">
        <button
          onClick={() => router.back()}
          className="shrink-0 w-8 h-8 flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors"
          aria-label="返回"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3L5 8l5 5" /></svg>
        </button>
        <div className="flex-1"><h1 className="text-base font-medium tracking-tight text-neutral-900">创建角色</h1></div>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="shrink-0 px-5 py-1.5 text-xs font-medium text-stone-50 bg-neutral-800 rounded-lg transition-all duration-200 hover:bg-neutral-700 active:scale-[0.98] disabled:opacity-25 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {saving ? "…" : "保存"}
        </button>
      </header>

      {error && (<div className="mx-8 mb-4"><p className="text-[11px] text-stone-400">{error}</p></div>)}

      <div className="flex-1 overflow-y-auto px-8 pb-32 space-y-14">
        {/* ===== 必填项区 ===== */}
        <section>
          <SectionLabel>必填项</SectionLabel>
          <div className="mt-6 space-y-7">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs text-neutral-800 font-medium">
                  名字<span className="text-red-400 ml-0.5">*</span>
                </span>
                <span className="text-[10px] text-stone-300 tabular-nums">{name.length}/{LIMITS.name}</span>
              </div>
              <input type="text" value={name} onChange={(e) => { if (e.target.value.length <= LIMITS.name) setName(e.target.value); }} placeholder="为你的角色命名" className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-400 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-300" autoFocus />
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs text-neutral-800 font-medium">
                  角色设定<span className="text-red-400 ml-0.5">*</span>
                </span>
                <span className="text-[10px] text-stone-300 tabular-nums">{setting.length}/{LIMITS.setting}</span>
              </div>
              <textarea value={setting} onChange={(e) => { if (e.target.value.length <= LIMITS.setting) setSetting(e.target.value); }} placeholder="角色基本设定，名字，性别，年龄，职业，爱好等" rows={5} className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-400 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-300 resize-none" />
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs text-neutral-800 font-medium">
                  开场白<span className="text-red-400 ml-0.5">*</span>
                </span>
                <span className="text-[10px] text-stone-300 tabular-nums">{greeting.length}/{LIMITS.greeting}</span>
              </div>
              <textarea value={greeting} onChange={(e) => { if (e.target.value.length <= LIMITS.greeting) setGreeting(e.target.value); }} placeholder={"角色向你发送的第一条消息（开场白）使用<START>分割多条可选开场白"} rows={4} className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-400 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-300 resize-none" />
            </div>
          </div>
        </section>

        {/* ===== 头像（可选） ===== */}
        <section>
          <SectionLabel>头像</SectionLabel>
          <div className="mt-5 flex items-center gap-5">
            <div className="w-16 h-16 shrink-0 bg-stone-100 overflow-hidden flex items-center justify-center">
              {avatarPreview ? (<img src={avatarPreview} alt="" className="w-full h-full object-cover" />) : (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#d6d3d1" strokeWidth="1.2" strokeLinecap="round"><circle cx="11" cy="8" r="3.5" /><path d="M5.5 19a5.5 5.5 0 0111 0" /></svg>
              )}
            </div>
            <label className="cursor-pointer text-xs text-neutral-800 font-medium hover:text-neutral-600 transition-colors duration-200">
              选择图片
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAvatarSelect(file); }} className="hidden" />
            </label>
            {avatarFile && (<button onClick={() => { setAvatarFile(null); setAvatarPreview(""); }} className="text-[10px] text-stone-300 hover:text-stone-400 transition-colors">移除</button>)}
            <span className="text-[10px] text-stone-300">jpg / png / webp</span>
          </div>
        </section>

        {/* ===== 折叠区 1：高级定义 ===== */}
        <section>
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2 group">
            <span className="text-[11px] font-medium text-neutral-800 tracking-[0.15em] uppercase group-hover:text-stone-600 transition-colors">高级定义</span>
            <svg width="8" height="8" viewBox="0 0 8 8" className={`text-stone-300 transition-transform duration-200 ${showAdvanced ? "rotate-90" : ""}`}><path d="M3 1.5L5.5 4 3 6.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {showAdvanced && (
            <div className="mt-6 space-y-7">
              <TextField label="性格特点" value={personality} onChange={setPersonality} max={LIMITS.personality} placeholder="角色性格特点的简要描述" rows={3} />
              <TextField label="情景设定" value={scenario} onChange={setScenario} max={LIMITS.scenario} placeholder="对话时角色和用户所处的环境和氛围" rows={3} />
              <TextField label="对话示例" value={dialogueExamples} onChange={setDialogueExamples} max={LIMITS.dialogue_examples} placeholder={"聊天对话的示例，每个示例都以<START>开头，格式为{{char}}：说话内容"} rows={4} mono />
            </div>
          )}
        </section>

        {/* ===== 折叠区 2：扩展字段 ===== */}
        <section>
          <button onClick={() => setShowExtended(!showExtended)} className="flex items-center gap-2 group">
            <span className="text-[11px] font-medium text-neutral-800 tracking-[0.15em] uppercase group-hover:text-stone-600 transition-colors">扩展字段</span>
            <svg width="8" height="8" viewBox="0 0 8 8" className={`text-stone-300 transition-transform duration-200 ${showExtended ? "rotate-90" : ""}`}><path d="M3 1.5L5.5 4 3 6.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {showExtended && (
            <div className="mt-6 space-y-7">
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs text-neutral-800 font-medium">昵称</span>
                  <span className="text-[10px] text-stone-300 tabular-nums">{nickname.length}/{LIMITS.nickname}</span>
                </div>
                <input type="text" value={nickname} onChange={(e) => { if (e.target.value.length <= LIMITS.nickname) setNickname(e.target.value); }} placeholder={"{{char}}将使用昵称替代名字"} className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-400 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-300" />
              </div>
              <TextField label="群聊开场白" value={groupGreeting} onChange={setGroupGreeting} max={LIMITS.group_greeting} placeholder={"群聊中角色向你发送的第一条信息（打招呼）使用<START>分割多条可选打招呼"} rows={3} />
            </div>
          )}
        </section>

        {/* ===== 折叠区 3：系统指令 ===== */}
        <section>
          <button onClick={() => setShowSystem(!showSystem)} className="flex items-center gap-2 group">
            <span className="text-[11px] font-medium text-neutral-800 tracking-[0.15em] uppercase group-hover:text-stone-600 transition-colors">系统指令</span>
            <svg width="8" height="8" viewBox="0 0 8 8" className={`text-stone-300 transition-transform duration-200 ${showSystem ? "rotate-90" : ""}`}><path d="M3 1.5L5.5 4 3 6.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {showSystem && (
            <div className="mt-6 space-y-7">
              <TextField label="Main prompt" value={mainPrompt} onChange={setMainPrompt} max={LIMITS.main_prompt} placeholder={"用于覆盖预设中的main prompt项，使用{{original}}来引用预设中的原提示词"} rows={5} mono hint={"支持 {{original}}"} />
              <TextField label="Post-history instructions" value={postHistoryInstructions} onChange={setPostHistoryInstructions} max={LIMITS.post_history_instructions} placeholder={"用来覆盖预设中的post-history instructions项，使用{{original}}来引用预设中的原提示词"} rows={4} mono hint={"支持 {{original}}"} />
            </div>
          )}
        </section>

        {/* ===== 折叠区 4：广场发布 ===== */}
        <section>
          <button onClick={() => setShowPublic(!showPublic)} className="flex items-center gap-2 group">
            <span className="text-[11px] font-medium text-neutral-800 tracking-[0.15em] uppercase group-hover:text-stone-600 transition-colors">广场发布</span>
            <svg width="8" height="8" viewBox="0 0 8 8" className={`text-stone-300 transition-transform duration-200 ${showPublic ? "rotate-90" : ""}`}><path d="M3 1.5L5.5 4 3 6.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {showPublic && (
            <div className="mt-6 space-y-7">
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs text-neutral-800 font-medium">一句话简介</span>
                  <span className="text-[10px] text-stone-300 tabular-nums">{oneLineIntro.length}/255</span>
                </div>
                <input type="text" value={oneLineIntro} onChange={(e) => { if (e.target.value.length <= 255) setOneLineIntro(e.target.value); }} placeholder="用一句话介绍你的角色，将在广场中展示" className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-400 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-300" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-800 font-medium">公开发布到广场</span>
                <button
                  onClick={() => setIsPublic(!isPublic)}
                  className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${isPublic ? 'bg-neutral-800' : 'bg-stone-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${isPublic ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              {isPublic && (
                <div>
                  <span className="text-xs text-neutral-800 font-medium block mb-3">选择展示字段</span>
                  <div className="space-y-2">
                    {[
                      { key: 'name', label: '角色名称' },
                      { key: 'setting', label: '角色设定' },
                      { key: 'greeting', label: '开场白' },
                      { key: 'personality', label: '性格' },
                      { key: 'scenario', label: '场景' },
                      { key: 'nickname', label: '昵称' },
                    ].map((field) => (
                      <label key={field.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={publicityFields.includes(field.key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPublicityFields([...publicityFields, field.key]);
                            } else {
                              setPublicityFields(publicityFields.filter(f => f !== field.key));
                            }
                          }}
                          className="w-3.5 h-3.5 rounded border-stone-300 text-neutral-800 focus:ring-neutral-500"
                        />
                        <span className="text-xs text-neutral-600">{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="shrink-0 bg-stone-50/90 backdrop-blur-sm border-t border-stone-100 px-8 py-4">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full py-2.5 text-xs font-medium text-stone-50 bg-neutral-800 rounded-lg transition-all duration-200 hover:bg-neutral-700 active:scale-[0.99] disabled:opacity-25 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {saving ? (avatarUploading ? "上传头像…" : "保存中…") : "保存角色"}
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-medium text-stone-400 tracking-[0.15em] uppercase">{children}</h2>;
}

function TextField({ label, value, onChange, max, placeholder, rows = 3, mono = false, hint }: {
  label: string; value: string; onChange: (v: string) => void; max: number;
  placeholder?: string; rows?: number; mono?: boolean; hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs text-neutral-800 font-medium">{label}</span>
        <span className="text-[10px] text-stone-300 tabular-nums">{value.length}/{max}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => { if (e.target.value.length <= max) onChange(e.target.value); }}
        placeholder={placeholder}
        rows={rows}
        className={`w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-400 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-300 resize-none ${mono ? "font-mono text-xs" : ""}`}
      />
      {hint && <p className="text-[10px] text-stone-300 mt-1.5">{hint}</p>}
    </div>
  );
}
