"use client";

interface CharacterHeaderProps {
  name: string;
  avatarUrl?: string | null;
  memoryUsed: number;
  memoryLimit: number;
}

export function CharacterHeader({ name, avatarUrl, memoryUsed, memoryLimit }: CharacterHeaderProps) {
  const safeName = name ?? "";
  const safeAvatar = avatarUrl ?? "";

  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-stone-200 bg-stone-50">
      <div className="w-9 h-9 rounded-lg bg-stone-200 overflow-hidden flex-shrink-0">
        {safeAvatar ? (
          <img
            src={safeAvatar}
            alt={safeName}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
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
    </div>
  );
}
