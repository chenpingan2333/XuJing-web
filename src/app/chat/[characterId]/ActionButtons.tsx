"use client";

interface ActionButtonsProps {
  loading?: boolean;
  activeAction?: string | null;
  onRegenerate?: () => void;
  onContinue?: () => void;
  onSuggest?: () => void;
}

export function ActionButtons({
  loading,
  activeAction,
  onRegenerate,
  onContinue,
  onSuggest,
}: ActionButtonsProps) {
  const isBusy = loading && activeAction !== null;

  return (
    <div className="flex items-center gap-1 mt-1.5 ml-1">
      {/* 重新生成 */}
      <button
        onClick={onRegenerate}
        disabled={isBusy && activeAction !== "regenerate"}
        title="重新生成回复"
        className={
          "flex items-center gap-1 h-7 rounded-md px-2 text-[11px] font-medium transition-colors duration-150 " +
          (activeAction === "regenerate"
            ? "bg-stone-200 text-stone-500"
            : isBusy
              ? "text-stone-200 cursor-not-allowed"
              : "text-stone-400 hover:text-stone-600 hover:bg-stone-200")
        }
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1.5 6.5A4.5 4.5 0 016 2c1.8 0 3.3 1 4 2.5" />
          <path d="M10.5 5.5A4.5 4.5 0 016 10c-1.8 0-3.3-1-4-2.5" />
          <path d="M2.5 2v2.5H5" />
          <path d="M9.5 10V7.5H7" />
        </svg>
        <span>重新生成</span>
      </button>

      {/* 继续 */}
      <button
        onClick={onContinue}
        disabled={isBusy && activeAction !== "continue"}
        title="再回复一句"
        className={
          "flex items-center gap-1 h-7 rounded-md px-2 text-[11px] font-medium transition-colors duration-150 " +
          (activeAction === "continue"
            ? "bg-stone-200 text-stone-500"
            : isBusy
              ? "text-stone-200 cursor-not-allowed"
              : "text-stone-400 hover:text-stone-600 hover:bg-stone-200")
        }
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 6h8M6 2l4 4-4 4" />
        </svg>
        <span>继续</span>
      </button>

      {/* 灵感 — 仅在有 handler 时显示 */}
      {onSuggest && (
        <button
          onClick={onSuggest}
          disabled={isBusy && activeAction !== "suggest"}
          title="AI 灵感回复"
          className={
            "flex items-center gap-1 h-7 rounded-md px-2 text-[11px] font-medium transition-colors duration-150 " +
            (activeAction === "suggest"
              ? "bg-stone-200 text-stone-500"
              : isBusy
                ? "text-stone-200 cursor-not-allowed"
                : "text-stone-400 hover:text-stone-600 hover:bg-stone-200")
          }
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 1.5l.9 2.7 2.8.2-2.2 1.8.7 2.8L6 7.5 3.8 9l.7-2.8-2.2-1.8 2.8-.2L6 1.5z" fill="currentColor" fillOpacity="0.2" />
          </svg>
          <span>灵感</span>
        </button>
      )}
    </div>
  );
}