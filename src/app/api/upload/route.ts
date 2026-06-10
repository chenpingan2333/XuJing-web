/**
 * POST /api/upload — image upload (local filesystem, TODO: cloud upload-on-consent)
 *
 * Accepts multipart/form-data with a single file field "file".
 * Stores to public/uploads/ and returns the public URL.
 * Limits: 10 MB max, jpg/png/webp only.
 * TODO: add cloud upload after user consent (planned for midnight deployment)
 */

import { jsonOk, jsonErr } from "../_base/response";
import { requireAuth } from "../_base/auth";
import { rateLimit } from "../_base/rate-limit";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

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
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);

    return jsonOk({ url: "/uploads/" + filename }, 201);
  } catch (err) {
    console.error("[upload] Local upload failed:", err instanceof Error ? err.message : String(err));
    return jsonErr("Upload failed. Please try again.", 500);
  }
}