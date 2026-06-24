-- ============================================================
-- EvaluaHealth Experts — Supabase schema
-- Run this in the Supabase SQL editor for your project.
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES  (extends auth.users)
-- role: 'admin' | 'evaluator'
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text not null default '',
  role        text not null default 'evaluator' check (role in ('admin','evaluator')),
  site        text,                       -- evaluator site scope (location code)
  photo_url   text,
  phone       text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- LOCATIONS (sites)
-- ============================================================
create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null unique,        -- MEX-01, GDL-01, MTY-01
  color      text not null default '#2563EB',
  created_at timestamptz not null default now()
);

-- ============================================================
-- GROUPS  (identified by assessment_date)
-- ============================================================
create table if not exists public.groups (
  id              uuid primary key default gen_random_uuid(),
  assessment_date date not null,
  description     text default '',
  created_at      timestamptz not null default now()
);

-- ============================================================
-- BATCHES  (Cases page top-level, identified by assessment_date)
-- ============================================================
create table if not exists public.batches (
  id              uuid primary key default gen_random_uuid(),
  name            text not null default '',
  assessment_date date not null,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- CASES  (belong to a batch)
-- ============================================================
create table if not exists public.cases (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid references public.batches(id) on delete cascade,
  name        text not null,
  description text default '',
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- QUESTIONS  (belong to a case, ordered)
-- type: 'rubric' (4 niveles) | 'yesno'
-- options jsonb: for rubric -> [{level,title,desc}]
-- ============================================================
create table if not exists public.questions (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid references public.cases(id) on delete cascade,
  title      text not null,
  type       text not null default 'rubric' check (type in ('rubric','yesno')),
  options    jsonb default '[]'::jsonb,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- STUDENTS
-- ============================================================
create table if not exists public.students (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid references public.groups(id) on delete set null,
  name         text not null,
  qrtexto      text not null default '',   -- the ID number
  photo_url    text,
  idcard_url   text,
  site         text,                       -- location code
  slot         text,                       -- time slot e.g. 10:00 AM
  created_at   timestamptz not null default now()
);

-- ============================================================
-- EVALUATIONS  (one evaluator submission for one student+case)
-- answers jsonb: [{question_id, value}]
-- ============================================================
create table if not exists public.evaluations (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid references public.students(id) on delete cascade,
  case_id       uuid references public.cases(id) on delete cascade,
  evaluator_id  uuid references public.profiles(id) on delete set null,
  evaluator_name text default '',
  answers       jsonb default '[]'::jsonb,
  status        text not null default 'submitted',  -- 'in_progress' | 'submitted'
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz
);
-- migrate existing installs
alter table public.evaluations add column if not exists status text not null default 'submitted';
alter table public.evaluations add column if not exists started_at timestamptz not null default now();
alter table public.evaluations alter column submitted_at drop not null;

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete cascade,
  title      text not null,
  body       text default '',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- handle_new_user trigger -> auto-create profile
-- role auto-detected from email containing 'admin'
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    new.email,
    case when position('admin' in lower(new.email)) > 0 then 'admin' else 'evaluator' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.locations     enable row level security;
alter table public.groups        enable row level security;
alter table public.batches       enable row level security;
alter table public.cases         enable row level security;
alter table public.questions     enable row level security;
alter table public.students      enable row level security;
alter table public.evaluations   enable row level security;
alter table public.notifications enable row level security;

-- helper: is admin
create or replace function public.is_admin()
returns boolean as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$ language sql security definer stable;

-- profiles: read own + admins read all; update own
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles admin insert" on public.profiles;
create policy "profiles admin insert" on public.profiles
  for insert with check (id = auth.uid() or public.is_admin());

-- shared read for all authenticated; write for admins
-- locations
drop policy if exists "loc read"  on public.locations;
create policy "loc read"  on public.locations  for select using (auth.role() = 'authenticated');
drop policy if exists "loc write" on public.locations;
create policy "loc write" on public.locations  for all using (public.is_admin()) with check (public.is_admin());

-- groups
drop policy if exists "grp read"  on public.groups;
create policy "grp read"  on public.groups  for select using (auth.role() = 'authenticated');
drop policy if exists "grp write" on public.groups;
create policy "grp write" on public.groups  for all using (public.is_admin()) with check (public.is_admin());

-- batches
drop policy if exists "bat read"  on public.batches;
create policy "bat read"  on public.batches  for select using (auth.role() = 'authenticated');
drop policy if exists "bat write" on public.batches;
create policy "bat write" on public.batches  for all using (public.is_admin()) with check (public.is_admin());

-- cases
drop policy if exists "cas read"  on public.cases;
create policy "cas read"  on public.cases  for select using (auth.role() = 'authenticated');
drop policy if exists "cas write" on public.cases;
create policy "cas write" on public.cases  for all using (public.is_admin()) with check (public.is_admin());

-- questions
drop policy if exists "que read"  on public.questions;
create policy "que read"  on public.questions  for select using (auth.role() = 'authenticated');
drop policy if exists "que write" on public.questions;
create policy "que write" on public.questions  for all using (public.is_admin()) with check (public.is_admin());

-- students
drop policy if exists "stu read"  on public.students;
create policy "stu read"  on public.students  for select using (auth.role() = 'authenticated');
drop policy if exists "stu write" on public.students;
create policy "stu write" on public.students  for all using (public.is_admin()) with check (public.is_admin());

-- evaluations: authenticated read; evaluators insert own; admins all
drop policy if exists "eval read" on public.evaluations;
create policy "eval read" on public.evaluations for select using (auth.role() = 'authenticated');
drop policy if exists "eval insert" on public.evaluations;
create policy "eval insert" on public.evaluations for insert
  with check (evaluator_id = auth.uid() or public.is_admin());
drop policy if exists "eval update" on public.evaluations;
create policy "eval update" on public.evaluations for update
  using (evaluator_id = auth.uid() or public.is_admin());
drop policy if exists "eval delete" on public.evaluations;
create policy "eval delete" on public.evaluations for delete
  using (evaluator_id = auth.uid() or public.is_admin());

-- notifications: own only
drop policy if exists "notif own" on public.notifications;
create policy "notif own" on public.notifications for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('student-photos','student-photos', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('student-idcards','student-idcards', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('evaluator-photos','evaluator-photos', true) on conflict (id) do nothing;

-- storage policies: public read, authenticated write
drop policy if exists "storage read" on storage.objects;
create policy "storage read" on storage.objects for select using (true);
drop policy if exists "storage write" on storage.objects;
create policy "storage write" on storage.objects for insert
  with check (auth.role() = 'authenticated');
drop policy if exists "storage update" on storage.objects;
create policy "storage update" on storage.objects for update
  using (auth.role() = 'authenticated');
drop policy if exists "storage delete" on storage.objects;
create policy "storage delete" on storage.objects for delete
  using (auth.role() = 'authenticated');
