"use client";
import { useState, useEffect, useRef } from "react";
import Icon from "./Icon";
import { useAuth } from "@/lib/auth";
import { listNotifications } from "@/lib/db";
import type { NotificationRow } from "@/lib/types";
import { SUPABASE_READY } from "@/lib/supabase";

function initials(name: string, email: string) {
  const base = (name || email || "U").trim();
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || "U") + (parts[1]?.[0] || "")).toUpperCase();
}

export default function Topbar({ title, sub, onHamburger }: { title: string; sub?: string; onHamburger: () => void }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationRow[]>([]);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile || !SUPABASE_READY) return;
    listNotifications(profile.id).then((d) => setNotifs(d as NotificationRow[])).catch(() => {});
  }, [profile]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const role = profile?.role === "admin" ? "Administrator" : "Evaluator";
  const name = profile?.full_name || profile?.email?.split("@")[0] || "User";

  return (
    <header className="topbar">
      <button className="hamburger" onClick={onHamburger}><Icon name="menu" size={20} /></button>
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="topbar-spacer" />
      <div style={{ position: "relative" }} ref={popRef}>
        <button className="icon-btn" onClick={() => setOpen((o) => !o)}>
          <Icon name="bell" size={18} />
          {notifs.some((n) => !n.read) && <span className="dot" />}
        </button>
        <div className={`notif-pop ${open ? "open" : ""}`}>
          <div className="notif-head">
            <h4>Notifications</h4>
            {notifs.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setNotifs([])}>Clear all</button>}
          </div>
          <div className="notif-list">
            {notifs.length === 0 ? (
              <div className="notif-empty">
                <Icon name="bell-off" size={30} />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifs.map((n) => (
                <div className="notif-item" key={n.id}>
                  <div className="ic tint-blue"><Icon name="info" size={17} /></div>
                  <div><div className="tx">{n.title}</div><div className="tm">{n.body}</div></div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <div className="userchip">
        {profile?.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.photo_url} alt="" />
        ) : (
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--brand-soft)", color: "var(--brand)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>
            {initials(profile?.full_name || "", profile?.email || "")}
          </span>
        )}
        <div><div className="nm">{name}</div><div className="rl">{role}</div></div>
      </div>
    </header>
  );
}
