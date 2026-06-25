"use client";

import { useAuth } from "@/lib/use-auth";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, use } from "react";

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


export default function EditCharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading, token } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [name, setName] = useState("");
  const [setting, setSetting] = useState("");
  const [greeting, setGreeting] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [personality, setPersonality] = useState("");
  const [scenario, setScenario] = useState("");
  const [dialogueExamples, setDialogueExamples] = useState("");
  const [nickname, setNickname] = useState("");
  const [groupGreeting, setGroupGreeting] = useState("");
  const [mainPrompt, setMainPrompt] = useState("");
  const [postHistoryInstructions, setPostHistoryInstructions] = useState("");

  const [isOfficial, setIsOfficial] = useState(false);
  const [charVersion, setCharVersion] = useState(1);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExtended, setShowExtended] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const [showPublic, setShowPublic] = useState(false);
  const [oneLineIntro, setOneLineIntro] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [publicityFields, setPublicityFields] = useState<string[]>([]);

  // Avatar preview only — separate from avatar_url
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [backgroundPreview, setBackgroundPreview] = useState("");
  const [backgroundUploading, setBackgroundUploading] = useState(false);

  const fetchCharacter = useCallback(async () => {
    if (!token || !id) return;
    try {
      const res = await fetch("/api/characters/" + id, {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "加载失败"); return; }
      const c = data.data;
      setName(c.name || "");
      setSetting(c.setting || "");
      setGreeting(c.greeting || "");
      setAvatarUrl(c.avatarUrl || "");
      setBackgroundUrl(c.backgroundUrl || "");
      setPersonality(c.personality || "");
      setScenario(c.scenario || "");
      setDialogueExamples(
        typeof c.dialogueExamples === "string" ? c.dialogueExamples : ""
      );
      setNickname(c.nickname || "");
      setGroupGreeting(c.groupGreeting || "");
      setMainPrompt(c.mainPrompt || "");
      setPostHistoryInstructions(c.postHistoryInstructions || "");
      setIsOfficial(c.isOfficial || false);
      setCharVersion(c.version || 1);
      setOneLineIntro(c.oneLineIntro || "");
      setIsPublic(c.isPublic || false);
      setPublicityFields(Array.isArray(c.publicityFields) ? c.publicityFields : []);
      if (c.avatarUrl) setAvatarPreview(c.avatarUrl);
      if (c.backgroundUrl) setBackgroundPreview(c.backgroundUrl);
      if (c.personality || c.scenario || c.dialogueExamples) setShowAdvanced(true);
      if (c.nickname || c.groupGreeting) setShowExtended(true);
      if (c.mainPrompt || c.postHistoryInstructions) setShowSystem(true);
    } catch {
      setError("网络错误");
    } finally {
      setFetching(false);
    }
  }, [token, id]);

  useEffect(() => { fetchCharacter(); }, [fetchCharacter]);

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("头像文件不能超过 10MB"); return; }
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) { setError("仅支持 jpg/png/webp 格式"); return; }

    // 本地预览
    const reader = new FileReader();
    reader.onload = () => { setAvatarPreview(reader.result as string); };
    reader.readAsDataURL(file);

    // 立即上传到服务器
    try {
      setAvatarUploading(true);
      setError("");
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: formData,
      });
      const uploadData = await res.json();
      if (uploadData.success && uploadData.data?.url) {
        // 将相对路径转为完整URL，确保后端Zod url()验证通过
        const fullUrl = new URL(uploadData.data.url, window.location.origin).href;
        setAvatarUrl(fullUrl);
        setAvatarPreview(fullUrl);
      } else {
        setError(uploadData.error || "头像上传失败");
      }
    } catch {
      setError("头像上传失败，请重试");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleBackgroundFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("背景图文件不能超过 10MB"); return; }
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) { setError("仅支持 jpg/png/webp 格式"); return; }

    // 本地预览
    const reader = new FileReader();
    reader.onload = () => { setBackgroundPreview(reader.result as string); };
    reader.readAsDataURL(file);

    // 立即上传到服务器
    try {
      setBackgroundUploading(true);
      setError("");
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: formData,
      });
      const uploadData = await res.json();
      if (uploadData.success && uploadData.data?.url) {
        const fullUrl = new URL(uploadData.data.url, window.location.origin).href;
        setBackgroundUrl(fullUrl);
        setBackgroundPreview(fullUrl);
      } else {
        setError(uploadData.error || "背景图上传失败");
      }
    } catch {
      setError("背景图上传失败，请重试");
    } finally {
      setBackgroundUploading(false);
    }
  };

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || fetching) {
    return <div className="flex h-dvh items-center justify-center text-gray-400">加载中…</div>;
  }

  if (!user) {
    return <div className="flex h-dvh items-center justify-center text-gray-400">跳转中…</div>;
  }

  const canSave = !isOfficial && name.trim() && setting.trim() && greeting.trim();

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/characters/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          name, setting, greeting,
          avatar_url: avatarUrl || null,
          background_url: backgroundUrl || null,
          personality: personality || null,
          scenario: scenario || null,
          dialogue_examples: dialogueExamples || null,
          nickname: nickname || null,
          group_greeting: groupGreeting || null,
          main_prompt: mainPrompt || null,
          post_history_instructions: postHistoryInstructions || null,
          one_line_intro: oneLineIntro || null,
          is_public: isPublic,
          publicity_fields: publicityFields.length > 0 ? publicityFields : null,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "保存失败"); return; }
      setSuccessMsg("保存成功");
      setCharVersion(data.data?.version ?? charVersion + 1);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/characters/" + id, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "删除失败"); return; }
      window.location.href = "/characters";
    } catch {
      setError("网络错误");
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch("/api/characters/" + id + "/export", {
        headers: { Authorization: "Bearer " + token },
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "导出失败"); return; }
      const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name.trim() + ".json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("导出失败");
    }
  };

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { window.location.href = "/characters"; }} className="text-gray-400 text-lg">&larr;</button>
          <h1 className="text-lg font-semibold text-gray-900">
            {isOfficial ? "查看角色" : "编辑角色"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!isOfficial && (
            <>
              <button onClick={handleExport}
                className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                导出
              </button>
              <button onClick={() => setShowDeleteConfirm(true)}
                className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50">
                删除
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}
        {successMsg && (
          <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-600">{successMsg}</div>
        )}
        {isOfficial && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
            <strong>⚠️ 版权保护：</strong>此角色为官方角色，版权归叙境项目组所有。未经授权，禁止复制、修改、传播或用于商业用途。违者将追究法律责任。
          </div>
        )}

        {/* 背景图预览层 */}
        {backgroundPreview ? (
          <div className="relative w-full h-40 rounded-lg overflow-hidden">
            <img src={backgroundPreview} alt="背景预览" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </div>
        ) : isOfficial ? (
          <div className="w-full h-40 rounded-lg bg-gray-100 flex items-center justify-center">
            <span className="text-gray-400 text-sm">暂无背景图片</span>
          </div>
        ) : null}

        <section>
          <h2 className="text-sm font-medium text-gray-500 mb-3">基础信息</h2>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">头像</label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="头像预览" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-300 text-2xl">+</span>
                )}
              </div>
              {!isOfficial && (
                <label className={`rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 cursor-pointer hover:bg-gray-50 ${avatarUploading ? "opacity-50 pointer-events-none" : ""}`}>
                  {avatarUploading ? "上传中…" : "更换图片"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarFile} className="hidden" disabled={avatarUploading} />
                </label>
              )}
              <span className="text-xs text-gray-400">jpg/png/webp</span>
            </div>

          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">背景图</label>
            <div className="flex items-center gap-3">
              <div className="w-32 h-20 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center">
                {backgroundPreview ? (
                  <img src={backgroundPreview} alt="背景预览" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-300 text-xl">+</span>
                )}
              </div>
              {!isOfficial && (
                <label className={`rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 cursor-pointer hover:bg-gray-50 ${backgroundUploading ? "opacity-50 pointer-events-none" : ""}`}>
                  {backgroundUploading ? "上传中…" : "更换背景"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleBackgroundFile} className="hidden" disabled={backgroundUploading} />
                </label>
              )}
              <span className="text-xs text-gray-400">jpg/png/webp, 建议 16:10</span>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">角色名称 *</label>
            <input type="text" value={name} readOnly={isOfficial} disabled={isOfficial}
              onChange={(e) => { if (e.target.value.length <= LIMITS.name) setName(e.target.value); }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 bg-muted text-muted-foreground cursor-not-allowed" />
            <div className="text-right text-xs text-gray-400 mt-0.5">{name.length} / {LIMITS.name}</div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">角色设定 *</label>
            <textarea value={setting} readOnly={isOfficial} disabled={isOfficial}
              onChange={(e) => { if (e.target.value.length <= LIMITS.setting) setSetting(e.target.value); }}
              rows={6}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none bg-muted text-muted-foreground cursor-not-allowed" />
            <div className="text-right text-xs text-gray-400 mt-0.5">{setting.length} / {LIMITS.setting}</div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">开场白 *</label>
            <textarea value={greeting} readOnly={isOfficial} disabled={isOfficial}
              onChange={(e) => { if (e.target.value.length <= LIMITS.greeting) setGreeting(e.target.value); }}
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none bg-muted text-muted-foreground cursor-not-allowed" />
            <div className="text-right text-xs text-gray-400 mt-0.5">{greeting.length} / {LIMITS.greeting}</div>
          </div>
        </section>

        <section>
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 w-full">
            <span className="text-xs">{showAdvanced ? "▼" : "▶"}</span>
            高级定义
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">性格特点</label>
                <textarea value={personality} readOnly={isOfficial} disabled={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.personality) setPersonality(e.target.value); }}
                  rows={4}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none bg-muted text-muted-foreground cursor-not-allowed" />
                <div className="text-right text-xs text-gray-400 mt-0.5">{personality.length} / {LIMITS.personality}</div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">情景设定</label>
                <textarea value={scenario} readOnly={isOfficial} disabled={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.scenario) setScenario(e.target.value); }}
                  rows={4}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none bg-muted text-muted-foreground cursor-not-allowed" />
                <div className="text-right text-xs text-gray-400 mt-0.5">{scenario.length} / {LIMITS.scenario}</div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">对话示例</label>
                <textarea value={dialogueExamples} readOnly={isOfficial} disabled={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.dialogue_examples) setDialogueExamples(e.target.value); }}
                  rows={4}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none font-mono bg-muted text-muted-foreground cursor-not-allowed" />
                <div className="flex justify-between items-center mt-0.5">
                  <span className="text-xs text-gray-400">格式：{"{{char}}:"} / {"{{user}}:"}</span>
                  <span className="text-xs text-gray-400">{dialogueExamples.length} / {LIMITS.dialogue_examples}</span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section>
          <button onClick={() => setShowExtended(!showExtended)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 w-full">
            <span className="text-xs">{showExtended ? "▼" : "▶"}</span>
            扩展字段
          </button>
          {showExtended && (
            <div className="mt-3 space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">昵称</label>
                <input type="text" value={nickname} readOnly={isOfficial} disabled={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.nickname) setNickname(e.target.value); }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 bg-muted text-muted-foreground cursor-not-allowed" />
                <div className="text-right text-xs text-gray-400 mt-0.5">{nickname.length} / {LIMITS.nickname}</div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">群聊开场白</label>
                <textarea value={groupGreeting} readOnly={isOfficial} disabled={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.group_greeting) setGroupGreeting(e.target.value); }}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none bg-muted text-muted-foreground cursor-not-allowed" />
                <div className="text-right text-xs text-gray-400 mt-0.5">{groupGreeting.length} / {LIMITS.group_greeting}</div>
              </div>
            </div>
          )}
        </section>

        <section>
          <button onClick={() => setShowSystem(!showSystem)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 w-full">
            <span className="text-xs">{showSystem ? "▼" : "▶"}</span>
            系统指令
          </button>
          {showSystem && (
            <div className="mt-3 space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Main Prompt</label>
                <textarea value={mainPrompt} readOnly={isOfficial} disabled={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.main_prompt) setMainPrompt(e.target.value); }}
                  rows={6}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none font-mono bg-muted text-muted-foreground cursor-not-allowed" />
                <div className="flex justify-between items-center mt-0.5">
                  <span className="text-xs text-gray-400">{"支持 {{original}}"}</span>
                  <span className="text-xs text-gray-400">{mainPrompt.length} / {LIMITS.main_prompt}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Post History Instructions</label>
                <textarea value={postHistoryInstructions} readOnly={isOfficial} disabled={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.post_history_instructions) setPostHistoryInstructions(e.target.value); }}
                  rows={6}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none font-mono bg-muted text-muted-foreground cursor-not-allowed" />
                <div className="flex justify-between items-center mt-0.5">
                  <span className="text-xs text-gray-400">{"支持 {{original}}"}</span>
                  <span className="text-xs text-gray-400">{postHistoryInstructions.length} / {LIMITS.post_history_instructions}</span>
                </div>
              </div>
            </div>
          )}
        </section>
        {/* ===== Plaza Publish ===== */}
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
                <input type="text" value={oneLineIntro} readOnly={isOfficial} disabled={isOfficial} onChange={(e) => { if (e.target.value.length <= 255) setOneLineIntro(e.target.value); }} placeholder="用一句话介绍你的角色，将在广场中展示" className="w-full bg-transparent py-2 text-sm text-neutral-800 placeholder:text-stone-400 outline-none border-b border-stone-200 focus:border-stone-400 transition-colors duration-300 bg-muted text-muted-foreground cursor-not-allowed" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-800 font-medium">公开发布到广场</span>
                <button
                  onClick={() => setIsPublic(!isPublic)}
                  disabled={isOfficial}
                  className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${isPublic ? "bg-neutral-800" : "bg-stone-200"} disabled:opacity-40`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${isPublic ? "translate-x-5" : ""}`} />
                </button>
              </div>
              {isPublic && (
                <div>
                  <span className="text-xs text-neutral-800 font-medium block mb-3">选择展示字段</span>
                  <div className="space-y-2">
                    {[
                      { key: "name", label: "角色名称" },
                      { key: "setting", label: "角色设定" },
                      { key: "greeting", label: "开场白" },
                      { key: "personality", label: "性格" },
                      { key: "scenario", label: "场景" },
                      { key: "nickname", label: "昵称" },
                    ].map((field) => (
                      <label key={field.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={publicityFields.includes(field.key)}
                          disabled={isOfficial}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPublicityFields([...publicityFields, field.key]);
                            } else {
                              setPublicityFields(publicityFields.filter(f => f !== field.key));
                            }
                          }}
                          className="w-3.5 h-3.5 rounded border-stone-300 text-neutral-800 focus:ring-neutral-500 disabled:opacity-40"
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
        {charVersion > 1 && (
          <p className="text-xs text-gray-400 text-center">版本 {charVersion}</p>
        )}
      </div>

      {!isOfficial && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-3">
          <button onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white disabled:opacity-40">
            {saving ? "保存中..." : "保存修改"}
          </button>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm text-center shadow-lg">
            <h3 className="text-base font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-500 mb-6">删除后无法恢复，确定要删除「{name}」吗？</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 rounded-lg bg-red-500 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-50">
                {deleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
