"use client";
import { useState, useEffect, useCallback } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import Drawer from "@/components/Drawer";
import { useToast } from "@/components/Toast";
import { SUPABASE_READY } from "@/lib/supabase";
import { listGroups, listBatches, createBatch, deleteBatch, listCases, createCase, updateCase, deleteCase, listQuestions, createQuestion, deleteQuestion } from "@/lib/db";
import type { Group, RubricOption } from "@/lib/types";
import { RUBRIC_LEVELS, type QuestionType } from "@/lib/types";
import { parseCaseSheet, downloadCaseTemplate, type ImportedCriterio } from "@/lib/importSheet";

interface DraftQ { id: string; title: string; type: QuestionType; levels?: Record<string, string> }
interface DraftCase { id: string; name: string; desc: string; questions: DraftQ[] }
interface DraftBatch { id: string; date: string; cases: DraftCase[] }

const PILLS = ["#2563EB", "#7c3aed", "#0d9488"];

function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function isLocked(dateStr: string) { return dateStr < todayStr(); }

export default function Cases() {
  const toast = useToast();
  const [batches, setBatches] = useState<DraftBatch[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [active, setActive] = useState<DraftBatch | null>(null);

  // batch drawer
  const [dBatch, setDBatch] = useState(false);
  const [bDate, setBDate] = useState("");
  const [bErr, setBErr] = useState("");

  // case drawer
  const [dCase, setDCase] = useState(false);
  const [editCase, setEditCase] = useState<DraftCase | null>(null);
  const [caseName, setCaseName] = useState("");
  const [caseDesc, setCaseDesc] = useState("");
  const [draftQs, setDraftQs] = useState<DraftQ[]>([]);
  const [qType, setQType] = useState<QuestionType>("rubric");
  const [qTitle, setQTitle] = useState("");
  const [qLevels, setQLevels] = useState<Record<string, string>>({});
  const [qErr, setQErr] = useState("");
  const [editingQId, setEditingQId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [caseErr, setCaseErr] = useState("");

  // import-case drawer
  const [dImport, setDImport] = useState(false);
  const [impName, setImpName] = useState("");
  const [impCriterios, setImpCriterios] = useState<ImportedCriterio[]>([]);
  const [impFileName, setImpFileName] = useState("");
  const [impNameErr, setImpNameErr] = useState("");
  const [impFileErr, setImpFileErr] = useState("");
  const [importing, setImporting] = useState(false);

  const reload = useCallback(async () => {
    if (!SUPABASE_READY) return;
    try {
      const [g, b] = await Promise.all([listGroups(), listBatches()]);
      setGroups(g);
      const withCounts: DraftBatch[] = await Promise.all(b.map(async (x) => {
        const cs = await listCases(x.id);
        const full: DraftCase[] = await Promise.all(cs.map(async (c) => {
          const qs = await listQuestions(c.id);
          return {
            id: c.id, name: c.name, desc: c.description || "",
            questions: qs.map((q) => ({
              id: q.id, title: q.title, type: q.type,
              levels: q.type === "rubric" ? Object.fromEntries((q.options || []).map((o) => [o.level, o.desc])) : undefined,
            })),
          };
        }));
        return { id: x.id, date: x.assessment_date, cases: full };
      }));
      setBatches(withCounts);
    } catch { /* */ }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // load cases + questions for a batch and drill in
  const openBatchPage = useCallback(async (b: DraftBatch) => {
    setActive(b);
    if (!SUPABASE_READY) return;
    try {
      const cs = await listCases(b.id);
      const full: DraftCase[] = await Promise.all(cs.map(async (c) => {
        const qs = await listQuestions(c.id);
        return {
          id: c.id, name: c.name, desc: c.description || "",
          questions: qs.map((q) => ({
            id: q.id, title: q.title, type: q.type,
            levels: q.type === "rubric" ? Object.fromEntries((q.options || []).map((o) => [o.level, o.desc])) : undefined,
          })),
        };
      }));
      const filled = { ...b, cases: full };
      setActive(filled);
      setBatches((bs) => bs.map((x) => x.id === b.id ? filled : x));
    } catch { /* */ }
  }, []);

  // dates that have a student group but no cases batch yet
  const usedDates = new Set(batches.map((b) => b.date));
  const availableDates = groups.map((g) => g.assessment_date).filter((d) => !usedDates.has(d) && !isLocked(d));
  const hasGroups = groups.length > 0;

  function openNewBatch() {
    if (!hasGroups) {
      toast("Can’t add a batch — no student groups exist yet. Create a student group (assessment date) on the Students page first.");
      return;
    }
    setBDate(""); setBErr(""); setDBatch(true);
  }

  async function saveBatch() {
    if (!bDate) { setBErr("Please select an assessment date."); return; }
    if (batches.some((b) => b.date === bDate)) { setBErr("A cases batch already exists for this date."); return; }
    setBErr("");
    try {
      const row = await createBatch({ assessment_date: bDate, name: `Assessment ${bDate}` });
      const nb: DraftBatch = { id: row.id, date: row.assessment_date, cases: [] };
      setBatches((bs) => [...bs, nb].sort(byDate));
      setDBatch(false);
      setActive(nb);          // drill straight into the new batch page
      toast("Batch created — add cases");
    } catch {
      setBErr("Could not save the batch. Please try again.");
    }
  }

  // ---- case drawer ----
  function openNewCase() {
    setEditCase(null);
    setCaseName(""); setCaseDesc(""); setDraftQs([]); setQTitle(""); setQType("rubric"); setQLevels({}); setQErr(""); setCaseErr(""); setEditingQId(null); setAddingNew(false);
    setDCase(true);
  }
  function openEditCase(c: DraftCase) {
    setEditCase(c);
    setCaseName(c.name); setCaseDesc(c.desc); setDraftQs([...c.questions]); setQTitle(""); setQType("rubric"); setQLevels({}); setQErr(""); setCaseErr(""); setEditingQId(null); setAddingNew(false);
    setDCase(true);
  }
  function addQuestion() {
    if (!qTitle.trim()) { setQErr("Criterio title is required"); return; }
    setQErr("");
    const data = { title: qTitle.trim(), type: qType, levels: qType === "rubric" ? { ...qLevels } : undefined };
    if (editingQId) {
      setDraftQs((qs) => qs.map((x) => x.id === editingQId ? { ...x, ...data } : x));
    } else {
      setDraftQs((q) => [...q, { id: crypto.randomUUID(), ...data }]);
    }
    setQTitle(""); setQLevels({}); setQType("rubric"); setEditingQId(null); setAddingNew(false);
  }
  function editQuestion(q: DraftQ) {
    setAddingNew(false);
    setEditingQId(q.id);
    setQTitle(q.title);
    setQType(q.type);
    setQLevels(q.type === "rubric" ? { ...(q.levels || {}) } : {});
    setQErr("");
  }
  function startAddNew() {
    setEditingQId(null);
    setQTitle(""); setQLevels({}); setQType("rubric"); setQErr("");
    setAddingNew(true);
  }
  function cancelQEdit() {
    setEditingQId(null); setAddingNew(false); setQTitle(""); setQLevels({}); setQType("rubric"); setQErr("");
  }
  function buildOptions(q: DraftQ): RubricOption[] {
    if (q.type !== "rubric") return [];
    return RUBRIC_LEVELS.map((l) => ({ level: l.level, title: l.level, desc: (q.levels?.[l.level] || "").trim() }));
  }

  async function saveCase() {
    if (!caseName.trim()) { setCaseErr("Case name is required"); return; }
    if (!active) return;
    setCaseErr("");
    try {
      let caseId: string;
      if (editCase) {
        caseId = editCase.id;
        await updateCase(caseId, { name: caseName.trim(), description: caseDesc });
        // replace questions: delete old, recreate
        const existing = await listQuestions(caseId);
        await Promise.all(existing.map((q) => deleteQuestion(q.id)));
      } else {
        const row = await createCase({ batch_id: active.id, name: caseName.trim(), description: caseDesc, position: active.cases.length });
        caseId = row.id;
      }
      await Promise.all(draftQs.map((q, i) =>
        createQuestion({ case_id: caseId, title: q.title, type: q.type, options: buildOptions(q), position: i })
      ));
      // refresh active batch from DB so the table + counts reflect persistence
      await openBatchPage({ id: active.id, date: active.date, cases: [] });
      toast(editCase ? "Case updated" : "Case added");
      setDCase(false);
    } catch {
      setCaseErr("Could not save the case. Please try again.");
    }
  }

  async function removeBatch(b: DraftBatch) {
    if (b.cases.length > 0) return;
    if (!confirm(`Delete assessment batch "${b.date}"? This cannot be undone.`)) return;
    try {
      await deleteBatch(b.id);
      await reload();
      toast("Batch deleted");
    } catch {
      toast("Could not delete the batch. Please try again.");
    }
  }

  async function removeCase(c: DraftCase) {
    if (c.questions.length > 0) return;
    if (!active) return;
    if (!confirm(`Delete case "${c.name}"? This cannot be undone.`)) return;
    try {
      await deleteCase(c.id);
      await openBatchPage({ id: active.id, date: active.date, cases: [] });
      toast("Case deleted");
    } catch {
      toast("Could not delete the case. Please try again.");
    }
  }

  // ---- import-case drawer ----
  function openImport() {
    setImpName(""); setImpCriterios([]); setImpFileName(""); setImpNameErr(""); setImpFileErr("");
    setDImport(true);
  }
  async function onPickCaseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImpFileErr("");
    try {
      const rows = await parseCaseSheet(file);
      if (!rows.length) { setImpFileErr("No criterios found. Make sure the file has a CRITERIO column."); return; }
      setImpCriterios(rows);
      setImpFileName(file.name);
      // suggest a case name from the filename if empty
      if (!impName.trim()) setImpName(file.name.replace(/\.[^.]+$/, ""));
    } catch {
      setImpFileErr("Could not read the file. Use a .csv, .xlsx or .xls export.");
    }
  }
  async function confirmImport() {
    let bad = false;
    if (!impName.trim()) { setImpNameErr("Case name is required"); bad = true; }
    if (!impCriterios.length) { setImpFileErr("Upload a CSV/Excel file with criterios"); bad = true; }
    if (bad || !active) return;
    setImporting(true);
    try {
      const row = await createCase({ batch_id: active.id, name: impName.trim(), description: "", position: active.cases.length });
      await Promise.all(impCriterios.map((c, i) =>
        createQuestion({
          case_id: row.id,
          title: c.title,
          type: "rubric",
          options: RUBRIC_LEVELS.map((l) => ({ level: l.level, title: l.level, desc: (c.levels[l.level] || "").trim() })),
          position: i,
        })
      ));
      await openBatchPage({ id: active.id, date: active.date, cases: [] });
      toast(`Imported case “${impName.trim()}” with ${impCriterios.length} criterio${impCriterios.length === 1 ? "" : "s"}`, "check");
      setDImport(false);
    } catch {
      setImpFileErr("Import failed — please try again.");
    }
    setImporting(false);
  }

  /* ============ BATCH DETAIL PAGE ============ */
  if (active) {
    const idx = batches.findIndex((b) => b.id === active.id);
    const color = PILLS[(idx < 0 ? 0 : idx) % 3];
    return (
      <Shell portal="admin" title="Cases" sub="Cases for this assessment date">
        <div className="group-ctx" style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setActive(null)}><Icon name="arrow-left" size={14} /> All Batches</button>
          <span className="pill" style={{ background: `${color}1a`, color }}><span className="sdot" style={{ background: color }} /> {active.date}</span>
        </div>

        <div className="card">
          <div className="card-head">
            <div><h3>Cases</h3><div className="sub">{active.cases.length} case{active.cases.length === 1 ? "" : "s"} · {active.cases.reduce((s, c) => s + c.questions.length, 0)} criterios</div></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={openImport}><Icon name="upload" size={16} /> Import Case</button>
              <button className="btn btn-pri" onClick={openNewCase}><Icon name="plus" size={16} /> Add Case</button>
            </div>
          </div>
          <div className="card-pad" style={{ padding: active.cases.length ? 0 : undefined }}>
            {active.cases.length === 0 ? (
              <EmptyState icon="clipboard-list" title="No cases yet"
                text="Add a case and its rubric criterios, or import one from a CSV/Excel file."
                action={<div style={{ display: "flex", gap: 8 }}><button className="btn btn-ghost" onClick={openImport}><Icon name="upload" size={16} /> Import Case</button><button className="btn btn-pri" onClick={openNewCase}><Icon name="plus" size={16} /> Add Case</button></div>} />
            ) : (
              <div className="tbl-wrap"><table className="tbl tbl-clickable">
                <thead><tr><th>Case Name</th><th style={{ textAlign: "center" }}>Criterios</th><th></th></tr></thead>
                <tbody>{active.cases.map((c, i) => (
                  <tr key={c.id} onClick={() => openEditCase(c)}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="case-num" style={{ background: `${color}1a`, color }}>{String(i + 1).padStart(3, "0")}</span>
                        <b>{c.name}</b>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}><span className="qcount-inline">{c.questions.length}</span></td>
                    <td>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button className="btn btn-icon btn-xs btn-ghost" onClick={(e) => { e.stopPropagation(); openEditCase(c); }}><Icon name="pencil" size={14} /></button>
                        <button className="btn btn-icon btn-xs btn-ghost" disabled={c.questions.length > 0}
                          title={c.questions.length > 0 ? "Remove all criterios before deleting this case" : "Delete case"}
                          style={c.questions.length > 0 ? { opacity: .4, cursor: "not-allowed" } : { color: "#e11d48" }}
                          onClick={(e) => { e.stopPropagation(); removeCase(c); }}>
                          <Icon name="trash-2" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>

        {renderCaseDrawer()}
        {renderImportDrawer()}
      </Shell>
    );
  }

  /* ============ BATCH LIST PAGE ============ */
  return (
    <Shell portal="admin" title="Cases" sub="Assessment batches → cases → rubric criterios">
      <div className="card">
        <div className="card-head">
          <div><h3>Case Batches</h3></div>
          <button className="btn btn-pri" onClick={openNewBatch} title={hasGroups ? "" : "Create a student group first"}><Icon name="plus" size={16} /> Add Batch</button>
        </div>
        <div className="card-pad" style={{ padding: batches.length ? 0 : undefined }}>
          {!hasGroups ? (
            <EmptyState icon="users" title="No student groups yet"
              text="Create a student group (an assessment date) first — case batches can only be created for dates that already have a student group." />
          ) : batches.length === 0 ? (
            <EmptyState icon="layers" title="No case batches yet"
              text="Create a batch for an assessment date, then add cases and their rubric criterios."
              action={<button className="btn btn-pri" onClick={openNewBatch}><Icon name="plus" size={16} /> Add Batch</button>} />
          ) : (() => {
            const maxCases = Math.max(0, ...batches.map((b) => b.cases.length));
            return (
            <div className="tbl-wrap"><table className="tbl tbl-clickable">
              <thead><tr>
                <th>Assessment Date</th>
                {Array.from({ length: maxCases }).map((_, ci) => (
                  <th key={ci} style={{ textAlign: "center" }}>Case {ci + 1}<br /><span className="sub" style={{ fontWeight: 600, fontSize: 11 }}>criterios</span></th>
                ))}
                <th style={{ textAlign: "center" }}>Total Criterios</th>
                <th></th>
              </tr></thead>
              <tbody>{batches.map((b, i) => (
                <tr key={b.id} onClick={() => openBatchPage(b)}>
                  <td><span className="pill" style={{ background: `${PILLS[i % 3]}1a`, color: PILLS[i % 3] }}><span className="sdot" style={{ background: PILLS[i % 3] }} /> {b.date}</span></td>
                  {Array.from({ length: maxCases }).map((_, ci) => (
                    <td key={ci} style={{ textAlign: "center" }}>
                      {b.cases[ci] ? <span className="qcount-inline">{b.cases[ci].questions.length}</span> : <span className="sub">—</span>}
                    </td>
                  ))}
                  <td style={{ textAlign: "center" }}><b>{b.cases.reduce((s, c) => s + c.questions.length, 0)}</b></td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button className="btn btn-icon btn-xs btn-ghost" disabled={b.cases.length > 0}
                        title={b.cases.length > 0 ? "Remove all cases before deleting this batch" : "Delete batch"}
                        style={b.cases.length > 0 ? { opacity: .4, cursor: "not-allowed" } : { color: "#e11d48" }}
                        onClick={(e) => { e.stopPropagation(); removeBatch(b); }}>
                        <Icon name="trash-2" size={14} />
                      </button>
                      <button className="btn btn-icon btn-xs btn-ghost" onClick={(e) => { e.stopPropagation(); openBatchPage(b); }}><Icon name="chevron-right" size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
            );
          })()}
        </div>
      </div>

      {/* New Batch drawer — date dropdown of student-group dates only */}
      <Drawer open={dBatch} onClose={() => { setDBatch(false); setBErr(""); }} title="New Case Batch"
        sub="Pick an assessment date that already has a student group"
        footer={<><button className="btn btn-ghost" onClick={() => setDBatch(false)}>Cancel</button><button className="btn btn-pri" onClick={saveBatch}>Create Batch</button></>}>
        <div className="field"><label>Assessment Date</label>
          <select className={`select${bErr ? " input-error" : ""}`} value={bDate} onChange={(e) => { setBDate(e.target.value); if (e.target.value) setBErr(""); }}>
            <option value="" disabled>Select an assessment date…</option>
            {availableDates.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          {bErr && <div className="field-error">{bErr}</div>}
        </div>
        {availableDates.length === 0 && (
          <div className="hint-box"><Icon name="info" size={16} /> All student-group dates already have a case batch. Create a new student group to add another date.</div>
        )}
      </Drawer>

      {renderCaseDrawer()}
      {renderImportDrawer()}
    </Shell>
  );

  /* ============ shared case drawer ============ */
  function renderCaseDrawer() {
    return (
      <Drawer open={dCase} onClose={() => setDCase(false)} wide title={editCase ? "Edit Case" : "Add Case"} sub="Define the case and its rubric criterios"
        footer={<><button className="btn btn-ghost" onClick={() => setDCase(false)}>Cancel</button><button className="btn btn-pri" onClick={saveCase}>{editCase ? "Save Changes" : "Save Case"}</button></>}>
        <div className="field"><label>Case Name</label><input className={`input${caseErr ? " input-error" : ""}`} value={caseName} onChange={(e) => { setCaseName(e.target.value); if (e.target.value.trim()) setCaseErr(""); }} placeholder="Escenario B · Politrauma en urgencias" />{caseErr && <div className="field-error">{caseErr}</div>}</div>

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 4 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800 }}>Criterios</h4>
          {draftQs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {draftQs.map((q, i) => {
                const open = editingQId === q.id;
                return (
                  <div key={q.id}
                    style={{ display: "block", borderRadius: 12, overflow: "hidden",
                      border: open ? "1.5px solid var(--brand)" : "1px solid var(--line)",
                      background: open ? "rgba(37,99,235,.04)" : "var(--surface)" }}>
                    {/* row header — click to expand/collapse */}
                    <div onClick={() => open ? cancelQEdit() : editQuestion(q)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}>
                      <span style={{ fontWeight: 800, color: "var(--muted)", minWidth: 16 }}>{i + 1}</span>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{q.title}</span>
                      <span className="pill pill-blue">{`MATER - ${String(i + 1).padStart(2, "0")}`}</span>
                      <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
                      <button className="btn btn-icon btn-xs btn-ghost" onClick={(e) => { e.stopPropagation(); if (open) cancelQEdit(); setDraftQs((qs) => qs.filter((x) => x.id !== q.id)); }}><Icon name="trash-2" size={14} /></button>
                    </div>
                    {/* expanded inline editor */}
                    {open && (
                      <div style={{ padding: "4px 14px 14px" }}>
                        {renderQForm("Save")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {/* add-new: button by default, opens the form on click (hidden while editing an existing criterio) */}
          {!editingQId && !addingNew && (
            <button type="button" className="btn btn-ghost btn-block" style={{ borderStyle: "dashed", justifyContent: "center", padding: "12px" }} onClick={startAddNew}>
              <Icon name="plus" size={16} /> Add Criterio
            </button>
          )}
          {!editingQId && addingNew && (
            <div style={{ background: "var(--surface)", borderRadius: 14, padding: 14, border: "1.5px solid var(--brand)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>New criterio</span>
                <button type="button" className="btn btn-icon btn-xs btn-ghost" onClick={cancelQEdit}><Icon name="x" size={15} /></button>
              </div>
              {renderQForm("Save")}
            </div>
          )}
        </div>
      </Drawer>
    );
  }

  /* shared criterio form used both inline (edit) and in the add-new panel */
  function renderQForm(actionLabel: string) {
    return (
      <>
        <div className="field" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={`btn btn-sm ${qType === "rubric" ? "btn-pri" : "btn-ghost"}`} onClick={() => setQType("rubric")}>Rubric · 4 niveles</button>
            <button type="button" className={`btn btn-sm ${qType === "yesno" ? "btn-pri" : "btn-ghost"}`} onClick={() => setQType("yesno")}>Sí / No</button>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 10 }}><label>Criterio title</label><input className={`input${qErr ? " input-error" : ""}`} value={qTitle} onChange={(e) => { setQTitle(e.target.value); if (e.target.value.trim()) setQErr(""); }} placeholder={qType === "rubric" ? "e.g. C — Circulación y Control Hemorragia" : "e.g. ¿Realizó lavado de manos antes del procedimiento?"} />{qErr && <div className="field-error">{qErr}</div>}</div>
        {qType === "rubric" && RUBRIC_LEVELS.map((l) => (
          <div className="field" style={{ marginBottom: 10 }} key={l.level}>
            <label>{l.level}</label>
            <textarea className="input" rows={2} value={qLevels[l.level] || ""} onChange={(e) => setQLevels((p) => ({ ...p, [l.level]: e.target.value }))} placeholder="Description" />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="btn btn-pri btn-block" onClick={addQuestion}><Icon name={editingQId ? "check" : "plus"} size={15} /> {actionLabel}</button>
          {editingQId && <button type="button" className="btn btn-ghost" onClick={cancelQEdit}>Cancel</button>}
        </div>
      </>
    );
  }

  /* ============ import-case drawer ============ */
  function renderImportDrawer() {
    return (
      <Drawer open={dImport} onClose={() => setDImport(false)} wide title="Import Case"
        sub="Give the case a name and upload a CSV/Excel of its criterios"
        footer={<><button className="btn btn-ghost" onClick={() => setDImport(false)}>Cancel</button>
          <button className="btn btn-pri" onClick={confirmImport} disabled={importing}>
            {importing ? "Importing…" : impCriterios.length ? `Import ${impCriterios.length} criterio${impCriterios.length === 1 ? "" : "s"}` : "Import"}
          </button></>}>

        <div className="field"><label>Case Name</label>
          <input className={`input${impNameErr ? " input-error" : ""}`} value={impName}
            onChange={(e) => { setImpName(e.target.value); if (e.target.value.trim()) setImpNameErr(""); }}
            placeholder="e.g. Escenario MATER · Emergencia obstétrica" />
          {impNameErr && <div className="field-error">{impNameErr}</div>}
        </div>

        <div className="field">
          <label>Case file (CSV / Excel)</label>
          <label className={`dropzone${impFileErr ? " input-error" : ""}`} style={{ cursor: "pointer", display: "block" }}>
            <input type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={onPickCaseFile} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 16px", border: "1.5px dashed var(--line)", borderRadius: 14, background: "var(--surface)" }}>
              <Icon name={impFileName ? "file-check-2" : "upload-cloud"} size={26} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{impFileName || "Click to choose a file"}</div>
                <div className="sub" style={{ fontSize: 12 }}>{impFileName ? "Click to replace" : "Columns: Clave, CRITERIO, Insuficiente, Aceptable, Competente, Sobresaliente"}</div>
              </div>
            </div>
          </label>
          {impFileErr && <div className="field-error">{impFileErr}</div>}
          <button type="button" className="btn btn-xs btn-ghost" style={{ marginTop: 8 }} onClick={downloadCaseTemplate}>
            <Icon name="download" size={13} /> Download template
          </button>
        </div>

        {impCriterios.length > 0 && (
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 4 }}>
            <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800 }}>Preview · {impCriterios.length} criterios</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "46vh", overflowY: "auto" }}>
              {impCriterios.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)" }}>
                  <span className="pill pill-blue" style={{ flexShrink: 0 }}>{c.clave || `MATER - ${String(i + 1).padStart(2, "0")}`}</span>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{c.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    );
  }
}

function byDate(a: { date: string }, b: { date: string }) {
  return (b.date || "").localeCompare(a.date || "");
}
