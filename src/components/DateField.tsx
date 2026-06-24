"use client";
import { useRef } from "react";

interface DateFieldProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  min?: string;
  max?: string;
}

/**
 * Date input where clicking anywhere in the field opens the native calendar
 * (not just the calendar icon). Shows an inline error message right below the box.
 */
export default function DateField({ label, value, onChange, error, min, max }: DateFieldProps) {
  const ref = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = ref.current;
    if (!el) return;
    try {
      // showPicker() opens the native calendar popup
      (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      el.focus();
    }
  };

  return (
    <div className="field">
      {label && <label>{label}</label>}
      <input
        ref={ref}
        className={`input${error ? " input-error" : ""}`}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        onClick={openPicker}
        style={{ cursor: "pointer" }}
      />
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
