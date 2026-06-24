"use client";
import { createBrowserClient } from "@supabase/ssr";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const SUPABASE_READY = Boolean(SUPABASE_URL && SUPABASE_ANON);

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabase() {
  if (!SUPABASE_READY) return null;
  if (!_client) {
    _client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
  }
  return _client;
}
