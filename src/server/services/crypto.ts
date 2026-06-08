/**
 * AES-256-CBC 鍔犲瘑宸ュ叿
 *
 * 鐢ㄤ簬 ApiConfig.api_key 鐨勫姞瀵?瑙ｅ瘑銆? * 瀵嗛挜鏉ヨ嚜鐜鍙橀噺 API_KEY_ENCRYPTION_KEY锛?4 瀛楃 hex = 32 瀛楄妭锛夈€? * 鏍煎紡: iv:encrypted锛坔ex 鎷兼帴锛夈€? */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-cbc";

function getKey(): Buffer {
  const hex = process.env.API_KEY_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("API_KEY_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

/** 鍔犲瘑 API Key 鈫?"ivHex:dataHex" */
export function encryptApiKey(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

/** 瑙ｅ瘑 API Key 鈫?"ivHex:dataHex" */
export function decryptApiKey(encrypted: string): string {
  const key = getKey();
  const [ivHex, dataHex] = encrypted.split(":");
  if (!ivHex || !dataHex) throw new Error("Invalid encrypted format, expected iv:data");
  const iv = Buffer.from(ivHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}