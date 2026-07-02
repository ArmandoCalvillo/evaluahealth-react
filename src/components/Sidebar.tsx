"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

const ADMIN_NAV = [
  { section: "Overview" },
  { href: "/admin/dashboard", icon: "layout-dashboard", label: "Dashboard" },
  { section: "Management" },
  { href: "/admin/students", icon: "graduation-cap", label: "Students" },
  { href: "/admin/evaluators", icon: "stethoscope", label: "Evaluators" },
  { href: "/admin/locations", icon: "map-pin", label: "Locations" },
  { href: "/admin/cases", icon: "layers", label: "Cases" },
  { section: "Insights" },
  { href: "/admin/results", icon: "chart-column", label: "Reports" },
  { href: "/admin/settings", icon: "settings", label: "Settings" },
];

const EVAL_NAV = [
  { section: "Workspace" },
  { href: "/evaluator/evaluate", icon: "clipboard-list", label: "Evaluate" },
  { href: "/evaluator/submitted", icon: "history", label: "Activity" },
];

export default function Sidebar({ portal, open, onClose }: { portal: "admin" | "evaluator"; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const router = useRouter();
  const nav = portal === "admin" ? ADMIN_NAV : EVAL_NAV;

  async function logout() {
    await signOut();
    router.replace("/");
  }

  return (
    <>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <Image src="/assets/img/logo-icon.png" alt="EvaluaHealth" width={120} height={88} style={{ height: 88, width: "auto" }} priority />
        </div>
        <nav className="side-nav">
          {nav.map((item, i) =>
            "section" in item ? (
              <div className="side-section" key={i}>{item.section}</div>
            ) : (
              <Link
                key={item.href}
                href={item.href!}
                onClick={onClose}
                className={`nav-item ${pathname === item.href ? "active" : ""}`}
              >
                <Icon name={item.icon!} size={18} /> {item.label}
              </Link>
            )
          )}
        </nav>
        <div className="side-foot">
          <a className="nav-item" onClick={logout} style={{ cursor: "pointer" }}>
            <Icon name="log-out" size={18} /> Logout
          </a>
        </div>
      </aside>
      <div className={`overlay ${open ? "open" : ""}`} onClick={onClose} />
    </>
  );
}
