# EvaluaHealth Experts — Clinical Evaluation Platform

A dynamic **Next.js 15 + TypeScript + Supabase** rebuild of the EvaluaHealth prototype.
Pixel-identical to the approved HTML design system (`veritas.css`), now backed by real auth, database, storage, and in-browser spreadsheet import.

## Stack
- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Supabase** — auth, Postgres database, storage (photo + ID-card uploads)
- **ApexCharts** (`react-apexcharts`) — dashboards
- **lucide-react** — icons
- **xlsx** — in-browser import of `.xlsx / .xls / .csv`
- Design system: `src/app/veritas.css` (verbatim from the approved prototype) + Tailwind utilities

## Screens (12)
**Admin (8):** Login · Dashboard · Students · Evaluators · Locations · Cases · Reports · Settings
**Evaluator (4):** Login (shared) · Dashboard · Evaluate · Submitted

## Key data rules (built in)
- **Groups** are identified by **Assessment Date** only (internal G-id for routing).
- **Student fields:** Nombre, QRTEXTO, Foto, ID Card, Sede, Slot.
- **Cases** = Batches (by date) → Cases → Questions (`rubric` 4-niveles or `yesno`), ordered.
- **Reports** show a panel of evaluators + submission timestamps — **no scores**.
- **Evaluators** search & evaluate (not assigned students); they can edit only the **newest** assessment date, older dates are locked.
- **Evaluate** page: pick a case first; the rubric form + progress ring stay hidden until a case is chosen; infinite scroll, no pagination.
- Sites: Mexico City `#2563EB` · Guadalajara `#7c3aed` · Monterrey `#0d9488`.
- Starts **empty** — empty states sit in the exact placeholder positions (no dummy data).

---

## Run locally

```bash
npm install
npm run dev   # http://localhost:5273  (port set in the dev tmux command)
```

### Offline preview (no backend)
`.env.local` ships with `NEXT_PUBLIC_PREVIEW_BYPASS=1`, so the full UI renders with **no Supabase required** — the preview always opens.
- Sign in with an email containing **admin** → admin portal.
- Sign in with any other email → evaluator portal.

### Connect real Supabase
1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor (tables + RLS + 3 storage buckets + `handle_new_user` trigger).
3. Put your keys in `.env.local` and flip the bypass off:
   ```
   NEXT_PUBLIC_PREVIEW_BYPASS=0
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
4. Create users in Supabase Auth; set their `profiles.role` to `admin` or `evaluator` (+ `site` for evaluators).

Storage buckets: `student-photos`, `student-idcards`, `evaluator-photos`.

## Project structure
```
src/
  app/                # routes (App Router)
    page.tsx          # shared login (role-based routing)
    admin/*           # 7 admin pages
    evaluator/*       # 3 evaluator pages
    veritas.css       # design system (verbatim from prototype)
  components/          # Shell, Sidebar, Topbar, Drawer, Modal, FileDrop, Toast, EmptyState, charts, Icon
  lib/                # supabase, auth (AuthProvider + useGuard), db, upload, importSheet, types
supabase/schema.sql   # full schema + RLS + storage + trigger
```

## Build
```bash
npm run build   # all 14 routes compile, TypeScript clean
```
