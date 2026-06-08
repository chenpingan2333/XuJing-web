"use client";

interface CharacterHeaderProps {
  name: string;
  avatarUrl?: string;
  memoryUsed: number;
  memoryLimit: number;
}

export function CharacterHeader({ name, avatarUrl, memoryUsed, memoryLimit }: CharacterHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-stone-200 bg-stone-50">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-lg bg-stone-200 overflow-hidden flex-shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-400 text-sm font-medium">
            {name.charAt(0)}
          </div>
        )}
      </div>

      {/* Name + Memory */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-neutral-900 truncate">{name}</div>
        <div className="text-xs text-stone-400 mt-0.5">
          记忆 {memoryUsed}/{memoryLimit}
        </div>
      </div>
    </div>
  );
}