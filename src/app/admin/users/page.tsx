"use client";
/**
 * 管理后台 — 用户管理
 *
 * ⚠️  仅限 admin 角色可操作。
 *     所有写操作经 POST /api/admin/users（服务端双重校验）。
 *     敏感操作附带二次确认弹窗。
 */

import { useAuth } from "@/lib/use-auth";
import { useState, useEffect, useCallback } from "react";

interface UserRow {
  id: string;
  uid: number;
  email: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "BANNED";
  vipExpiresAt: string | null;
  hasPurchasedVip: boolean;
  starDiamonds: number;
  createdAt: string;
}

const VIP_OPTIONS = [
  { days: 2, label: "2 天" },
  { days: 7, label: "7 天" },
  { days: 30, label: "30 天" },
  { days: 90, label: "90 天" },
  { days: 365, label: "365 天" },
] as const;

export default function AdminUsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [vipModal, setVipModal] = useState<{ userId: string; email: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const fetchUsers = useCallback(async (q?: string) => {
    if (!token) return;
    setFetching(true);
    try {
      const url = q
        ? "/api/admin/users?q=" + encodeURIComponent(q)
        : "/api/admin/users";
      const res = await fetch(url, {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (data.success) setUsers(data.data as UserRow[]);
    } catch { /* ignore */ }
    setFetching(false);
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSearch = () => fetchUsers(query.trim() || undefined);

  const execAction = async (userId: string, action: string, value?: unknown) => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ userId, action, value }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("操作成功");
        fetchUsers(query.trim() || undefined);
      } else {
        showToast("操作失败: " + (data.error || "未知错误"));
      }
    } catch {
      showToast("网络错误，请重试");
    }
    setConfirm(null);
    setVipModal(null);
  };

  const isVip = (u: UserRow) =>
    u.vipExpiresAt && new Date(u.vipExpiresAt) > new Date();

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  return (
    <div className="px-8 pt-12 pb-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">用户管理</h2>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="搜索邮箱…"
          className="flex-1 max-w-sm rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-stone-300 outline-none transition-colors focus:border-stone-400"
        />
        <button
          onClick={handleSearch}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-stone-50 hover:bg-neutral-800 transition-colors"
        >
          搜索
        </button>
      </div>

      {/* Table */}
      {fetching ? (
        <div className="text-sm text-stone-300 py-12 text-center">加载中…</div>
      ) : users.length === 0 ? (
        <div className="text-sm text-stone-300 py-12 text-center">暂无用户</div>
      ) : (
        <div className="rounded-xl border border-stone-100 bg-white overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-7 gap-2 px-4 py-2.5 bg-stone-50 text-[11px] font-medium text-stone-400 uppercase tracking-wider">
            <span>UID</span>
            <span className="col-span-2">邮箱</span>
            <span>角色</span>
            <span>VIP</span>
            <span>状态</span>
            <span>操作</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-stone-50">
            {users.map((u) => {
              const isVipActive = isVip(u);
              const isBanned = u.status === "BANNED";
              return (
                <div
                  key={u.id}
                  className={
                    "grid grid-cols-7 gap-2 px-4 py-3 text-xs items-center transition-colors " +
                    (isBanned ? "bg-red-50/30" : "hover:bg-stone-50/50")
                  }
                >
                  <span className="text-stone-500 font-mono text-[11px]">{u.uid}</span>
                  <span className="col-span-2 text-stone-700 truncate">{u.email}</span>
                  <span>
                    <span
                      className={
                        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium " +
                        (u.role === "ADMIN"
                          ? "bg-red-100 text-red-700"
                          : "bg-stone-100 text-stone-500")
                      }
                    >
                      {u.role}
                    </span>
                  </span>
                  <span>
                    {isVipActive ? (
                      <span className="text-green-600 font-medium text-[11px]">
                        VIP {fmtDate(u.vipExpiresAt)}
                      </span>
                    ) : (
                      <span className="text-stone-300 text-[11px]">—</span>
                    )}
                  </span>
                  <span>
                    <span
                      className={
                        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium " +
                        (isBanned
                          ? "bg-red-100 text-red-700"
                          : "bg-green-50 text-green-600")
                      }
                    >
                      {u.status}
                    </span>
                  </span>
                  <span>
                    <div className="flex items-center gap-1">
                      {/* VIP 按钮 */}
                      {!isVipActive ? (
                        <button
                          onClick={() => setVipModal({ userId: u.id, email: u.email })}
                          className="rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-700 hover:bg-amber-100 transition-colors"
                          title="发放 VIP"
                        >
                          +VIP
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            setConfirm({
                              title: "撤销 VIP",
                              message: "确定撤销 " + u.email + " 的 VIP 权限？",
                              onConfirm: () => execAction(u.id, "revoke_vip"),
                            })
                          }
                          className="rounded-md bg-stone-100 px-2 py-1 text-[10px] text-stone-500 hover:bg-stone-200 transition-colors"
                          title="撤销 VIP"
                        >
                          -VIP
                        </button>
                      )}

                      {/* 封禁/解封 */}
                      <button
                        onClick={() =>
                          setConfirm({
                            title: isBanned ? "解封用户" : "封禁用户",
                            message: isBanned
                              ? "确定解封 " + u.email + "？"
                              : "确定封禁 " + u.email + "？封禁后该用户无法登录。",
                            onConfirm: () =>
                              execAction(u.id, "set_status", isBanned ? "ACTIVE" : "BANNED"),
                          })
                        }
                        className={
                          "rounded-md px-2 py-1 text-[10px] transition-colors " +
                          (isBanned
                            ? "bg-green-50 text-green-700 hover:bg-green-100"
                            : "bg-red-50 text-red-600 hover:bg-red-100")
                        }
                        title={isBanned ? "解封" : "封禁"}
                      >
                        {isBanned ? "解封" : "封禁"}
                      </button>

                      {/* 管理员提升/降级 */}
                      {u.role !== "ADMIN" ? (
                        <button
                          onClick={() =>
                            setConfirm({
                              title: "提升为管理员",
                              message: "确定将 " + u.email + " 提升为管理员？该操作授予后台管理权限。",
                              onConfirm: () => execAction(u.id, "set_role", "ADMIN"),
                            })
                          }
                          className="rounded-md bg-stone-100 px-2 py-1 text-[10px] text-stone-500 hover:bg-stone-200 transition-colors"
                          title="提升为管理员"
                        >
                          管理
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            setConfirm({
                              title: "降级为普通用户",
                              message: "确定将 " + u.email + " 降级为普通用户？",
                              onConfirm: () => execAction(u.id, "set_role", "USER"),
                            })
                          }
                          className="rounded-md bg-red-50 px-2 py-1 text-[10px] text-red-500 hover:bg-red-100 transition-colors"
                          title="降级"
                        >
                          降级
                        </button>
                      )}
                    </div>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── VIP 发放弹窗 ─── */}
      {vipModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={() => setVipModal(null)}
        >
          <div
            className="rounded-xl bg-white shadow-lg border border-stone-100 p-5 w-72"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">发放 VIP</h3>
            <p className="text-[11px] text-stone-400 mb-4 truncate">{vipModal.email}</p>
            <div className="space-y-2">
              {VIP_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => execAction(vipModal.userId, "grant_vip", opt.days)}
                  className="w-full rounded-lg border border-stone-100 px-3 py-2 text-xs text-stone-700 hover:bg-amber-50 hover:border-amber-200 transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setVipModal(null)}
              className="w-full mt-3 rounded-lg bg-stone-50 py-2 text-xs text-stone-400 hover:bg-stone-100 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* ─── 二次确认弹窗 ─── */}
      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={() => setConfirm(null)}
        >
          <div
            className="rounded-xl bg-white shadow-lg border border-stone-100 p-5 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">{confirm.title}</h3>
            <p className="text-xs text-stone-500 mb-5 leading-relaxed">{confirm.message}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 rounded-lg border border-stone-100 py-2 text-xs text-stone-500 hover:bg-stone-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirm.onConfirm}
                className="flex-1 rounded-lg bg-neutral-900 py-2 text-xs font-medium text-stone-50 hover:bg-neutral-800 transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast ─── */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className="rounded-full bg-neutral-900 px-5 py-2.5 text-xs font-medium text-stone-50 shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}