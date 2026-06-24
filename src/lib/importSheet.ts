"use client";
import * as XLSX from "xlsx";

export interface ImportedStudent {
  name: string;
  qrtexto: string;
  site: string;
  slot: string;
  photo_url: string;   // CSV provides a path / url for the photo
  idcard_url: string;
}

const KEY_MAP: Record<string, keyof ImportedStudent> = {
  nombre: "name", name: "name",
  qrtexto: "qrtexto", qr: "qrtexto", folio: "qrtexto",
  sede: "site", site: "site", location: "site",
  slot: "slot", grupo: "slot", hora: "slot",
  foto: "photo_url", photo: "photo_url", photo_url: "photo_url", "foto_url": "photo_url",
  identificacion: "idcard_url", "identificación": "idcard_url",
  "id card": "idcard_url", idcard: "idcard_url", id_card: "idcard_url", "id_card_url": "idcard_url", credencial: "idcard_url",
};

/** Headers for the downloadable empty template (matches the client export format). */
export const TEMPLATE_HEADERS = ["NOMBRE", "QRTEXTO", "IDENTIFICACION", "FOTO", "Sede", "GRUPO"];

/** Parse an xlsx/xls/csv File into an array of student rows. */
export async function parseStudentSheet(file: File): Promise<ImportedStudent[]> {
  const buf = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  const wb = isCsv
    ? XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string" })
    : XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return json.map((raw) => {
    const out: ImportedStudent = { name: "", qrtexto: "", site: "", slot: "", photo_url: "", idcard_url: "" };
    for (const k of Object.keys(raw)) {
      const norm = k.trim().toLowerCase();
      const mapped = KEY_MAP[norm];
      if (mapped) out[mapped] = String(raw[k] ?? "").trim();
    }
    return out;
  }).filter((r) => r.name || r.qrtexto);
}

/** Trigger a download of an empty CSV template with the expected headers + one example row. */
export function downloadStudentTemplate() {
  const example = [
    "Alexia Gonzalez Guerrero",
    "A911228",
    "https://example.com/idcard.jpg",
    "https://example.com/photo.jpg",
    "MTY",
    "8:00:00 a.m.",
  ];
  const csv = [TEMPLATE_HEADERS.join(","), example.map((c) => `"${c}"`).join(",")].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_sustentantes.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
   CASE IMPORT — rubric criterios from a CSV/XLSX
   Expected columns (case-insensitive, accents optional):
   Clave | CRITERIO | INSUFICIENTE | ACEPTABLE | COMPETENTE | SOBRESALIENTE
   Each row = one rubric criterio with its 4 level descriptions.
   ============================================================ */
export interface ImportedCriterio {
  clave: string;                       // e.g. "MATER - 01" (display only)
  title: string;                       // the CRITERIO text
  levels: Record<string, string>;      // Insuficiente/Aceptable/Competente/Sobresaliente -> desc
}

const CASE_KEY_MAP: Record<string, keyof ImportedCriterio | "lvl_ins" | "lvl_acep" | "lvl_comp" | "lvl_sobr"> = {
  clave: "clave", key: "clave", codigo: "clave", "código": "clave",
  criterio: "title", criterion: "title", titulo: "title", "título": "title", descripcion: "title", "descripción": "title",
  insuficiente: "lvl_ins",
  aceptable: "lvl_acep",
  competente: "lvl_comp",
  sobresaliente: "lvl_sobr",
};

/** Parse a case CSV/XLSX into rubric criterios. */
export async function parseCaseSheet(file: File): Promise<ImportedCriterio[]> {
  const buf = await file.arrayBuffer();
  // CSV files are UTF-8 text — decode explicitly so accents (á, í, ó, ñ) survive.
  // XLSX/XLS are binary and must be read as an array.
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  const wb = isCsv
    ? XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string" })
    : XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return json.map((raw) => {
    const out: ImportedCriterio = { clave: "", title: "", levels: {} };
    for (const k of Object.keys(raw)) {
      const norm = k.trim().toLowerCase();
      const mapped = CASE_KEY_MAP[norm];
      const val = String(raw[k] ?? "").trim();
      if (mapped === "clave") out.clave = val;
      else if (mapped === "title") out.title = val;
      else if (mapped === "lvl_ins") out.levels["Insuficiente"] = val;
      else if (mapped === "lvl_acep") out.levels["Aceptable"] = val;
      else if (mapped === "lvl_comp") out.levels["Competente"] = val;
      else if (mapped === "lvl_sobr") out.levels["Sobresaliente"] = val;
    }
    return out;
  }).filter((r) => r.title);
}

export const CASE_TEMPLATE_HEADERS = ["Clave", "CRITERIO", "INSUFICIENTE", "ACEPTABLE", "COMPETENTE", "SOBRESALIENTE"];

/** Download an empty case-import template with the expected headers + one example criterio. */
export function downloadCaseTemplate() {
  const example = [
    "MATER - 01",
    "Activación oportuna del Código Mater y conducción del Equipo de Respuesta Inmediata Obstétrica (ERIO)",
    "No activa el código.",
    "Activa tardíamente (>5 min) o sin coordinar.",
    "Activa en los primeros 4 min y coordina ERIO.",
    "Coordinación ejemplar con briefing, asignación de roles y comunicación cerrada inmediata.",
  ];
  const csv = [
    CASE_TEMPLATE_HEADERS.join(","),
    example.map((c) => `"${c.replace(/"/g, '""')}"`).join(","),
  ].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_caso.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
