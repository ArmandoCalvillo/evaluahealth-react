"use client";
import { useRef, useState, useEffect } from "react";
import Icon from "./Icon";
import { uploadFile, type Bucket } from "@/lib/upload";
import { SUPABASE_READY } from "@/lib/supabase";

/** Drag&drop + click image uploader with preview. Returns public URL via onChange. */
export default function FileDrop({
  bucket, value, onChange, label = "Upload photo", shape = "square", doc = false,
}: {
  bucket: Bucket; value?: string | null; onChange: (url: string) => void;
  label?: string; shape?: "square" | "circle"; doc?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);
  const [drag, setDrag] = useState(false);

  // Re-sync preview when the controlled value changes (e.g. opening the
  // drawer to edit a different record, or clearing the form).
  useEffect(() => { setPreview(value || null); }, [value]);

  async function handle(file: File) {
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    if (!SUPABASE_READY) { onChange(localUrl); return; }
    setBusy(true);
    try {
      const url = await uploadFile(bucket, file);
      setPreview(url);
      onChange(url);
    } catch {
      onChange(localUrl);
    } finally { setBusy(false); }
  }

  const radius = shape === "circle" ? "50%" : 18;

  return (
    <div className="photo-pick">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) handle(f); }}
        className={`ph ${doc && !preview ? "ph-doc" : ""}`}
        style={{
          width: 74, height: 74, borderRadius: radius, cursor: "pointer", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: drag ? "2px dashed var(--brand)" : undefined,
          backgroundImage: preview ? `url(${preview})` : undefined,
          backgroundSize: "cover", backgroundPosition: "center",
        }}
      >
        {!preview && <Icon name={busy ? "loader" : doc ? "credit-card" : "image-plus"} size={26} />}
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>{label}</div>
        <div className="hint" style={{ marginTop: 0 }}>
          {busy ? "Uploading…" : "Drag & drop or click to browse"}
        </div>
        {preview && (
          <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 8 }}
            onClick={(e) => { e.stopPropagation(); setPreview(null); onChange(""); }}>
            <Icon name="x" size={13} /> Remove
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
    </div>
  );
}
