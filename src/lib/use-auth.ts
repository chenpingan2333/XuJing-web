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
}

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  loading: boolean;
}

// ─── localStorage keys ───

const TOKEN_KEY = "xujing_token";
const REFRESH_KEY = "xujing_refresh";
const USER_ID_KEY = "xujing_uid";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function getStoredRefresh(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

function getStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_ID_KEY);
}

function persistAuth(token: string, refreshToken: string, userId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_ID_KEY, userId);
}

function clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_ID_KEY);
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
  const data = await apiCall<{ data: { userId: string; role: string; subscription: string } }>(
    "/api/users",
    token
  );
  return {
    userId: data.data.userId,
    role: data.data.role as "USER" | "ADMIN",
    subscription: data.data.subscription as "free" | "vip",
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
