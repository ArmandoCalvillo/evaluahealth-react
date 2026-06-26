"use client";
import { useState, useEffect, useCallback } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import Drawer from "@/components/Drawer";
import EmptyState from "@/components/EmptyState";
import { Gauge, Grouped, DonutTotal, Stacked } from "@/components/charts";
import SiteTracker, { buildSiteRows } from "@/components/SiteTracker";
import { listLocations, listStudents, listEvaluations, listEvaluators, listGroups, listCases, listBatches } from "@/lib/db";
import type { Location, Student, Profile, Evaluation, Group, CaseRow, Batch } from "@/lib/types";

// A panel is normally 3 evaluators, but counts as complete with 2 if one
// doctor doesn't show. The "expected" count is derived per student+case from
// the evaluators who actually opened/started that evaluation. Until anyone
// engages we target the default panel size.
const PANEL = 3;        // default target before a panel forms
const MIN_PANEL = 2;    // a panel is acceptable with 2 if the 3rd never showed

type Scope = "live" | "last" | "all";
const SCOPES: { key: Scope; label: string; icon: string }[] = [
  { key: "live", label: "Live / Upcoming", icon: "radio" },
  { key: "last", label: "Last Assessment", icon: "history" },
  { key: "all", label: "Historical", icon: "layers" },
];
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmtStamp = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};

export default function Dashboard() {
  const [site, setSite] = useState("all");
  const [scope, setScope] = useState<Scope>("all");
  const [locations, setLocations] = useState<Location[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [evaluators, setEvaluators] = useState<Profile[]>([]);
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [allCases, setAllCases] = useState<CaseRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  // Tracker drawer
  const [drawer, setDrawer] = useState<{ site: string; slot: string; color: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"finished" | "progress" | "none" | "absent" | "all">("progress");
  // historical date scrub inside the drawer (index into drawerDates, -1 = all in-scope)
  const [drawerDateIdx, setDrawerDateIdx] = useState(-1);

  const loadLocations = useCallback(() => {
    listLocations().then(setLocations).catch(() => setLocations([]));
  }, []);

  useEffect(() => {
    loadLocations();
    listStudents().then(setStudents).catch(() => setStudents([]));
    listEvaluators().then(setEvaluators).catch(() => setEvaluators([]));
    listEvaluations().then(setEvals).catch(() => setEvals([]));
    listGroups().then(setGroups).catch(() => setGroups([]));
    listCases().then(setAllCases).catch(() => setAllCases([]));
    listBatches().then(setBatches).catch(() => setBatches([]));
  }, [loadLocations]);

  const hasLocations = locations.length > 0;
  const norm = (v: string | null | undefined) => (v || "").trim().toLowerCase();

  // ---- Time-scope: which assessment groups are in play ----
  const td = todayStr();
  const sortedGroups = [...groups].sort((a, b) => (a.assessment_date < b.assessment_date ? 1 : -1));
  // map student -> group, plus which groups have students / evaluations
  const studentGroup = new Map(students.map((s) => [s.id, s.group_id || ""]));
  const groupsWithStudents = new Set<string>();
  for (const s of students) if (s.group_id) groupsWithStudents.add(s.group_id);
  const groupsWithEvals = new Set<string>();
  for (const e of evals) {
    const gid = studentGroup.get(e.student_id);
    if (gid) groupsWithEvals.add(gid);
  }
  // "Last assessment" = the most-recent PAST assessment that actually has students
  // (i.e. the last one that was conducted). We do NOT require evaluations to
  // exist — a finished assessment can still be awaiting some evaluators.
  // Fallbacks: a past group with evals, then any past group.
  const lastPast =
    sortedGroups.find((g) => g.assessment_date < td && groupsWithStudents.has(g.id)) ||
    sortedGroups.find((g) => g.assessment_date < td && groupsWithEvals.has(g.id)) ||
    sortedGroups.find((g) => g.assessment_date < td) ||
    null;
  const scopeGroups =
    scope === "live"
      ? groups.filter((g) => g.assessment_date >= td)
      : scope === "last"
        ? lastPast
          ? [lastPast]
          : []
        : groups; // historical = all
  const scopeGroupIds = new Set(scopeGroups.map((g) => g.id));
  const scopeStudentIds = new Set(students.filter((s) => scopeGroupIds.has(s.group_id || "")).map((s) => s.id));

  // Cases in scope = cases whose batch assessment_date matches an in-scope group date.
  // This keeps each student measured only against the cases of their assessment,
  // not every case that ever existed (which inflated the target).
  const scopeDates = new Set(scopeGroups.map((g) => g.assessment_date));
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const cases = allCases.filter((c) => {
    const b = c.batch_id ? batchById.get(c.batch_id) : null;
    // include if batch date is in scope; if a case has no batch, include it (legacy)
    return b ? scopeDates.has(b.assessment_date) : true;
  });
  // upcoming = strictly future-dated groups (not today)
  const upcomingGroups = groups
    .filter((g) => g.assessment_date > td)
    .sort((a, b) => (a.assessment_date < b.assessment_date ? -1 : 1));
  const todayGroups = groups.filter((g) => g.assessment_date === td);
  const nextUpcoming = upcomingGroups[0] || null;
  // in Live mode with no assessment running today but one scheduled ahead → "upcoming" state
  const isUpcomingOnly = scope === "live" && todayGroups.length === 0 && !!nextUpcoming;
  const scopeNote =
    scope === "live"
      ? todayGroups.length > 0
        ? "Live · assessment running today"
        : nextUpcoming
          ? `Upcoming assessment · ${nextUpcoming.assessment_date}`
          : "No live or upcoming assessments"
      : scope === "last"
        ? lastPast
          ? `Last assessment · ${lastPast.assessment_date}`
          : "No completed assessment yet"
        : "All finished assessments to date";

  const activeLoc = site === "all" ? null : locations.find((l) => l.id === site) || null;
  const locKeys = activeLoc ? new Set([norm(activeLoc.name), norm(activeLoc.code)]) : null;

  // students/evaluators filtered by the selected site AND time-scope
  const fStudents = (locKeys ? students.filter((s) => locKeys.has(norm(s.site))) : students).filter((s) => scopeStudentIds.has(s.id));
  const fEvaluators = locKeys ? evaluators.filter((e) => locKeys.has(norm(e.site))) : evaluators;
  const fStudentIds = new Set(fStudents.map((s) => s.id));
  // always scope evaluations to the students in the current site + time-scope
  const fEvals = evals.filter((e) => fStudentIds.has(e.student_id));
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

  // shared: which students have at least started an evaluation
  const startedAllIds = new Set(fEvals.map((e) => e.student_id));

  // ---- Dynamic panel size per student+case ----
  // Count distinct evaluators who have ANY row (started or finished) for a
  // given student+case — that's the panel that actually showed up. Before
  // anyone engages, expect the default PANEL (3). Once a panel forms we lock
  // the denominator to who appeared, clamped to [MIN_PANEL, PANEL].
  const panelMap = new Map<string, Set<string>>(); // `${student}|${case}` -> set of evaluator ids
  fEvals.forEach((e) => {
    const key = `${e.student_id}|${e.case_id}`;
    if (!panelMap.has(key)) panelMap.set(key, new Set());
    if (e.evaluator_id) panelMap.get(key)!.add(e.evaluator_id);
  });
  const panelSize = (studentId: string, caseId: string): number => {
    const seen = panelMap.get(`${studentId}|${caseId}`)?.size || 0;
    if (seen === 0) return PANEL; // nobody started yet → target full panel
    return Math.min(Math.max(seen, MIN_PANEL), PANEL);
  };
  // cases that apply to a given student = cases of that student's own assessment date
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const casesForStudent = (studentId: string): CaseRow[] => {
    const s = students.find((x) => x.id === studentId);
    const g = s?.group_id ? groupById.get(s.group_id) : null;
    if (!g) return cases; // fallback: all in-scope cases
    return cases.filter((c) => {
      const b = c.batch_id ? batchById.get(c.batch_id) : null;
      return b ? b.assessment_date === g.assessment_date : true;
    });
  };
  // total expected evaluations for a student across THEIR cases
  const studentTarget = (studentId: string): number =>
    casesForStudent(studentId).reduce((sum, c) => sum + panelSize(studentId, c.id), 0);

  // ---- "Did not appear": group date in the PAST + 0 evaluations + not reopened ----
  const evalsByStudentAll = new Map<string, number>();
  evals.forEach((e) => evalsByStudentAll.set(e.student_id, (evalsByStudentAll.get(e.student_id) || 0) + 1));
  const isAbsent = (studentId: string): boolean => {
    const s = students.find((x) => x.id === studentId);
    if (!s) return false;
    if (s.reopened_at) return false; // admin reopened -> suppress auto-absent
    const g = s.group_id ? groupById.get(s.group_id) : null;
    if (!g || !(g.assessment_date < td)) return false; // only past assessments
    return (evalsByStudentAll.get(studentId) || 0) === 0; // no evaluations at all
  };

  // ---- Tracker: by SITE for live/last, by DATE for historical ----
  const isHistorical = scope === "all";
  const { sections: siteSections, needAttention } = buildSiteRows(fStudents, finishedEvals, cases.length, locations, startedAllIds, studentTarget, isAbsent);
  // Historical date list: per assessment date, per-site breakdown + total
  const historyRows = scopeGroups
    .map((g) => {
      const gStu = fStudents.filter((s) => s.group_id === g.id);
      const byLoc = locations
        .map((l) => ({ name: l.name, color: l.color, n: gStu.filter((s) => s.site === l.name).length }))
        .filter((x) => x.n > 0);
      return { date: g.assessment_date, total: gStu.length, byLoc };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const siteList = activeLoc ? [activeLoc] : locations;
  const finishedByStudent = new Map<string, number>();
  finishedEvals.forEach((e) => finishedByStudent.set(e.student_id, (finishedByStudent.get(e.student_id) || 0) + 1));

  // ---- 1) Evaluation Completion (overall rate) ----
  // Every student in scope counts toward the denominator — including "Did not appear"
  // (a no-show is an incomplete evaluation, not an exclusion).
  const absentInScope = fStudents.filter((s) => isAbsent(s.id)).length;
  const totalStudentsScope = fStudents.length;
  const completionDenom = totalStudentsScope;
  const fullyDone = fStudents.filter((s) => { const t = studentTarget(s.id); return t > 0 && (finishedByStudent.get(s.id) || 0) >= t; }).length;
  const completionRate = completionDenom ? (fullyDone / completionDenom) * 100 : 0;
  // student-level breakdown (drives the explainer under the gauge)
  const compInProgress = fStudents.filter((s) => {
    const t = studentTarget(s.id); const fin = finishedByStudent.get(s.id) || 0;
    return !(t > 0 && fin >= t) && (fin > 0 || startedAllIds.has(s.id)) && !isAbsent(s.id);
  }).length;
  const compNotStarted = Math.max(0, completionDenom - fullyDone - compInProgress - absentInScope);
  // panel-level progress (finished evaluator-panels vs expected) — only counts panels that were
  // ACTUALLY convened. A panel exists for a student+case only if ≥1 evaluator opened it; its size
  // is the real number of evaluators who engaged (1, 2, or 3), NOT an assumed full 3-person panel.
  // No-shows / not-started students have no convened panel → contribute 0 to expected.
  const convenedSize = (studentId: string, caseId: string): number =>
    panelMap.get(`${studentId}|${caseId}`)?.size || 0; // 0 if nobody opened it
  const panelExpected = fStudents.reduce((sum, s) =>
    sum + casesForStudent(s.id).reduce((c, cs) => c + convenedSize(s.id, cs.id), 0), 0);
  const panelFinished = fStudents.reduce((sum, s) =>
    sum + Math.min(finishedByStudent.get(s.id) || 0, casesForStudent(s.id).reduce((c, cs) => c + convenedSize(s.id, cs.id), 0)), 0);
  const panelPct = panelExpected ? Math.round((panelFinished / panelExpected) * 100) : 0;

  // ---- 2) Evaluations per Scheduled Group Hour (grouped bars, by site) ----
  const fmtSlot = (raw: string): string => {
    if (!raw) return "Unscheduled";
    const m = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?\s*\.?\s*m/i);
    if (!m) return raw.trim();
    const h = parseInt(m[1], 10);
    const ap = m[3].toLowerCase() === "p" ? "PM" : "AM";
    return `${h}:${m[2]} ${ap}`;
  };
  const slotOrder = (label: string): number => {
    const m = label.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return 9999;
    let h = parseInt(m[1], 10) % 12;
    if (m[3].toUpperCase() === "PM") h += 12;
    return h * 60 + parseInt(m[2], 10);
  };
  // finished evals attributed to a student's slot, grouped by site
  const studentById = new Map(fStudents.map((s) => [s.id, s]));
  const slotSet = new Set<string>();
  const hourBySite = new Map<string, Map<string, number>>(); // siteName -> slot -> count
  finishedEvals.forEach((e) => {
    const s = studentById.get(e.student_id);
    if (!s) return;
    const siteName = s.site || "Unspecified";
    const slot = fmtSlot(s.slot || "");
    slotSet.add(slot);
    if (!hourBySite.has(siteName)) hourBySite.set(siteName, new Map());
    const m = hourBySite.get(siteName)!;
    m.set(slot, (m.get(slot) || 0) + 1);
  });
  const slotCats = Array.from(slotSet).sort((a, b) => slotOrder(a) - slotOrder(b));
  const hourSites = siteList.filter((l) => hourBySite.has(l.name));
  const hourSeries = hourSites.map((l) => ({
    name: l.name,
    data: slotCats.map((sl) => hourBySite.get(l.name)!.get(sl) || 0),
  }));
  const hourColors = hourSites.map((l) => l.color);
  const hasHour = slotCats.length > 0 && hourSeries.some((s) => s.data.some(Boolean));

  // ---- 3) Completion by Case (donut + per-case %) ----
  const caseColors = ["#2563EB", "#7c3aed", "#0d9488", "#f59e0b", "#e11d48", "#16a34a"];
  const caseRows = cases.map((c, i) => {
    // A case only applies to students whose group assessment date == the case's batch date.
    const cb = c.batch_id ? batchById.get(c.batch_id) : null;
    const caseStudents = cb
      ? fStudents.filter((s) => groupById.get(s.group_id || "")?.assessment_date === cb.assessment_date)
      : fStudents;
    const caseStudentIds = new Set(caseStudents.map((s) => s.id));
    const finished = finishedEvals.filter((e) => e.case_id === c.id && caseStudentIds.has(e.student_id)).length;
    // % = finished panels vs expected (sum of each relevant student's panel size) for this case
    const expected = caseStudents.reduce((sum, s) => sum + panelSize(s.id, c.id), 0);
    const pct = expected ? Math.round((finished / expected) * 100) : 0;
    return { name: c.name, finished, pct, color: caseColors[i % caseColors.length] };
  });
  const caseLabels = caseRows.map((r) => r.name);
  const caseSeries = caseRows.map((r) => r.finished);
  const caseDonutColors = caseRows.map((r) => r.color);
  const caseTotal = caseSeries.reduce((a, b) => a + b, 0);
  const hasCaseData = caseRows.length > 0 && caseTotal > 0;

  // ---- 4) Group Status by Site (stacked done / in progress / unfinished) ----
  const statusCats = siteList.map((l) => l.name);
  const statDone: number[] = [], statProg: number[] = [], statNone: number[] = [], statAbsent: number[] = [];
  siteList.forEach((l) => {
    const k = new Set([norm(l.name), norm(l.code)]);
    const ss = fStudents.filter((s) => k.has(norm(s.site)));
    let d = 0, p = 0, n = 0, a = 0;
    ss.forEach((s) => {
      const fin = finishedByStudent.get(s.id) || 0;
      const t = studentTarget(s.id);
      if (t > 0 && fin >= t) d++;
      else if (fin > 0 || startedAllIds.has(s.id)) p++;
      else if (isAbsent(s.id)) a++;
      else n++;
    });
    statDone.push(d); statProg.push(p); statNone.push(n); statAbsent.push(a);
  });
  const hasStatus = statusCats.length > 0 && (statDone.some(Boolean) || statProg.some(Boolean) || statNone.some(Boolean) || statAbsent.some(Boolean));

  // ---- Tracker drawer: students in the selected site + slot ----
  const slotMatch = (raw: string | null) => fmtSlot(raw || "") === (drawer?.slot ? fmtSlot(drawer.slot) : "");
  // assessment dates that have students for the open site+slot — across ALL history
  // (independent of the page scope), so the drawer can scrub past assessments.
  const drawerDates = drawer
    ? Array.from(
        new Set(
          students
            .filter((s) => s.site === drawer.site && slotMatch(s.slot))
            .map((s) => groupById.get(s.group_id || "")?.assessment_date || "")
            .filter(Boolean)
        )
      ).sort((a, b) => (a < b ? 1 : -1)) // newest first
    : [];
  // active date for the drawer: -1 (or out of range) → newest available
  const drawerDate = drawerDates.length
    ? drawerDates[drawerDateIdx >= 0 && drawerDateIdx < drawerDates.length ? drawerDateIdx : 0]
    : "";
  const drawerStudents = drawer
    ? students.filter(
        (s) =>
          s.site === drawer.site &&
          slotMatch(s.slot) &&
          (!drawerDate || groupById.get(s.group_id || "")?.assessment_date === drawerDate)
      )
    : [];
  // drawer status uses the FULL eval set (drawer can scrub to out-of-scope dates)
  const drawerFinishedBy = new Map<string, number>();
  evals.filter((e) => e.status === "finished").forEach((e) =>
    drawerFinishedBy.set(e.student_id, (drawerFinishedBy.get(e.student_id) || 0) + 1)
  );
  const drawerStartedIds = new Set(evals.map((e) => e.student_id));
  const studentStatus = (id: string): "finished" | "progress" | "none" | "absent" => {
    const fin = drawerFinishedBy.get(id) || 0;
    const t = studentTarget(id);
    if (t > 0 && fin >= t) return "finished";
    if (fin > 0 || drawerStartedIds.has(id)) return "progress";
    if (isAbsent(id)) return "absent";
    return "none";
  };
  const drawerCounts = {
    finished: drawerStudents.filter((s) => studentStatus(s.id) === "finished").length,
    progress: drawerStudents.filter((s) => studentStatus(s.id) === "progress").length,
    none: drawerStudents.filter((s) => studentStatus(s.id) === "none").length,
    absent: drawerStudents.filter((s) => studentStatus(s.id) === "absent").length,
    all: drawerStudents.length,
  };
  // if the active filter tile got hidden (count 0), fall back to "all"
  useEffect(() => {
    if (statusFilter !== "all" && drawerCounts[statusFilter] === 0) setStatusFilter("all");
  }, [statusFilter, drawerCounts.finished, drawerCounts.progress, drawerCounts.none, drawerCounts.absent]);
  const statusRank = (id: string) => {
    const st = studentStatus(id);
    return st === "none" ? 0 : st === "progress" ? 1 : st === "absent" ? 2 : 3; // finished/absent sink to bottom
  };
  const drawerList = drawerStudents
    .filter((s) => statusFilter === "all" || studentStatus(s.id) === statusFilter)
    .sort((a, b) => statusRank(a.id) - statusRank(b.id));
  const caseName = (id: string) => cases.find((c) => c.id === id)?.name || "Case";
  const evaluatorById = new Map(evaluators.map((e) => [e.id, e]));
  // pending evaluators per student: per-case panel size minus submitted,
  // with the actual doctors (submitted + still-pending) surfaced per case.
  type DocStatus = "submitted" | "progress" | "awaiting";
  type DocRow = { id: string; name: string; photo: string | null; status: DocStatus; time: string | null };
  const pendingInfo = (sid: string) => {
    // use the FULL eval set so drawer details work for out-of-scope (historical) dates too
    const studentEvals = evals.filter((e) => e.student_id === sid);
    const submitted = studentEvals.filter((e) => e.status === "finished").length;
    const target = studentTarget(sid);
    const allEvalsForStudent = studentEvals;
    const lines = casesForStudent(sid).map((c, ci) => {
      const caseEvals = studentEvals.filter((e) => e.case_id === c.id);
      const doneEvals = caseEvals.filter((e) => e.status === "finished");
      const done = doneEvals.length;
      const panel = panelSize(sid, c.id);
      // doctors who submitted
      const submittedDocs: DocRow[] = doneEvals.map((e) => ({
        id: e.evaluator_id || "",
        name: (e.evaluator_id && evaluatorById.get(e.evaluator_id)?.full_name) || e.evaluator_name || "Evaluator",
        photo: (e.evaluator_id && evaluatorById.get(e.evaluator_id)?.photo_url) || null,
        status: "submitted",
        time: e.submitted_at || null,
      }));
      // doctors who started but not yet submitted → "In progress"
      const startedDocs: DocRow[] = caseEvals
        .filter((e) => e.status !== "finished" && e.evaluator_id)
        .map((e) => ({
          id: e.evaluator_id!,
          name: evaluatorById.get(e.evaluator_id!)?.full_name || e.evaluator_name || "Evaluator",
          photo: evaluatorById.get(e.evaluator_id!)?.photo_url || null,
          status: "progress",
          time: null, // in-progress evaluators show no timestamp; only submitted time is shown
        }));
      // remaining unfilled slots → awaiting an evaluator
      const filled = submittedDocs.length + startedDocs.length;
      const awaiting = Math.max(panel - filled, 0);
      const awaitingDocs: DocRow[] = Array.from({ length: awaiting }, () => ({
        id: "", name: "Awaiting evaluator", photo: null, status: "awaiting" as DocStatus, time: null,
      }));
      // full roster: submitted first, then in-progress, then awaiting
      const docs: DocRow[] = [...submittedDocs, ...startedDocs, ...awaitingDocs];
      const started = caseEvals.length > 0; // anyone engaged this case at all
      return { caseId: c.id, caseLabel: c.name || `Case ${ci + 1}`, case: c.name, done, panel, started, docs };
    });
    const anyStarted = allEvalsForStudent.length > 0;
    return { submitted, target, pending: Math.max(target - submitted, 0), lines, anyStarted };
  };

  return (
    <Shell portal="admin" title="Dashboard" sub={`${scopeNote}${activeLoc ? ` · ${activeLoc.name}` : ""}`}>
      {/* Site filter — only shown once locations exist */}
      <div className="between wrap" style={{ marginBottom: 20 }}>
        {hasLocations ? (
          <div className="tabs">
            <button className={`tab ${site === "all" ? "active" : ""}`} onClick={() => setSite("all")}>
              All Sites
            </button>
            {locations.map((l) => (
              <button key={l.id} className={`tab ${site === l.id ? "active" : ""}`} onClick={() => setSite(l.id)}>
                <span className="sdot" style={{ background: l.color, marginRight: 6 }} />{l.name}
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}
        <div className="row gap8">
          <div className="scope-toggle">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                className={`scope-btn ${scope === s.key ? "active" : ""}`}
                onClick={() => setScope(s.key)}
                title={s.label}
              >
                <Icon name={s.icon} size={14} /> {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Upcoming-assessment notice (Live mode, nothing running today) */}
      {isUpcomingOnly && nextUpcoming && (
        <div className="upcoming-banner" style={{ marginBottom: 18 }}>
          <div className="ub-ic"><Icon name="calendar-clock" size={22} /></div>
          <div className="ub-body">
            <div className="ub-title">No assessment is running today</div>
            <div className="ub-sub">
              The next assessment is scheduled for <b>{nextUpcoming.assessment_date}</b>
              {upcomingGroups.length > 1 ? ` (+${upcomingGroups.length - 1} more upcoming)` : ""}.
              Live data will appear here once it begins.
            </div>
          </div>
          <span className="pill pill-blue ub-pill"><Icon name="clock" size={13} /> Upcoming</span>
        </div>
      )}

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

      {/* Evaluation Tracker — by site (live/last) or by date (historical) */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div>
            <h3>Evaluation Tracker</h3>
            <div className="sub">
              {isHistorical
                ? "All assessments to date, by date"
                : scope === "last"
                  ? lastPast
                    ? `Last assessment · ${lastPast.assessment_date} — by site, behind groups shown first`
                    : "No completed assessment yet"
                  : "Live · each site keeps its own scheduled groups — behind groups shown first"}
            </div>
          </div>
          {!isHistorical && !isUpcomingOnly && needAttention > 0 && (
            <span className="pill pill-danger"><span className="strk-dotr" /> {needAttention} need attention</span>
          )}
        </div>
        <div className="card-pad">
          {isHistorical ? (
            historyRows.length === 0 ? (
              <EmptyState icon="layers" title="No completed assessments yet"
                text="Finished assessments will be listed here by date." />
            ) : (
              <div className="hist-list">
                {historyRows.map((r) => {
                  // open the drawer scrubbed to this date's first site + slot
                  const openDate = () => {
                    const firstSite = r.byLoc[0]?.name;
                    if (!firstSite) return;
                    const dateStu = students.filter(
                      (s) =>
                        s.site === firstSite &&
                        groupById.get(s.group_id || "")?.assessment_date === r.date
                    );
                    const slot = dateStu[0]?.slot || "";
                    const loc = locations.find((l) => l.name === firstSite);
                    const dates = Array.from(
                      new Set(
                        students
                          .filter((s) => s.site === firstSite && fmtSlot(s.slot || "") === fmtSlot(slot))
                          .map((s) => groupById.get(s.group_id || "")?.assessment_date || "")
                          .filter(Boolean)
                      )
                    ).sort((a, b) => (a < b ? 1 : -1));
                    setStatusFilter("all");
                    setDrawerDateIdx(Math.max(dates.indexOf(r.date), 0));
                    setDrawer({ site: firstSite, slot, color: loc?.color || "#2563EB" });
                  };
                  return (
                    <div key={r.date} className="hist-row hist-row-click" onClick={openDate} role="button" tabIndex={0}>
                      <div className="hist-date"><Icon name="calendar" size={15} /><b>{r.date}</b></div>
                      <div className="hist-locs">
                        {r.byLoc.map((l) => (
                          <span key={l.name} className="hist-loc">
                            <span className="strk-dot" style={{ background: l.color }} />
                            {l.name}<b>{l.n}</b>
                          </span>
                        ))}
                      </div>
                      <span className="hist-total">{r.total} student{r.total !== 1 ? "s" : ""}</span>
                      <Icon name="chevron-right" size={16} />
                    </div>
                  );
                })}
              </div>
            )
          ) : isUpcomingOnly || siteSections.length === 0 ? (
            <EmptyState icon="activity" title={isUpcomingOnly ? "Assessment not started yet" : "No evaluation groups yet"}
              text={isUpcomingOnly
                ? `The next assessment is scheduled for ${nextUpcoming?.assessment_date}. Site progress will appear once it begins.`
                : activeLoc ? `No scheduled groups for ${activeLoc.name} yet.` : "Once assessment groups are scheduled, live progress for each site will appear here."} />
          ) : (
            <SiteTracker
              sections={siteSections}
              needAttention={needAttention}
              onOpen={(siteName, slot) => {
                const loc = locations.find((l) => l.name === siteName);
                setStatusFilter("progress");
                // land the drawer on the scope's active assessment date (not always newest)
                const scopeDate = lastPast?.assessment_date;
                const dates = Array.from(
                  new Set(
                    students
                      .filter((s) => s.site === siteName && fmtSlot(s.slot || "") === fmtSlot(slot))
                      .map((s) => groupById.get(s.group_id || "")?.assessment_date || "")
                      .filter(Boolean)
                  )
                ).sort((a, b) => (a < b ? 1 : -1));
                const idx = scopeDate ? dates.indexOf(scopeDate) : -1;
                setDrawerDateIdx(idx >= 0 ? idx : -1);
                setDrawer({ site: siteName, slot, color: loc?.color || "#2563EB" });
              }}
            />
          )}
        </div>
      </div>

      {/* Evaluation Completion + Evaluations per Scheduled Group Hour */}
      <div className="grid g-3" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><div><h3>Evaluation Completion</h3><div className="sub">Students fully evaluated</div></div></div>
          <div className="card-pad">
            {!isUpcomingOnly && totalStudentsScope > 0 ? (
              <div className="comp-wrap">
                <Gauge value={completionRate} color="#16a34a" height={190} label="fully evaluated" />
                <div className="comp-formula">
                  <b>{fullyDone}</b> of <b>{completionDenom}</b> students fully evaluated
                  {absentInScope > 0 && <span className="comp-note"> · incl. {absentInScope} who did not appear</span>}
                </div>
                <div className="comp-bd">
                  <div className="comp-row">
                    <span className="comp-dot" style={{ background: "#16a34a" }} />
                    <span className="comp-lbl">Fully evaluated</span>
                    <span className="comp-val">{fullyDone}</span>
                  </div>
                  <div className="comp-row">
                    <span className="comp-dot" style={{ background: "#f59e0b" }} />
                    <span className="comp-lbl">In progress</span>
                    <span className="comp-val">{compInProgress}</span>
                  </div>
                  {absentInScope > 0 && (
                    <div className="comp-row">
                      <span className="comp-dot" style={{ background: "#e11d48" }} />
                      <span className="comp-lbl">Did not appear</span>
                      <span className="comp-val">{absentInScope}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState icon="gauge" title={isUpcomingOnly ? "Assessment not started yet" : "No students yet"}
                text={isUpcomingOnly ? "Completion will appear once the assessment begins." : undefined} />
            )}
          </div>
        </div>
        <div className="card" style={{ gridColumn: "span 2" }}>
          <div className="card-head"><div><h3>Evaluations per Scheduled Group Hour</h3><div className="sub">Broken down by site</div></div></div>
          <div className="card-pad">
            {hasHour ? (
              <Grouped categories={slotCats} series={hourSeries} colors={hourColors} height={250} />
            ) : (
              <EmptyState icon="bar-chart-3" title="No evaluations yet" text="Finished evaluations will plot by scheduled hour and site." />
            )}
          </div>
        </div>
      </div>

      {/* Completion by Case + Group Status by Site */}
      <div className="grid g-2">
        <div className="card">
          <div className="card-head"><div><h3>Completion by Case</h3><div className="sub">Finished panels</div></div></div>
          <div className="card-pad">
            {hasCaseData ? (
              <div className="case-completion">
                <DonutTotal series={caseSeries} labels={caseLabels} colors={caseDonutColors} total={caseTotal} height={240} />
                <div className="cc-legend">
                  {caseRows.map((r, i) => (
                    <div className="cl-row" key={i}>
                      <span className="cl-dot" style={{ background: r.color }} />
                      <span className="cl-name">{r.name}</span>
                      <span className="cl-pct">{r.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState icon="pie-chart" title="No data" />
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Group Status by Site</h3><div className="sub">Done · in progress · did not appear</div></div></div>
          <div className="card-pad">
            {!isUpcomingOnly && hasStatus ? (
              <Stacked
                categories={statusCats}
                series={[
                  { name: "Done", data: statDone },
                  { name: "In progress", data: statProg },
                  { name: "Did not appear", data: statAbsent },
                ]}
                colors={["#16a34a", "#f59e0b", "#e11d48"]}
                height={260}
              />
            ) : (
              <EmptyState icon="chart-column" title={isUpcomingOnly ? "Assessment not started yet" : "No groups yet"}
                text={isUpcomingOnly ? "Group status will appear once the assessment begins." : undefined} />
            )}
          </div>
        </div>
      </div>

      {/* Tracker → pending students drawer */}
      <Drawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title=""
        wide
        headerExtra={drawer ? (
          <div className="tdraw-head">
            <span className="tdraw-pill tdraw-loc">
              <span className="sdot" style={{ background: drawer.color }} />
              {drawer.site}
            </span>
            <span className="tdraw-sep">|</span>
            <span className="tdraw-pill tdraw-slot">
              <Icon name="clock" size={15} /> {fmtSlot(drawer.slot)} Group
            </span>
          </div>
        ) : undefined}
      >
        {drawer && (
          <div className="tdraw">
            {/* Clickable status stat tiles */}
            <div className="tdraw-stats">
              {([
                { key: "finished", lbl: "Finished", val: drawerCounts.finished, color: "#16a34a" },
                { key: "progress", lbl: "In progress", val: drawerCounts.progress, color: "#f59e0b" },
                { key: "none", lbl: "Not yet started", val: drawerCounts.none, color: "#64748b" },
                { key: "absent", lbl: "Did not appear", val: drawerCounts.absent, color: "#94a3b8" },
                { key: "all", lbl: "Total", val: drawerCounts.all, color: "#2563EB" },
              ] as const).filter((t) => t.key === "all" || t.val > 0).map((t) => (
                <button
                  key={t.key}
                  className={`tdraw-stat ${statusFilter === t.key ? "active" : ""}`}
                  style={statusFilter === t.key ? { borderColor: t.color, boxShadow: `0 0 0 1px ${t.color}` } : undefined}
                  onClick={() => setStatusFilter(t.key)}
                >
                  <span className="ts-val" style={{ color: t.color }}>{t.val}</span>
                  <span className="ts-lbl">{t.lbl}</span>
                </button>
              ))}
            </div>

            {/* Student list (filtered) */}
            <div className="tdraw-listlbl">
              {statusFilter === "all" ? "All students" : statusFilter === "finished" ? "Finished students" : statusFilter === "progress" ? "In-progress students" : statusFilter === "absent" ? "Did not appear" : "Not-yet-started students"}
              <b>{drawerList.length}</b>
            </div>
            {drawerList.length === 0 ? (
              <EmptyState icon="users" title="No students" text="No students match this status." />
            ) : (
              <div className="tdraw-students">
                {drawerList.map((s) => {
                  const info = pendingInfo(s.id);
                  return (
                    <div className="tdraw-card" key={s.id}>
                      <div className="tdraw-shead">
                        {s.photo_url
                          ? <img src={s.photo_url} className="gp-savatar" alt="" />
                          : <span className="gp-savatar" style={{ background: "var(--brand-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", fontWeight: 800 }}>{s.name[0]}</span>}
                        <div className="tdraw-sinfo">
                          <div className="tdraw-sname">{s.name}</div>
                          <div className="tdraw-sid">{s.qrtexto} · {s.site} · {fmtSlot(s.slot || "")}</div>
                        </div>
                        {studentStatus(s.id) === "absent" && (
                          <span className="tdraw-subpill" style={{ background: "#eef2f6", color: "#64748b", borderColor: "#cbd5e1" }}>Did not appear</span>
                        )}
                      </div>
                      {studentStatus(s.id) === "absent" ? (
                        <div className="tdraw-absent" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", color: "#64748b", fontSize: 13 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Icon name="user-x" size={15} /> Student did not appear for this assessment
                          </span>
                        </div>
                      ) : !info.anyStarted ? (
                        <div className="tdraw-notstarted">
                          <Icon name="circle-dashed" size={15} /> Evaluation not started yet
                        </div>
                      ) : info.lines.map((l, i) => (
                        <div key={i} className="tdraw-caseblk">
                          <div className="tdraw-casetitle">{l.caseLabel}</div>
                          {!l.started ? (
                            <div className="tdraw-casenote"><Icon name="circle-dashed" size={13} /> Not started yet</div>
                          ) : (
                            <div className="tdraw-evlist">
                              {l.docs.filter((d) => d.name !== "Awaiting evaluator").map((d, j) => (
                                <div className="tdraw-evrow" key={j}>
                                  <Icon name="check-circle-2" size={15} style={{ color: d.status === "submitted" ? "#16a34a" : d.status === "progress" ? "#f59e0b" : "#cbd5e1" }} />
                                  <span className="tdraw-evname">{d.name}</span>
                                  {d.time && fmtStamp(d.time) && (
                                    <span className="tdraw-evtime"><Icon name="clock" size={12} /> {fmtStamp(d.time)}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Drawer>

    </Shell>
  );
}
