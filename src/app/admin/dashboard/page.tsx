"use client";
import { useState, useEffect } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import { Donut, Area, HBars, Stacked } from "@/components/charts";
import { listLocations, listStudents, listEvaluations, listEvaluators, listGroups, listCases } from "@/lib/db";
import type { Location, Student, Profile, Evaluation, Group, CaseRow } from "@/lib/types";

// Each student case is evaluated by a panel of this many evaluators.
const PANEL = 3;

export default function Dashboard() {
  const [site, setSite] = useState("all");
  const [locations, setLocations] = useState<Location[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [evaluators, setEvaluators] = useState<Profile[]>([]);
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);

  useEffect(() => {
    listLocations().then(setLocations).catch(() => setLocations([]));
    listStudents().then(setStudents).catch(() => setStudents([]));
    listEvaluators().then(setEvaluators).catch(() => setEvaluators([]));
    listEvaluations().then(setEvals).catch(() => setEvals([]));
    listGroups().then(setGroups).catch(() => setGroups([]));
    listCases().then(setCases).catch(() => setCases([]));
  }, []);

  const hasLocations = locations.length > 0;
  const norm = (v: string | null | undefined) => (v || "").trim().toLowerCase();

  const activeLoc = site === "all" ? null : locations.find((l) => l.id === site) || null;
  const locKeys = activeLoc ? new Set([norm(activeLoc.name), norm(activeLoc.code)]) : null;

  // students/evaluators filtered by the selected site
  const fStudents = locKeys ? students.filter((s) => locKeys.has(norm(s.site))) : students;
  const fEvaluators = locKeys ? evaluators.filter((e) => locKeys.has(norm(e.site))) : evaluators;
  const fStudentIds = new Set(fStudents.map((s) => s.id));
  const fEvals = locKeys ? evals.filter((e) => fStudentIds.has(e.student_id)) : evals;
  const finishedEvals = fEvals.filter((e) => e.status === "finished");

  const counts = {
    students: fStudents.length,
    evals: finishedEvals.length,
    evaluators: fEvaluators.length,
  };

  const STATS = [
    { ic: "graduation-cap", tint: "tint-blue", lbl: "Total Students", val: counts.students },
    { ic: "clipboard-check", tint: "tint-green", lbl: "Evaluations Done", val: counts.evals },
    { ic: "stethoscope", tint: "tint-violet", lbl: "Total Evaluators", val: counts.evaluators },
    { ic: "map-pin", tint: "tint-teal", lbl: activeLoc ? "Location" : "Locations", val: activeLoc ? activeLoc.code : locations.length },
  ];

  // ---- Evaluation Tracker: per assessment group ----
  // For each group: students in it × cases that day × PANEL = expected;
  // finished evaluations of those students = done.
  const studentGroup = new Map(students.map((s) => [s.id, s.group_id]));
  const tracker = groups
    .map((g) => {
      const gStudents = fStudents.filter((s) => s.group_id === g.id);
      const dayCases = cases.length; // cases are global in this build
      const expected = gStudents.length * Math.max(dayCases, 1) * PANEL;
      const gStudentIds = new Set(gStudents.map((s) => s.id));
      const done = finishedEvals.filter((e) => gStudentIds.has(e.student_id)).length;
      const pct = expected ? Math.round((done / expected) * 100) : 0;
      return { date: g.assessment_date, students: gStudents.length, done, expected, pct };
    })
    .filter((t) => t.students > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  // ---- Evaluation Activity: submissions per day, last 7 days ----
  const today = new Date();
  const days: { label: string; key: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) });
  }
  const activityData = days.map(
    (d) => finishedEvals.filter((e) => (e.submitted_at || "").slice(0, 10) === d.key).length,
  );
  const hasActivity = activityData.some((v) => v > 0);

  // ---- Completion by Case ----
  const caseName = new Map(cases.map((c) => [c.id, c.name]));
  const byCase = new Map<string, number>();
  finishedEvals.forEach((e) => {
    const n = caseName.get(e.case_id) || "Unknown case";
    byCase.set(n, (byCase.get(n) || 0) + 1);
  });
  const caseLabels = Array.from(byCase.keys());
  const caseSeries = Array.from(byCase.values());
  const caseColors = ["#2563EB", "#7c3aed", "#0d9488", "#f59e0b", "#e11d48", "#16a34a"];
  const hasCaseData = caseSeries.length > 0;

  // ---- Group Status by Site (stacked done / in progress / not started) ----
  const siteList = activeLoc ? [activeLoc] : locations;
  const statusCats = siteList.map((l) => l.name);
  // Per site: count students whose evaluations are all done / partially / none.
  const finishedByStudent = new Map<string, number>();
  finishedEvals.forEach((e) => finishedByStudent.set(e.student_id, (finishedByStudent.get(e.student_id) || 0) + 1));
  const startedStudentIds = new Set(fEvals.map((e) => e.student_id));
  const targetPerStudent = Math.max(cases.length, 1) * PANEL;
  const statDone: number[] = [], statProg: number[] = [], statNone: number[] = [];
  siteList.forEach((l) => {
    const k = new Set([norm(l.name), norm(l.code)]);
    const ss = students.filter((s) => k.has(norm(s.site)));
    let d = 0, p = 0, n = 0;
    ss.forEach((s) => {
      const fin = finishedByStudent.get(s.id) || 0;
      if (fin >= targetPerStudent) d++;
      else if (fin > 0 || startedStudentIds.has(s.id)) p++;
      else n++;
    });
    statDone.push(d); statProg.push(p); statNone.push(n);
  });
  const hasStatus = statusCats.length > 0 && (statDone.some(Boolean) || statProg.some(Boolean));

  // ---- Top Evaluators ----
  const byEvaluator = new Map<string, number>();
  finishedEvals.forEach((e) => {
    const n = e.evaluator_name || "—";
    byEvaluator.set(n, (byEvaluator.get(n) || 0) + 1);
  });
  const topEval = Array.from(byEvaluator.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const evalCats = topEval.map((t) => t[0]);
  const evalData = topEval.map((t) => t[1]);
  const evalColors = evalCats.map((_, i) => caseColors[i % caseColors.length]);
  const hasTopEval = topEval.length > 0;

  return (
    <Shell portal="admin" title="Dashboard" sub={activeLoc ? `Evaluation activity at ${activeLoc.name}` : "Evaluation activity across all locations"}>
      {/* Site filter — only shown once locations exist */}
      <div className="between wrap" style={{ marginBottom: 20 }}>
        {hasLocations ? (
          <div className="tabs">
            <button className={`tab ${site === "all" ? "active" : ""}`} onClick={() => setSite("all")}>
              All Sites
            </button>
            {locations.map((l) => (
              <button key={l.id} className={`tab ${site === l.id ? "active" : ""}`} onClick={() => setSite(l.id)}>
                {l.name}
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}
        <span className="pill pill-blue">
          <Icon name="map-pin" size={14} /> {hasLocations ? `${locations.length} active site${locations.length > 1 ? "s" : ""}` : "No active sites yet"}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid g-4" style={{ marginBottom: 18 }}>
        {STATS.map((s) => (
          <div className="stat" key={s.lbl}>
            <div className={`ic ${s.tint}`}><Icon name={s.ic} size={24} /></div>
            <div className="lbl">{s.lbl}</div>
            <div className="val">{s.val}</div>
          </div>
        ))}
      </div>

      {/* Group Evaluation Tracker */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div><h3>Evaluation Tracker</h3><div className="sub">{activeLoc ? `Live · ${activeLoc.name}` : "Live · progress for each assessment group"}</div></div>
        </div>
        <div className="card-pad">
          {tracker.length === 0 ? (
            <EmptyState icon="activity" title="No evaluation groups yet"
              text={activeLoc ? `No scheduled groups for ${activeLoc.name} yet.` : "Once assessment groups are scheduled, live progress for each site will appear here."} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {tracker.map((t) => {
                const behind = t.pct < 50;
                return (
                  <div key={t.date} className="trk-row">
                    <div className="trk-head">
                      <div className="trk-title">
                        <Icon name="calendar" size={15} />
                        <b>{t.date}</b>
                        <span className="sub" style={{ marginLeft: 8 }}>{t.students} student{t.students !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="trk-counts">
                        <span className="pill pill-green">{t.done} done</span>
                        <span className="pill pill-grey">{Math.max(t.expected - t.done, 0)} pending</span>
                        {behind && <span className="pill pill-danger"><Icon name="alert-triangle" size={12} /> Needs attention</span>}
                      </div>
                    </div>
                    <div className="trk-bar"><div className="trk-fill" style={{ width: `${t.pct}%`, background: behind ? "#e11d48" : "#16a34a" }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Activity + Completion by case */}
      <div className="grid g-3" style={{ marginBottom: 18 }}>
        <div className="card" style={{ gridColumn: "span 2" }}>
          <div className="card-head"><div><h3>Evaluation Activity</h3><div className="sub">Daily submissions last 7 days</div></div></div>
          <div className="card-pad">
            {hasActivity ? (
              <Area categories={days.map((d) => d.label)} data={activityData} color="#2563EB" label="Submissions" height={240} />
            ) : (
              <EmptyState icon="trending-up" title="No activity yet" text="Submission trends will plot here as evaluations come in." />
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Completion by Case</h3></div></div>
          <div className="card-pad">
            {hasCaseData ? (
              <Donut series={caseSeries} labels={caseLabels} colors={caseColors} height={240} />
            ) : (
              <EmptyState icon="pie-chart" title="No data" />
            )}
          </div>
        </div>
      </div>

      {/* Status + Top evaluators */}
      <div className="grid g-2">
        <div className="card">
          <div className="card-head"><div><h3>Student Status by Site</h3><div className="sub">Done · In progress · Not started</div></div></div>
          <div className="card-pad">
            {hasStatus ? (
              <Stacked
                categories={statusCats}
                series={[
                  { name: "Done", data: statDone },
                  { name: "In progress", data: statProg },
                  { name: "Not started", data: statNone },
                ]}
                colors={["#16a34a", "#f59e0b", "#e2e8f0"]}
                height={260}
              />
            ) : (
              <EmptyState icon="chart-column" title="No groups yet" />
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Top Evaluators</h3><div className="sub">Finished evaluations</div></div></div>
          <div className="card-pad">
            {hasTopEval ? (
              <HBars categories={evalCats} data={evalData} colors={evalColors} height={260} />
            ) : (
              <EmptyState icon="award" title="No evaluations yet" />
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
