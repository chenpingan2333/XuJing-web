"use client";

interface Message {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

interface MessageListProps {
  messages: Message[];
  /** Disable all action buttons (global loading/streaming lock) */
  loading?: boolean;
  /** Which action is currently active: "regenerate" | "continue" | "suggest" | null */
  activeAction?: string | null;
  onRegenerate?: () => void;
  onContinue?: () => void;
  onSuggest?: () => void;
}

export function MessageList({
  messages,
  loading,
  activeAction,
  onRegenerate,
  onContinue,
  onSuggest,
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-stone-300">开始对话吧</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      {messages.map((msg, idx) => {
        const isLastAi = msg.role === "ASSISTANT" && idx === lastAiIndex(messages);
        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            showActions={isLastAi}
            loading={loading}
            activeAction={activeAction}
            onRegenerate={onRegenerate}
            onContinue={onContinue}
            onSuggest={onSuggest}
          />
        );
      })}
      <div className="h-4" />
    </div>
  );
}

/** Find the index of the last ASSISTANT message */
function lastAiIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "ASSISTANT") return i;
  }
  return -1;
}

interface BubbleProps {
  message: Message;
  showActions: boolean;
  loading?: boolean;
  activeAction?: string | null;
  onRegenerate?: () => void;
  onContinue?: () => void;
  onSuggest?: () => void;
}

function MessageBubble({
  message,
  showActions,
  loading,
  activeAction,
  onRegenerate,
  onContinue,
  onSuggest,
}: BubbleProps) {
  const isUser = message.role === "USER";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="flex flex-col max-w-[75%]">
        {/* Bubble */}
        <div
          className={
            isUser
              ? "rounded-xl px-4 py-2.5 bg-neutral-900 text-stone-50 text-[15px] leading-relaxed"
              : "rounded-xl px-4 py-2.5 bg-stone-100 text-neutral-900 text-[15px] leading-relaxed border-l-2 border-stone-300"
          }
        >
          {message.content || (
            <span className="text-stone-300 italic">...</span>
          )}
        </div>

        {/* AI action buttons — only on the last AI message */}
        {showActions && (
          <div className="flex gap-1 mt-1.5 ml-1">
            <ActionButton
              label="重新生成回复"
              activeLabel="重新生成..."
              action="regenerate"
              activeAction={activeAction}
              loading={loading}
              onClick={onRegenerate}
              char="↻"
            />
            <ActionButton
              label="再回复一句"
              activeLabel="继续..."
              action="continue"
              activeAction={activeAction}
              loading={loading}
              onClick={onContinue}
              char="⏩"
            />
            <ActionButton
              label="AI灵感回复"
              activeLabel="生成中..."
              action="suggest"
              activeAction={activeAction}
              loading={loading}
              onClick={onSuggest}
              char="💬"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  activeLabel,
  action,
  activeAction,
  loading,
  onClick,
  char,
}: {
  label: string;
  activeLabel: string;
  action: string;
  activeAction?: string | null;
  loading?: boolean;
  onClick?: () => void;
  char: string;
}) {
  const isActive = activeAction === action;
  const disabled = loading && !isActive;

  return (
    <button
      onClick={onClick}
      disabled={disabled || !onClick}
      title={isActive ? activeLabel : label}
      className={
        "flex items-center gap-0.5 h-7 rounded-md px-1.5 text-xs transition-colors " +
        (isActive
          ? "text-stone-500 bg-stone-100"
          : disabled
            ? "text-stone-200 cursor-not-allowed"
            : "text-stone-300 hover:text-stone-500 hover:bg-stone-100")
      }
    >
      <span>{char}</span>
      {isActive && <span className="text-[10px] text-stone-400">...</span>}
    </button>
  );
}