"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./use-auth";

interface ApiStatus {
  configured: boolean;
  configName: string | null;
  configId: string | null;
}

let globalCache: ApiStatus | null = null;
let globalFetchPromise: Promise<ApiStatus> | null = null;
let cacheListeners: Set<(s: ApiStatus) => void> = new Set();

function notifyListeners(status: ApiStatus) {
  globalCache = status;
  cacheListeners.forEach((fn) => fn(status));
}

async function fetchStatus(token: string): Promise<ApiStatus> {
  // Deduplicate concurrent fetches
  if (globalFetchPromise) return globalFetchPromise;

  globalFetchPromise = (async () => {
    try {
      const res = await fetch("/api/api-configs", {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      const configs: any[] = data.success && Array.isArray(data.data) ? data.data : [];
      const first = configs[0];
      const status: ApiStatus = first
        ? { configured: true, configName: first.name || null, configId: first.id || null }
        : { configured: false, configName: null, configId: null };
      notifyListeners(status);
      return status;
    } catch {
      const fallback: ApiStatus = { configured: false, configName: null, configId: null };
      notifyListeners(fallback);
      return fallback;
    } finally {
      globalFetchPromise = null;
    }
  })();

  return globalFetchPromise;
}

/** Invalidate cache — call after saving/updating API config */
export function invalidateApiStatus() {
  globalCache = null;
}

export function useApiStatus() {
  const { token, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<ApiStatus>(
    globalCache ?? { configured: false, configName: null, configId: null }
  );

  // Subscribe to cache updates
  useEffect(() => {
    const listener = (s: ApiStatus) => setStatus(s);
    cacheListeners.add(listener);
    return () => { cacheListeners.delete(listener); };
  }, []);

  // Fetch on mount
  useEffect(() => {
    if (!token || authLoading) return;
    if (globalCache) {
      setStatus(globalCache);
      return;
    }
    fetchStatus(token);
  }, [token, authLoading]);

  const refresh = useCallback(async () => {
    if (!token) return;
    globalCache = null;
    await fetchStatus(token);
  }, [token]);

  return { ...status, refresh };
}