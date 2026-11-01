-- Migration 052: dynamic percentile management
alter table public.student_exam_marks
  add column if not exists percentile numeric,
  add column if not exists merit_score numeric,
  add column if not exists calculation_method text,
  add column if not exists percentile_source text check (percentile_source in ('manual','automatic','official')),
  add column if not exists manual_override_allowed boolean not null default false;

create table if not exists public.percentile_settings (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references public.board_masters (id) on delete cascade,
  exam_id uuid references public.exam_masters (id) on delete cascade,
  course_id uuid references public.courses (id) on delete cascade,
  manual_entry boolean not null default true,
  automatic_calculation boolean not null default false,
  official_published_entry boolean not null default true,
  enable_percentage boolean not null default true,
  enable_percentile boolean not null default true,
  calculation_method text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.percentile_settings enable row level security;
drop policy if exists percentile_settings_admin_manage on public.percentile_settings;
create policy percentile_settings_admin_manage on public.percentile_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists percentile_settings_read on public.percentile_settings;
create policy percentile_settings_read on public.percentile_settings
  for select to authenticated using (true);

grant select, insert, update, delete on public.percentile_settings to authenticated;
