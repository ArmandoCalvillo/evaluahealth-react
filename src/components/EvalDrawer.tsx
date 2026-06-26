"use client";
import { useState, useEffect, useCallback } from "react";
import Drawer from "./Drawer";
import Icon from "./Icon";
import { useToast } from "./Toast";
import { useAuth } from "@/lib/auth";
import {
  listQuestions, listEvaluations, createEvaluation, updateEvaluation,
} from "@/lib/db";
import type { Question, Evaluation, Student } from "@/lib/types";
import { isDateLocked } from "@/lib/dates";

const RUBRIC_OPTS = [
  { ttl: "Insuficiente", ds: "No cumple con los criterios mínimos esperados." },
  { ttl: "Aceptable", ds: "Cumple parcialmente con los criterios esperados." },
  { ttl: "Competente", ds: "Cumple satisfactoriamente con los criterios esperados." },
  { ttl: "Sobresaliente", ds: "Supera ampliamente los criterios esperados." },
];

export interface EvalTarget {
  student: Student | null;        // student being evaluated (header + photo)
  studentId: string;
  caseId: string;
  caseName: string;
  assessmentDate?: string;        // the batch date this student belongs to (drives the lock)
}

/**
 * Slide-over evaluation form. Opens from Dashboard / Submitted edit pencils.
 * Autosaves every answer (not_started → started), submit flips started → finished,
 * supports reedit / reset within the 2-day window, and locks past it.
 */
export default function EvalDrawer({
  open, target, onClose, onSaved,
}: {
  open: boolean;
  target: EvalTarget | null;
  onClose: () => void;
  onSaved?: () => void; // parent reloads its list after a save/submit/reset
}) {
  const toast = useToast();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draftId, setDraftId] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<string | null>(null); // submitted_at when finished
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false); // user clicked "Reeditar" → show form despite finished

  const load = useCallback(async () => {
    if (!target?.caseId) return;
    setLoading(true);
    setAnswers({}); setDraftId(null); setDoneAt(null); setEditing(false);
    try {
      const qs = await listQuestions(target.caseId);
      setQuestions(qs);
      const all = await listEvaluations();
      const mine = all.find(
        (e) => e.student_id === target.studentId && e.case_id === target.caseId && e.evaluator_id === profile?.id
      );
      if (mine) {
        setDraftId(mine.id);
        const restored: Record<string, string> = {};
        (mine.answers || []).forEach((a) => { if (a?.question_id) restored[a.question_id] = a.value; });
        setAnswers(restored);
        const finishedAt = mine.status === "finished" ? (mine.submitted_at ?? null) : null;
        setDoneAt(finishedAt);
        // Open the edit form directly — skip the "Evaluación terminada" screen.
        // Lock once the assessment date is over (past); today/future stay editable.
        if (finishedAt && !isDateLocked(target.assessmentDate)) setEditing(true);
      }
    } catch { setQuestions([]); }
    setLoading(false);
  }, [target, profile?.id]);

  useEffect(() => { if (open && target) load(); }, [open, target, load]);

  /* ---- pick an answer → autosave draft, flip not_started → started ---- */
  async function pickAnswer(questionId: string, value: string) {
    const next = { ...answers, [questionId]: value };
    setAnswers(next);
    if (!target || savingDraft) return;
    const payloadAnswers = questions.map((q) => ({ question_id: q.id, value: next[q.id] })).filter((a) => a.value);
    setSavingDraft(true);
    try {
      if (draftId) {
        // if this row was finished and the user is editing, keep it finished but update answers;
        // otherwise it's a live draft.
        await updateEvaluation(draftId, doneAt && editing ? { answers: payloadAnswers } : { answers: payloadAnswers, status: "started" });
        if (!doneAt) {/* stays started */}
      } else {
        const row = await createEvaluation({
          student_id: target.studentId,
          case_id: target.caseId,
          evaluator_id: profile?.id ?? null,
          evaluator_name: profile?.full_name || "Evaluador",
          answers: payloadAnswers,
          status: "started",
          submitted_at: null,
        });
        setDraftId(row.id);
      }
      onSaved?.();
    } catch { /* best-effort; submit will persist */ }
    setSavingDraft(false);
  }

  const answered = questions.filter((q) => answers[q.id]).length;
  const pct = questions.length ? Math.round((answered / questions.length) * 100) : 0;
  const circ = 2 * Math.PI * 54;
  const ringColor = pct === 100 ? "#16a34a" : pct >= 50 ? "#f59e0b" : "#2563EB";

  async function submitEval() {
    if (!target) return;
    if (answered < questions.length) { toast("Responde todos los criterios antes de enviar"); return; }
    setSubmitting(true);
    try {
      const payload = {
        answers: questions.map((q) => ({ question_id: q.id, value: answers[q.id] })),
        status: "finished" as const,
        submitted_at: new Date().toISOString(),
      };
      if (draftId) await updateEvaluation(draftId, payload);
      else {
        const row = await createEvaluation({
          student_id: target.studentId,
          case_id: target.caseId,
          evaluator_id: profile?.id ?? null,
          evaluator_name: profile?.full_name || "Evaluador",
          ...payload,
        });
        setDraftId(row.id);
      }
      toast("Evaluación enviada");
      onSaved?.();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      toast(msg ? `No se pudo enviar: ${msg}` : "Intenta nuevamente en unos segundos");
    }
    setSubmitting(false);
  }

  async function resetEval() {
    if (!draftId) { setDoneAt(null); setAnswers({}); setEditing(true); return; }
    setSubmitting(true);
    try {
      await updateEvaluation(draftId, { answers: [], status: "started", submitted_at: null });
      setAnswers({}); setDoneAt(null); setEditing(true);
      onSaved?.();
      toast("Evaluación reiniciada");
    } catch { toast("No se pudo reiniciar"); }
    setSubmitting(false);
  }

  const s = target?.student || null;
  const locked = doneAt ? isDateLocked(target?.assessmentDate) : false;
  const showForm = !doneAt || editing;

  const footer = showForm && questions.length > 0 && !loading ? (
    <button className="btn btn-pri" type="button" disabled={submitting} onClick={submitEval} style={{ width: "100%", justifyContent: "center" }}>
      <Icon name="send" size={16} /> {submitting ? "Enviando…" : "Enviar evaluación"}
    </button>
  ) : undefined;

  return (
    <Drawer open={open} onClose={onClose} wide
      title={target?.caseName || "Evaluación"}
      sub={s ? `${s.name} · ${s.site || ""} · ${s.slot || ""}` : undefined}
      footer={footer}>
      {!target ? null : loading ? (
        <div className="empty-sm">Cargando…</div>
      ) : (
        <>
          {/* student header */}
          {s && (
            <div className="std-profile" style={{ marginBottom: 16 }}>
              {s.photo_url
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.photo_url} className="av-lg" alt="" style={{ borderRadius: "50%" }} />
                : <span className="av-lg" style={{ borderRadius: "50%", background: "var(--brand-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", fontWeight: 800, fontSize: 22 }}>{s.name[0]}</span>}
              <div>
                <div className="std-name">{s.name}</div>
                <div className="st-meta" style={{ marginTop: 6 }}>
                  <span className="slot-chip"><Icon name="map-pin" size={13} /> {s.site}</span>
                  <span className="slot-chip"><Icon name="clock" size={13} /> {s.slot}</span>
                </div>
              </div>
            </div>
          )}

          {questions.length === 0 ? (
            <div className="empty-sm">Este caso aún no tiene criterios definidos.</div>
          ) : doneAt && !editing ? (
            /* finished view → reedit / reset (or locked) */
            <div style={{ textAlign: "center", padding: "36px 12px" }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <Icon name={locked ? "lock" : "check-circle-2"} size={30} style={{ color: "#16a34a" }} />
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Evaluación terminada</div>
              <div className="sub" style={{ maxWidth: 360, margin: "0 auto" }}>
                {locked
                  ? "El día de la evaluación ya terminó y esta evaluación quedó bloqueada."
                  : "Ya enviaste tu evaluación para este caso. Puedes reeditarla mientras siga abierto el día de la evaluación."}
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: "#16a34a", fontWeight: 700 }}>
                Enviado el {new Date(doneAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
              </div>
              {!locked && (
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
                  <button className="btn btn-pri" type="button" onClick={() => setEditing(true)}>
                    <Icon name="pencil" size={15} /> Reeditar
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={resetEval}>
                    <Icon name="rotate-ccw" size={15} /> Reiniciar
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="eval-progress" style={{ marginBottom: 14, position: "static", top: "auto", zIndex: "auto" }}>
                <div className="eval-progress-circle">
                  <svg className="ring-prog" viewBox="0 0 120 120" style={{ width: 84, height: 84 }}>
                    <circle className="ring-bg" cx="60" cy="60" r="54" />
                    <circle className="ring-fg" cx="60" cy="60" r="54" style={{ stroke: ringColor, strokeDasharray: circ, strokeDashoffset: circ - (circ * pct) / 100 }} />
                    <text className="ring-count" x="60" y="58">{answered}/{questions.length}</text>
                    <text className="ring-sub" x="60" y="74">Answered</text>
                  </svg>
                  <div><div style={{ fontWeight: 800 }}>{target.caseName}</div><div className="sub">{pct}% complete</div></div>
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
              </form>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
