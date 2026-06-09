"use client";

import { ActionButtons } from "./ActionButtons";

interface Message {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

interface MessageListProps {
  messages: Message[];
  loading?: boolean;
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
    return null;
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

        {showActions && (
          <ActionButtons
            loading={loading}
            activeAction={activeAction}
            onRegenerate={onRegenerate}
            onContinue={onContinue}
            onSuggest={onSuggest}
          />
        )}
      </div>
    </div>
  );
}