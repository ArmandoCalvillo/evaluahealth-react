"use client";
import Icon from "@/components/Icon";
import type { Student, Evaluation, Location } from "@/lib/types";

const PANEL = 3; // default evaluators expected per case per student (before a panel forms)

// Normalize messy stored slot strings ("8:00:00 a.m." / "01:30:00 p. m.") → "8:00 AM"
function fmtSlot(raw: string): string {
  if (!raw || raw === "Unscheduled") return raw || "Unscheduled";
  const m = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?\s*\.?\s*m/i);
  if (!m) return raw.trim();
  const h = parseInt(m[1], 10);
  const mm = m[2];
  const ap = m[3].toLowerCase() === "p" ? "PM" : "AM";
  return `${h}:${mm} ${ap}`;
}

export interface SlotRow {
  key: string;
  site: string;        // site/location name
  slot: string;        // e.g. "10:00 AM"
  total: number;       // denominator = ALL students (no-shows included as incomplete)
  headcount: number;   // all students in this site + slot
  done: number;        // students fully evaluated
  progress: number;    // students started but not fully done
  notStarted: number;  // students with zero evaluations
  absent: number;      // students who did not appear (counted as incomplete in denominator)
  unfinished: number;  // total - done
  pct: number;         // done %
  pctProg: number;     // in-progress %
  pctNone: number;     // not-started %
  needsAttention: boolean;
}

export interface SiteSection {
  key: string;
  name: string;
  color: string;
  slots: SlotRow[];
}

/**
 * Build per-site → per-slot progress rows from in-scope students + finished evaluations.
 * A student is "fully evaluated" when they have (cases × PANEL) finished evaluations.
 * Sites and slots with the lowest completion bubble to the top (behind groups first).
 */
export function buildSiteRows(
  students: Student[],
  finishedEvals: Evaluation[],
  caseCount: number,
  locations: Location[],
  startedStudentIds?: Set<string>,
  /** required finished evals for a student (sum of per-case panel sizes). Falls back to caseCount × PANEL. */
  targetFor?: (studentId: string) => number,
  /** student "did not appear" — counted as incomplete (still in denominator). */
  absentFor?: (studentId: string) => boolean
): { sections: SiteSection[]; needAttention: number } {
  const defaultNeed = Math.max(caseCount, 1) * PANEL; // fallback when no targetFor given
  const need = (sid: string) => (targetFor ? targetFor(sid) : defaultNeed);
  const finishedByStudent = new Map<string, number>();
  finishedEvals.forEach((e) =>
    finishedByStudent.set(e.student_id, (finishedByStudent.get(e.student_id) || 0) + 1)
  );
  const started = startedStudentIds || new Set<string>();

  let needAttention = 0;

  const sections: SiteSection[] = locations
    .map((l) => {
      const mine = students.filter((s) => s.site === l.name);
      // group these students by slot
      const bySlot = new Map<string, Student[]>();
      mine.forEach((s) => {
        const slot = s.slot || "Unscheduled";
        if (!bySlot.has(slot)) bySlot.set(slot, []);
        bySlot.get(slot)!.push(s);
      });
      const slots: SlotRow[] = Array.from(bySlot.entries())
        .map(([slot, list]) => {
          let done = 0, progress = 0, notStarted = 0, absent = 0;
          list.forEach((s) => {
            if (absentFor && absentFor(s.id)) { absent++; return; } // no-show = incomplete (counts in denominator)
            const fin = finishedByStudent.get(s.id) || 0;
            const tgt = need(s.id);
            // A student can only be "done" when there is a real target (cases
            // exist) AND every expected evaluation is finished. With no cases
            // attached (future/unprepared assessment) target is 0 → never done.
            if (tgt > 0 && fin >= tgt) done++;
            else if (fin > 0 || started.has(s.id)) progress++;
            else notStarted++;
          });
          const total = list.length; // denominator = ALL students (no-shows included as incomplete)
          const unfinished = Math.max(total - done, 0);
          const pct = total ? Math.round((done / total) * 100) : 0;
          const pctProg = total ? Math.round((progress / total) * 100) : 0;
          const pctNone = total ? Math.max(0, 100 - pct - pctProg) : 0;
          const attn = total > 0 && pct < 50;
          if (attn) needAttention++;
          return { key: `${l.id}-${slot}`, site: l.name, slot, total, headcount: list.length, done, progress, notStarted, absent, unfinished, pct, pctProg, pctNone, needsAttention: attn };
        })
        .sort((a, b) => a.pct - b.pct); // behind groups first
      return { key: l.id, name: l.name, color: l.color, slots };
    })
    .filter((sec) => sec.slots.length > 0);

  return { sections, needAttention };
}

export default function SiteTracker({
  sections,
  onOpen,
}: {
  sections: SiteSection[];
  needAttention?: number;
  onOpen?: (siteName: string, slot: string) => void;
}) {
  if (sections.length === 0) return null;
  return (
    <div className="strk-wrap">
      {sections.map((sec) => (
        <div key={sec.key} className="strk-site">
          <div className="strk-sitehd">
            <span className="strk-dot" style={{ background: sec.color }} />
            <b>{sec.name}</b>
          </div>
          <div className="strk-list">
            {sec.slots.map((r) => (
              <div
                key={r.key}
                className={`strk-row${onOpen ? " strk-click" : ""}${r.needsAttention ? " strk-attn" : ""}`}
                onClick={onOpen ? () => onOpen(sec.name, r.slot) : undefined}
              >
                <div className="strk-rowlabel">
                  <div className="strk-slot">{fmtSlot(r.slot)} Group</div>
                  <div className="strk-students">{r.headcount} student{r.headcount !== 1 ? "s" : ""}</div>
                </div>
                <div className="strk-bar">
                  {r.pct > 0 && (
                    <div className="strk-seg" style={{ width: `${r.pct}%`, background: "#16a34a" }} />
                  )}
                  {r.pctProg > 0 && (
                    <div className="strk-seg" style={{ width: `${r.pctProg}%`, background: "#f59e0b" }} />
                  )}
                  {r.pctNone > 0 && (
                    <div className="strk-seg" style={{ width: `${r.pctNone}%`, background: "#cbd5e1" }} />
                  )}
                </div>
                <div className="strk-pills">
                  <span className="pill pill-green">{r.done} done</span>
                  {r.progress > 0 && <span className="pill pill-amber">{r.progress} in progress</span>}
                  {r.absent > 0 && <span className="pill pill-grey">{r.absent} did not appear</span>}
                  {r.needsAttention && (
                    <span className="pill pill-danger">Needs attention</span>
                  )}
                  {onOpen && <Icon name="chevron-right" size={16} className="strk-chev" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
