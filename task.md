# EvaluaHealth React/Next.js Migration — Build Tracker

## Stack
Next.js 15 App Router + TS + Tailwind (+ veritas.css design system kept verbatim) + Supabase + ApexCharts + lucide-react + xlsx.
Empty-state first (no seed data). Mobile responsive HIGH priority. All 12 screens in one pass.

## DONE
- [x] Scaffold Next.js, install deps
- [x] Copy assets/img + veritas.css (app.css)
- [x] globals.css + layout.tsx (Inter + JetBrains Mono)
- [x] supabase/schema.sql (tables + RLS + 3 storage buckets + handle_new_user)
- [x] lib/types.ts, lib/supabase.ts, lib/auth.tsx (AuthProvider+useGuard+PREVIEW_BYPASS), lib/db.ts, lib/upload.ts, lib/importSheet.ts
- [x] components/Icon.tsx, components/Toast.tsx

## TODO components
- [ ] charts (Gauge/Ring/Donut/Bars/Area/Stacked/HBars/HistBar/Radial) — ApexCharts animations:{enabled:false}
- [ ] Sidebar, Topbar (notif popover empty), Shell, Drawer, Modal, FileDrop, EmptyState

## TODO screens (12)
ADMIN: login(/), dashboard, students, evaluators, locations, cases, results, settings
EVALUATOR: dashboard, evaluate, submitted

## KEY DECISIONS
- Groups by Assessment Date (G-id internal only)
- Student fields: Nombre, QRTEXTO, Foto, ID Card, Sede, Slot
- Cases = Batches(date) -> Cases -> Questions(rubric 4-niveles | yesno), ordered
- Reports: NO scores, panel of 3 doctors + timestamps
- Evaluator edits only newest assessment; older locked
- Evaluators NOT assigned students — search & evaluate, site-scoped
- Sites colors: Mexico City #2563EB / Guadalajara #7c3aed / Monterrey #0d9488
- Evaluate: case dropdown first, form+ring hidden until case picked, infinite scroll no pagination
- Login: split-screen .auth, role auto-detect by email contains 'admin'
- Demo: admin@evaluahealth.mx / maria@evaluahealth.mx (Guadalajara), pwd evaluahealth
- Right slide-over drawers for popups; confirm modal destructive only

## ENV
- NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (ask_secrets later)
- NEXT_PUBLIC_PREVIEW_BYPASS=1 for offline preview
- Dev: tmux 'evhreact' npm run dev -- -p 5273

## STATUS: COMPLETE
All 12 screens built + production build clean (14 routes, TS clean). Dev server tmux 'evhreact' port 5273 LIVE.
Screenshot-verified: login, admin dashboard/students/cases (+drawer slide-over), evaluator dashboard.
Fixes applied: veritas.css auth-side.png -> /assets/img; added Viewport export to layout (mobile meta);
useToast returns fn directly (not {toast}); yn selected class is .on not .sel; bypass demo sets name+site from email.
README written. Offline preview works via NEXT_PUBLIC_PREVIEW_BYPASS=1.
NOTE: mb --width screenshot shows desktop sidebar at 390 because mb keeps innerWidth=1024 (screenshot artifact, not a bug — viewport meta now set + media queries identical to verified prototype).
REMAINING: zip delivery.
