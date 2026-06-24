"use client";
import { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useGuard } from "@/lib/auth";
import type { Role } from "@/lib/types";

export default function Shell({
  portal, title, sub, children,
}: { portal: Role; title: string; sub?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { profile, loading } = useGuard(portal);

  if (loading || !profile) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8a93a6" }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar portal={portal} open={open} onClose={() => setOpen(false)} />
      <div className="main">
        <Topbar title={title} sub={sub} onHamburger={() => setOpen(true)} />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
