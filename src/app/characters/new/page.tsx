"use client";

import { useAuth } from "@/lib/use-auth";
import { useState } from "react";

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
// 当前版本仅保留头像预览功能，avatar_url 字段留空。
// 上传服务实现后，前端调用上传 API 获取真实 URL 再填入 avatar_url。

export default function NewCharacterPage() {
  const { user, loading, token, login } = useAuth();
  const [email, setEmail] = useState("");
  const [logging, setLogging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExtended, setShowExtended] = useState(false);
  const [showSystem, setShowSystem] = useState(false);

  // Avatar preview only — not submitted as avatar_url
  const [avatarPreview, setAvatarPreview] = useState("");

  if (loading) {
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

  const canSave = name.trim() && setting.trim() && greeting.trim();

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("头像文件不能超过 10MB"); return; }
    // 仅预览，不设置 avatar_url（需要上传服务）
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
          name, setting, greeting,
          avatar_url: avatarUrl || undefined,
          background_url: backgroundUrl || undefined,
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
      window.location.href = "/characters";
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { window.location.href = "/characters"; }} className="text-gray-400 text-lg">&larr;</button>
          <h1 className="text-lg font-semibold text-gray-900">创建角色</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
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
              <label className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 cursor-pointer hover:bg-gray-50">
                选择图片（预览）
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarFile} className="hidden" />
              </label>
              <span className="text-xs text-gray-400">jpg/png/webp, &le;10MB</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">头像上传功能即将上线，当前仅支持预览</p>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">角色名称 *</label>
            <input type="text" value={name} onChange={(e) => { if (e.target.value.length <= LIMITS.name) setName(e.target.value); }}
              placeholder="为你的角色取一个名字"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
            <div className="text-right text-xs text-gray-400 mt-0.5">{name.length} / {LIMITS.name}</div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">角色设定 *</label>
            <textarea value={setting} onChange={(e) => { if (e.target.value.length <= LIMITS.setting) setSetting(e.target.value); }}
              placeholder="描述角色的外貌、性格、背景故事..."
              rows={6}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none" />
            <div className="text-right text-xs text-gray-400 mt-0.5">{setting.length} / {LIMITS.setting}</div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">开场白 *</label>
            <textarea value={greeting} onChange={(e) => { if (e.target.value.length <= LIMITS.greeting) setGreeting(e.target.value); }}
              placeholder="角色第一次和你说话时会说..."
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none" />
            <div className="flex justify-between items-center mt-0.5">
              <span className="text-xs text-gray-400">用 &lt;START&gt; 分隔多个开场白</span>
              <span className="text-xs text-gray-400">{greeting.length} / {LIMITS.greeting}</span>
            </div>
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
                <textarea value={personality} onChange={(e) => { if (e.target.value.length <= LIMITS.personality) setPersonality(e.target.value); }}
                  placeholder="角色的性格、说话方式、喜好..."
                  rows={4}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none" />
                <div className="text-right text-xs text-gray-400 mt-0.5">{personality.length} / {LIMITS.personality}</div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">情景设定</label>
                <textarea value={scenario} onChange={(e) => { if (e.target.value.length <= LIMITS.scenario) setScenario(e.target.value); }}
                  placeholder="当前对话发生的场景..."
                  rows={4}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none" />
                <div className="text-right text-xs text-gray-400 mt-0.5">{scenario.length} / {LIMITS.scenario}</div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">对话示例</label>
                <textarea value={dialogueExamples} onChange={(e) => { if (e.target.value.length <= LIMITS.dialogue_examples) setDialogueExamples(e.target.value); }}
                  placeholder={"{{char}}: 你好，我是...\n{{user}}: 你好！很高兴认识你"}
                  rows={4}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none font-mono" />
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
                <input type="text" value={nickname} onChange={(e) => { if (e.target.value.length <= LIMITS.nickname) setNickname(e.target.value); }}
                  placeholder="角色的昵称或别名"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
                <div className="text-right text-xs text-gray-400 mt-0.5">{nickname.length} / {LIMITS.nickname}</div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">群聊开场白</label>
                <textarea value={groupGreeting} onChange={(e) => { if (e.target.value.length <= LIMITS.group_greeting) setGroupGreeting(e.target.value); }}
                  placeholder="群聊场景下的开场白（当前版本仅存储，不接入群聊）"
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none" />
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
                <textarea value={mainPrompt} onChange={(e) => { if (e.target.value.length <= LIMITS.main_prompt) setMainPrompt(e.target.value); }}
                  placeholder={"自定义系统提示词，使用 {{original}} 引用默认提示词"}
                  rows={6}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none font-mono" />
                <div className="flex justify-between items-center mt-0.5">
                  <span className="text-xs text-gray-400">{"支持 {{original}}"}</span>
                  <span className="text-xs text-gray-400">{mainPrompt.length} / {LIMITS.main_prompt}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Post History Instructions</label>
                <textarea value={postHistoryInstructions} onChange={(e) => { if (e.target.value.length <= LIMITS.post_history_instructions) setPostHistoryInstructions(e.target.value); }}
                  placeholder={"在对话历史之后添加的指令，支持 {{original}}"}
                  rows={6}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none font-mono" />
                <div className="flex justify-between items-center mt-0.5">
                  <span className="text-xs text-gray-400">{"支持 {{original}}"}</span>
                  <span className="text-xs text-gray-400">{postHistoryInstructions.length} / {LIMITS.post_history_instructions}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-3">
        <button onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white disabled:opacity-40">
          {saving ? "保存中..." : "保存角色"}
        </button>
      </div>
    </div>
  );
}