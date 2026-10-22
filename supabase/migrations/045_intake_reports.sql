-- Migration 045: Intake report table (Excel report columns)
-- Idempotent and safe to re-run.

create table if not exists public.intake_reports (
  id uuid primary key default gen_random_uuid(),
  sr_no integer,
  branch text,
  intake integer not null default 0,
  acpc integer not null default 0,
  mq integer not null default 0,
  nri integer not null default 0,
  total integer not null default 0,
  tfws integer not null default 0,
  filled_acpc integer not null default 0,
  filled_mq integer not null default 0,
  filled_nri integer not null default 0,
  filled_total integer not null default 0,
  vacant_acpc integer not null default 0,
  vacant_mq integer not null default 0,
  vacant_nri integer not null default 0,
  total_vacant integer not null default 0,
  p_q integer not null default 0,
  cancel_tfws integer not null default 0,
  cancel_acpc integer not null default 0,
  cancel_mq integer not null default 0,
  cancel_nri integer not null default 0,
  cancel_tfws2 integer not null default 0,
  r_t_v integer not null default 0,
  college_name text,
  course_name text,
  academic_year text,
  created_at timestamptz not null default now()
);

alter table public.intake_reports enable row level security;

drop policy if exists intake_reports_admin_all on public.intake_reports;
create policy intake_reports_admin_all on public.intake_reports
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists intake_reports_read on public.intake_reports;
create policy intake_reports_read on public.intake_reports
  for select to authenticated
  using (true);

grant select, insert, update, delete on public.intake_reports to authenticated;
