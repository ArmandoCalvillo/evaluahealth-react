export type Role = "admin" | "evaluator";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  site: string | null;
  photo_url: string | null;
  phone: string | null;
  active?: boolean;
  created_at: string;
}

export interface Location {
  id: string;
  name: string;
  code: string;
  color: string;
  created_at: string;
}

export interface Group {
  id: string;
  assessment_date: string;
  description: string;
  created_at: string;
}

export interface Batch {
  id: string;
  name: string;
  assessment_date: string;
  created_at: string;
}

export interface CaseRow {
  id: string;
  batch_id: string | null;
  name: string;
  description: string;
  position: number;
  created_at: string;
}

export type QuestionType = "rubric" | "yesno";

export interface RubricOption {
  level: string; // Insuficiente / Aceptable / Competente / Sobresaliente
  title: string;
  desc: string;
}

export interface Question {
  id: string;
  case_id: string | null;
  title: string;
  type: QuestionType;
  options: RubricOption[];
  position: number;
  created_at: string;
}

export interface Student {
  id: string;
  group_id: string | null;
  name: string;
  qrtexto: string;
  photo_url: string | null;
  idcard_url: string | null;
  site: string | null;
  slot: string | null;
  created_at: string;
}

export interface Evaluation {
  id: string;
  student_id: string;
  case_id: string;
  evaluator_id: string | null;
  evaluator_name: string;
  answers: { question_id: string; value: string }[];
  status: "started" | "finished";
  started_at: string;
  submitted_at: string | null;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

// Default rubric levels (Spanish)
export const RUBRIC_LEVELS: RubricOption[] = [
  { level: "Insuficiente", title: "Insuficiente", desc: "No cumple con los criterios mínimos esperados." },
  { level: "Aceptable", title: "Aceptable", desc: "Cumple parcialmente con los criterios esperados." },
  { level: "Competente", title: "Competente", desc: "Cumple satisfactoriamente con los criterios esperados." },
  { level: "Sobresaliente", title: "Sobresaliente", desc: "Supera ampliamente los criterios esperados." },
];
