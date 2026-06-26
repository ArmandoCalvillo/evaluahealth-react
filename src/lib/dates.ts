// Shared date helpers + edit-lock policy.

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDate(s: string): string {
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// Evaluations can be edited / re-evaluated only within this many days of submission.
export const EDIT_WINDOW_DAYS = 2;

// Returns true when a finished evaluation is past the edit window and must stay locked.
export function isEditLocked(submittedAt: string | null | undefined): boolean {
  if (!submittedAt) return false; // never submitted → still editable (draft)
  const submitted = new Date(submittedAt).getTime();
  if (Number.isNaN(submitted)) return false;
  const ageMs = Date.now() - submitted;
  return ageMs > EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

// Returns true when an assessment date is in the past (the day is over) and its
// submitted evaluations must stay locked. Today and future dates remain editable.
export function isDateLocked(assessmentDate: string | null | undefined): boolean {
  if (!assessmentDate) return false;
  return assessmentDate.slice(0, 10) < todayStr();
}
