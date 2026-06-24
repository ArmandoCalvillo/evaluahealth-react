"use client";
import { useState, useEffect, useCallback } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import Drawer from "@/components/Drawer";
import FileDrop from "@/components/FileDrop";
import { useToast } from "@/components/Toast";
import { SUPABASE_READY } from "@/lib/supabase";
import { listLocations } from "@/lib/db";
import type { Profile, Location } from "@/lib/types";

export default function Evaluators() {
  const toast = useToast();
  const [rows, setRows] = useState<Profile[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [site, setSite] = useState("all");
  const [dAdd, setDAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ name?: string; email?: string; pass?: string; phone?: string; site?: string; photo_url?: string }>({});
  const [err, setErr] = useState<Record<string, string>>({});

  const [toggling, setToggling] = useState<string | null>(null);

  const reload = useCallback(async () => {
    listLocations().then(setLocations).catch(() => setLocations([]));
    if (!SUPABASE_READY) return;
    try {
      const res = await fetch("/api/evaluators");
      const out = await res.json();
      if (res.ok) setRows(out.rows || []);
    } catch { /* */ }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const hasLocations = locations.length > 0;

  function openAdd() {
    setEditId(null); setForm({}); setErr({}); setDAdd(true);
  }
  function openEdit(p: Profile) {
    setEditId(p.id);
    setForm({ name: p.full_name, email: p.email, phone: p.phone || "", site: p.site || "", photo_url: p.photo_url || "", pass: "" });
    setErr({}); setDAdd(true);
  }

  async function save() {
    const e: Record<string, string> = {};
    if (!form.photo_url) e.photo = "Photo is required.";
    if (!form.name?.trim()) e.name = "Full name is required.";
    if (!form.email?.trim()) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email.";
    if (!editId && !form.pass?.trim()) e.pass = "Password is required.";
    if (!form.phone?.trim()) e.phone = "Phone is required.";
    if (!form.site) e.site = "Site is required.";
    if (Object.keys(e).length) { setErr(e); return; }
    setErr({});
    if (!SUPABASE_READY) { toast("Connect Supabase to invite evaluators", "info"); setDAdd(false); return; }
    setBusy(true);
    try {
      const payload = { name: form.name, email: form.email, password: form.pass, phone: form.phone, site: form.site, photo_url: form.photo_url };
      const res = editId
        ? await fetch("/api/evaluators", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editId, ...payload }) })
        : await fetch("/api/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const out = await res.json();
      if (!res.ok) { toast(out.error || "Could not save", "alert-triangle"); setBusy(false); return; }
      toast(editId ? "Evaluator updated" : "Evaluator created");
      await reload();
      setDAdd(false); setForm({}); setEditId(null);
    } catch { toast("Network error", "alert-triangle"); }
    setBusy(false);
  }

  async function removeEvaluator(p: Profile) {
    if (!confirm(`Remove ${p.full_name}? This deletes their login account.`)) return;
    try {
      const res = await fetch(`/api/evaluators?id=${p.id}`, { method: "DELETE" });
      const out = await res.json();
      if (!res.ok) { toast(out.error || "Could not delete", "alert-triangle"); return; }
      toast("Evaluator removed");
      await reload();
    } catch { toast("Network error", "alert-triangle"); }
  }

  async function toggleActive(p: Profile) {
    const next = !(p.active ?? true);
    setToggling(p.id);
    // optimistic update
    setRows((rs) => rs.map((r) => r.id === p.id ? { ...r, active: next } : r));
    try {
      const res = await fetch("/api/evaluators", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, active: next }) });
      const out = await res.json();
      if (!res.ok) {
        setRows((rs) => rs.map((r) => r.id === p.id ? { ...r, active: !next } : r));
        toast(out.error || "Could not update access", "alert-triangle");
      } else {
        toast(next ? `${p.full_name} can now access the portal` : `${p.full_name}’s portal access disabled`);
      }
    } catch {
      setRows((rs) => rs.map((r) => r.id === p.id ? { ...r, active: !next } : r));
      toast("Network error", "alert-triangle");
    }
    setToggling(null);
  }

  const filtered = site === "all" ? rows : rows.filter((r) => r.site === site);

  return (
    <Shell portal="admin" title="Evaluators" sub="Clinical evaluators by site">
      <div className="card-head" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 16, marginBottom: 16, flexWrap: "wrap" }}>
        {hasLocations ? (
          <div className="tabs scroll-tabs">
            <button className={`tab ${site === "all" ? "active" : ""}`} onClick={() => setSite("all")}>
              All Sites<span className="tab-count">{rows.length}</span>
            </button>
            {locations.map((l) => (
              <button key={l.id} className={`tab ${site === l.name ? "active" : ""}`} onClick={() => setSite(l.name)}>
                {l.name}<span className="tab-count">{rows.filter((r) => r.site === l.name).length}</span>
              </button>
            ))}
          </div>
        ) : (
          <span className="pill pill-blue"><Icon name="map-pin" size={14} /> No active sites yet</span>
        )}
        <button className="btn btn-pri" onClick={openAdd}><Icon name="user-plus" size={16} /> Add Evaluator</button>
      </div>

      <div className="card"><div className="card-pad" style={{ padding: filtered.length ? 0 : undefined }}>
        {filtered.length === 0 ? (
          <EmptyState icon="stethoscope" title="No evaluators yet"
            text="Invite clinical evaluators. Each one gets login credentials and is scoped to a site."
            action={<button className="btn btn-pri" onClick={openAdd}><Icon name="user-plus" size={16} /> Add Evaluator</button>} />
        ) : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Evaluator</th><th>Site</th><th>Email</th><th style={{ textAlign: "center" }}>Portal Access</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
            <tbody>{filtered.map((e) => {
              const on = e.active ?? true;
              return (
              <tr key={e.id}>
                <td style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {e.photo_url ? <img src={e.photo_url} className="av-lg" alt="" style={{ borderRadius: "50%" }} /> : <span className="av-lg" style={{ borderRadius: "50%", background: "var(--brand-soft)", color: "var(--brand)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{e.full_name[0]}</span>}
                  <b>{e.full_name}</b>
                </td>
                <td>{e.site}</td><td>{e.email}</td>
                <td style={{ textAlign: "center" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      className={`switch${on ? " on" : ""}`}
                      role="switch"
                      aria-checked={on}
                      disabled={toggling === e.id}
                      title={on ? "Click to disable portal access" : "Click to enable portal access"}
                      onClick={() => toggleActive(e)}
                    >
                      <span className="switch-knob" />
                    </button>
                    <span className={`switch-label ${on ? "on" : "off"}`}>{on ? "Enabled" : "Disabled"}</span>
                  </div>
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn btn-icon btn-xs btn-ghost" title="Edit" onClick={() => openEdit(e)}><Icon name="pencil" size={14} /></button>
                  <button className="btn btn-icon btn-xs btn-ghost" title="Remove" onClick={() => removeEvaluator(e)} style={{ marginLeft: 6, color: "#e11d48" }}><Icon name="trash-2" size={14} /></button>
                </td>
              </tr>
            );})}</tbody>
          </table></div>
        )}
      </div></div>

      <Drawer open={dAdd} onClose={() => { setDAdd(false); setErr({}); }} wide title={editId ? "Edit Evaluator" : "Add Evaluator"} sub={editId ? "Update evaluator details" : "Create a clinical evaluator account · all fields required"}
        footer={<><button className="btn btn-ghost" onClick={() => { setDAdd(false); setErr({}); }}>Cancel</button><button className="btn btn-pri" onClick={save} disabled={busy}>{busy ? "Saving…" : editId ? "Save Changes" : "Create Account"}</button></>}>
        <div style={{ marginBottom: 14 }}>
          <FileDrop bucket="evaluator-photos" label="Photo" shape="circle" value={form.photo_url} onChange={(u) => { setForm((f) => ({ ...f, photo_url: u })); if (u) setErr((x) => ({ ...x, photo: "" })); }} />
          {err.photo && <div className="field-error">{err.photo}</div>}
        </div>
        <div className="field"><label>Full Name</label><input className={`input${err.name ? " input-error" : ""}`} value={form.name || ""} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); if (e.target.value) setErr((x) => ({ ...x, name: "" })); }} placeholder="Dr. Maria Rodriguez" />{err.name && <div className="field-error">{err.name}</div>}</div>
        <div className="field"><label>Email</label><input className={`input${err.email ? " input-error" : ""}`} type="email" value={form.email || ""} onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); if (e.target.value) setErr((x) => ({ ...x, email: "" })); }} />{err.email && <div className="field-error">{err.email}</div>}</div>
        <div className="field"><label>Password{editId ? " (leave blank to keep current)" : ""}</label>
          <div className="pass-wrap">
            <input className={`input${err.pass ? " input-error" : ""}`} type={showPass ? "text" : "password"} value={form.pass || ""} placeholder={editId ? "••••••••" : ""} onChange={(e) => { setForm((f) => ({ ...f, pass: e.target.value })); if (e.target.value) setErr((x) => ({ ...x, pass: "" })); }} />
            <button type="button" onClick={() => setShowPass((s) => !s)}><Icon name={showPass ? "eye-off" : "eye"} size={18} /></button>
          </div>
          {err.pass && <div className="field-error">{err.pass}</div>}
        </div>
        <div className="field-row">
          <div className="field"><label>Phone</label><input className={`input${err.phone ? " input-error" : ""}`} value={form.phone || ""} onChange={(e) => { setForm((f) => ({ ...f, phone: e.target.value })); if (e.target.value) setErr((x) => ({ ...x, phone: "" })); }} />{err.phone && <div className="field-error">{err.phone}</div>}</div>
          <div className="field"><label>Site</label><select className={`select${err.site ? " input-error" : ""}`} value={form.site || ""} onChange={(e) => { setForm((f) => ({ ...f, site: e.target.value })); if (e.target.value) setErr((x) => ({ ...x, site: "" })); }}><option value="" disabled>Select a site…</option>{locations.map((l) => <option key={l.id}>{l.name}</option>)}</select>{err.site && <div className="field-error">{err.site}</div>}</div>
        </div>
      </Drawer>
    </Shell>
  );
}
