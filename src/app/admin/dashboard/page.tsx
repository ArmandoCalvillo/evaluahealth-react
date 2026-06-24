"use client";
import { useState, useEffect } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import { listLocations, listStudents, listEvaluations, listEvaluators } from "@/lib/db";
import type { Location, Student, Profile, Evaluation } from "@/lib/types";

export default function Dashboard() {
  const [site, setSite] = useState("all");
  const [locations, setLocations] = useState<Location[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [evaluators, setEvaluators] = useState<Profile[]>([]);
  const [evals, setEvals] = useState<Evaluation[]>([]);

  useEffect(() => {
    listLocations().then(setLocations).catch(() => setLocations([]));
    listStudents().then(setStudents).catch(() => setStudents([]));
    listEvaluators().then(setEvaluators).catch(() => setEvaluators([]));
    listEvaluations().then(setEvals).catch(() => setEvals([]));
  }, []);

  const hasLocations = locations.length > 0;
  const norm = (v: string | null | undefined) => (v || "").trim().toLowerCase();

  // resolve selected tab -> the location object (or null for "all")
  const activeLoc = site === "all" ? null : locations.find((l) => l.id === site) || null;
  const locKeys = activeLoc ? new Set([norm(activeLoc.name), norm(activeLoc.code)]) : null;

  // students/evaluators filtered by the selected site
  const fStudents = locKeys ? students.filter((s) => locKeys.has(norm(s.site))) : students;
  const fEvaluators = locKeys ? evaluators.filter((e) => locKeys.has(norm(e.site))) : evaluators;
  // evaluations belonging to the filtered students of this site
  const fStudentIds = new Set(fStudents.map((s) => s.id));
  const fEvals = locKeys ? evals.filter((e) => fStudentIds.has(e.student_id)) : evals;

  const counts = {
    students: fStudents.length,
    evals: fEvals.length,
    evaluators: fEvaluators.length,
  };

  const STATS = [
    { ic: "graduation-cap", tint: "tint-blue", lbl: "Total Students", val: counts.students },
    { ic: "clipboard-check", tint: "tint-green", lbl: "Evaluations Done", val: counts.evals },
    { ic: "stethoscope", tint: "tint-violet", lbl: "Total Evaluators", val: counts.evaluators },
    { ic: "map-pin", tint: "tint-teal", lbl: activeLoc ? "Location" : "Locations", val: activeLoc ? activeLoc.code : locations.length },
  ];

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
          <div><h3>Evaluation Tracker</h3><div className="sub">{activeLoc ? `Live · ${activeLoc.name}` : "Live · each site keeps its own scheduled groups"}</div></div>
        </div>
        <div className="card-pad">
          <EmptyState icon="activity" title="No evaluation groups yet"
            text={activeLoc ? `No scheduled groups for ${activeLoc.name} yet.` : "Once assessment groups are scheduled, live progress for each site will appear here."} />
        </div>
      </div>

      {/* Chart placeholders */}
      <div className="grid g-3" style={{ marginBottom: 18 }}>
        <div className="card" style={{ gridColumn: "span 2" }}>
          <div className="card-head"><div><h3>Evaluation Activity</h3><div className="sub">Daily submissions last week</div></div></div>
          <div className="card-pad"><EmptyState icon="trending-up" title="No activity yet" text="Submission trends will plot here as evaluations come in." /></div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Completion by Case</h3></div></div>
          <div className="card-pad"><EmptyState icon="pie-chart" title="No data" /></div>
        </div>
      </div>

      <div className="grid g-2">
        <div className="card">
          <div className="card-head"><div><h3>Group Status by Site</h3></div></div>
          <div className="card-pad"><EmptyState icon="chart-column" title="No groups yet" /></div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Top Evaluators</h3></div></div>
          <div className="card-pad"><EmptyState icon="award" title="No evaluations yet" /></div>
        </div>
      </div>
    </Shell>
  );
}
