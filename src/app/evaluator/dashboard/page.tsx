"use client";
import { useEffect, useState, useMemo } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import EvalDrawer, { type EvalTarget } from "@/components/EvalDrawer";
import { useAuth } from "@/lib/auth";
import {
  listMyEvaluations, listStudents, listGroups, listBatches, listCases,
} from "@/lib/db";
import type { Evaluation, Student, Group, CaseRow } from "@/lib/types";
import { todayStr, isEditLocked } from "@/lib/dates";

function fmtDate(s: string) {
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function EvalDashboard() {
  const { profile } = useAuth();
  const site = profile?.site || "";
  const [loading, setLoading] = useState(true);
  const [myEvals, setMyEvals] = useState<Evaluation[]>([]);
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [caseNames, setCaseNames] = useState<Record<string, string>>({});
  const [todayGroup, setTodayGroup] = useState<Group | null>(null);
  const [todayStudents, setTodayStudents] = useState<Student[]>([]);
  const [activeCases, setActiveCases] = useState(0);
  const [editTarget, setEditTarget] = useState<EvalTarget | null>(null);

  const reload = async () => {
    if (!profile?.id) return;
    try { setMyEvals(await listMyEvaluations(profile.id)); } catch { /* */ }
  };

  useEffect(() => {
    (async () => {
      if (!profile?.id) return;
      setLoading(true);
      try {
        const evs = await listMyEvaluations(profile.id);
        setMyEvals(evs);
        // resolve student names for the rows we have
        const allStudents = await listStudents();
        const map: Record<string, Student> = {};
        allStudents.forEach((s) => { map[s.id] = s; });
        setStudents(map);
        // resolve case names
        const allCases: CaseRow[] = await listCases();
        const cmap: Record<string, string> = {};
        allCases.forEach((c) => { cmap[c.id] = c.name; });
        setCaseNames(cmap);
        // today's scheduling for "Pending Today" + "Cases Active"
        const groups = await listGroups();
        const g = groups.find((x) => x.assessment_date === todayStr()) || null;
        setTodayGroup(g);
        if (g) {
          const ts = (await listStudents(g.id)).filter((s) => !site || s.site === site);
          setTodayStudents(ts);
          const batches = await listBatches();
          const batch = batches.find((b) => b.assessment_date === g.assessment_date);
          setActiveCases(batch ? (await listCases(batch.id)).length : 0);
        }
      } catch { /* offline / no data */ }
      setLoading(false);
    })();
  }, [profile?.id, site]);

  const finished = useMemo(() => myEvals.filter((e) => e.status === "finished"), [myEvals]);

  // Pending today = today's students at my site with at least one case I haven't finished
  const pendingToday = useMemo(() => {
    if (!todayGroup) return 0;
    const finishedByStudent = new Set(finished.map((e) => e.student_id));
    return todayStudents.filter((s) => !finishedByStudent.has(s.id)).length;
  }, [todayGroup, todayStudents, finished]);

  const stats = [
    { ic: "clipboard-check", tint: "tint-green", lbl: "Completed Evaluations", val: finished.length },
    { ic: "clock", tint: "tint-amber", lbl: "Pending Today", val: pendingToday },
    { ic: "layers", tint: "tint-blue", lbl: "Cases Active", val: activeCases },
  ];

  // history grouped by assessment date — count of distinct students finished per date
  const history = useMemo(() => {
    const byDate: Record<string, Set<string>> = {};
    finished.forEach((e) => {
      const s = students[e.student_id];
      // group by submission date
      const d = e.submitted_at ? e.submitted_at.slice(0, 10) : "";
      if (!d) return;
      (byDate[d] ||= new Set()).add(e.student_id);
      void s;
    });
    return Object.entries(byDate)
      .map(([date, set]) => ({ date, count: set.size }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [finished, students]);

  const maxCount = Math.max(1, ...history.map((h) => h.count));

  // recent activity = latest finished evaluations
  const recent = useMemo(() =>
    finished.slice().sort((a, b) => ((b.submitted_at || "") > (a.submitted_at || "") ? 1 : -1)).slice(0, 8),
    [finished]);

  return (
    <Shell portal="evaluator" title="Dashboard" sub="Your evaluation workspace">
      <div className="grid g-3" style={{ marginBottom: 18 }}>
        {stats.map((s) => (
          <div className="stat" key={s.lbl}>
            <div className={`ic ${s.tint}`}><Icon name={s.ic} size={24} /></div>
            <div className="lbl">{s.lbl}</div>
            <div className="val">{s.val}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head"><div><h3>Students Evaluated per Assessment</h3><div className="sub">Your finished evaluations grouped by date</div></div></div>
        <div className="card-pad">
          {loading ? <div className="empty-sm">Cargando…</div>
            : history.length === 0 ? (
              <EmptyState icon="chart-column" title="No history yet" text="Your evaluation totals per assessment date will plot here." />
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 18, height: 200, padding: "10px 6px 0" }}>
                {history.map((h) => (
                  <div key={h.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 48 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "var(--navy)" }}>{h.count}</div>
                    <div title={`${h.count} students`} style={{
                      width: "100%", maxWidth: 56, borderRadius: "8px 8px 0 0",
                      background: "linear-gradient(180deg,#7c3aed,#5b21b6)",
                      height: `${Math.max(8, (h.count / maxCount) * 150)}px`, transition: ".3s",
                    }} />
                    <div className="sub" style={{ fontSize: 11, textAlign: "center" }}>{fmtDate(h.date)}</div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div><h3>Recent Evaluation Activity</h3></div></div>
        <div className="card-pad" style={{ padding: recent.length ? 0 : undefined }}>
          {loading ? <div className="empty-sm">Cargando…</div>
            : recent.length === 0 ? (
              <EmptyState icon="activity" title="No recent activity" text="Head to Evaluate to start assessing students." />
            ) : (
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Student</th><th>Case</th><th>Submitted</th><th style={{ width: 56 }}></th></tr></thead>
                <tbody>{recent.map((e) => {
                  const s = students[e.student_id];
                  const locked = isEditLocked(e.submitted_at);
                  return (
                    <tr key={e.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {s?.photo_url
                            ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.photo_url} className="av-sm" alt="" style={{ borderRadius: "50%" }} />
                            : <span className="av-sm" style={{ borderRadius: "50%", background: "var(--brand-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", fontWeight: 800, fontSize: 13 }}>{(s?.name || "?")[0]}</span>}
                          <div><div style={{ fontWeight: 700 }}>{s?.name || "—"}</div><div className="sub" style={{ fontSize: 12 }}>{s?.qrtexto}</div></div>
                        </div>
                      </td>
                      <td><span className="pill pill-violet">{caseNames[e.case_id] || "Caso"}</span></td>
                      <td>{fmtTime(e.submitted_at)}</td>
                      <td>
                        {locked
                          ? <span className="icon-btn is-locked" title="Bloqueada (más de 2 días)"><Icon name="lock" size={15} /></span>
                          : <button className="icon-btn" title="Editar evaluación" onClick={() => setEditTarget({ student: s ?? null, studentId: e.student_id, caseId: e.case_id, caseName: caseNames[e.case_id] || "Evaluación" })}><Icon name="pencil" size={15} /></button>}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
        </div>
      </div>

      <EvalDrawer open={!!editTarget} target={editTarget} onClose={() => setEditTarget(null)} onSaved={reload} />
    </Shell>
  );
}
