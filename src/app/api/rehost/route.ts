import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const ALLOWED = new Set(["student-photos", "student-idcards", "evaluator-photos"]);

// Longest-edge cap per bucket. Avatars small, ID cards kept readable.
const MAX_DIM: Record<string, number> = {
  "student-photos": 512,
  "evaluator-photos": 512,
  "student-idcards": 1000,
};

/**
 * Server-side image re-hosting.
 * Fetches a remote image (e.g. an external azureedge URL) server-side — no
 * browser CORS — and uploads it into a Supabase Storage bucket using the
 * service-role key. Returns the hosted public URL.
 *
 * POST { bucket, url } -> { url: hostedUrl, rehosted: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const { bucket, url } = (await req.json()) as { bucket?: string; url?: string };

    if (!url) return NextResponse.json({ url: "", rehosted: false });
    if (!bucket || !ALLOWED.has(bucket)) {
      return NextResponse.json({ error: "invalid bucket" }, { status: 400 });
    }
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return NextResponse.json({ error: "server not configured" }, { status: 500 });
    }

    // Fetch the remote image server-side (no CORS restrictions here).
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 EvaluaHealth-Importer" },
    });
    if (!res.ok) {
      // Could not fetch — fall back to the original URL so import never breaks.
      return NextResponse.json({ url, rehosted: false });
    }

    const original = Buffer.from(await res.arrayBuffer());

    // Downscale + compress to JPEG. If sharp fails (non-image / decode error),
    // fall back to the original bytes so import never breaks.
    let outBuf: Buffer = original;
    let ct = res.headers.get("content-type") || "image/jpeg";
    let ext = ct.split("/")[1]?.split("+")[0] || (url.split(".").pop()?.split("?")[0] || "jpg");
    try {
      const maxDim = MAX_DIM[bucket] || 512;
      const optimized = await sharp(original)
        .rotate() // respect EXIF orientation
        .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      if (optimized.length < original.length) {
        outBuf = optimized as Buffer;
        ct = "image/jpeg";
        ext = "jpg";
      }
    } catch {
      // keep original bytes
    }

    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await admin.storage
      .from(bucket)
      .upload(path, outBuf, { upsert: true, contentType: ct });

    if (error) {
      return NextResponse.json({ url, rehosted: false });
    }

    const { data } = admin.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl, rehosted: true });
  } catch {
    return NextResponse.json({ error: "rehost failed" }, { status: 500 });
  }
}
