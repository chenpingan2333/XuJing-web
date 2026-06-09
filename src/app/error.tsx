"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RouteError]", error);
  }, [error]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-stone-50 px-6 select-none">
      <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mb-6">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 className="text-base font-medium text-neutral-800 mb-2">
        页面加载遇到了一点小麻烦
      </h2>
      <p className="text-sm text-stone-400 text-center leading-relaxed max-w-xs mb-8">
        请尝试刷新页面，或清除浏览器缓存后重试
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => {
            try { localStorage.clear(); } catch {}
            try { sessionStorage.clear(); } catch {}
            window.location.reload();
          }}
          className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-stone-50 hover:bg-neutral-800 active:scale-[0.98] transition-all"
        >
          清除缓存并刷新
        </button>
        <button
          onClick={reset}
          className="rounded-lg border border-stone-200 bg-white px-5 py-2.5 text-sm text-stone-600 hover:bg-stone-50 active:scale-[0.98] transition-all"
        >
          重试
        </button>
      </div>
      <p className="text-xs text-stone-300 mt-10">
        若问题持续，请尝试更换浏览器或联系主理人
      </p>
    </div>
  );
}