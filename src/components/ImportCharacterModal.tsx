"use client";

import { useState, useRef } from "react";
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
  mainPrompt?: string;
  postHistoryInstructions?: string;
}

interface ImportCharacterModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  token: string | null;
}

// ─── Format Adapter ───

function isTavernCard(data: any): boolean {
  return data?.spec === "chara_card_v2" && data?.spec_version === "2.0" && data?.data;
}

function isSillyTavernCard(data: any): boolean {
  return !isTavernCard(data) && (data?.first_mes || data?.description);
}

function isXujingCard(data: any): boolean {
  return data?.name && data?.setting && data?.greeting && !data?.spec;
}

function adaptCharacter(data: any): ParsedCharacter | null {
  // Tavern Card v2
  if (isTavernCard(data)) {
    const d = data.data;
    return {
      name: d.name || "",
      setting: d.description || d.personality || "",
      greeting: d.first_mes || "",
      personality: d.personality || "",
      scenario: d.scenario || "",
      dialogueExamples: d.mes_example || "",
      nickname: "",
      mainPrompt: d.system_prompt || d.creator_notes || "",
      postHistoryInstructions: d.post_history_instructions || "",
    };
  }

  // SillyTavern / generic card
  if (isSillyTavernCard(data)) {
    return {
      name: data.name || "",
      setting: data.description || data.personality || "",
      greeting: data.first_mes || data.greeting || "",
      personality: data.personality || "",
      scenario: data.scenario || "",
      dialogueExamples: data.mes_example || data.dialogue_examples || "",
      nickname: data.nickname || "",
      mainPrompt: data.system_prompt || data.main_prompt || data.creator_notes || "",
      postHistoryInstructions: data.post_history_instructions || "",
    };
  }

  // Xujing native
  if (isXujingCard(data)) {
    return {
      name: data.name,
      setting: data.setting,
      greeting: data.greeting,
      avatarUrl: data.avatar_url || data.avatarUrl || "",
      personality: data.personality || "",
      scenario: data.scenario || "",
      dialogueExamples: data.dialogue_examples || data.dialogueExamples || "",
      nickname: data.nickname || "",
      mainPrompt: data.main_prompt || data.mainPrompt || "",
      postHistoryInstructions: data.post_history_instructions || data.postHistoryInstructions || "",
    };
  }

  return null;
}

function validateCharacter(c: ParsedCharacter): string | null {
  if (!c.name?.trim()) return "角色卡缺少必要字段（名字）";
  if (!c.setting?.trim()) return "角色卡缺少必要字段（角色设定）";
  if (!c.greeting?.trim()) return "角色卡缺少必要字段（开场白）";
  if (c.name.length > 10) return "角色名字最长 10 个中文字符";
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
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"choose" | "preview" | "importing">("choose");
  const [parsed, setParsed] = useState<ParsedCharacter | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rawData, setRawData] = useState<any>(null);

  if (!open) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const reset = () => {
    setStep("choose");
    setParsed(null);
    setRawData(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFilePick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file extension
    if (!file.name.toLowerCase().endsWith(".json")) {
      showToast("请选择有效的 JSON 角色卡文件");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const data = JSON.parse(text);
        const adapted = adaptCharacter(data);

        if (!adapted) {
          showToast("该文件不是有效的角色卡格式");
          return;
        }

        const err = validateCharacter(adapted);
        if (err) {
          showToast(err);
          return;
        }

        setRawData(data);
        setParsed(adapted);
        setStep("preview");
      } catch {
        showToast("该文件不是有效的角色卡格式");
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!parsed || !token) return;
    setStep("importing");
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          name: parsed.name,
          setting: parsed.setting,
          greeting: parsed.greeting,
          personality: parsed.personality || undefined,
          scenario: parsed.scenario || undefined,
          dialogue_examples: parsed.dialogueExamples || undefined,
          nickname: parsed.nickname || undefined,
          main_prompt: parsed.mainPrompt || undefined,
          post_history_instructions: parsed.postHistoryInstructions || undefined,
        }),
      });
      const result = await res.json();
      if (!result.success) {
        showToast(result.error || "导入失败");
        setStep("preview");
        return;
      }
      reset();
      onImported();
    } catch {
      showToast("网络错误，请重试");
      setStep("preview");
    }
  };

  const hasAdvanced = parsed && (
    parsed.personality || parsed.scenario || parsed.dialogueExamples ||
    parsed.nickname || parsed.mainPrompt || parsed.postHistoryInstructions
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-stone-900/20 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Toast */}
      {toast && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-neutral-900 px-5 py-2.5 text-xs text-stone-50 shadow-lg animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      {/* Modal */}
      <div className="relative w-full sm:max-w-sm mx-4 bg-white rounded-2xl shadow-xl animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />

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
              支持叙境角色卡、Tavern Character Card、SillyTavern 角色卡格式
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

            {/* Avatar + Name */}
            <div className="flex items-center gap-4 mb-5">
              <div className="w-16 h-16 rounded-2xl bg-stone-100 overflow-hidden shrink-0 flex items-center justify-center">
                {parsed.avatarUrl ? (
                  <img src={parsed.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-stone-300 text-2xl font-light">{parsed.name.charAt(0)}</span>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-neutral-800 truncate">{parsed.name}</h3>
                {parsed.nickname && (
                  <span className="text-[11px] text-stone-400">{parsed.nickname}</span>
                )}
              </div>
            </div>

            {/* Setting preview */}
            <div className="mb-4">
              <span className="text-[10px] font-medium text-stone-400 uppercase tracking-wider">角色设定</span>
              <p className="mt-1 text-xs text-stone-600 leading-relaxed line-clamp-3">
                {parsed.setting}
              </p>
            </div>

            {/* Greeting preview */}
            <div className="mb-4">
              <span className="text-[10px] font-medium text-stone-400 uppercase tracking-wider">开场白</span>
              <p className="mt-1 text-xs text-stone-600 leading-relaxed line-clamp-2">
                {parsed.greeting}
              </p>
            </div>

            {/* Advanced fields indicator */}
            {hasAdvanced && (
              <div className="mb-5 rounded-xl bg-stone-50 p-3">
                <span className="text-[10px] font-medium text-stone-400 uppercase tracking-wider">高级设定</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {parsed.personality && <Tag label="性格特点" />}
                  {parsed.scenario && <Tag label="情景设定" />}
                  {parsed.dialogueExamples && <Tag label="对话示例" />}
                  {parsed.mainPrompt && <Tag label="系统指令" />}
                  {parsed.postHistoryInstructions && <Tag label="历史指令" />}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => { setStep("choose"); setParsed(null); }}
                className="flex-1 rounded-xl border border-stone-200 py-2.5 text-xs font-medium text-stone-500 hover:bg-stone-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleImport}
                disabled={step === "importing"}
                className="flex-1 rounded-xl bg-neutral-900 py-2.5 text-xs font-medium text-stone-50 hover:bg-neutral-800 transition-colors active:scale-[0.98] disabled:opacity-50"
              >
                {step === "importing" ? "导入中..." : "确认导入"}
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
            <span className="text-xs text-stone-400">正在导入角色...</span>
          </div>
        )}
      </div>
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
