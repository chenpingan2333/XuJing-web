"use client";
/**
 * 管理后台 — 概览
 * ⚠️  仅限 admin 角色。
 */

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect } from "react";
import Link from "next/link";

interface Stats {
  totalUsers: number;
  vipUsers: number;
  bannedUsers: number;
  adminUsers: number;
}

export default function AdminDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/admin/users", { headers: { Authorization: "Bearer " + token } })
      .then((r) => r.json())
      .then((d) => {
        const users: any[] = d.data || d;
        if (Array.isArray(users)) {
          const now = new Date();
          setStats({
            totalUsers: users.length,
            vipUsers: users.filter((u: any) => u.vipExpiresAt && new Date(u.vipExpiresAt) > now).length,
            bannedUsers: users.filter((u: any) => u.status === "BANNED").length,
            adminUsers: users.filter((u: any) => u.role === "ADMIN").length,
          });
        }
      })
      .catch(() => {});
  }, [token]);

  const cards = [
    { label: "用户总数", value: stats?.totalUsers ?? "…", href: "/admin/users" },
    { label: "VIP 用户", value: stats?.vipUsers ?? "…", href: "/admin/users" },
    { label: "封禁用户", value: stats?.bannedUsers ?? "…", href: "/admin/users" },
    { label: "管理员", value: stats?.adminUsers ?? "…", href: "/admin/users" },
  ];

  return (
    <div className="px-8 pt-12 pb-8 overflow-y-auto">
      <h2 className="text-lg font-semibold tracking-tight text-neutral-900 mb-6">概览</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-xl bg-white border border-stone-100 px-5 py-4 hover:border-stone-200 hover:bg-stone-50/50 transition-all"
          >
            <div className="text-[11px] text-stone-400 uppercase tracking-wider mb-1">{c.label}</div>
            <div className="text-2xl font-semibold text-neutral-900">{c.value}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}