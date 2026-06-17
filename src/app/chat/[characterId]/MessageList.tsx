"use client";

import { useEffect, useRef } from "react";
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
  onRewriteUser?: (message: Message) => void;
  onRewriteAi?: (message: Message) => void;
}

export function MessageList({
  messages,
  loading,
  activeAction,
  onRegenerate,
  onContinue,
  onSuggest,
  onRewriteUser,
  onRewriteAi,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  console.log("[MessageList] rendering", messages.length, "messages, first:", messages[0]?.content?.slice(0, 30));
  if (messages.length === 0) {
    console.log("[MessageList] returning null — empty messages");
    return null;
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      {messages.map((msg, idx) => {
        const isLastAi = msg.role === "ASSISTANT" && idx === lastAiIndex(messages);
        const isLastUser = msg.role === "USER" && idx === lastUserIndex(messages);
        const showActions = isLastAi || isLastUser;
        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            showActions={showActions}
            isUserLastAction={isLastUser}
            loading={loading}
            activeAction={activeAction}
            onRegenerate={onRegenerate}
            onContinue={onContinue}
            onSuggest={onSuggest}
            onRewrite={isLastUser && onRewriteUser ? () => onRewriteUser(msg) : isLastAi && onRewriteAi ? () => onRewriteAi(msg) : undefined}
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

function lastUserIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "USER") return i;
  }
  return -1;
}

interface BubbleProps {
  message: Message;
  showActions: boolean;
  isUserLastAction?: boolean;
  loading?: boolean;
  activeAction?: string | null;
  onRegenerate?: () => void;
  onContinue?: () => void;
  onSuggest?: () => void;
  onRewrite?: () => void;
}

function MessageBubble({
  message,
  showActions,
  isUserLastAction,
  loading,
  activeAction,
  onRegenerate,
  onContinue,
  onSuggest,
  onRewrite,
}: BubbleProps) {
  const isUser = message.role === "USER";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="flex flex-col max-w-[75%]">
        <div
          className={
            isUser
              ? "rounded-xl px-4 py-2.5 bg-neutral-900 text-stone-50 text-[15px] leading-relaxed"
              : "rounded-xl px-4 py-2.5 bg-white/85 text-neutral-900 text-[15px] leading-relaxed border-l-2 border-stone-300"
          }
        >
          {message.content || (
            <span className="text-stone-300 italic">...</span>
          )}
        </div>

        {showActions && (
          isUserLastAction ? (
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={onRewrite}
                disabled={loading}
                className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-40"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.05 10.476a.75.75 0 0 0-.188.335l-.834 2.89a.25.25 0 0 0 .306.306l2.89-.834a.75.75 0 0 0 .335-.188l7.963-7.963a1.75 1.75 0 0 0 0-2.475Zm-1.414 1.06a.25.25 0 0 1 .354 0l.596.596a.25.25 0 0 1 0 .354L5.94 12.018l-1.89.545.545-1.89 8.479-8.5Z" />
                </svg>
                <span>改写</span>
              </button>
            </div>
          ) : (
            <ActionButtons
              loading={loading}
              activeAction={activeAction}
              onRegenerate={onRegenerate}
              onContinue={onContinue}
              onSuggest={onSuggest}
              onRewrite={onRewrite}
            />
          )
        )}
      </div>
    </div>
  );
}