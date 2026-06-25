"use client";

import Image from "next/image";
import { toAbsoluteUrl } from "@/lib/image-utils";

interface CharacterHeaderProps {
  name: string;
  avatarUrl?: string | null;
  memoryUsed: number;
  memoryLimit: number;
  onMenuClick?: () => void;
}

export function CharacterHeader({ name, avatarUrl, memoryUsed, memoryLimit, onMenuClick }: CharacterHeaderProps) {
  const safeName = name ?? "";
  const safeAvatar = avatarUrl ?? "";

  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-stone-200 bg-white/60 backdrop-blur-md">
      <div className="relative w-9 h-9 rounded-lg bg-stone-200 overflow-hidden flex-shrink-0">
        {safeAvatar ? (
          <Image
            src={toAbsoluteUrl(safeAvatar)}
            alt={safeName}
            fill
            className="object-cover"
            sizes="36px"
            onError={() => {
              /* Image 组件会自动隐藏失败图片，无需手动处理 */
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-400 text-sm font-medium">
            {safeName.charAt(0) || "?"}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-neutral-900 truncate">
          {safeName || "—"}
        </div>
        <div className="text-xs text-stone-400 mt-0.5">
          记忆 {memoryUsed ?? 0}/{memoryLimit ?? 100}
        </div>
      </div>
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="9" cy="9" r="1.25" />
            <circle cx="9" cy="3.5" r="1.25" />
            <circle cx="9" cy="14.5" r="1.25" />
          </svg>
        </button>
      )}
    </div>
  );
}