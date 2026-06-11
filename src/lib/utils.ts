/**
 * Utilities — display ID formatting & parsing
 *
 * formatDisplayId: createdAt (Date) + uid (number) → "xujing_2026060900001"
 * parseDisplayId:   "xujing_2026060900001" → uid (number) | null
 */

/** Safely convert any value to a Date object. Returns null for invalid inputs. */
export function safeDate(value: unknown): Date | null {
  if (!value) return null;

  const date =
    value instanceof Date
      ? value
      : new Date(value as string);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

/** Format a user-facing display ID from creation date and serial uid. */
export function formatDisplayId(createdAt: Date, uid: number): string {
  console.error(
    "[DATE CRASH]",
    createdAt,
    typeof createdAt,
    createdAt instanceof Date
  );
  const date = safeDate(createdAt);
  if (!date) {
    return "--";
  }
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
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
