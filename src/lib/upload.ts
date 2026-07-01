"use client";
import { getSupabase } from "./supabase";

export type Bucket = "student-photos" | "student-idcards" | "evaluator-photos";

// Max dimension (longest edge) per bucket. ID cards need to stay readable,
// avatars can be small.
const MAX_DIM: Record<Bucket, number> = {
  "student-photos": 512,
  "evaluator-photos": 512,
  "student-idcards": 1000,
};
const JPEG_QUALITY = 0.82;

/**
 * Downscale + compress an image File in the browser via canvas before upload.
 * Returns a JPEG Blob (small). Falls back to the original file if anything
 * goes wrong (e.g. non-image, decode failure).
 */
async function optimizeImage(file: File, maxDim: number): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    // Only use the optimized version if it's actually smaller.
    if (blob && blob.size < file.size) return blob;
    return file;
  } catch {
    return file;
  }
}

/** Upload a File to a Supabase Storage bucket. Returns the public URL. */
export async function uploadFile(bucket: Bucket, file: File): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const optimized = await optimizeImage(file, MAX_DIM[bucket]);
  const isJpeg = optimized !== file;
  const ext = isJpeg ? "jpg" : file.name.split(".").pop() || "png";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(bucket).upload(path, optimized, {
    upsert: true,
    contentType: isJpeg ? "image/jpeg" : file.type || undefined,
  });
  if (error) throw error;
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Fetch a remote image (e.g. an external azureedge URL) and re-host it in a
 * Supabase Storage bucket. Returns the hosted public URL.
 * If the remote fetch fails (CORS / network / expired), returns the original
 * URL unchanged so the import never breaks.
 */
export async function uploadFromUrl(bucket: Bucket, url: string): Promise<string> {
  if (!url) return "";
  try {
    // Re-host server-side via the /api/rehost route. The server fetches the
    // remote image (no browser CORS — works on Vercel) and uploads it with the
    // service-role key. On any failure it returns the original URL.
    const res = await fetch("/api/rehost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket, url }),
    });
    if (!res.ok) return url;
    const data = (await res.json()) as { url?: string };
    return data.url || url;
  } catch {
    return url;
  }
}
