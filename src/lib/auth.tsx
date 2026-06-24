"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, SUPABASE_READY } from "./supabase";
import type { Profile, Role } from "./types";

const PREVIEW_BYPASS = process.env.NEXT_PUBLIC_PREVIEW_BYPASS === "1";

interface AuthCtx {
  profile: Profile | null;
  loading: boolean;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string; role?: Role }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  profile: null,
  loading: true,
  ready: SUPABASE_READY,
  signIn: async () => ({ error: "not ready" }),
  signOut: async () => {},
  refresh: async () => {},
});

// Demo profile used when preview bypass is on (no supabase)
const DEMO_ADMIN: Profile = {
  id: "demo-admin", full_name: "Admin Demo", email: "admin@evaluahealth.mx",
  role: "admin", site: null, photo_url: null, phone: null, created_at: "",
};

// Fixed demo accounts (offline preview mode). Only these credentials sign in.
const DEMO_USERS: Record<string, { password: string; profile: Profile }> = {
  "admin@evaluahealth.mx": {
    password: "Admin@123",
    profile: {
      id: "demo-admin", full_name: "Carlos Mendoza", email: "admin@evaluahealth.mx",
      role: "admin", site: null, photo_url: null, phone: null, created_at: "",
    },
  },
  "evaluator@evaluahealth.mx": {
    password: "Eval@123",
    profile: {
      id: "demo-evaluator", full_name: "Dr. Maria Rodriguez", email: "evaluator@evaluahealth.mx",
      role: "evaluator", site: "Guadalajara", photo_url: null, phone: null, created_at: "",
    },
  },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const applyUser = useCallback(async (user: { id: string; email?: string } | null) => {
    if (!user) { setProfile(null); setLoading(false); return; }
    const sb = getSupabase();
    const fallback: Profile = {
      id: user.id, full_name: "", email: user.email || "",
      role: (user.email || "").toLowerCase().includes("admin") ? "admin" : "evaluator",
      site: null, photo_url: null, phone: null, created_at: "",
    };
    try {
      const q = sb!.from("profiles").select("*").eq("id", user.id).single();
      const timeout = new Promise<{ data: null }>((res) => setTimeout(() => res({ data: null }), 4000));
      const { data } = (await Promise.race([q, timeout])) as { data: Profile | null };
      setProfile(data ?? fallback);
    } catch {
      setProfile(fallback);
    }
    setLoading(false);
  }, []);

  const loadProfile = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) { setLoading(false); return; }
    const { data: { session } } = await sb.auth.getSession();
    await applyUser(session?.user ?? null);
  }, [applyUser]);

  useEffect(() => {
    if (PREVIEW_BYPASS) { setProfile(DEMO_ADMIN); setLoading(false); return; }
    const sb = getSupabase();
    if (!sb) { setLoading(false); return; }
    // onAuthStateChange fires INITIAL_SESSION on mount with the restored cookie session
    const { data: sub } = sb.auth.onAuthStateChange((_e: string, session: { user?: { id: string; email?: string } } | null) => {
      applyUser(session?.user ?? null);
    });
    // safety net in case the listener doesn't fire
    const t = setTimeout(() => { loadProfile(); }, 1500);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, [applyUser, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (PREVIEW_BYPASS) {
      const account = DEMO_USERS[email.trim().toLowerCase()];
      if (!account) return { error: "No account found for this email." };
      if (account.password !== password) return { error: "Incorrect password." };
      setProfile(account.profile);
      return { role: account.profile.role };
    }
    const sb = getSupabase();
    if (!sb) return { error: "Supabase not configured" };
    const { data: signInData, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    const user = signInData?.user;
    if (!user) return { error: "Sign-in failed" };
    let profileRow: Profile | null = null;
    try {
      const { data } = await sb.from("profiles").select("*").eq("id", user.id).single();
      profileRow = (data as Profile) ?? null;
    } catch { /* profile fetch is best-effort; fall back to email heuristic */ }
    const role: Role = (profileRow?.role as Role) ||
      ((user.email || "").toLowerCase().includes("admin") ? "admin" : "evaluator");
    if (profileRow) setProfile(profileRow);
    else setProfile({ id: user.id, email: user.email || email, full_name: user.email || "", role, site: null } as Profile);
    return { role };
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    setProfile(null);
  }, []);

  return (
    <Ctx.Provider value={{ profile, loading, ready: SUPABASE_READY, signIn, signOut, refresh: loadProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

/** Guard for portal pages. Redirects to login if no session, or wrong role. */
export function useGuard(required: Role) {
  const { profile, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!profile) { router.replace("/"); return; }
    if (profile.role !== required) {
      router.replace(profile.role === "admin" ? "/admin/dashboard" : "/evaluator/dashboard");
    }
  }, [profile, loading, required, router]);
  return { profile, loading };
}
