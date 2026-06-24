"use client";
import Icon from "./Icon";

export default function Modal({
  open, onClose, title, message, confirmLabel = "Confirm", danger, onConfirm,
}: {
  open: boolean; onClose: () => void; title: string; message: string;
  confirmLabel?: string; danger?: boolean; onConfirm: () => void;
}) {
  return (
    <div className={`modal-backdrop ${open ? "open" : ""}`} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-pad">
          <div className={`ic-big ${danger ? "tint-rose" : "tint-blue"}`}>
            <Icon name={danger ? "trash-2" : "help-circle"} size={24} />
          </div>
          <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800 }}>{title}</h3>
          <p style={{ margin: "0 0 22px", color: "var(--muted)" }}>{message}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className={`btn ${danger ? "btn-danger" : "btn-pri"}`} onClick={() => { onConfirm(); onClose(); }}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
