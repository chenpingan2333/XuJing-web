"use client";

import { useAuth } from "@/lib/use-auth";
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

// TODO: Phase 7.2 — 实现头像上传服务 (POST /api/characters/avatar)
// 当前版本仅保留头像预览功能。

export default function EditCharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading, token, login } = useAuth();
  const [email, setEmail] = useState("");
  const [logging, setLogging] = useState(false);
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

  // Avatar preview only — separate from avatar_url
  const [avatarPreview, setAvatarPreview] = useState("");

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
      if (c.avatarUrl) setAvatarPreview(c.avatarUrl);
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
    // 仅预览，需要上传服务获取 URL
    const reader = new FileReader();
    reader.onload = () => { setAvatarPreview(reader.result as string); };
    reader.readAsDataURL(file);
  };

  if (loading || fetching) {
    return <div className="flex h-dvh items-center justify-center text-gray-400">加载中...</div>;
  }

  if (!user) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6">
        <div className="text-lg font-medium text-gray-800">叙境 Xujing</div>
        <div className="text-sm text-gray-500">AI 恋爱陪伴平台</div>
        <div className="mt-4 w-full max-w-xs space-y-3">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="输入邮箱登录（开发模式）"
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-gray-400" />
          <button onClick={async () => { if (!email) return; setLogging(true); try { await login(email); } catch {} setLogging(false); }}
            disabled={logging || !email}
            className="w-full rounded-lg bg-gray-900 py-2.5 text-sm text-white disabled:opacity-50">
            {logging ? "登录中..." : "登录"}
          </button>
        </div>
      </div>
    );
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
          <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-600">
            官方角色 — 不可编辑或删除
          </div>
        )}

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
                <label className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 cursor-pointer hover:bg-gray-50">
                  更换图片（预览）
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarFile} className="hidden" />
                </label>
              )}
              <span className="text-xs text-gray-400">jpg/png/webp</span>
            </div>
            {!isOfficial && (
              <p className="text-xs text-gray-400 mt-1">头像上传功能即将上线，当前仅支持预览</p>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">角色名称 *</label>
            <input type="text" value={name} readOnly={isOfficial}
              onChange={(e) => { if (e.target.value.length <= LIMITS.name) setName(e.target.value); }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-500" />
            <div className="text-right text-xs text-gray-400 mt-0.5">{name.length} / {LIMITS.name}</div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">角色设定 *</label>
            <textarea value={setting} readOnly={isOfficial}
              onChange={(e) => { if (e.target.value.length <= LIMITS.setting) setSetting(e.target.value); }}
              rows={6}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none disabled:bg-gray-50 disabled:text-gray-500" />
            <div className="text-right text-xs text-gray-400 mt-0.5">{setting.length} / {LIMITS.setting}</div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">开场白 *</label>
            <textarea value={greeting} readOnly={isOfficial}
              onChange={(e) => { if (e.target.value.length <= LIMITS.greeting) setGreeting(e.target.value); }}
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none disabled:bg-gray-50 disabled:text-gray-500" />
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
                <textarea value={personality} readOnly={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.personality) setPersonality(e.target.value); }}
                  rows={4}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none disabled:bg-gray-50 disabled:text-gray-500" />
                <div className="text-right text-xs text-gray-400 mt-0.5">{personality.length} / {LIMITS.personality}</div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">情景设定</label>
                <textarea value={scenario} readOnly={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.scenario) setScenario(e.target.value); }}
                  rows={4}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none disabled:bg-gray-50 disabled:text-gray-500" />
                <div className="text-right text-xs text-gray-400 mt-0.5">{scenario.length} / {LIMITS.scenario}</div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">对话示例</label>
                <textarea value={dialogueExamples} readOnly={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.dialogue_examples) setDialogueExamples(e.target.value); }}
                  rows={4}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none font-mono disabled:bg-gray-50 disabled:text-gray-500" />
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
                <input type="text" value={nickname} readOnly={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.nickname) setNickname(e.target.value); }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-500" />
                <div className="text-right text-xs text-gray-400 mt-0.5">{nickname.length} / {LIMITS.nickname}</div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">群聊开场白</label>
                <textarea value={groupGreeting} readOnly={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.group_greeting) setGroupGreeting(e.target.value); }}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none disabled:bg-gray-50 disabled:text-gray-500" />
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
                <textarea value={mainPrompt} readOnly={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.main_prompt) setMainPrompt(e.target.value); }}
                  rows={6}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none font-mono disabled:bg-gray-50 disabled:text-gray-500" />
                <div className="flex justify-between items-center mt-0.5">
                  <span className="text-xs text-gray-400">{"支持 {{original}}"}</span>
                  <span className="text-xs text-gray-400">{mainPrompt.length} / {LIMITS.main_prompt}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Post History Instructions</label>
                <textarea value={postHistoryInstructions} readOnly={isOfficial}
                  onChange={(e) => { if (e.target.value.length <= LIMITS.post_history_instructions) setPostHistoryInstructions(e.target.value); }}
                  rows={6}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none font-mono disabled:bg-gray-50 disabled:text-gray-500" />
                <div className="flex justify-between items-center mt-0.5">
                  <span className="text-xs text-gray-400">{"支持 {{original}}"}</span>
                  <span className="text-xs text-gray-400">{postHistoryInstructions.length} / {LIMITS.post_history_instructions}</span>
                </div>
              </div>
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