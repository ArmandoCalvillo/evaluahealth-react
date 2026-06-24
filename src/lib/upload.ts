"use client";
import { getSupabase } from "./supabase";

export type Bucket = "student-photos" | "student-idcards" | "evaluator-photos";

/** Upload a File to a Supabase Storage bucket. Returns the public URL. */
export async function uploadFile(bucket: Bucket, file: File): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const ext = file.name.split(".").pop() || "png";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
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
