"use client";

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";

export interface InputBarHandle {
  fillText: (text: string) => void;
}

interface InputBarProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export const InputBar = forwardRef<InputBarHandle, InputBarProps>(
  function InputBar({ onSend, disabled }, ref) {
    const [value, setValue] = useState("");
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Expose fillText to parent
    useImperativeHandle(ref, () => ({
      fillText: (text: string) => {
        setValue(text);
        // Focus and move cursor to end
        requestAnimationFrame(() => {
          const el = inputRef.current;
          if (el) {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
          }
        });
      },
    }));

    // Auto-resize textarea
    useEffect(() => {
      const el = inputRef.current;
      if (el) {
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 120) + "px";
      }
    }, [value]);

    const handleSend = () => {
      const trimmed = value.trim();
      if (!trimmed || disabled) return;
      onSend(trimmed);
      setValue("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    };

    return (
      <div className="px-4 py-3 border-t border-stone-200 bg-stone-50">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="随便聊聊……"
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-[15px] leading-relaxed text-neutral-900 placeholder:text-stone-300 outline-none focus:border-stone-400 disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-neutral-900 text-stone-50 text-sm font-medium flex items-center justify-center hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            发送
          </button>
        </div>
      </div>
    );
  }
);