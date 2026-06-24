"use client";
import { useState, useEffect, useCallback } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { SUPABASE_READY } from "@/lib/supabase";
import { listGroups, listLocations, listBatches, listCases, listQuestions, listStudents, listEvaluations } from "@/lib/db";
import type { Group, Location } from "@/lib/types";

/* CSV cell escaping (quote when needed). */
function csvCell(v: string): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* fecha dd/mm/yyyy + hora h:mm from an ISO timestamp */
function fmtFecha(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtHora(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Results() {
  const toast = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [active, setActive] = useState<Group | null>(null);
  const [site, setSite] = useState("all");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const siteTabs = [{ key: "all", label: "All Sites" }, ...locations.map((l) => ({ key: l.name, label: l.name }))];

  const reload = useCallback(async () => {
    if (!SUPABASE_READY) return;
    try { setGroups(await listGroups()); } catch { /* */ }
    try { setLocations(await listLocations()); } catch { /* */ }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  function toggle(id: string) {
    setChecked((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  /**
   * Build + download a CSV matching the client format:
   * Nombre del sustentante, Nombre del evaluador, Sede, Fecha, Hora,
   * MATER - 01 ... MATER - NN  (one column per criterio, value = rubric level)
   * One row per submitted evaluation.
   */
  async function exportReports(onlyGroup?: Group) {
    if (!SUPABASE_READY) { toast("Connect Supabase to export", "alert-triangle"); return; }
    const targetGroups = onlyGroup ? [onlyGroup] : groups.filter((g) => (checked.size ? checked.has(g.id) : true));
    if (!targetGroups.length) { toast("No groups to export", "alert-triangle"); return; }
    setExporting(true);
    try {
      const [batches, allEvals] = await Promise.all([listBatches(), listEvaluations()]);

      // Resolve a student's stored site (name OR code) to its location CODE.
      const codeOf = (site: string): string => {
        const v = (site || "").trim().toLowerCase();
        const loc = locations.find((l) => l.name?.trim().toLowerCase() === v || l.code?.trim().toLowerCase() === v);
        return loc?.code || site || "";
      };

      // MATER columns are dynamic: pad to the largest case across the whole export.
      // Each row carries its case's criterio cells; we pad to maxCrit at the end.
      type PendingRow = { lead: string[]; cells: string[] };
      const pending: PendingRow[] = [];
      let maxCrit = 0;

      for (const g of targetGroups) {
        const students = await listStudents(g.id);
        const studentMap = new Map(students.map((s) => [s.id, s]));
        const batch = batches.find((b) => b.assessment_date === g.assessment_date);
        if (!batch) continue;
        const cases = await listCases(batch.id);
        // questions per case (ordered by position)
        const qByCase = new Map<string, Awaited<ReturnType<typeof listQuestions>>>();
        for (const c of cases) qByCase.set(c.id, await listQuestions(c.id));

        for (const ev of allEvals) {
          if (ev.status !== "finished" || !ev.submitted_at) continue;   // only finished
          const student = studentMap.get(ev.student_id);
          if (!student) continue;                 // evaluation not in this group
          const qs = qByCase.get(ev.case_id);
          if (!qs) continue;                       // case not in this batch
          const ansMap = new Map(ev.answers.map((a) => [a.question_id, a.value]));
          // one cell per criterio in THIS case, in order; blank if no answer
          const cells = qs.map((q) => ansMap.get(q.id) || "");
          if (cells.length > maxCrit) maxCrit = cells.length;
          pending.push({
            lead: [
              student.name,
              ev.evaluator_name || "",
              codeOf(student.site || ""),
              fmtFecha(ev.submitted_at),
              fmtHora(ev.submitted_at),
            ],
            cells,
          });
        }
      }

      if (!pending.length) { toast("No submitted evaluations to export", "alert-triangle"); setExporting(false); return; }

      // Pad every row's criterio cells to the largest case (trailing blanks).
      const rows: string[][] = pending.map((p) => [
        ...p.lead,
        ...Array.from({ length: maxCrit }, (_, i) => p.cells[i] ?? ""),
      ]);

      const materCols = Array.from({ length: maxCrit }, (_, i) => `MATER - ${String(i + 1).padStart(2, "0")}`);
      const header = ["Nombre del sustentante", "Nombre del evaluador", "Sede", "Fecha", "Hora", ...materCols];

      const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reporte_evaluaciones_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast(`Exported ${rows.length} evaluation row${rows.length === 1 ? "" : "s"}`, "download");
    } catch {
      toast("Export failed — check Supabase", "alert-triangle");
    }
    setExporting(false);
  }

  return (
    <Shell portal="admin" title="Reports" sub="Submission tracking by assessment date">
      {!active ? (
        <div className="card">
          <div className="card-head">
            <div><h3>Assessment Groups</h3><div className="sub">Select groups to export, or export all.</div></div>
            <button className="btn btn-pri" onClick={() => exportReports()} disabled={exporting}><Icon name={exporting ? "loader" : "download"} size={16} /> {exporting ? "Exporting…" : "Export Reports"}</button>
          </div>
          <div className="card-pad" style={{ padding: groups.length ? 0 : undefined }}>
            {groups.length === 0 ? (
              <EmptyState icon="chart-column" title="No reports yet"
                text="Once evaluations are submitted, results appear here grouped by assessment date." />
            ) : (
              <div className="tbl-wrap"><table className="tbl tbl-clickable tbl-reports">
                <thead><tr><th style={{ width: 36 }}></th><th>Assessment Date</th>{locations.map((l) => <th key={l.id}>{l.name}</th>)}<th style={{ textAlign: "center" }}>Total</th></tr></thead>
                <tbody>{groups.map((g) => (
                  <tr key={g.id} onClick={() => setActive(g)}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="row-chk" checked={checked.has(g.id)} onChange={() => toggle(g.id)} /></td>
                    <td><b>{g.assessment_date}</b></td>{locations.map((l) => <td key={l.id}>0</td>)}<td style={{ textAlign: "center" }}>0</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="group-ctx" style={{ marginBottom: 16, display: "flex", alignItems: "center" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setActive(null)}><Icon name="arrow-left" size={14} /> All Groups</button>
            <span className="gname">Assessment {active.assessment_date}</span>
            <button className="btn btn-pri btn-sm" style={{ marginLeft: "auto" }} onClick={() => exportReports(active!)} disabled={exporting}><Icon name={exporting ? "loader" : "download"} size={15} /> {exporting ? "Exporting…" : "Export Reports"}</button>
          </div>
          <div className="card-head" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <div className="tabs scroll-tabs">
              {siteTabs.map((s) => <button key={s.key} className={`tab ${site === s.key ? "active" : ""}`} onClick={() => setSite(s.key)}>{s.label}</button>)}
            </div>
          </div>
          <div className="card"><div className="card-pad">
            <EmptyState icon="clipboard-check" title="No submissions yet"
              text="Each case will show a panel of evaluators and their submission timestamps once they finish." />
          </div></div>
        </>
      )}
    </Shell>
  );
}
