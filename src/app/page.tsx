"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TermsModal from "@/components/TermsModal";

export default function WelcomePage() {
  const router = useRouter();
  const [showTerms, setShowTerms] = useState(false);

  const handleAgree = () => {
    setShowTerms(false);
    router.push("/login");
  };

  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-stone-50 px-6 select-none">
      {/* Logo */}
      <img
        src="/logo.png"
        alt="叙境"
        className="w-28 h-28 object-contain opacity-90"
      />

      {/* Tagline */}
      <p className="mt-6 text-sm text-stone-400 tracking-wider">
        ta也许不记得世界，但一定记得你
      </p>

      {/* Divider */}
      <div className="mt-12 w-6 h-px bg-stone-200" />

      {/* Enter button */}
      <button
        onClick={() => setShowTerms(true)}
        className="mt-10 rounded-xl bg-neutral-900 px-10 py-2.5 text-sm font-medium text-stone-50 hover:bg-neutral-800 transition-colors"
      >
        进入叙境
      </button>

      {/* Terms Modal */}
      <TermsModal
        open={showTerms}
        onAgree={handleAgree}
        onDisagree={() => setShowTerms(false)}
      />
    </div>
  );
}
