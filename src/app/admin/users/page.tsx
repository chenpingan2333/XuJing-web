"use client";
/**
 * 管理后台 — 用户管理（响应式重构）
 *
 * ⚠️  仅限 admin 角色可操作。
 *     所有写操作经 POST /api/admin/users（服务端双重校验）。
 *     敏感操作附带二次确认弹窗。
 *
 * 响应式策略：
 *   ≥768px  表格布局（grid-cols-7）
 *   <768px   卡片布局（垂直排列，44px 触控区域）
 */

import { useAuth } from "@/lib/use-auth";
import { safeDate } from "@/lib/utils";
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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalUsers, setTotalUsers] = useState(0);
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
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('limit', String(pageSize));
      if (q) params.set('q', q);
      const url = `/api/admin/users?${params.toString()}`;
      
      const res = await fetch(url, {
        headers: { Authorization: "Bearer " + token },
        cache: 'no-store' // ✅ 彻底击碎幽灵缓存
      });
      
      const json = await res.json();
      
      // ✅ 修复解构逻辑：判断外层包装，提取内层数据
      if (json.success || json.success === undefined) { 
        const payload = json.data || json; // 脱掉包装层
        
        // 兼容两种可能的数据格式，并做安全回退
        setUsers(payload.users || payload.data || []);
        setTotalUsers(payload.total || 0);
      } else {
        showToast("获取用户数据失败");
      }
    } catch (err) {
      console.error("Fetch users error:", err);
    } finally {
      setFetching(false);
    }
  }, [token, currentPage, pageSize]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSearch = () => {
    setCurrentPage(1);
    fetchUsers(query.trim() || undefined);
  };

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

  const isVip = (u: UserRow) => {
    if (!u.vipExpiresAt) return false;
    const expiresAt = safeDate(u.vipExpiresAt);
    const now = new Date();
    return expiresAt && expiresAt > now;
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    const date = safeDate(iso);
    if (!date) return "—";
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  // ─── Shared sub-components ───

  const RoleBadge = ({ role }: { role: string }) => (
    <span
      className={
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium " +
        (role === "ADMIN"
          ? "bg-red-100 text-red-700"
          : "bg-stone-100 text-stone-500")
      }
    >
      {role}
    </span>
  );

  const StatusBadge = ({ status }: { status: string }) => {
    const banned = status === "BANNED";
    return (
      <span
        className={
          "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium " +
          (banned
            ? "bg-red-100 text-red-700"
            : "bg-green-50 text-green-600")
        }
      >
        {status}
      </span>
    );
  };

  const ActionButtons = ({ user: u }: { user: UserRow }) => {
    const vipActive = isVip(u);
    const banned = u.status === "BANNED";

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {/* VIP button */}
        {!vipActive ? (
          <button
            onClick={() => setVipModal({ userId: u.id, email: u.email })}
            className="min-h-[44px] rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 hover:bg-amber-100 active:scale-95 transition-all"
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
            className="min-h-[44px] rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-500 hover:bg-stone-200 active:scale-95 transition-all"
          >
            -VIP
          </button>
        )}

        {/* Ban/unban */}
        <button
          onClick={() =>
            setConfirm({
              title: banned ? "解封用户" : "封禁用户",
              message: banned
                ? "确定解封 " + u.email + "？"
                : "确定封禁 " + u.email + "？封禁后该用户无法登录。",
              onConfirm: () =>
                execAction(u.id, "set_status", banned ? "ACTIVE" : "BANNED"),
            })
          }
          className={
            "min-h-[44px] rounded-md px-3 py-2 text-xs transition-all active:scale-95 " +
            (banned
              ? "bg-green-50 text-green-700 hover:bg-green-100"
              : "bg-red-50 text-red-600 hover:bg-red-100")
          }
        >
          {banned ? "解封" : "封禁"}
        </button>

        {/* Promote/demote */}
        {u.role !== "ADMIN" ? (
          <button
            onClick={() =>
              setConfirm({
                title: "提升为管理员",
                message: "确定将 " + u.email + " 提升为管理员？该操作授予后台管理权限。",
                onConfirm: () => execAction(u.id, "set_role", "ADMIN"),
              })
            }
            className="min-h-[44px] rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-500 hover:bg-stone-200 active:scale-95 transition-all"
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
            className="min-h-[44px] rounded-md bg-red-50 px-3 py-2 text-xs text-red-500 hover:bg-red-100 active:scale-95 transition-all"
          >
            降级
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* ─── Sticky search bar ─── */}
      <div className="sticky top-0 z-20 bg-stone-50 px-4 md:px-8 pt-6 md:pt-12 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">用户管理</h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="搜索邮箱…"
            className="flex-1 max-w-sm rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-neutral-800 placeholder-stone-300 outline-none transition-colors focus:border-stone-400"
          />
          <button
            onClick={handleSearch}
            className="min-h-[44px] rounded-lg bg-neutral-900 px-5 py-2 text-sm font-medium text-stone-50 hover:bg-neutral-800 active:scale-95 transition-all"
          >
            搜索
          </button>
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8">
        {fetching ? (
          <div className="text-sm text-stone-300 py-12 text-center">加载中…</div>
        ) : users.length === 0 ? (
          <div className="text-sm text-stone-300 py-12 text-center">暂无用户</div>
        ) : (
          <>
            {/* ═══════════ DESKTOP TABLE (>=768px) ═══════════ */}
            <div className="hidden md:block rounded-xl border border-stone-100 bg-white overflow-hidden">
              <div className="grid grid-cols-7 gap-2 px-4 py-2.5 bg-stone-50 text-[11px] font-medium text-stone-400 uppercase tracking-wider">
                <span>UID</span>
                <span className="col-span-2">邮箱</span>
                <span>角色</span>
                <span>VIP</span>
                <span>状态</span>
                <span>操作</span>
              </div>
              <div className="divide-y divide-stone-50">
                {users.map((u) => {
                  const vipActive = isVip(u);
                  const banned = u.status === "BANNED";
                  return (
                    <div
                      key={u.id}
                      className={
                        "grid grid-cols-7 gap-2 px-4 py-3 text-xs items-center transition-colors " +
                        (banned ? "bg-red-50/30" : "hover:bg-stone-50/50")
                      }
                    >
                      <span className="text-stone-500 font-mono text-[11px]">{u.uid}</span>
                      <span className="col-span-2 text-stone-700 truncate">{u.email}</span>
                      <span><RoleBadge role={u.role} /></span>
                      <span>
                        {vipActive ? (
                          <span className="text-green-600 font-medium text-[11px]">
                            VIP {fmtDate(u.vipExpiresAt)}
                          </span>
                        ) : (
                          <span className="text-stone-300 text-[11px]">—</span>
                        )}
                      </span>
                      <span><StatusBadge status={u.status} /></span>
                      <span><ActionButtons user={u} /></span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ═══════════ MOBILE CARDS (<768px) ═══════════ */}
            <div className="md:hidden space-y-3">
              {users.map((u) => {
                const vipActive = isVip(u);
                const banned = u.status === "BANNED";
                return (
                  <div
                    key={u.id}
                    className={
                      "rounded-xl bg-white p-4 shadow-sm border transition-colors " +
                      (banned ? "border-red-100 bg-red-50/30" : "border-stone-100")
                    }
                  >
                    {/* Top: email + badges */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-neutral-800 truncate">{u.email}</div>
                        <div className="mt-0.5 text-[11px] text-stone-400 font-mono">UID: {u.uid}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <RoleBadge role={u.role} />
                        <StatusBadge status={u.status} />
                      </div>
                    </div>

                    {/* VIP status */}
                    <div className="mb-3">
                      {vipActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          VIP · 到期 {fmtDate(u.vipExpiresAt)}
                        </span>
                      ) : (
                        <span className="text-xs text-stone-300">未开通 VIP</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="overflow-x-auto -mx-1">
                      <ActionButtons user={u} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ─── Pagination ─── */}
      {!fetching && users.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 md:px-8 py-3 border-t border-stone-100 bg-white">
          {/* Page size selector */}
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <span>每页</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700 outline-none focus:border-stone-400"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value={5000}>5000</option>
              <option value={10000}>10000</option>
            </select>
            <span>条</span>
          </div>

          {/* Page navigation */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="min-h-[36px] rounded-md border border-stone-200 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
            >
              上一页
            </button>
            <span className="px-2 text-xs text-stone-500">
              第 {currentPage} 页
            </span>
            <button
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage * pageSize >= totalUsers}
              className="min-h-[36px] rounded-md border border-stone-200 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
            >
              下一页
            </button>
          </div>

          {/* Total count */}
          <div className="text-xs text-stone-400">
            共 {totalUsers} 个用户
          </div>
        </div>
      )}

      {/* ─── VIP modal ─── */}
      {vipModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4"
          onClick={() => setVipModal(null)}
        >
          <div
            className="rounded-xl bg-white shadow-lg border border-stone-100 p-5 w-full max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">发放 VIP</h3>
            <p className="text-[11px] text-stone-400 mb-4 truncate">{vipModal.email}</p>
            <div className="space-y-2">
              {VIP_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => execAction(vipModal.userId, "grant_vip", opt.days)}
                  className="w-full min-h-[44px] rounded-lg border border-stone-100 px-3 py-2.5 text-sm text-stone-700 hover:bg-amber-50 hover:border-amber-200 active:scale-95 transition-all"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setVipModal(null)}
              className="w-full mt-3 min-h-[44px] rounded-lg bg-stone-50 py-2.5 text-sm text-stone-400 hover:bg-stone-100 active:scale-95 transition-all"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* ─── Confirm modal ─── */}
      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4"
          onClick={() => setConfirm(null)}
        >
          <div
            className="rounded-xl bg-white shadow-lg border border-stone-100 p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">{confirm.title}</h3>
            <p className="text-xs text-stone-500 mb-5 leading-relaxed">{confirm.message}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 min-h-[44px] rounded-lg border border-stone-100 py-2.5 text-sm text-stone-500 hover:bg-stone-50 active:scale-95 transition-all"
              >
                取消
              </button>
              <button
                onClick={confirm.onConfirm}
                className="flex-1 min-h-[44px] rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-stone-50 hover:bg-neutral-800 active:scale-95 transition-all"
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
