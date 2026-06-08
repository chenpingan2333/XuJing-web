import { randomBytes } from "crypto";

/** Generate RFC 9562 compliant UUID v7 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);

  // Random portion
  const rand = randomBytes(10);
  bytes.set(rand, 6);

  // 48-bit timestamp, big-endian bytes 0-5
  const ts = BigInt(Date.now());
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);

  // Version 7: bytes[6] = 0b0111xxxx
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;

  // Variant 10xx: bytes[8] = 0b10xxxxxx
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  // Format as UUID string
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
