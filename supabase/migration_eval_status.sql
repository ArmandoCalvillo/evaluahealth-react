-- Evaluation lifecycle: 3 states
--   not_started = NO row exists (nobody opened it)
--   started     = row exists, evaluator opened + answered >=1 criterio (draft saved)
--   finished    = row submitted
-- Stored status values: 'started' | 'finished'

alter table public.evaluations
  add column if not exists status text not null default 'finished';   -- 'started' | 'finished'
alter table public.evaluations
  add column if not exists started_at timestamptz not null default now();
alter table public.evaluations
  alter column submitted_at drop not null;

-- Migrate any legacy values to the new naming
update public.evaluations set status = 'started'  where status = 'in_progress';
update public.evaluations set status = 'finished' where status = 'submitted';

-- Refresh PostgREST schema cache
notify pgrst, 'reload schema';
