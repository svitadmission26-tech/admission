-- Migration 044: Lateral entry intake table
-- Idempotent and safe to re-run.

create table if not exists public.lateral_entry_intakes (
  id uuid primary key default gen_random_uuid(),
  sr_no integer,
  college_name text,
  course_name text,
  branch_name text,
  intake integer not null default 0 check (intake >= 0),
  acpc integer not null default 0 check (acpc >= 0),
  mq integer not null default 0 check (mq >= 0),
  nri integer not null default 0 check (nri >= 0),
  vacant integer not null default 0 check (vacant >= 0),
  tfws integer not null default 0 check (tfws >= 0),
  academic_year text,
  created_at timestamptz not null default now()
);

alter table public.lateral_entry_intakes enable row level security;

drop policy if exists lateral_entry_intakes_admin_all on public.lateral_entry_intakes;
create policy lateral_entry_intakes_admin_all on public.lateral_entry_intakes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists lateral_entry_intakes_read on public.lateral_entry_intakes;
create policy lateral_entry_intakes_read on public.lateral_entry_intakes
  for select to authenticated
  using (true);

grant select, insert, update, delete on public.lateral_entry_intakes to authenticated;
