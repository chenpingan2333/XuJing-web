/**
 * AES-256-CBC 加解密 — Web Crypto API 实现
 *
 * 跨 Node.js / Edge / Browser 运行时兼容。
 * 密钥来自环境变量 API_KEY_ENCRYPTION_KEY，64 字符 hex = 32 字节。
 * 格式: iv:encrypted（hex 拼接）。
 */

const ALGORITHM = "AES-CBC" as const;
const KEY_LENGTH = 256;

/** 将 hex 字符串转为 Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/** 将 Uint8Array 转为 hex 字符串 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 从环境变量加载原始密钥字节 */
function getKeyBytes(): Uint8Array {
  const hex = process.env.API_KEY_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("API_KEY_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return hexToBytes(hex);
}

/** 将原始密钥导入为 Web Crypto CryptoKey */
async function importKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", rawKey, { name: ALGORITHM }, false, ["encrypt", "decrypt"]);
}

/** 加密 API Key → "ivHex:dataHex" */
export async function encryptApiKey(plaintext: string): Promise<string> {
  const keyBytes = getKeyBytes();
  const key = await importKey(keyBytes);
  const iv = new Uint8Array(16);
  globalThis.crypto.getRandomValues(iv);

  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);

  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(encrypted))}`;
}

/** 解密 API Key ← "ivHex:dataHex" */
export async function decryptApiKey(encrypted: string): Promise<string> {
  const keyBytes = getKeyBytes();
  const key = await importKey(keyBytes);
  const [ivHex, dataHex] = encrypted.split(":");
  if (!ivHex || !dataHex) throw new Error("Invalid encrypted format, expected iv:data");

  const iv = hexToBytes(ivHex);
  const data = hexToBytes(dataHex);

  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, data);
  return new TextDecoder().decode(decrypted);
}
