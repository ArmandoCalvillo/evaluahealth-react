"use client";
import Icon from "./Icon";

export default function EmptyState({
  icon = "inbox", title, text, action,
}: { icon?: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={40} />
      <h4>{title}</h4>
      {text && <p style={{ margin: 0, fontSize: 13.5, maxWidth: 360 }}>{text}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
