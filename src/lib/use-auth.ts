"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────

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

// ─── localStorage keys ─────────────────────────────────

const TOKEN_KEY = "xujing_token";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// ─── API helpers ────────────────────────────────────────

async function apiCall<T>(path: string, token: string | null, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
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

// ─── Hook ───────────────────────────────────────────────

const AUTH_LOAD_TIMEOUT = 8000; // 8s safety timeout

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

    // Safety: always resolve loading within AUTH_LOAD_TIMEOUT
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
      .catch((err) => {
        console.warn("[useAuth] Failed to restore session:", err instanceof Error ? err.message : String(err));
        setStoredToken(null);
        done({ token: null, user: null, loading: false });
      });

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  /** Dev login — direct token without verification code */
  const login = useCallback(async (email: string) => {
    const data = await apiCall<{ data: { accessToken: string; userId: string } }>(
      "/api/auth/dev/token",
      null,
      { method: "POST", body: JSON.stringify({ email }) }
    );
    const token = data.data.accessToken;
    setStoredToken(token);
    const user = await fetchUser(token);
    setState({ token, user, loading: false });
    return user;
  }, []);

  /** Send verification code to email */
  const sendCode = useCallback(async (email: string): Promise<string | null> => {
    try {
      await apiCall<{ data: { message: string } }>(
        "/api/auth/send-code",
        null,
        { method: "POST", body: JSON.stringify({ email }) }
      );
      return null; // success
    } catch (err) {
      return err instanceof Error ? err.message : "发送失败";
    }
  }, []);

  /** Verify code and login */
  const loginWithCode = useCallback(async (email: string, code: string): Promise<string | null> => {
    try {
      const data = await apiCall<{ data: { accessToken: string; userId: string } }>(
        "/api/auth/login",
        null,
        { method: "POST", body: JSON.stringify({ email, code }) }
      );
      const token = data.data.accessToken;
      setStoredToken(token);
      const user = await fetchUser(token);
      setState({ token, user, loading: false });
      return null; // success
    } catch (err) {
      return err instanceof Error ? err.message : "验证失败";
    }
  }, []);

  const logout = useCallback(async () => {
    if (state.token) {
      try {
        await apiCall("/api/auth/logout", state.token, { method: "POST" });
      } catch { /* ignore */ }
    }
    setStoredToken(null);
    setState({ token: null, user: null, loading: false });
  }, [state.token]);

  return { ...state, login, sendCode, loginWithCode, logout };
}
