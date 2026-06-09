"use client";

import { useState, useRef, useCallback, type DragEvent } from "react";
import { useRouter } from "next/navigation";

// ─── Types ───

interface ParsedCharacter {
  name: string;
  setting: string;
  greeting: string;
  avatarUrl?: string;
  personality?: string;
  scenario?: string;
  dialogueExamples?: string;
  nickname?: string;
  groupGreeting?: string;
  mainPrompt?: string;
  postHistoryInstructions?: string;
}

interface ImportCharacterModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  token: string | null;
}

// ─── Format Adapters ───

function isXujingNested(data: any): boolean {
  return (
    typeof data?.name === "string" &&
    typeof data?.setting === "string" &&
    typeof data?.greeting === "string" &&
    (data?.advanced_definitions !== undefined ||
      data?.extended_fields !== undefined ||
      data?.system_instructions !== undefined)
  );
}

function isTavernCard(data: any): boolean {
  return data?.spec === "chara_card_v2" && data?.spec_version === "2.0" && data?.data;
}

function isLegacyCard(data: any): boolean {
  return (
    typeof data?.name === "string" &&
    typeof data?.setting === "string" &&
    typeof data?.greeting === "string" &&
    !data?.advanced_definitions &&
    !data?.spec
  );
}

function adaptCharacter(data: any): ParsedCharacter | null {
  if (isXujingNested(data)) {
    return {
      name: data.name?.trim() || "",
      setting: data.setting?.trim() || "",
      greeting: data.greeting?.trim() || "",
      avatarUrl: data.avatar || "",
      personality: data.advanced_definitions?.personality?.trim() || "",
      scenario: data.advanced_definitions?.scenario?.trim() || "",
      dialogueExamples: data.advanced_definitions?.dialogueExamples?.trim() || "",
      nickname: data.extended_fields?.nickname?.trim() || "",
      groupGreeting: data.extended_fields?.groupGreeting?.trim() || "",
      mainPrompt: data.system_instructions?.mainPrompt?.trim() || "",
      postHistoryInstructions: data.system_instructions?.postHistoryInstructions?.trim() || "",
    };
  }

  if (isTavernCard(data)) {
    const d = data.data;
    return {
      name: d.name?.trim() || "",
      setting: d.description?.trim() || d.personality?.trim() || "",
      greeting: d.first_mes?.trim() || "",
      personality: d.personality?.trim() || "",
      scenario: d.scenario?.trim() || "",
      dialogueExamples: d.mes_example?.trim() || "",
      nickname: "",
      groupGreeting: "",
      mainPrompt: d.system_prompt?.trim() || d.creator_notes?.trim() || "",
      postHistoryInstructions: d.post_history_instructions?.trim() || "",
    };
  }

  if (isLegacyCard(data)) {
    return {
      name: data.name?.trim() || "",
      setting: data.setting?.trim() || data.description?.trim() || "",
      greeting: data.greeting?.trim() || data.first_mes?.trim() || "",
      avatarUrl: data.avatar_url || data.avatarUrl || "",
      personality: data.personality?.trim() || "",
      scenario: data.scenario?.trim() || "",
      dialogueExamples: (data.dialogue_examples || data.dialogueExamples || data.mes_example || "").trim(),
      nickname: data.nickname?.trim() || "",
      groupGreeting: data.group_greeting?.trim() || "",
      mainPrompt: (data.main_prompt || data.mainPrompt || data.system_prompt || data.creator_notes || "").trim(),
      postHistoryInstructions: (data.post_history_instructions || data.postHistoryInstructions || "").trim(),
    };
  }

  return null;
}

function validateCharacter(c: ParsedCharacter): string | null {
  if (!c.name) return "缺少角色名称";
  if (!c.setting) return "缺少角色设定";
  if (!c.greeting) return "缺少开场白";
  if (c.name.length > 10) return "角色名称最长 10 个中文字符";
  if (c.greeting.length > 200) return "开场白最长 200 字";
  if (c.setting.length > 10000) return "角色设定最长 10000 字";
  return null;
}

// ─── Component ───

export default function ImportCharacterModal({
  open,
  onClose,
  onImported,
  token,
}: ImportCharacterModalProps) {
  // ═══════════════════════════════════════════════════════════
  // SECTION 1: ALL HOOKS — absolute top, no if/return
  // ═══════════════════════════════════════════════════════════

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"choose" | "preview" | "importing">("choose");
  const [parsed, setParsed] = useState<ParsedCharacter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  // Drag & Drop callbacks (must be BEFORE any early return)
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, []);

  // ═══════════════════════════════════════════════════════════
  // SECTION 2: EARLY RETURN — after all hooks
  // ═══════════════════════════════════════════════════════════

  if (!open) return null;

  // ═══════════════════════════════════════════════════════════
  // SECTION 3: Plain functions and handlers
  // ═══════════════════════════════════════════════════════════

  const reset = () => {
    setStep("choose");
    setParsed(null);
    setError(null);
    setAvatarFile(null);
    setAvatarPreview("");
    setIsDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // ─── JSON File Handling ───

  function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("请选择有效的 .json 角色卡文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const data = JSON.parse(text);
        const adapted = adaptCharacter(data);

        if (!adapted) {
          setError("无法识别此角色卡格式，请使用叙境、Tavern v2 或 SillyTavern 格式");
          return;
        }

        const err = validateCharacter(adapted);
        if (err) { setError(err); return; }

        setError(null);
        setParsed(adapted);
        setStep("preview");
      } catch {
        setError("JSON 格式错误，请检查文件内容");
      }
    };
    reader.readAsText(file);
  }

  const handleFilePick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // ─── Image Upload ───

  const handleImagePick = () => imageInputRef.current?.click();

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("图片不能超过 10MB");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("仅支持 jpg / png / webp 格式");
      return;
    }
    setError(null);
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ─── Submit ───

  const handleImport = async () => {
    if (!parsed || !token) return;
    setStep("importing");
    setError(null);

    try {
      let avatarUrl = parsed.avatarUrl || "";

      if (avatarFile) {
        setUploading(true);
        try {
          const formData = new FormData();
          formData.append("file", avatarFile);
          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            headers: { Authorization: "Bearer " + token },
            body: formData,
          });
          const uploadData = await uploadRes.json();
          if (uploadData.success) {
            avatarUrl = uploadData.data.url;
          } else {
            setError("头像上传失败: " + (uploadData.error || "未知错误"));
            setStep("preview");
            setUploading(false);
            return;
          }
        } catch {
          setError("头像上传失败，请重试");
          setStep("preview");
          setUploading(false);
          return;
        }
        setUploading(false);
      }

      const res = await fetch("/api/characters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          name: parsed.name,
          setting: parsed.setting,
          greeting: parsed.greeting,
          avatar_url: avatarUrl || undefined,
          personality: parsed.personality || undefined,
          scenario: parsed.scenario || undefined,
          dialogue_examples: parsed.dialogueExamples || undefined,
          nickname: parsed.nickname || undefined,
          group_greeting: parsed.groupGreeting || undefined,
          main_prompt: parsed.mainPrompt || undefined,
          post_history_instructions: parsed.postHistoryInstructions || undefined,
        }),
      });

      const result = await res.json();
      if (!result.success) {
        setError(result.error || "导入失败");
        setStep("preview");
        return;
      }

      reset();
      onImported();
      if (result.data?.id) {
        router.push("/chat/" + result.data.id);
      }
    } catch {
      setError("网络错误，请重试");
      setStep("preview");
    }
  };

  // ═══════════════════════════════════════════════════════════
  // SECTION 4: Derived values & RENDER
  // ═══════════════════════════════════════════════════════════

  const hasAdvanced =
    parsed &&
    (parsed.personality ||
      parsed.scenario ||
      parsed.dialogueExamples ||
      parsed.nickname ||
      parsed.groupGreeting);

  const hasSystem =
    parsed && (parsed.mainPrompt || parsed.postHistoryInstructions);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-stone-900/20 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />

      <div className="relative w-full sm:max-w-sm mx-4 max-h-[85dvh] overflow-y-auto bg-white rounded-2xl shadow-xl animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
        <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} className="hidden" />

        {step === "choose" && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-neutral-900 mb-5">创建角色</h2>
            <div className="space-y-3">
              <button
                onClick={() => { handleClose(); router.push("/characters/new"); }}
                className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-medium text-stone-50 hover:bg-neutral-800 transition-colors active:scale-[0.98]"
              >
                新建角色
              </button>
              <button
                onClick={handleFilePick}
                className="w-full rounded-xl border border-stone-200 bg-white py-3 text-sm font-medium text-neutral-700 hover:bg-stone-50 transition-colors active:scale-[0.98]"
              >
                导入角色卡
              </button>
            </div>
            <p className="mt-4 text-center text-[10px] text-stone-300 leading-relaxed">
              支持叙境格式、Tavern Character Card、SillyTavern 角色卡
            </p>
            <button
              onClick={handleClose}
              className="mt-3 w-full text-center text-xs text-stone-400 hover:text-stone-500 transition-colors"
            >
              取消
            </button>
          </div>
        )}

        {step === "preview" && parsed && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-neutral-900 mb-5">预览角色卡</h2>

            <div className="flex items-center gap-4 mb-5">
              <button
                onClick={handleImagePick}
                className="w-16 h-16 rounded-2xl bg-stone-100 overflow-hidden shrink-0 flex items-center justify-center hover:ring-2 hover:ring-stone-200 transition-all"
                title="点击更换头像"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                ) : parsed.avatarUrl ? (
                  <img src={parsed.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-stone-300 text-2xl font-light">{parsed.name.charAt(0)}</span>
                )}
              </button>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-neutral-800 truncate">{parsed.name}</h3>
                {parsed.nickname && (
                  <span className="text-[11px] text-stone-400">{parsed.nickname}</span>
                )}
              </div>
            </div>

            <Section label="角色设定">
              <p className="text-xs text-stone-600 leading-relaxed line-clamp-3">{parsed.setting}</p>
            </Section>

            <Section label="开场白">
              <p className="text-xs text-stone-600 leading-relaxed line-clamp-2">{parsed.greeting}</p>
            </Section>

            {hasAdvanced && (
              <div className="mb-4 rounded-xl bg-stone-50 p-3">
                <span className="text-[10px] font-medium text-stone-400 uppercase tracking-wider">高级定义</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {parsed.personality && <Tag label="性格特点" />}
                  {parsed.scenario && <Tag label="情景设定" />}
                  {parsed.dialogueExamples && <Tag label="对话示例" />}
                  {parsed.nickname && <Tag label="昵称" />}
                  {parsed.groupGreeting && <Tag label="群聊开场白" />}
                </div>
              </div>
            )}

            {hasSystem && (
              <div className="mb-4 rounded-xl bg-stone-50 p-3">
                <span className="text-[10px] font-medium text-stone-400 uppercase tracking-wider">系统指令</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {parsed.mainPrompt && <Tag label="Main Prompt" />}
                  {parsed.postHistoryInstructions && <Tag label="Post History" />}
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-xl bg-stone-50 px-4 py-3 text-xs text-stone-500">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep("choose"); setParsed(null); setAvatarFile(null); setAvatarPreview(""); setError(null); }}
                className="flex-1 rounded-xl border border-stone-200 py-2.5 text-xs font-medium text-stone-500 hover:bg-stone-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleImport}
                disabled={(step as string) === "importing"}
                className="flex-1 rounded-xl bg-neutral-900 py-2.5 text-xs font-medium text-stone-50 hover:bg-neutral-800 transition-colors active:scale-[0.98] disabled:opacity-50"
              >
                {(step as string) === "importing" ? (uploading ? "上传头像..." : "导入中...") : "确认导入"}
              </button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="p-10 flex flex-col items-center justify-center gap-3">
            <svg className="animate-spin h-6 w-6 text-stone-400" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
              <path d="M10 2a8 8 0 017.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-xs text-stone-400">
              {uploading ? "正在上传头像..." : "正在导入角色..."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ───

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <span className="text-[10px] font-medium text-stone-400 uppercase tracking-wider">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-block text-[10px] text-stone-400 bg-white rounded-md px-2 py-0.5 border border-stone-100">
      {label}
    </span>
  );
}