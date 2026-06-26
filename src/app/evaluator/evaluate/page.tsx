"use client";
import { useState, useEffect, useMemo } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import {
  listGroups, listStudents, listBatches, listCases, listQuestions,
  listEvaluations, createEvaluation, updateEvaluation,
} from "@/lib/db";
import type { Group, Student, Batch, CaseRow, Question, Evaluation } from "@/lib/types";
import { todayStr, fmtDate, isDateLocked } from "@/lib/dates";

const RUBRIC_OPTS = [
  { ttl: "Insuficiente", ds: "No cumple con los criterios mínimos esperados." },
  { ttl: "Aceptable", ds: "Cumple parcialmente con los criterios esperados." },
  { ttl: "Competente", ds: "Cumple satisfactoriamente con los criterios esperados." },
  { ttl: "Sobresaliente", ds: "Supera ampliamente los criterios esperados." },
];
const EXPECTED_EVALUATORS = 3;

export default function Evaluate() {
  const toast = useToast();
  const { profile } = useAuth();
  const site = profile?.site || "";

  const [loading, setLoading] = useState(true);
  const [todayGroup, setTodayGroup] = useState<Group | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [search, setSearch] = useState("");
  const [slotFilter, setSlotFilter] = useState("");

  // selected student (detail view)
  const [active, setActive] = useState<Student | null>(null);
  const [caseSel, setCaseSel] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null); // existing eval row for this evaluator+student+case
  const [savingDraft, setSavingDraft] = useState(false);
  const [doneAt, setDoneAt] = useState<string | null>(null); // if THIS evaluator already finished the picked case → locked + timestamp

  /* ---------- load today's scheduled students at this site ---------- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const groups = await listGroups();
        const g = groups.find((x) => x.assessment_date === todayStr()) || null;
        setTodayGroup(g);
        if (g) {
          const all = await listStudents(g.id);
          setStudents(site ? all.filter((s) => s.site === site) : all);
          const batches = await listBatches();
          const batch = batches.find((b) => b.assessment_date === g.assessment_date);
          setCases(batch ? await listCases(batch.id) : []);
        } else {
          setStudents([]); setCases([]);
        }
        setEvals(await listEvaluations());
      } catch {
        setTodayGroup(null); setStudents([]); setCases([]); setEvals([]);
      }
      setLoading(false);
    })();
  }, [site]);

  /* ---------- deep-link: ?student=&case= opens that student+case directly (edit from dashboard/submitted) ---------- */
  useEffect(() => {
    if (loading || !students.length) return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("student");
    const cid = params.get("case");
    if (!sid || active) return;
    const s = students.find((x) => x.id === sid);
    if (s) {
      openStudent(s);
      if (cid) setTimeout(() => pickCase(cid), 0);
      window.history.replaceState({}, "", "/evaluator/evaluate");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, students]);

  /* ---------- per-student case status (Evaluate page = THIS evaluator's own task) ----------
     The big icon reflects what the LOGGED-IN evaluator has done for this case:
       finished → green check, started → orange clock, nothing → grey circle.
     The dots show each evaluator slot (mine first) so multi-evaluator progress stays visible. */
  function caseStatus(studentId: string, caseId: string) {
    const rows = evals.filter((e) => e.student_id === studentId && e.case_id === caseId);
    const mine = rows.find((r) => r.evaluator_id === profile?.id);
    const others = rows.filter((r) => r.evaluator_id !== profile?.id);

    // icon/state = MY own progress on this case
    let state: "ok" | "prog" | "no";
    if (!mine) state = "no";
    else if (mine.status === "finished") state = "ok";
    else state = "prog";

    // dots = my slot first, then other evaluators, padded to EXPECTED_EVALUATORS
    const slotStates: ("ok" | "prog" | "no")[] = [];
    slotStates.push(mine ? (mine.status === "finished" ? "ok" : "prog") : "no");
    others.forEach((r) => slotStates.push(r.status === "finished" ? "ok" : "prog"));
    while (slotStates.length < EXPECTED_EVALUATORS) slotStates.push("no");

    return { state, dots: slotStates };
  }

  const slots = useMemo(() => Array.from(new Set(students.map((s) => s.slot).filter(Boolean))) as string[], [students]);

  // overall rank for THIS evaluator: 0 = not started, 1 = in progress, 2 = finished (all cases done by me)
  function studentRank(studentId: string) {
    const caseIds = cases.length ? cases.map((c) => c.id) : [];
    if (!caseIds.length) return 0;
    const mine = evals.filter((e) => e.student_id === studentId && e.evaluator_id === profile?.id);
    if (!mine.length) return 0;
    const finishedCases = new Set(mine.filter((e) => e.status === "finished").map((e) => e.case_id));
    if (caseIds.every((id) => finishedCases.has(id))) return 2; // I finished all cases → sink to bottom
    return 1; // started something
  }

  const filtered = students
    .filter((s) =>
      (!search || s.name.toLowerCase().includes(search.toLowerCase()) || s.qrtexto.toLowerCase().includes(search.toLowerCase())) &&
      (!slotFilter || s.slot === slotFilter)
    )
    .sort((a, b) => {
      const ra = studentRank(a.id), rb = studentRank(b.id);
      if (ra !== rb) return ra - rb; // not-started/in-progress first, finished last
      return a.name.localeCompare(b.name);
    });

  /* ---------- open a student ---------- */
  function openStudent(s: Student) {
    setActive(s); setCaseSel(""); setQuestions([]); setAnswers({}); setDraftId(null); setDoneAt(null);
  }
  async function pickCase(caseId: string) {
    setCaseSel(caseId); setAnswers({}); setDraftId(null); setDoneAt(null);
    if (!caseId) { setQuestions([]); return; }
    try {
      const qs = await listQuestions(caseId);
      setQuestions(qs);
      // resume this evaluator's existing row for this student+case (draft or finished)
      const mine = evals.find(
        (e) => e.student_id === active?.id && e.case_id === caseId && e.evaluator_id === profile?.id
      );
      if (mine) {
        setDraftId(mine.id);
        const restored: Record<string, string> = {};
        (mine.answers || []).forEach((a) => { if (a?.question_id) restored[a.question_id] = a.value; });
        setAnswers(restored);
        // already finished by THIS evaluator → lock the form, show timestamp
        setDoneAt(mine.status === "finished" ? (mine.submitted_at ?? null) : null);
      }
    } catch { setQuestions([]); }
  }

  /* ---------- pick an answer → persist draft (create on first, update after) ---------- */
  async function pickAnswer(questionId: string, value: string) {
    const next = { ...answers, [questionId]: value };
    setAnswers(next);
    if (!active || !caseSel || savingDraft) return;
    const payloadAnswers = questions.map((q) => ({ question_id: q.id, value: next[q.id] })).filter((a) => a.value);
    setSavingDraft(true);
    try {
      if (draftId) {
        await updateEvaluation(draftId, { answers: payloadAnswers });
      } else {
        const row = await createEvaluation({
          student_id: active.id,
          case_id: caseSel,
          evaluator_id: profile?.id ?? null,
          evaluator_name: profile?.full_name || "Evaluador",
          answers: payloadAnswers,
          status: "started",
          submitted_at: null,
        });
        setDraftId(row.id);
      }
      setEvals(await listEvaluations()); // keep list status live (orange "In progress")
    } catch { /* draft save is best-effort; final submit will persist */ }
    setSavingDraft(false);
  }

  const required = questions; // every criterio is required; comment is separate
  const answered = required.filter((q) => answers[q.id]).length;
  const pct = required.length ? Math.round((answered / required.length) * 100) : 0;
  const circ = 2 * Math.PI * 54;
  const ringColor = pct === 100 ? "#16a34a" : pct >= 50 ? "#f59e0b" : "#2563EB";

  async function submitEval() {
    if (!active || !caseSel) return;
    if (answered < required.length) { toast("Responde todos los criterios antes de enviar"); return; }
    setSubmitting(true);
    try {
      const payload = {
        answers: questions.map((q) => ({ question_id: q.id, value: answers[q.id] })),
        status: "finished" as const,
        submitted_at: new Date().toISOString(),
      };
      if (draftId) {
        // keep the SAME row, just flip its status to finished
        await updateEvaluation(draftId, payload);
      } else {
        await createEvaluation({
          student_id: active.id,
          case_id: caseSel,
          evaluator_id: profile?.id ?? null,
          evaluator_name: profile?.full_name || "Evaluador",
          ...payload,
        });
      }
      toast("Evaluación enviada");
      setEvals(await listEvaluations()); // finished students auto-sink to bottom
      setActive(null); setCaseSel(""); setQuestions([]); setAnswers({}); setDraftId(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "");
      toast(msg ? `No se pudo enviar: ${msg}` : "Intenta nuevamente en unos segundos");
    }
    setSubmitting(false);
  }

  /* ---------- reset / re-evaluate a finished case ---------- */
  async function resetEval() {
    if (!draftId) { setDoneAt(null); setAnswers({}); return; }
    setSubmitting(true);
    try {
      await updateEvaluation(draftId, { answers: [], status: "started", submitted_at: null });
      setAnswers({});
      setDoneAt(null);
      setEvals(await listEvaluations());
      toast("Evaluación reiniciada");
    } catch {
      toast("No se pudo reiniciar");
    }
    setSubmitting(false);
  }

  /* ============================= RENDER ============================= */

  // ---- student detail (screen 3) ----
  if (active) {
    return (
      <Shell portal="evaluator" title="Evaluate" sub="Select a student to begin a case assessment">
        <button className="btn btn-ghost" style={{ marginBottom: 16 }} onClick={() => setActive(null)}>
          <Icon name="arrow-left" size={16} /> Back to students
        </button>

        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-pad">
            <div className="std-profile" style={{ marginBottom: 14 }}>
              {active.photo_url
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={active.photo_url} className="av-xl" alt="" style={{ borderRadius: "50%" }} />
                : <span className="av-xl" style={{ borderRadius: "50%", background: "var(--brand-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", fontWeight: 800, fontSize: 26 }}>{active.name[0]}</span>}
              <div>
                <div className="std-name">{active.name}</div>
                <div className="st-meta" style={{ marginTop: 6 }}>
                  <span className="slot-chip"><Icon name="map-pin" size={13} /> {active.site}</span>
                  <span className="slot-chip"><Icon name="clock" size={13} /> {active.slot}</span>
                </div>
              </div>
            </div>

            <div className="field" style={{ maxWidth: 380 }}>
              <label>Caso a evaluar</label>
              <select className="select" value={caseSel} onChange={(e) => pickCase(e.target.value)}>
                <option value="">Selecciona un caso…</option>
                {cases.map((c) => {
                  const done = active != null && evals.some((e) => e.student_id === active.id && e.case_id === c.id && e.evaluator_id === profile?.id && e.status === "finished");
                  return <option key={c.id} value={c.id}>{done ? "✓ " : ""}{c.name}{done ? " — Terminada" : ""}</option>;
                })}
              </select>
            </div>
          </div>
        </div>

        {!caseSel ? (
          <div className="card"><div className="card-pad"><div className="empty-sm">Selecciona un caso arriba para comenzar la evaluación.</div></div></div>
        ) : questions.length === 0 ? (
          <div className="card"><div className="card-pad"><div className="empty-sm">Este caso aún no tiene criterios definidos.</div></div></div>
        ) : doneAt ? (
          <div className="card">
            <div className="card-pad" style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <Icon name={isDateLocked(todayStr()) ? "lock" : "check-circle-2"} size={34} style={{ color: "#16a34a" }} />
              </div>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6 }}>Evaluación Terminada</div>
              <div className="sub" style={{ maxWidth: 440, margin: "0 auto 4px" }}>
                {isDateLocked(todayStr())
                  ? "El día de la evaluación ya terminó y esta evaluación quedó bloqueada."
                  : "Ya enviaste tu evaluación para este caso. Puedes reeditarla o reiniciarla mientras siga abierto el día de la evaluación."}
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: "#16a34a", fontWeight: 700 }}>
                Enviado el {new Date(doneAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
              </div>
              {!isDateLocked(todayStr()) && (
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22, flexWrap: "wrap" }}>
                  <button className="btn btn-pri" type="button" onClick={() => setDoneAt(null)}>
                    <Icon name="pencil" size={15} /> Reeditar evaluación
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={resetEval}>
                    <Icon name="rotate-ccw" size={15} /> Reiniciar
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="eval-progress">
              <div className="eval-progress-circle">
                <svg className="ring-prog" viewBox="0 0 120 120">
                  <circle className="ring-bg" cx="60" cy="60" r="54" />
                  <circle className="ring-fg" cx="60" cy="60" r="54" style={{ stroke: ringColor, strokeDasharray: circ, strokeDashoffset: circ - (circ * pct) / 100 }} />
                  <text className="ring-count" x="60" y="58">{answered}/{required.length}</text>
                  <text className="ring-sub" x="60" y="74">Answered</text>
                </svg>
                <div><div style={{ fontWeight: 800 }}>{cases.find((c) => c.id === caseSel)?.name}</div><div className="sub">{pct}% complete</div></div>
              </div>
            </div>

            <form onSubmit={(e) => e.preventDefault()}>
              {questions.map((q, i) => (
                <div className="q-card" key={q.id}>
                  <div className="q-head"><span className="qn">{i + 1}. {q.title}</span><span className="q-req">Obligatoria</span></div>
                  <div className="q-body">
                    {q.type === "rubric" && (q.options?.length ? q.options : RUBRIC_OPTS.map((o) => ({ level: o.ttl, title: o.ttl, desc: o.ds }))).map((o) => (
                      <div key={o.level} className={`opt-pick ${answers[q.id] === o.level ? "sel" : ""}`} onClick={() => pickAnswer(q.id, o.level)}>
                        <span className="radio" /><div><div className="ttl">{o.title || o.level}</div>{o.desc && <div className="ds">{o.desc}</div>}</div>
                      </div>
                    ))}
                    {q.type === "yesno" && (
                      <div className="q-yn">
                        {["Sí", "No"].map((v) => <div key={v} className={`yn ${answers[q.id] === v ? "on" : ""}`} onClick={() => pickAnswer(q.id, v)}>{v}</div>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="eval-submit-bar" style={{ justifyContent: "center" }}>
                <button className="btn btn-pri" type="button" disabled={submitting} onClick={submitEval}>
                  <Icon name="send" size={16} /> {submitting ? "Enviando…" : "Submit Evaluation"}
                </button>
              </div>
            </form>
          </>
        )}
      </Shell>
    );
  }

  // ---- student list (screen 1/2) ----
  return (
    <Shell portal="evaluator" title="Evaluate" sub="Select a student to begin a case assessment">
      {loading ? (
        <div className="card"><div className="card-pad"><div className="empty-sm">Cargando…</div></div></div>
      ) : !todayGroup ? (
        <div className="card"><div className="card-pad">
          <EmptyState icon="calendar-clock" title="Not yet scheduled"
            text={`No assessment is scheduled for today (${fmtDate(todayStr())}). Once an assessment is set up for your site, the students will appear here ready to evaluate.`} />
        </div></div>
      ) : students.length === 0 ? (
        <div className="card"><div className="card-pad">
          <EmptyState icon="users" title="No students at your site today"
            text={`An assessment is scheduled for today (${fmtDate(todayStr())}), but no students are registered for your site${site ? ` (${site})` : ""}.`} />
        </div></div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-pad" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div className="input-search" style={{ flex: 1, minWidth: 220 }}>
                <Icon name="search" size={16} />
                <input className="input" placeholder="Search by name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="select" style={{ maxWidth: 180 }} value={slotFilter} onChange={(e) => setSlotFilter(e.target.value)}>
                <option value="">All Slots</option>
                {slots.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="case-legend" style={{ marginBottom: 12 }}>
            <span className="lg"><Icon name="check-circle-2" size={15} style={{ color: "#16a34a" }} /> Finished</span>
            <span className="lg"><Icon name="clock" size={15} style={{ color: "#f59e0b" }} /> In progress</span>
            <span className="lg"><Icon name="circle" size={15} style={{ color: "#cbd5e1" }} /> Not started</span>
          </div>

          <div className="grid g-3">{filtered.map((s) => (
            <div className="case-tile student-tile" key={s.id}>
              <div className="st-head">
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {s.photo_url
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.photo_url} className="av-md" alt="" style={{ borderRadius: "50%" }} />
                    : <span className="av-md" style={{ borderRadius: "50%", background: "var(--brand-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", fontWeight: 800 }}>{s.name[0]}</span>}
                  <div><div className="nm">{s.name}</div><div className="sub" style={{ fontSize: 12 }}>{s.qrtexto}</div></div>
                </div>
              </div>
              <div className="st-meta"><span className="slot-chip"><Icon name="map-pin" size={13} /> {s.site}</span><span className="slot-chip"><Icon name="clock" size={13} /> {s.slot}</span></div>
              <div className="st-cases">
                {(cases.length ? cases : [0, 1, 2]).map((c, i) => {
                  const caseId = cases[i]?.id;
                  const st = caseId ? caseStatus(s.id, caseId) : { state: "no" as const, dots: ["no", "no", "no"] as ("ok" | "prog" | "no")[] };
                  const icon = st.state === "ok" ? "check-circle-2" : st.state === "prog" ? "clock" : "circle";
                  const color = st.state === "ok" ? "#16a34a" : st.state === "prog" ? "#f59e0b" : "#cbd5e1";
                  return (
                    <div className={`scase ${st.state}`} key={i}>
                      <div className="scase-lbl">{cases[i]?.name ? `Case ${i + 1}` : `Case ${i + 1}`}</div>
                      <Icon name={icon} size={19} style={{ color }} />
                      <span className="edots">{st.dots.map((d, di) => <span key={di} className={`edot ed-${d}`} />)}</span>
                    </div>
                  );
                })}
              </div>
              <button className="btn btn-pri full" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={() => openStudent(s)}>
                <Icon name="clipboard-list" size={15} /> Evaluate
              </button>
            </div>
          ))}</div>
          {filtered.length === 0 && (
            <div className="card"><div className="card-pad"><div className="empty-sm">No students match your search.</div></div></div>
          )}
        </>
      )}
    </Shell>
  );
}
