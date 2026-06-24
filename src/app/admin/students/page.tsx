"use client";
import { useState, useEffect, useCallback } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import Drawer from "@/components/Drawer";
import DateField from "@/components/DateField";
import FileDrop from "@/components/FileDrop";
import { useToast } from "@/components/Toast";
import { SUPABASE_READY } from "@/lib/supabase";
import { listGroups, listStudents, createGroup, updateGroup, deleteGroup, createStudent, updateStudent, deleteStudent, createStudents, listBatches, listLocations, listCases, listEvaluations, listEvaluators } from "@/lib/db";
import type { Group, Student, Batch, Location, CaseRow, Evaluation, Profile } from "@/lib/types";
import { parseStudentSheet, downloadStudentTemplate, type ImportedStudent } from "@/lib/importSheet";
import { uploadFromUrl } from "@/lib/upload";

const SLOTS = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM"];

// Local YYYY-MM-DD for "today" (no UTC shift) — used to lock past assessments
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// An assessment is locked once its date is strictly before today (assessment over)
function isLocked(dateStr: string) {
  return dateStr < todayStr();
}

// Windowed page numbers: 1 … (cur-1) cur (cur+1) … last
function pageWindow(cur: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "...")[] = [1];
  const start = Math.max(2, cur - 1);
  const end = Math.min(total - 1, cur + 1);
  if (start > 2) out.push("...");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("...");
  out.push(total);
  return out;
}

export default function Students() {
  const toast = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [startedDates, setStartedDates] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, { total: number; byLoc: Record<string, number> }>>({});
  const [locations, setLocations] = useState<Location[]>([]);
  const [active, setActive] = useState<Group | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [groupCases, setGroupCases] = useState<CaseRow[]>([]);
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [evaluators, setEvaluators] = useState<Profile[]>([]);
  const [detail, setDetail] = useState<Student | null>(null);
  const [showIdCard, setShowIdCard] = useState(false);
  const [site, setSite] = useState("all");
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [showIds, setShowIds] = useState(false);

  const EXPECTED_EVALUATORS = 3; // panel size per case

  const siteTabs = [{ key: "all", label: "All Sites" }, ...locations.map((l) => ({ key: l.name, label: l.name }))];
  const firstSite = locations[0]?.name || "";

  // Resolve a sheet "Sede" value (a location code OR name) to an existing Location.
  function resolveLocation(sede: string): Location | undefined {
    const v = (sede || "").trim().toLowerCase();
    if (!v) return undefined;
    return locations.find(
      (l) => l.code?.trim().toLowerCase() === v || l.name?.trim().toLowerCase() === v
    );
  }

  const [dGroup, setDGroup] = useState(false);
  const [dAdd, setDAdd] = useState(false);
  const [dImport, setDImport] = useState(false);

  const [gDate, setGDate] = useState("");
  const [gErr, setGErr] = useState("");
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [form, setForm] = useState<Partial<Student>>({ slot: "8:00 AM" });
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [sErr, setSErr] = useState<Record<string, string>>({});

  // Bulk import preview state
  const [preview, setPreview] = useState<ImportedStudent[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importProg, setImportProg] = useState<{ done: number; total: number } | null>(null);

  // Codes present in the current preview that don't match any existing location.
  const unmatchedCodes = preview
    ? Array.from(new Set(preview.map((r) => (r.site || "").trim()).filter((c) => c && !resolveLocation(c))))
    : [];

  const reload = useCallback(async () => {
    if (!SUPABASE_READY) { setLoaded(true); return; }
    try { setGroups(await listGroups()); } catch { /* */ }
    try {
      const bs = await listBatches();
      setBatches(bs);
      const cs = await listCases();                     // all cases across batches
      const batchIdsWithCases = new Set(cs.map((c) => c.batch_id));
      setStartedDates(new Set(bs.filter((b) => batchIdsWithCases.has(b.id)).map((b) => b.assessment_date)));
    } catch { /* */ }
    try { setLocations(await listLocations()); } catch { /* */ }
    try {
      const all = await listStudents();
      const map: Record<string, { total: number; byLoc: Record<string, number> }> = {};
      for (const s of all) {
        const gid = (s as Student).group_id;
        if (!gid) continue;
        if (!map[gid]) map[gid] = { total: 0, byLoc: {} };
        map[gid].total++;
        const loc = (s as Student).site || "";
        map[gid].byLoc[loc] = (map[gid].byLoc[loc] || 0) + 1;
      }
      setCounts(map);
    } catch { /* */ }
    setLoaded(true);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function openGroup(g: Group) {
    setActive(g);
    setGroupCases([]); setEvals([]); setSite("all"); setPage(1);
    if (!SUPABASE_READY) return;
    try { setStudents(await listStudents(g.id)); } catch { setStudents([]); }
    try {
      // Cases attached to this assessment = cases of the batch with the same date
      const batch = batches.find((b) => b.assessment_date === g.assessment_date);
      if (batch) setGroupCases(await listCases(batch.id));
    } catch { setGroupCases([]); }
    try { setEvals(await listEvaluations()); } catch { setEvals([]); }
    try { if (!evaluators.length) setEvaluators(await listEvaluators()); } catch { /* */ }
  }

  /* status of one student × one case.
     An evaluator is "attached" the moment they OPEN the case (an evaluation row exists).
       - status 'submitted'   -> green (ok)
       - status 'started' -> orange (prog), shown as "Pending"
     Grey dots = empty/closed slots (no evaluator attached) -> NOT pending, just default.
     Dot count = max(3, number of attached evaluators) so 4 evaluators -> 4 dots.
     Case state:
       - 'no'   : nobody opened it yet (all grey)        -> Not started
       - 'prog' : someone opened but not everyone done   -> In progress
       - 'ok'   : at least 1 attached and all submitted   -> Completed */
  function caseStatus(studentId: string, caseId: string) {
    const rows = evals.filter((e) => e.student_id === studentId && e.case_id === caseId);
    // newest first so submitted ones surface; sort: submitted before in_progress is not required
    const submitted = rows.filter((r) => r.status === "finished");
    const inProgress = rows.filter((r) => r.status === "started");
    const attached = [...submitted, ...inProgress];

    const slots = Math.max(EXPECTED_EVALUATORS, attached.length);
    const dots: ("ok" | "prog" | "no")[] = [];
    for (let i = 0; i < slots; i++) {
      if (i < submitted.length) dots.push("ok");
      else if (i < attached.length) dots.push("prog");
      else dots.push("no");
    }

    let state: "ok" | "prog" | "no";
    if (attached.length === 0) state = "no";
    else if (inProgress.length === 0) state = "ok";
    else state = "prog";

    return { state, dots, submitted, inProgress, attached };
  }

  function evaluatorFor(ev: Evaluation): Profile | undefined {
    return evaluators.find((p) => p.id === ev.evaluator_id || p.full_name === ev.evaluator_name);
  }

  function fmtTime(iso: string) {
    try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
    catch { return iso; }
  }

  function openGroupEdit(g: Group) {
    setEditGroup(g);
    setGDate(g.assessment_date);
    setGErr("");
    setDGroup(true);
  }

  async function removeGroup(g: Group) {
    if ((counts[g.id]?.total || 0) > 0) return;
    if (!confirm(`Delete assessment group "${g.assessment_date}"? This cannot be undone.`)) return;
    try {
      await deleteGroup(g.id);
      await reload();
      toast("Group deleted");
    } catch {
      toast("Could not delete the group. Please try again.");
    }
  }

  function openGroupNew() {
    setEditGroup(null);
    setGDate("");
    setGErr("");
    setDGroup(true);
  }

  async function saveGroup() {
    if (!gDate) { setGErr("Please select an assessment date."); return; }
    // When creating a new group the date can't be in the past. When editing an
    // existing group we allow its (possibly past) date to remain.
    if (!editGroup && gDate < todayStr()) {
      setGErr("Assessment date cannot be in the past.");
      return;
    }
    if (groups.some((g) => g.assessment_date === gDate && g.id !== editGroup?.id)) {
      setGErr("An assessment group already exists for this date.");
      return;
    }
    setGErr("");
    if (SUPABASE_READY) {
      try {
        if (editGroup) {
          await updateGroup(editGroup.id, { assessment_date: gDate });
          await reload();
          toast("Group updated");
        } else {
          await createGroup({ assessment_date: gDate, description: "" });
          await reload();
          toast("Group created");
        }
      }
      catch { toast("Could not save — check Supabase", "alert-triangle"); }
    } else { toast("Connect Supabase to save", "info"); }
    setDGroup(false); setGDate(""); setGErr(""); setEditGroup(null);
  }

  async function saveStudent() {
    if (!active) return;
    const errs: Record<string, string> = {};
    if (!form.photo_url) errs.photo = "Photo is required.";
    if (!form.idcard_url) errs.idcard = "ID card is required.";
    if (!form.name?.trim()) errs.name = "Name is required.";
    if (!form.qrtexto?.trim()) errs.qrtexto = "Folio is required.";
    if (!form.site) errs.site = "Site is required.";
    if (!form.slot) errs.slot = "Slot is required.";
    if (Object.keys(errs).length) { setSErr(errs); return; }
    setSErr({});
    if (SUPABASE_READY) {
      try {
        if (editStudent) {
          await updateStudent(editStudent.id, { ...form });
          toast("Student updated");
        } else {
          await createStudent({ ...form, group_id: active.id });
          toast("Student registered");
        }
        setStudents(await listStudents(active.id));
      } catch { toast("Could not save", "alert-triangle"); }
    } else { toast("Connect Supabase to save", "info"); }
    setDAdd(false); setForm({ slot: "8:00 AM" }); setEditStudent(null);
  }

  async function removeStudent() {
    if (!editStudent || !active) return;
    if (!confirm(`Delete student "${editStudent.name}"? This cannot be undone.`)) return;
    if (SUPABASE_READY) {
      try { await deleteStudent(editStudent.id); setStudents(await listStudents(active.id)); toast("Student deleted"); }
      catch { toast("Could not delete", "alert-triangle"); }
    } else { toast("Connect Supabase to save", "info"); }
    setDAdd(false); setForm({ slot: "8:00 AM" }); setEditStudent(null);
  }

  async function onPickFile(file: File) {
    setParsing(true);
    setPreview(null);
    try {
      const rows = await parseStudentSheet(file);
      if (!rows.length) { toast("No valid rows found in file", "alert-triangle"); setParsing(false); return; }
      setPreview(rows);
    } catch { toast("Could not parse file", "alert-triangle"); }
    setParsing(false);
  }

  async function confirmImport() {
    if (!preview || !active) return;
    if (unmatchedCodes.length) {
      toast(`Add these locations first: ${unmatchedCodes.join(", ")}`, "alert-triangle");
      return;
    }
    setImporting(true);
    try {
      if (SUPABASE_READY) {
        // Re-host every remote photo / ID-card URL into our own Supabase
        // Storage buckets, then save the hosted URL (not the external link).
        const rows = [];
        for (let i = 0; i < preview.length; i++) {
          const r = preview[i];
          setImportProg({ done: i, total: preview.length });
          const photo = r.photo_url ? await uploadFromUrl("student-photos", r.photo_url) : null;
          const idcard = r.idcard_url ? await uploadFromUrl("student-idcards", r.idcard_url) : null;
          const loc = resolveLocation(r.site);
          rows.push({
            group_id: active.id,
            name: r.name,
            qrtexto: r.qrtexto,
            site: loc?.name || r.site || firstSite,
            slot: r.slot || "8:00 AM",
            photo_url: photo,
            idcard_url: idcard,
          });
        }
        await createStudents(rows);
        setStudents(await listStudents(active.id));
        toast(`Imported ${rows.length} student${rows.length === 1 ? "" : "s"}`);
      } else { toast("Connect Supabase to save", "info"); }
      setDImport(false); setPreview(null);
    } catch { toast("Could not import — check Supabase", "alert-triangle"); }
    setImporting(false); setImportProg(null);
  }

  function closeImport() { setDImport(false); setPreview(null); setParsing(false); }

  const filtered = site === "all" ? students : students.filter((s) => s.site === site);
  const PAGE_SIZE = 12; // ~4 rows of 3 cards
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, pageCount);
  const paged = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  return (
    <Shell portal="admin" title="Students" sub="Assessment groups, organized by date">
      {!active ? (
        <div className="card">
          <div className="card-head">
            <div><h3>Assessment Groups</h3><div className="sub">Each group is identified by its assessment date</div></div>
            <button className="btn btn-pri" onClick={openGroupNew}><Icon name="plus" size={16} /> New Group</button>
          </div>
          <div className="card-pad" style={{ padding: groups.length ? 0 : undefined }}>
            {groups.length === 0 ? (
              <EmptyState icon="calendar" title="No assessment groups yet"
                text="Create an assessment group (by date), then add or import students into it."
                action={<button className="btn btn-pri" onClick={openGroupNew}><Icon name="plus" size={16} /> New Group</button>} />
            ) : (
              <div className="tbl-wrap"><table className="tbl tbl-clickable">
                <thead><tr><th>Assessment Date</th><th style={{ textAlign: "center" }}>Cases</th>{locations.map((l) => <th key={l.id}>{l.name}</th>)}<th style={{ textAlign: "center" }}>Total</th><th></th></tr></thead>
                <tbody>{groups.map((g) => {
                  const hasCases = startedDates.has(g.assessment_date);
                  const locked = isLocked(g.assessment_date);
                  const c = counts[g.id] || { total: 0, byLoc: {} };
                  const hasStudents = c.total > 0;
                  return (
                  <tr key={g.id} onClick={() => openGroup(g)}>
                    <td><b>{g.assessment_date}</b></td>
                    <td style={{ textAlign: "center" }}>
                      {!loaded
                        ? <span className="case-tick muted">—</span>
                        : hasCases
                          ? <Icon name="check-circle-2" size={18} className="case-tick ok" />
                          : <Icon name="x-circle" size={18} className="case-tick no" />}
                    </td>
                    {locations.map((l) => <td key={l.id}>{c.byLoc[l.name] || 0}</td>)}
                    <td style={{ textAlign: "center" }}><b>{c.total}</b></td>
                    <td>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        {locked
                          ? <button className="btn btn-icon btn-xs is-locked" disabled title="Assessment is over — locked" onClick={(e) => e.stopPropagation()}><Icon name="lock" size={14} /></button>
                          : <>
                              <button className="btn btn-icon btn-xs btn-ghost" onClick={(e) => { e.stopPropagation(); openGroupEdit(g); }}><Icon name="pencil" size={14} /></button>
                              <button className="btn btn-icon btn-xs btn-ghost" disabled={hasStudents}
                                title={hasStudents ? "Students are already added — remove them before deleting this group" : "Delete group"}
                                style={hasStudents ? { opacity: .4, cursor: "not-allowed" } : { color: "#e11d48" }}
                                onClick={(e) => { e.stopPropagation(); removeGroup(g); }}>
                                <Icon name="trash-2" size={14} />
                              </button>
                            </>}
                      </div>
                    </td>
                  </tr>
                );})}</tbody>
              </table></div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="group-ctx" style={{ marginBottom: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setActive(null)}><Icon name="arrow-left" size={14} /> All Groups</button>
            <span className="gname">Assessment {active.assessment_date}</span>
            {isLocked(active.assessment_date) && <span className="pill pill-grey" style={{ marginLeft: 8 }}><Icon name="lock" size={12} /> Locked</span>}
          </div>
          {isLocked(active.assessment_date) && (
            <div className="hint-box" style={{ marginBottom: 16, background: "#f1f5f9", borderColor: "#e2e8f0", color: "#475569" }}>
              <Icon name="lock" size={16} /> This assessment is over and has been locked. Students can be viewed but not added, imported, or edited.
            </div>
          )}
          <div className="card-head" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <div className="tabs scroll-tabs">
              {siteTabs.map((s) => (
                <button key={s.key} className={`tab ${site === s.key ? "active" : ""}`} onClick={() => { setSite(s.key); setPage(1); }}>{s.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className={`btn ${showIds ? "btn-active" : "btn-ghost"}`} onClick={() => setShowIds((v) => !v)}><Icon name={showIds ? "eye-off" : "eye"} size={16} /> {showIds ? "Hide ID cards" : "Show ID cards"}</button>
              {!isLocked(active.assessment_date) && <>
                <button className="btn btn-ghost" onClick={() => setDImport(true)}><Icon name="upload" size={16} /> Import</button>
                <button className="btn btn-pri" onClick={() => { setEditStudent(null); setForm({ slot: "8:00 AM" }); setSErr({}); setDAdd(true); }}><Icon name="user-plus" size={16} /> Add Student</button>
              </>}
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="card"><div className="card-pad">
              <EmptyState icon="users" title="No students in this group"
                text={isLocked(active.assessment_date) ? "This assessment is locked — no students were added." : "Register students individually or import a spreadsheet (xlsx, xls, csv)."}
                action={isLocked(active.assessment_date) ? undefined : <button className="btn btn-pri" onClick={() => { setEditStudent(null); setForm({ slot: "8:00 AM" }); setSErr({}); setDAdd(true); }}><Icon name="user-plus" size={16} /> Add Student</button>} />
            </div></div>
          ) : (
            <><div className="grid g-3">{paged.map((s) => (
              <div className="case-tile student-tile is-clickable" key={s.id} onClick={() => { setShowIdCard(false); setDetail(s); }}>
                <div className="st-head">
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {s.photo_url ? <img src={s.photo_url} className="av-md" alt="" style={{ borderRadius: "50%" }} /> : <span className="av-md" style={{ borderRadius: "50%", background: "var(--brand-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", fontWeight: 800 }}>{s.name[0]}</span>}
                    <div><div className="nm">{s.name}</div><div className="sub" style={{ fontSize: 12 }}>{s.qrtexto}</div></div>
                  </div>
                  {!isLocked(active.assessment_date) && <button className="btn btn-icon btn-xs btn-ghost btn-edit-sm" onClick={(e) => { e.stopPropagation(); setEditStudent(s); setForm(s); setSErr({}); setDAdd(true); }}><Icon name="pencil" size={14} /></button>}
                </div>
                <div className="st-meta"><span className="slot-chip"><Icon name="map-pin" size={13} /> {s.site}</span><span className="slot-chip"><Icon name="clock" size={13} /> {s.slot}</span></div>
                <div className="st-cases">
                  {(groupCases.length ? groupCases : [0, 1, 2]).map((c, i) => {
                    const caseId = groupCases[i]?.id;
                    const st = caseId ? caseStatus(s.id, caseId) : { state: "no" as const, dots: ["no", "no", "no"] as ("ok" | "prog" | "no")[] };
                    const icon = st.state === "ok" ? "check-circle-2" : st.state === "prog" ? "clock" : "circle";
                    const color = st.state === "ok" ? "#16a34a" : st.state === "prog" ? "#f59e0b" : "#cbd5e1";
                    return (
                      <div className={`scase ${st.state}`} key={i}>
                        <div className="scase-lbl">Case {i + 1}</div>
                        <Icon name={icon} size={19} style={{ color }} />
                        <span className="edots">{st.dots.map((d, di) => <span key={di} className={`edot ed-${d}`} />)}</span>
                      </div>
                    );
                  })}
                </div>
                {showIds && (
                  <div className="st-idcard">
                    <div className="st-idcard-lbl"><Icon name="credit-card" size={13} /> ID CARD</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {s.idcard_url
                      ? <img src={s.idcard_url} alt="ID card" />
                      : <div className="st-idcard-empty"><Icon name="image" size={18} /> No ID card</div>}
                  </div>
                )}
              </div>
            ))}</div>
            {pageCount > 1 && (
              <div className="pager">
                <span className="pager-info">
                  Showing {(curPage - 1) * PAGE_SIZE + 1}–{Math.min(curPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div className="pager-ctrls">
                  <button className="btn btn-ghost btn-sm" disabled={curPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><Icon name="chevron-left" size={15} /> Prev</button>
                  {pageWindow(curPage, pageCount).map((n, i) =>
                    n === "..." ? (
                      <span key={`e${i}`} className="pager-ellipsis">…</span>
                    ) : (
                      <button key={n} className={`btn btn-sm ${n === curPage ? "btn-pri" : "btn-ghost"}`} onClick={() => setPage(n as number)}>{n}</button>
                    )
                  )}
                  <button className="btn btn-ghost btn-sm" disabled={curPage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next <Icon name="chevron-right" size={15} /></button>
                </div>
              </div>
            )}
            </>
          )}
        </>
      )}

      {/* Student detail drawer */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} wide
        title="Student Evaluation Details"
        sub={detail ? (() => {
          const done = groupCases.reduce((n, c) => n + caseStatus(detail.id, c.id).submitted.length, 0);
          return `${done} evaluation${done === 1 ? "" : "s"} submitted across ${groupCases.length || 0} case${groupCases.length === 1 ? "" : "s"}`;
        })() : ""}
        footer={<button className="btn btn-ghost" onClick={() => setDetail(null)}>Close</button>}>
        {detail && (
          <>
            <div className="std-profile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {detail.photo_url ? <img src={detail.photo_url} className="av-xl" alt="" /> : <span className="av-xl" style={{ borderRadius: 16, background: "var(--brand-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", fontWeight: 800, fontSize: 28 }}>{detail.name[0]}</span>}
              <div>
                <div className="std-name">{detail.name}</div>
                <div className="std-id">{detail.qrtexto}</div>
                <div className="st-meta" style={{ marginTop: 10 }}><span className="slot-chip"><Icon name="map-pin" size={13} /> {detail.site}</span><span className="slot-chip"><Icon name="clock" size={13} /> {detail.slot}</span></div>
              </div>
              {detail.idcard_url && (
                <button className="btn btn-ghost btn-xs" style={{ marginLeft: "auto", alignSelf: "flex-start" }} onClick={() => setShowIdCard((v) => !v)}>
                  <Icon name={showIdCard ? "eye-off" : "id-card"} size={14} /> {showIdCard ? "Hide ID card" : "Show ID card"}
                </button>
              )}
            </div>
            {showIdCard && detail.idcard_url && (
              <div style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 16 }}>
                <div className="sub" style={{ marginBottom: 8, fontWeight: 700 }}>ID Card</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detail.idcard_url} alt="ID card" style={{ width: "100%", maxWidth: 420, borderRadius: 12, border: "1px solid var(--line)", display: "block" }} />
              </div>
            )}
            {groupCases.length === 0 ? (
              <EmptyState icon="clipboard-list" title="No cases attached" text="No cases batch is assigned to this assessment date yet." />
            ) : (
              <div className="std-cases">
                {groupCases.map((c, i) => {
                  const st = caseStatus(detail.id, c.id);
                  const badge = st.state === "ok" ? { cls: "cd-ok", icon: "check-circle-2", txt: "Completed" } : st.state === "prog" ? { cls: "cd-prog", icon: "clock", txt: "In progress" } : { cls: "cd-no", icon: "circle", txt: "Not started" };
                  return (
                    <div className="cd-case" key={c.id}>
                      <div className="cd-chead">
                        <div className="cd-ctitle"><span className="cd-cnum">Case {i + 1}</span>{c.name}</div>
                        <span className={`cd-badge ${badge.cls}`}><Icon name={badge.icon} size={13} /> {badge.txt}</span>
                      </div>
                      {st.attached.length > 0 && (
                        <div className="cd-sub">
                          {`${st.submitted.length} of ${st.attached.length} evaluator${st.attached.length === 1 ? "" : "s"} submitted`}
                        </div>
                      )}
                      <div className="cd-docs">
                        {st.attached.length === 0 ? null : (<>
                          {st.submitted.map((ev) => {
                            const p = evaluatorFor(ev);
                            return (
                              <div className="cd-doc" key={ev.id}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {p?.photo_url ? <img src={p.photo_url} className="doc-ph" alt="" /> : <span className="doc-ph" style={{ background: "var(--brand-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", fontWeight: 800, fontSize: 13 }}>{(ev.evaluator_name || "?")[0]}</span>}
                                <div className="cd-dmeta">
                                  <div className="cd-dname">{ev.evaluator_name}</div>
                                  <div className="cd-dtime"><Icon name="calendar-check" size={13} /> Submitted {ev.submitted_at ? fmtTime(ev.submitted_at) : ""}</div>
                                </div>
                                <Icon name="check" size={18} className="cd-tick" />
                              </div>
                            );
                          })}
                          {st.inProgress.map((ev) => {
                            const p = evaluatorFor(ev);
                            return (
                              <div className="cd-doc cd-pend" key={ev.id}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {p?.photo_url ? <img src={p.photo_url} className="doc-ph" alt="" style={{ opacity: .85 }} /> : <span className="doc-ph" style={{ background: "#fef3c7", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#b45309", fontWeight: 800, fontSize: 13 }}>{(ev.evaluator_name || "?")[0]}</span>}
                                <div className="cd-dmeta">
                                  <div className="cd-dname">{ev.evaluator_name}</div>
                                  <div className="cd-dtime cd-dpend" style={{ color: "#b45309" }}><Icon name="clock" size={13} /> Pending · not submitted</div>
                                </div>
                                <span className="cd-wait" style={{ color: "#b45309", fontWeight: 700 }}>•••</span>
                              </div>
                            );
                          })}
                        </>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Drawer>

      {/* New Group drawer */}
      <Drawer open={dGroup} onClose={() => { setDGroup(false); setGErr(""); setEditGroup(null); }} title={editGroup ? "Edit Assessment Group" : "New Assessment Group"}
        sub="Groups are identified by assessment date"
        footer={<><button className="btn btn-ghost" onClick={() => { setDGroup(false); setEditGroup(null); }}>Cancel</button><button className="btn btn-pri" onClick={saveGroup}>{editGroup ? "Save Changes" : "Create Group"}</button></>}>
        <DateField label="Assessment Date" value={gDate} onChange={(v) => { setGDate(v); if (v) setGErr(""); }} error={gErr} min={editGroup ? undefined : todayStr()} />
        <div className="hint-box"><Icon name="info" size={16} /> A unique Group ID is generated automatically. Students within a group are organized by site and slot.</div>
      </Drawer>

      {/* Add student drawer */}
      <Drawer open={dAdd} onClose={() => { setDAdd(false); setSErr({}); setEditStudent(null); }} wide title={editStudent ? "Edit Student" : "Register Student"}
        sub={active ? `Assessment ${active.assessment_date} · all fields required` : ""}
        footer={<><button className="btn btn-ghost" onClick={() => { setDAdd(false); setSErr({}); setEditStudent(null); }}>Cancel</button><button className="btn btn-pri" onClick={saveStudent}>{editStudent ? "Save Changes" : "Register"}</button></>}>
        <div className="field-row" style={{ marginBottom: 14 }}>
          <div className="field">
            <FileDrop bucket="student-photos" label="Foto" shape="circle" value={form.photo_url} onChange={(u) => { setForm((f) => ({ ...f, photo_url: u })); if (u) setSErr((e) => ({ ...e, photo: "" })); }} />
            {sErr.photo && <div className="field-error">{sErr.photo}</div>}
          </div>
          <div className="field">
            <FileDrop bucket="student-idcards" label="ID Card" doc value={form.idcard_url} onChange={(u) => { setForm((f) => ({ ...f, idcard_url: u })); if (u) setSErr((e) => ({ ...e, idcard: "" })); }} />
            {sErr.idcard && <div className="field-error">{sErr.idcard}</div>}
          </div>
        </div>
        <div className="field-row">
          <div className="field"><label>Nombre</label><input className={`input${sErr.name ? " input-error" : ""}`} value={form.name || ""} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); if (e.target.value) setSErr((x) => ({ ...x, name: "" })); }} />{sErr.name && <div className="field-error">{sErr.name}</div>}</div>
          <div className="field"><label>Folio</label><input className={`input${sErr.qrtexto ? " input-error" : ""}`} value={form.qrtexto || ""} onChange={(e) => { setForm((f) => ({ ...f, qrtexto: e.target.value })); if (e.target.value) setSErr((x) => ({ ...x, qrtexto: "" })); }} />{sErr.qrtexto && <div className="field-error">{sErr.qrtexto}</div>}</div>
        </div>
        <div className="field-row">
          <div className="field"><label>Sede</label><select className={`select${sErr.site ? " input-error" : ""}`} value={form.site || ""} onChange={(e) => { setForm((f) => ({ ...f, site: e.target.value })); if (e.target.value) setSErr((x) => ({ ...x, site: "" })); }}><option value="" disabled>Select a location…</option>{locations.map((l) => <option key={l.id}>{l.name}</option>)}</select>{sErr.site && <div className="field-error">{sErr.site}</div>}</div>
          <div className="field"><label>Slot</label><select className="select" value={form.slot || ""} onChange={(e) => setForm((f) => ({ ...f, slot: e.target.value }))}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        {editStudent && (
          <button className="btn btn-danger" style={{ width: "100%", justifyContent: "center", marginTop: 22 }} onClick={removeStudent}>
            <Icon name="trash-2" size={16} /> Delete Student
          </button>
        )}
      </Drawer>

      {/* Import drawer */}
      <Drawer open={dImport} onClose={closeImport} wide={!!preview}
        title="Import Students"
        sub={preview ? `Review ${preview.length} row${preview.length === 1 ? "" : "s"} before importing` : "Upload a spreadsheet (xlsx, xls, csv)"}
        footer={preview ? (
          <>
            <button className="btn btn-ghost" onClick={() => setPreview(null)} disabled={importing}>Back</button>
            <button className="btn btn-pri" onClick={confirmImport} disabled={importing || unmatchedCodes.length > 0}>
              <Icon name={importing ? "loader" : "check"} size={16} /> {importing ? (importProg ? `Saving photos ${importProg.done}/${importProg.total}…` : "Importing…") : `Confirm import (${preview.length})`}
            </button>
          </>
        ) : undefined}>
        {!preview ? (
          <>
            <div className="hint-box" style={{ marginBottom: 14 }}><Icon name="info" size={16} /> Expected columns: <b>NOMBRE</b>, <b>Folio</b>, <b>IDENTIFICACION</b></div>
            <label className="btn btn-pri btn-block" style={{ cursor: "pointer", marginBottom: 10 }}>
              <Icon name={parsing ? "loader" : "upload"} size={16} /> {parsing ? "Reading file…" : "Choose CSV / Excel file"}
              <input type="file" accept=".xlsx,.xls,.csv" hidden disabled={parsing} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ""; }} />
            </label>
            <button className="btn btn-ghost btn-block" onClick={downloadStudentTemplate}>
              <Icon name="download" size={16} /> Download empty template
            </button>
          </>
        ) : (
          <>
            {unmatchedCodes.length > 0 ? (
              <div className="hint-box" style={{ marginBottom: 14, background: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" }}>
                <Icon name="alert-triangle" size={16} />
                <span>
                  These location codes are not registered: <b>{unmatchedCodes.join(", ")}</b>.{" "}
                  Add them on the <b>Locations</b> page (matching the code exactly) before importing.
                </span>
              </div>
            ) : (
              <div className="hint-box" style={{ marginBottom: 14 }}><Icon name="info" size={16} /> All locations matched. Adding to assessment <b>{active?.assessment_date}</b> after you confirm.</div>
            )}
            <div className="tbl-wrap" style={{ maxHeight: "55vh", overflow: "auto" }}>
              <table className="tbl">
                <thead><tr><th style={{ width: 36 }}>#</th><th>Foto</th><th>Nombre</th><th>Folio</th><th>Sede (code)</th><th>Location</th><th>Slot</th></tr></thead>
                <tbody>
                  {preview.map((r, i) => {
                    const loc = resolveLocation(r.site);
                    return (
                    <tr key={i} style={r.site && !loc ? { background: "#fef2f2" } : undefined}>
                      <td className="sub">{i + 1}</td>
                      <td>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {r.photo_url ? <img src={r.photo_url} alt="" className="av-sm" style={{ borderRadius: "50%", width: 30, height: 30, objectFit: "cover" }} /> : <span className="av-sm" style={{ borderRadius: "50%", width: 30, height: 30, background: "var(--brand-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", fontWeight: 800, fontSize: 12 }}>{(r.name || "?")[0]}</span>}
                      </td>
                      <td>{r.name || <span className="sub">—</span>}</td>
                      <td><span style={{ fontFamily: "var(--mono, monospace)" }}>{r.qrtexto || <span className="sub">—</span>}</span></td>
                      <td><span style={{ fontFamily: "var(--mono, monospace)" }}>{r.site || <span className="sub">—</span>}</span></td>
                      <td>
                        {loc ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#16a34a", fontWeight: 600 }}><Icon name="check-circle-2" size={14} /> {loc.name}</span>
                        ) : r.site ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#dc2626", fontWeight: 600 }}><Icon name="x-circle" size={14} /> Not found</span>
                        ) : (
                          <span className="sub">{firstSite || "—"}</span>
                        )}
                      </td>
                      <td>{r.slot || <span className="sub">—</span>}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Drawer>
    </Shell>
  );
}
