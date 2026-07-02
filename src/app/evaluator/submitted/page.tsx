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

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

interface Row { ev: Evaluation; student?: Student; caseName: string; assessmentDate: string }
type Filter = "all" | "started" | "finished";

export default function Activity() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<EvalTarget | null>(null);

  const reload = async () => {
    if (!profile?.id) return;
    try {
      const evs = await listMyEvaluations(profile.id);
      const students = await listStudentsByIds(evs.map((e) => e.student_id));
      const smap: Record<string, Student> = {};
      students.forEach((s) => { smap[s.id] = s; });
      const allCases = await listCases();
      const cmap: Record<string, string> = {};
      allCases.forEach((c) => { cmap[c.id] = c.name; });
      const allGroups = await listGroups();
      const gmap: Record<string, string> = {};
      allGroups.forEach((g) => { gmap[g.id] = g.assessment_date; });
      setRows(evs.map((ev) => {
        const student = smap[ev.student_id];
        const assessmentDate = (student?.group_id && gmap[student.group_id]) || (ev.submitted_at || ev.started_at || "").slice(0, 10);
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

  const counts = useMemo(() => ({
    all: rows.length,
    started: rows.filter((r) => r.ev.status === "started").length,
    finished: rows.filter((r) => r.ev.status === "finished").length,
  }), [rows]);

  // latest activity first — use submitted_at when finished else started_at
  const activityTime = (r: Row) => r.ev.submitted_at || r.ev.started_at || "";

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => filter === "all" || r.ev.status === filter)
      .filter((r) => !q || (r.student?.name || "").toLowerCase().includes(q) || (r.student?.qrtexto || "").toLowerCase().includes(q))
      .sort((a, b) => (activityTime(b) > activityTime(a) ? 1 : -1));
  }, [rows, filter, search]);

  return (
    <Shell portal="evaluator" title="Activity" sub="Your latest and past evaluation activity">
      <div className="tabs scroll-tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All <span className="tab-count">{counts.all}</span></button>
        <button className={`tab ${filter === "started" ? "active" : ""}`} onClick={() => setFilter("started")}>Ongoing <span className="tab-count">{counts.started}</span></button>
        <button className={`tab ${filter === "finished" ? "active" : ""}`} onClick={() => setFilter("finished")}>Submitted <span className="tab-count">{counts.finished}</span></button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div className="input-search" style={{ flex: 1, minWidth: 220 }}>
            <Icon name="search" size={16} />
            <input className="input" placeholder="Search by name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div><h3>{filter === "started" ? "Ongoing Evaluations" : filter === "finished" ? "Submitted Evaluations" : "Evaluation Activity"}</h3><div className="sub">{visible.length} {visible.length === 1 ? "evaluation" : "evaluations"}{filter === "all" ? " · latest first" : ""}</div></div></div>
        <div className="card-pad" style={{ padding: 0 }}>
          {loading ? <div className="empty-sm" style={{ padding: 24 }}>Cargando…</div>
            : visible.length === 0 ? (
              <div style={{ padding: 24 }}>
                <EmptyState icon="history" title={search ? "No matches" : "No evaluation activity yet"}
                  text={search ? "No evaluations match your search." : "Evaluations you start or submit will appear here, latest first."} />
              </div>
            ) : (
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Student</th><th>ID</th><th>Site</th><th>Slot</th><th>Case</th><th>Status</th><th>Activity</th><th style={{ width: 56 }}></th></tr></thead>
                <tbody>{visible.map((r) => {
                  const finished = r.ev.status === "finished";
                  const locked = finished && isDateLocked(r.assessmentDate);
                  const target: EvalTarget = { student: r.student ?? null, studentId: r.ev.student_id, caseId: r.ev.case_id, caseName: r.caseName, assessmentDate: r.assessmentDate };
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
                      <td>{finished
                        ? <span className="pill pill-green"><Icon name="check-circle-2" size={12} /> Submitted</span>
                        : <span className="pill pill-amber"><Icon name="clock" size={12} /> Ongoing</span>}</td>
                      <td>{fmtDateTime(activityTime(r))}</td>
                      <td>
                        {!finished
                          ? <button className="icon-btn" title="Continuar evaluación" onClick={() => setEditTarget(target)}><Icon name="play" size={15} /></button>
                          : locked
                            ? <span className="icon-btn is-locked" title="Bloqueada (el día de la evaluación terminó)"><Icon name="lock" size={15} /></span>
                            : <button className="icon-btn" title="Editar evaluación" onClick={() => setEditTarget(target)}><Icon name="pencil" size={15} /></button>}
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
