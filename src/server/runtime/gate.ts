/**
 * Runtime Gate — Startup Barrier
 *
 * Blocks API requests until DB + Redis + ENV are ready.
 * Phase 3.6 deterministic runtime.
 */

import { checkInfra } from "@/server/services/infra-health";
import type { InfraStatus } from "@/server/services/infra-health";

export type RuntimeState = "init" | "ready" | "degraded";

let _state: RuntimeState = "init";
let _status: InfraStatus | null = null;
let _initPromise: Promise<void> | null = null;

/**
 * Initialize runtime gate. Idempotent; repeated calls return the same Promise.
 */
export function initRuntimeGate(): Promise<void> {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      _status = await checkInfra();
      _state = _status.ok ? "ready" : "degraded";
      console.log("[gate] Runtime state:", _state, JSON.stringify(_status));
    } catch (e) {
      _state = "degraded";
      _status = { ok: false, postgres: false, redis: false, env: false, error: (e as Error).message };
      console.error("[gate] Init failed:", (e as Error).message);
    }
  })();

  return _initPromise;
}

/** Current runtime state (init / ready / degraded). */
export function runtimeState(): RuntimeState {
  return _state;
}

/** Current health snapshot. */
export function runtimeHealth(): InfraStatus | null {
  return _status;
}

/** Whether business requests can be accepted. */
export function isReady(): boolean {
  return _state === "ready";
}
