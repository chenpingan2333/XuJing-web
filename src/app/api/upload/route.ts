import { jsonOk, jsonErr } from "../_base/response";
import { requireAuth } from "../_base/auth";
import { rateLimit } from "../_base/rate-limit";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const UPLOAD_DIR = "/var/www/xujing/public/uploads";

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const rl = await rateLimit(auth.userId, "upload:avatar", {
    free: { limit: 10, windowMs: 60_000 },
    vip: { limit: 30, windowMs: 60_000 },
  }, auth.subscription);
  if (rl) return rl;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonErr("Invalid form data", 400);
  }

  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof File)) {
    return jsonErr("No file provided", 400);
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return jsonErr("Unsupported file type. Use jpg, png, or webp.", 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return jsonErr("File too large (max 10 MB)", 413);
  }

  try {
    await mkdir(UPLOAD_DIR, { recursive: true });

    const ext = path.extname(file.name) || ".png";
    const filename = crypto.randomUUID() + ext;
    const targetPath = path.join(UPLOAD_DIR, filename);

    // 使用 ReadableStream 异步流切片吸入，彻底释放主线程事件循环，根治 Pending 超时
    const writeStream = createWriteStream(targetPath);
    const reader = file.stream().getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        await new Promise<void>((resolve, reject) => {
          writeStream.write(Buffer.from(value), (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    }
    
    await new Promise<void>((resolve) => writeStream.end(resolve));

    return jsonOk({ url: `${process.env.ASSET_PREFIX || ""}/uploads/` + filename }, 201);
  } catch (err) {
    console.error("[upload] Stream local upload failed:", err instanceof Error ? err.message : String(err));
    return jsonErr("Upload failed. Please try again.", 500);
  }
}
