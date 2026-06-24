"use client";
import Icon from "./Icon";

export default function Drawer({
  open, onClose, title, sub, wide, footer, children,
}: {
  open: boolean; onClose: () => void; title: string; sub?: string;
  wide?: boolean; footer?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <>
      <div className={`drawer-scrim ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`drawer ${wide ? "drawer-wide" : ""} ${open ? "open" : ""}`}>
        <div className="drawer-head">
          <div>
            <h3>{title}</h3>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </>
  );
}
