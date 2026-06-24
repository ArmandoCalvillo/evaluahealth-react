import { NextResponse } from "next/server";
import { getAdminClient, ADMIN_READY } from "@/lib/supabaseAdmin";

const NEVER = "876000h"; // ~100 years ban => effectively disabled

// GET: list evaluator profiles merged with their active (enabled) state from auth
export async function GET() {
  if (!ADMIN_READY) return NextResponse.json({ error: "Supabase admin not configured" }, { status: 500 });
  const admin = getAdminClient()!;
  const { data: profs, error } = await admin.from("profiles").select("*").eq("role", "evaluator").order("full_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // fetch auth users to read ban / app_metadata.active
  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const map = new Map<string, boolean>();
  for (const u of usersData?.users || []) {
    const meta = (u.app_metadata || {}) as { active?: boolean };
    const banned = Boolean((u as { banned_until?: string }).banned_until);
    // active = explicitly true in metadata, OR (not banned and no flag set)
    const active = meta.active === undefined ? !banned : meta.active && !banned;
    map.set(u.id, active);
  }

  const rows = (profs || []).map((p) => ({ ...p, active: map.has(p.id) ? map.get(p.id) : true }));
  return NextResponse.json({ rows });
}

// POST: create a new evaluator (auth user + profile)
export async function POST(req: Request) {
  if (!ADMIN_READY) return NextResponse.json({ error: "Supabase admin not configured" }, { status: 500 });
  const admin = getAdminClient()!;
  const body = await req.json();
  const { name, email, password, phone, site, photo_url } = body || {};
  if (!name || !email || !password || !site) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // create auth user (confirmed)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
    app_metadata: { active: true },
  });
  if (createErr || !created?.user) {
    return NextResponse.json({ error: createErr?.message || "Could not create user" }, { status: 400 });
  }

  const uid = created.user.id;
  // upsert profile (handle_new_user trigger may have created a base row)
  const { error: profErr } = await admin.from("profiles").upsert({
    id: uid,
    full_name: name,
    email,
    role: "evaluator",
    site,
    phone: phone || null,
    photo_url: photo_url || null,
  });
  if (profErr) {
    // rollback auth user so we don't orphan it
    await admin.auth.admin.deleteUser(uid);
    return NextResponse.json({ error: profErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: uid });
}

// PATCH: update an evaluator profile (+ optional password) OR toggle active state
export async function PATCH(req: Request) {
  if (!ADMIN_READY) return NextResponse.json({ error: "Supabase admin not configured" }, { status: 500 });
  const admin = getAdminClient()!;
  const body = await req.json();
  const { id, name, email, password, phone, site, photo_url, active } = body || {};
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // ---- toggle enable/disable portal access ----
  if (typeof active === "boolean") {
    const patch: Record<string, unknown> = {
      app_metadata: { active },
      ban_duration: active ? "none" : NEVER,
    };
    const { error } = await admin.auth.admin.updateUserById(id, patch);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, active });
  }

  // update auth fields if email/password changed
  const authPatch: Record<string, unknown> = {};
  if (email) authPatch.email = email;
  if (password) authPatch.password = password;
  if (name) authPatch.user_metadata = { full_name: name };
  if (Object.keys(authPatch).length) {
    const { error: aErr } = await admin.auth.admin.updateUserById(id, authPatch);
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 });
  }

  const profilePatch: Record<string, unknown> = {};
  if (name !== undefined) profilePatch.full_name = name;
  if (email !== undefined) profilePatch.email = email;
  if (phone !== undefined) profilePatch.phone = phone || null;
  if (site !== undefined) profilePatch.site = site;
  if (photo_url !== undefined) profilePatch.photo_url = photo_url || null;
  if (Object.keys(profilePatch).length) {
    const { error: pErr } = await admin.from("profiles").update(profilePatch).eq("id", id);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE: remove an evaluator entirely
export async function DELETE(req: Request) {
  if (!ADMIN_READY) return NextResponse.json({ error: "Supabase admin not configured" }, { status: 500 });
  const admin = getAdminClient()!;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  // delete auth user; profile row cascades via FK (on delete cascade)
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from("profiles").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
