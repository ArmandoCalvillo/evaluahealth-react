"use client";
import { useEffect, useState, useMemo } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import EvalDrawer, { type EvalTarget } from "@/components/EvalDrawer";
import { useAuth } from "@/lib/auth";
import { listMyEvaluations, listStudentsByIds, listCases, listGroups } from "@/lib/db";
import type { Evaluation, Student } from "@/lib/types";
import { isDateLocked } from "@/lib/dates";

function fmtDate(s: string) {
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

interface Row { ev: Evaluation; student?: Student; caseName: string; assessmentDate: string }

export default function Submitted() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [active, setActive] = useState<string | null>(null); // selected date
  const [editTarget, setEditTarget] = useState<EvalTarget | null>(null);

  const reload = async () => {
    if (!profile?.id) return;
    try {
      const evs = (await listMyEvaluations(profile.id)).filter((e) => e.status === "finished");
      const students = await listStudentsByIds(evs.map((e) => e.student_id));
      const smap: Record<string, Student> = {};
      students.forEach((s) => { smap[s.id] = s; });
      const allCases = await listCases();
      const cmap: Record<string, string> = {};
      allCases.forEach((c) => { cmap[c.id] = c.name; });
      // map group_id -> assessment_date so submitted evaluations stay in their batch's date
      const allGroups = await listGroups();
      const gmap: Record<string, string> = {};
      allGroups.forEach((g) => { gmap[g.id] = g.assessment_date; });
      setRows(evs.map((ev) => {
        const student = smap[ev.student_id];
        const assessmentDate = (student?.group_id && gmap[student.group_id]) || (ev.submitted_at || "").slice(0, 10);
        return { ev, student, caseName: cmap[ev.case_id] || "Caso", assessmentDate };
      }));
    } catch { setRows([]); }
  };

  useEffect(() => {
    (async () => {
      if (!profile?.id) return;
      setLoading(true);
      await reload();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // group by the student's batch assessment date (NOT the submission timestamp),
  // so an eval submitted later still stays in its batch's date
  const dates = useMemo(() => {
    const by: Record<string, { set: Set<string>; latest: string }> = {};
    rows.forEach((r) => {
      const d = r.assessmentDate;
      if (!d) return;
      const iso = r.ev.submitted_at || "";
      const b = (by[d] ||= { set: new Set(), latest: iso });
      b.set.add(r.ev.student_id);
      if (iso > b.latest) b.latest = iso;
    });
    return Object.entries(by)
      .map(([date, v]) => ({ date, count: v.set.size, latest: v.latest }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [rows]);

  const activeRows = useMemo(() =>
    rows.filter((r) => r.assessmentDate === active)
      .sort((a, b) => ((b.ev.submitted_at || "") > (a.ev.submitted_at || "") ? 1 : -1)),
    [rows, active]);

  return (
    <Shell portal="evaluator" title="Submitted" sub="Your submitted evaluations by date">
      {!active ? (
        <div className="card">
          <div className="card-head"><div><h3>Evaluation Dates</h3><div className="sub">Evaluations stay editable until the assessment day is over, then they lock</div></div></div>
          <div className="card-pad" style={{ padding: dates.length ? 0 : undefined }}>
            {loading ? <div className="empty-sm">Cargando…</div>
              : dates.length === 0 ? (
                <EmptyState icon="check-square" title="No submitted evaluations yet"
                  text="Evaluations you submit will be grouped here by assessment date." />
              ) : (
                <div className="tbl-wrap"><table className="tbl tbl-clickable">
                  <thead><tr><th>Evaluation Date</th><th>Number of Students Evaluated</th><th></th></tr></thead>
                  <tbody>{dates.map((d) => {
                    const locked = isDateLocked(d.date);
                    return (
                    <tr key={d.date} onClick={() => setActive(d.date)}>
                      <td><b>{fmtDate(d.date)}</b></td>
                      <td><span className="pill pill-violet">{d.count} {d.count === 1 ? "student" : "students"}</span></td>
                      <td>{!locked
                        ? <span className="pill pill-green"><span className="sdot" style={{ background: "#16a34a" }} /> Editable</span>
                        : <span className="pill pill-gray"><Icon name="lock" size={12} /> Locked</span>}</td>
                    </tr>
                  ); })}</tbody>
                </table></div>
              )}
          </div>
        </div>
      ) : (
        <>
          <div className="group-ctx" style={{ marginBottom: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setActive(null)}><Icon name="arrow-left" size={14} /> All Dates</button>
            <span className="gname">{fmtDate(active)}</span>
          </div>
          <div className="card">
            <div className="card-head"><div><h3>Submitted Evaluations</h3><div className="sub">{activeRows.length} {activeRows.length === 1 ? "evaluation" : "evaluations"}</div></div></div>
            <div className="card-pad" style={{ padding: 0 }}>
              {activeRows.length === 0 ? (
                <div style={{ padding: 24 }}><EmptyState icon="users" title="No students for this date" /></div>
              ) : (
                <div className="tbl-wrap"><table className="tbl">
                  <thead><tr><th>Student</th><th>ID</th><th>Site</th><th>Slot</th><th>Case</th><th>Submitted At</th><th style={{ width: 56 }}></th></tr></thead>
                  <tbody>{activeRows.map((r) => {
                    const locked = isDateLocked(r.assessmentDate);
                    return (
                    <tr key={r.ev.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {r.student?.photo_url
                            ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.student.photo_url} className="av-sm" alt="" style={{ borderRadius: "50%" }} />
                            : <span className="av-sm" style={{ borderRadius: "50%", background: "var(--brand-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", fontWeight: 800, fontSize: 13 }}>{(r.student?.name || "?")[0]}</span>}
                          <span style={{ fontWeight: 700 }}>{r.student?.name || "—"}</span>
                        </div>
                      </td>
                      <td>{r.student?.qrtexto || "—"}</td>
                      <td>{r.student?.site || "—"}</td>
                      <td>{r.student?.slot || "—"}</td>
                      <td><span className="pill pill-violet">{r.caseName}</span></td>
                      <td>{fmtDateTime(r.ev.submitted_at)}</td>
                      <td>
                        {locked
                          ? <span className="icon-btn is-locked" title="Bloqueada (el día de la evaluación terminó)"><Icon name="lock" size={15} /></span>
                          : <button className="icon-btn" title="Editar evaluación" onClick={() => setEditTarget({ student: r.student ?? null, studentId: r.ev.student_id, caseId: r.ev.case_id, caseName: r.caseName, assessmentDate: r.assessmentDate })}><Icon name="pencil" size={15} /></button>}
                      </td>
                    </tr>
                  ); })}</tbody>
                </table></div>
              )}
            </div>
          </div>
        </>
      )}

      <EvalDrawer open={!!editTarget} target={editTarget} onClose={() => setEditTarget(null)} onSaved={reload} />
    </Shell>
  );
}
