"use client";
/**
 * 管理后台布局
 *
 * ⚠️  仅限 admin 角色访问。
 *     非 admin 用户立即重定向至首页。
 *     该检查为客户端渲染层防护；服务端 API 另有独立校验。
 */

import { useAuth } from "@/lib/use-auth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || user.role !== "ADMIN")) {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-sm text-stone-300">加载中...</span>
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <span className="text-sm text-stone-300">跳转中...</span>
      </div>
    );
  }

  const links = [
    { href: "/admin", label: "概览", exact: true },
    { href: "/admin/users", label: "用户管理", exact: false },
  ];

  return (
    <div className="flex h-dvh bg-stone-50">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r border-stone-100 bg-white flex flex-col">
        <div className="px-5 pt-12 pb-6">
          <h1 className="text-sm font-semibold tracking-tight text-neutral-900">叙境 管理后台</h1>
          <p className="mt-1 text-[11px] text-stone-400">Admin Console</p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {links.map((link) => {
            const active = link.exact
              ? pathname === link.href
              : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  "block rounded-lg px-3 py-2 text-sm transition-colors duration-150 " +
                  (active
                    ? "bg-neutral-900 text-stone-50 font-medium"
                    : "text-stone-500 hover:bg-stone-50 hover:text-stone-800")
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-6">
          <Link
            href="/"
            className="block rounded-lg px-3 py-2 text-sm text-stone-400 hover:bg-stone-50 hover:text-stone-600 transition-colors"
          >
            ← 返回前台
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}