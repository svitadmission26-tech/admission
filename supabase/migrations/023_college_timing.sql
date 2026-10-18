-- College-wise, shift-wise timing. Apply after 001-022.
create table if not exists public.college_timings (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null references public.colleges(id) on delete cascade,
 department text not null default '',
 shift_name text not null default 'General',
 day_of_week integer not null check(day_of_week between 0 and 6),
 opens_at time not null,
 closes_at time not null,
 period_minutes integer not null default 60 check(period_minutes between 15 and 240),
 break_start time,
 break_end time,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(college_id, department, shift_name, day_of_week),
 constraint valid_hours check (opens_at < closes_at),
 constraint valid_break check ((break_start is null and break_end is null) or (break_start is not null and break_end is not null and opens_at <= break_start and break_start < break_end and break_end <= closes_at))
);
create index if not exists college_timings_college_idx on public.college_timings(college_id);
alter table public.college_timings enable row level security;
drop policy if exists college_timings_read on public.college_timings;
create policy college_timings_read on public.college_timings for select to authenticated using (public.has_permission('academics.read') or public.has_permission('academics.manage'));
drop policy if exists college_timings_manage on public.college_timings;
create policy college_timings_manage on public.college_timings for all to authenticated using (public.has_permission('academics.manage')) with check (public.has_permission('academics.manage'));
