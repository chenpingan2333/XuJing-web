"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toAbsoluteUrl } from "@/lib/image-utils";

interface Character {
  id: string;
  name: string;
  avatarUrl: string;
  oneLineIntro: string;
  fakeChats: number;
  fakeLikes: number;
}

interface CreatorInfo {
  id: string;
  nickname: string;
  username?: string;
  avatarUrl: string | null;
}

interface CreatorGroup {
  creator: CreatorInfo;
  characters: Character[];
}

export default function PlazaPage() {
  const [activeTab, setActiveTab] = useState<"characters" | "creators">("characters");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [creators, setCreators] = useState<CreatorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function loadPlazaData() {
      setLoading(true);
      try {
        const token = localStorage.getItem("token") || localStorage.getItem("xujing_token");
        const res = await fetch(`/api/plaza?tab=${activeTab}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const d = await res.json();
        if (d.success) {
          const items = d.data?.items || [];
          if (activeTab === "characters") setCharacters(items);
          else setCreators(items);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadPlazaData();
  }, [activeTab]);

  const handleQuickStart = async (e: React.MouseEvent, charId: string) => {
    e.stopPropagation();
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("xujing_token");
      await fetch(`/api/chat/${charId}/quick-start`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (err) {
      console.error(err);
    }
    router.push(`/chat/${charId}`);
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-24 select-none">
      <div className="p-6 sticky top-0 bg-stone-950/80 backdrop-blur-md z-40 border-b border-stone-900 flex flex-col gap-4">
        <h1 className="text-2xl font-black tracking-widest text-center text-amber-400">探索新境</h1>
        <div className="flex bg-stone-900 rounded-xl p-1 max-w-xs mx-auto w-full border border-stone-800">
          <button
            onClick={() => setActiveTab("characters")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "characters" ? "bg-stone-800 text-amber-400 shadow-md" : "text-stone-400"
            }`}
          >
            角色
          </button>
          <button
            onClick={() => setActiveTab("creators")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "creators" ? "bg-stone-800 text-amber-400 shadow-md" : "text-stone-400"
            }`}
          >
            创作者
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64 text-stone-500 text-xs animate-pulse">正在构筑新境景观...</div>
      ) : activeTab === "characters" ? (
        <div className="grid grid-cols-2 gap-3 p-3 max-w-4xl mx-auto">
          {characters.map((char) => (
            <div
              key={char.id}
              onClick={() => setSelectedChar(char)}
              className="relative aspect-[3/4] bg-stone-900 rounded-2xl overflow-hidden group shadow-lg border border-stone-900 cursor-pointer"
            >
              <Image
                src={char.avatarUrl ? char.avatarUrl : "/favicon.svg"}
                alt={char.name}
                fill
                sizes="(max-width: 768px) 50vw, 400px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/20 to-transparent flex flex-col justify-end p-3">
                <h3 className="font-bold text-sm text-stone-100 truncate">{char.name}</h3>
                <p className="text-[11px] text-stone-400 truncate">{char.oneLineIntro || "新境的神秘居民..."}</p>
                <div className="flex items-center gap-2 text-[9px] text-stone-500 font-mono">
                  <span>👥 {char.fakeChats || 100}</span>
                  <span>❤️ {char.fakeLikes || 10}</span>
                </div>
              </div>
              <button
                onClick={(e) => handleQuickStart(e, char.id)}
                className="absolute right-3 bottom-3 w-8 h-8 rounded-full bg-amber-400 text-stone-950 flex items-center justify-center shadow-md text-xs font-bold"
              >
                💬
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-6 p-4 max-w-4xl mx-auto">
          {creators.map((group, idx) => (
            <div key={group.creator?.id || idx} className="border-b border-stone-900 pb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-xs text-stone-300">@{group.creator?.nickname || group.creator?.username || "神秘创作者"}</span>
                <button className="px-3 py-1 text-[10px] font-bold border border-amber-400/30 text-amber-400 rounded-full">
                  关注
                </button>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none whitespace-nowrap">
                {group.characters?.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedChar(c)}
                    className="inline-block w-24 bg-stone-900 rounded-xl overflow-hidden border border-stone-800 cursor-pointer relative"
                  >
                    <Image src={toAbsoluteUrl(c.avatarUrl || "/favicon.svg")} className="object-cover" width={96} height={96} alt="" />
                    <div className="p-1.5 text-center">
                      <div className="text-[10px] font-bold text-stone-300 truncate">{c.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedChar && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center animate-fade-in" onClick={() => setSelectedChar(null)}>
          <div className="bg-stone-900 w-full max-w-md rounded-t-3xl border-t border-stone-800 p-6 flex flex-col gap-4 max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-4 items-center">
              <Image src={toAbsoluteUrl(selectedChar.avatarUrl || "/favicon.svg")} className="rounded-xl object-cover shadow-md" width={48} height={48} alt="" />
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-stone-100 truncate">{selectedChar.name}</h2>
                <p className="text-xs text-stone-400 truncate">{selectedChar.oneLineIntro || "新境的神秘居民..."}</p>
              </div>
            </div>
            <button
              onClick={(e) => handleQuickStart(e, selectedChar.id)}
              className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 font-black text-stone-950 rounded-xl text-center text-xs tracking-widest shadow-lg shadow-amber-400/10"
            >
              与她开聊 (CONNECT)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
