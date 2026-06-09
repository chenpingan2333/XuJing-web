/**
 * POST /api/upload — image upload (Vercel Blob)
 *
 * Accepts multipart/form-data with a single file field "file".
 * Stores to Vercel Blob and returns the public URL.
 * Limits: 10 MB max, jpg/png/webp only.
 */

import { jsonOk, jsonErr } from "../_base/response";
import { requireAuth } from "../_base/auth";
import { rateLimit } from "../_base/rate-limit";
import { put } from "@vercel/blob";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

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
    const blob = await put(file.name, file, {
      access: "public",
      contentType: file.type,
    });

    return jsonOk({ url: blob.url }, 201);
  } catch (err) {
    console.error("[upload] Vercel Blob upload failed:", err instanceof Error ? err.message : String(err));
    return jsonErr("Upload failed. Ensure BLOB_READ_WRITE_TOKEN is configured.", 500);
  }
}
