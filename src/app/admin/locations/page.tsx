"use client";
import { useState, useEffect, useCallback } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import Drawer from "@/components/Drawer";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import { SUPABASE_READY } from "@/lib/supabase";
import { listLocations, createLocation, updateLocation, deleteLocation, listStudents, listEvaluators } from "@/lib/db";
import type { Location } from "@/lib/types";

const COLORS = ["#2563EB", "#7c3aed", "#0d9488", "#f59e0b", "#e11d48", "#0ea5e9"];

export default function Locations() {
  const toast = useToast();
  const [rows, setRows] = useState<Location[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Location>>({});
  const [nameErr, setNameErr] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [delTarget, setDelTarget] = useState<Location | null>(null);
  // map of location id -> {students, evaluators} linked counts
  const [links, setLinks] = useState<Record<string, { students: number; evaluators: number }>>({});

  const reload = useCallback(async () => {
    if (!SUPABASE_READY) return;
    try {
      const locs = await listLocations();
      setRows(locs);
      // count students + evaluators tied to each location (site stores name OR code)
      const [students, evaluators] = await Promise.all([listStudents(), listEvaluators()]);
      const norm = (v: string | null | undefined) => (v || "").trim().toLowerCase();
      const map: Record<string, { students: number; evaluators: number }> = {};
      for (const l of locs) {
        const keys = new Set([norm(l.name), norm(l.code)]);
        const s = students.filter((st) => keys.has(norm(st.site))).length;
        const e = evaluators.filter((ev) => keys.has(norm(ev.site))).length;
        map[l.id] = { students: s, evaluators: e };
      }
      setLinks(map);
    } catch { /* */ }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function confirmDelete() {
    if (!delTarget) return;
    if (SUPABASE_READY) {
      try { await deleteLocation(delTarget.id); toast("Location deleted"); await reload(); }
      catch { toast("Could not delete", "alert-triangle"); }
    } else { toast("Connect Supabase to delete", "info"); }
    setDelTarget(null);
  }

  // colors already taken by OTHER locations (current edited location's own color stays available)
  const usedColors = new Set(rows.filter((l) => l.id !== editId).map((l) => l.color));
  const availableColors = COLORS.filter((c) => !usedColors.has(c));

  function openNew() {
    setEditId(null);
    setForm({ color: availableColors[0] || COLORS[0] });
    setNameErr(""); setCodeErr("");
    setOpen(true);
  }
  function openEdit(l: Location) {
    setEditId(l.id);
    setForm({ name: l.name, code: l.code, color: l.color });
    setNameErr(""); setCodeErr("");
    setOpen(true);
  }

  async function save() {
    let bad = false;
    if (!form.name) { setNameErr("Site name is required"); bad = true; }
    if (!form.code) { setCodeErr("Site code is required"); bad = true; }
    if (bad) return;
    setNameErr(""); setCodeErr("");
    if (SUPABASE_READY) {
      try {
        if (editId) { await updateLocation(editId, form); toast("Location updated"); }
        else { await createLocation(form); toast("Location added"); }
        await reload();
      }
      catch { toast("Could not save", "alert-triangle"); }
    } else { toast("Connect Supabase to save", "info"); }
    setOpen(false); setEditId(null); setForm({});
  }

  return (
    <Shell portal="admin" title="Locations" sub="Evaluation sites across the program">
      <div className="card">
        <div className="card-head">
          <div><h3>Evaluation Sites</h3><div className="sub">Each site has a unique code & color used in reports and the tracker</div></div>
          <button className="btn btn-pri" onClick={openNew}><Icon name="plus" size={16} /> Add Location</button>
        </div>
        <div className="card-pad" style={{ padding: rows.length ? 0 : undefined }}>
          {rows.length === 0 ? (
            <EmptyState icon="map-pin" title="No locations yet"
              text="Add the sites where evaluations take place. Students are tied to a location."
              action={<button className="btn btn-pri" onClick={openNew}><Icon name="plus" size={16} /> Add Location</button>} />
          ) : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Site Name</th><th>Location Code</th><th></th></tr></thead>
              <tbody>{rows.map((l) => {
                const lk = links[l.id] || { students: 0, evaluators: 0 };
                const linked = lk.students + lk.evaluators;
                const why = linked
                  ? `Linked to ${[lk.students && `${lk.students} student${lk.students > 1 ? "s" : ""}`, lk.evaluators && `${lk.evaluators} evaluator${lk.evaluators > 1 ? "s" : ""}`].filter(Boolean).join(" & ")} — reassign or remove them first`
                  : "Delete location";
                return (
                <tr key={l.id}>
                  <td><b>{l.name}</b></td>
                  <td><span className="pill" style={{ background: `${l.color}1a`, color: l.color }}><span className="sdot" style={{ background: l.color }} /> {l.code}</span></td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      {linked > 0 && <span className="pill" style={{ background: "#f1f5f9", color: "#475569", fontSize: 11 }}><Icon name="link" size={12} /> {linked} linked</span>}
                      <button className="btn btn-icon btn-xs btn-ghost" onClick={() => openEdit(l)}><Icon name="pencil" size={14} /></button>
                      <button className="btn btn-icon btn-xs btn-ghost" title={why} disabled={linked > 0}
                        style={linked > 0 ? { opacity: 0.4, cursor: "not-allowed" } : { color: "#e11d48" }}
                        onClick={() => linked === 0 && setDelTarget(l)}>
                        <Icon name="trash-2" size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ); })}</tbody>
            </table></div>
          )}
        </div>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} title={editId ? "Edit Location" : "Add Location"} sub="Sites identify where evaluations happen"
        footer={<><button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-pri" onClick={save}>Save Location</button></>}>
        <div className="field"><label>Site Name</label><input className={`input${nameErr ? " input-error" : ""}`} value={form.name || ""} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); if (e.target.value) setNameErr(""); }} placeholder="e.g. Mexico City" />{nameErr && <div className="field-error">{nameErr}</div>}</div>
        <div className="field"><label>Site Code</label><input className={`input${codeErr ? " input-error" : ""}`} value={form.code || ""} onChange={(e) => { setForm((f) => ({ ...f, code: e.target.value })); if (e.target.value) setCodeErr(""); }} placeholder="e.g. MEX-01" />{codeErr && <div className="field-error">{codeErr}</div>}</div>
        <div className="field"><label>Color</label>
          <div style={{ display: "flex", gap: 10 }}>
            {availableColors.map((c) => (
              <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                style={{ width: 34, height: 34, borderRadius: 10, background: c, border: form.color === c ? "3px solid #0F1B3D" : "2px solid #fff", boxShadow: "0 0 0 1px var(--line)", cursor: "pointer" }} />
            ))}
            {availableColors.length === 0 && <div className="sub">All colors are in use. Free one up by editing another location.</div>}
          </div>
        </div>
        <div className="hint-box"><Icon name="info" size={16} /> The code and color identify this location in reports, chats, and the evaluation tracker.</div>
      </Drawer>

      <Modal open={!!delTarget} onClose={() => setDelTarget(null)} danger
        title="Delete location?"
        message={`This will permanently remove "${delTarget?.name}" (${delTarget?.code}). This can't be undone.`}
        confirmLabel="Delete" onConfirm={confirmDelete} />
    </Shell>
  );
}
