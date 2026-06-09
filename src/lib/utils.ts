/**
 * Utilities — display ID formatting & parsing
 *
 * formatDisplayId: createdAt (Date) + uid (number) → "xujing_2026060900001"
 * parseDisplayId:   "xujing_2026060900001" → uid (number) | null
 */

/** Format a user-facing display ID from creation date and serial uid. */
export function formatDisplayId(createdAt: Date, uid: number): string {
  const y = createdAt.getUTCFullYear();
  const m = String(createdAt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(createdAt.getUTCDate()).padStart(2, "0");
  const seq = String(uid).padStart(5, "0");
  return `xujing_${y}${m}${d}${seq}`;
}

/**
 * Parse a display ID back to its numeric uid.
 * Returns null when the format does not match.
 */
const DISPLAY_ID_RE = /^xujing_\d{8}(\d{5,})$/;

export function parseDisplayId(displayId: string): number | null {
  const match = displayId.match(DISPLAY_ID_RE);
  if (!match) return null;
  const num = parseInt(match[1]!, 10);
  return Number.isNaN(num) ? null : num;
}
