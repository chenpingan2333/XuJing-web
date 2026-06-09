"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ───

export interface UserInfo {
  userId: string;
  role: "USER" | "ADMIN";
  subscription: "free" | "vip";
  nickname?: string;
  avatarUrl?: string;
  email?: string;
  createdAt: Date | null;
  uid: number | null;
}

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  loading: boolean;
}

// ─── Safe storage with memory fallback (Safari/Brave private mode) ───

const memoryStore = new Map<string, string>();
let storageAvailable: boolean | null = null;

function isStorageAvailable(): boolean {
  if (storageAvailable !== null) return storageAvailable;
  try {
    const key = "__storage_test__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  return storageAvailable;
}

function safeGetItem(key: string): string | null {
  if (typeof window === "undefined") return memoryStore.get(key) ?? null;
  if (isStorageAvailable()) {
    try { return localStorage.getItem(key); } catch { return memoryStore.get(key) ?? null; }
  }
  return memoryStore.get(key) ?? null;
}

function safeSetItem(key: string, value: string): void {
  memoryStore.set(key, value);
  if (typeof window === "undefined") return;
  if (isStorageAvailable()) {
    try { localStorage.setItem(key, value); } catch { /* memory fallback active */ }
  }
}

function safeRemoveItem(key: string): void {
  memoryStore.delete(key);
  if (typeof window === "undefined") return;
  if (isStorageAvailable()) {
    try { localStorage.removeItem(key); } catch { /* memory fallback active */ }
  }
}

// ─── localStorage keys ───

const TOKEN_KEY = "xujing_token";
const REFRESH_KEY = "xujing_refresh";
const USER_ID_KEY = "xujing_uid";

function getStoredToken(): string | null {
  return safeGetItem(TOKEN_KEY);
}
function getStoredRefresh(): string | null {
  return safeGetItem(REFRESH_KEY);
}
function getStoredUserId(): string | null {
  return safeGetItem(USER_ID_KEY);
}
function persistAuth(token: string, refreshToken: string, userId: string) {
  safeSetItem(TOKEN_KEY, token);
  safeSetItem(REFRESH_KEY, refreshToken);
  safeSetItem(USER_ID_KEY, userId);
}
function clearAuth() {
  safeRemoveItem(TOKEN_KEY);
  safeRemoveItem(REFRESH_KEY);
  safeRemoveItem(USER_ID_KEY);
}
// ─── Silent refresh ───

let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getStoredRefresh();
    const userId = getStoredUserId();
    if (!refreshToken || !userId) return null;

    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, refreshToken }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.success) return null;
      const { accessToken, refreshToken: newRefresh } = data.data;
      persistAuth(accessToken, newRefresh || refreshToken, userId);
      return accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ─── API helper with auto-refresh ───

async function apiCall<T>(path: string, token: string | null, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;

  let res = await fetch(path, { ...options, headers });
  const ct = res.headers.get("content-type") || "";

  // Attempt silent refresh on 401
  if (res.status === 401 && token) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      headers["Authorization"] = "Bearer " + newToken;
      res = await fetch(path, { ...options, headers });
    }
  }

  if (!res.ok) {
    let msg = "Request failed";
    if (ct.includes("application/json")) {
      try { const body = await res.json(); msg = body.error || msg; } catch {}
    } else if (res.status >= 500) {
      msg = "服务器内部错误，请稍后重试";
    }
    throw new Error(msg);
  }
  if (!ct.includes("application/json")) throw new Error("服务器返回了意外的响应格式");
  return res.json();
}

async function fetchUser(token: string): Promise<UserInfo> {
  const data = await apiCall<{
    data: {
      userId: string;
      role: string;
      subscription: string;
      createdAt: string | null;
      uid: number | null;
    };
  }>("/api/users", token);
  return {
    userId: data.data.userId,
    role: data.data.role as "USER" | "ADMIN",
    subscription: data.data.subscription as "free" | "vip",
    createdAt: data.data.createdAt ? new Date(data.data.createdAt) : null,
    uid: data.data.uid ?? null,
  };
}

// ─── Hook ───

const AUTH_LOAD_TIMEOUT = 8000;

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    token: null,
    user: null,
    loading: true,
  });

  // Initialize from localStorage
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const done = (s: AuthState) => {
      if (cancelled) return;
      if (timeoutId) clearTimeout(timeoutId);
      setState(s);
    };

    timeoutId = setTimeout(() => {
      console.warn("[useAuth] Auth init timed out after", AUTH_LOAD_TIMEOUT, "ms");
      done({ token: null, user: null, loading: false });
    }, AUTH_LOAD_TIMEOUT);

    const token = getStoredToken();
    if (!token) {
      done({ token: null, user: null, loading: false });
      return () => { cancelled = true; };
    }

    setState((s) => ({ ...s, token, loading: true }));
    fetchUser(token)
      .then((user) => done({ token, user, loading: false }))
      .catch(async (err) => {
        console.warn("[useAuth] Failed to restore session:", err instanceof Error ? err.message : String(err));
        // Try refresh before giving up
        const newToken = await tryRefreshToken();
        if (newToken && !cancelled) {
          try {
            const user = await fetchUser(newToken);
            done({ token: newToken, user, loading: false });
            return;
          } catch { /* fall through */ }
        }
        clearAuth();
        done({ token: null, user: null, loading: false });
      });

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // ─── Verification code (retained) ───

  const sendCode = useCallback(async (email: string): Promise<string | null> => {
    try {
      await apiCall<{ data: { message: string } }>(
        "/api/auth/send-code",
        null,
        { method: "POST", body: JSON.stringify({ email }) }
      );
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "发送失败";
    }
  }, []);

  const loginWithCode = useCallback(async (email: string, code: string): Promise<string | null> => {
    try {
      const data = await apiCall<{ data: { accessToken: string; refreshToken: string; userId: string } }>(
        "/api/auth/login",
        null,
        { method: "POST", body: JSON.stringify({ email, code }) }
      );
      const { accessToken, refreshToken, userId } = data.data;
      persistAuth(accessToken, refreshToken, userId);
      const user = await fetchUser(accessToken);
      setState({ token: accessToken, user, loading: false });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "验证失败";
    }
  }, []);

  // ─── Password login ───

  const loginWithPassword = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const data = await apiCall<{ data: { accessToken: string; refreshToken: string; userId: string } }>(
        "/api/auth/login",
        null,
        { method: "POST", body: JSON.stringify({ email, password }) }
      );
      const { accessToken, refreshToken, userId } = data.data;
      persistAuth(accessToken, refreshToken, userId);
      const user = await fetchUser(accessToken);
      setState({ token: accessToken, user, loading: false });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "登录失败";
    }
  }, []);

  // ─── Registration: captcha + send code ───

  const registerRequestCode = useCallback(async (
    email: string,
    captchaId: string,
    captchaText: string
  ): Promise<string | null> => {
    try {
      await apiCall<{ data: { message: string } }>(
        "/api/auth/register/send-code",
        null,
        { method: "POST", body: JSON.stringify({ email, captchaId, captchaText }) }
      );
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "验证失败";
    }
  }, []);

  // ─── Registration: verify email code + create account ───

  const registerVerify = useCallback(async (
    email: string,
    code: string,
    password: string
  ): Promise<string | null> => {
    try {
      await apiCall<{ data: { message: string } }>(
        "/api/auth/register/verify",
        null,
        { method: "POST", body: JSON.stringify({ email, code, password }) }
      );
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "注册失败";
    }
  }, []);

  // ─── Logout ───

  const logout = useCallback(async () => {
    if (state.token) {
      try {
        await apiCall("/api/auth/logout", state.token, { method: "POST" });
      } catch { /* ignore */ }
    }
    clearAuth();
    setState({ token: null, user: null, loading: false });
  }, [state.token]);

  return {
    ...state,
    sendCode,
    loginWithCode,
    loginWithPassword,
    registerRequestCode,
    registerVerify,
    logout,
  };
}
