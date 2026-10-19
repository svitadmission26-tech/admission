-- Add designations table for managing faculty designations
-- Used as dynamic reference for faculty records in College Information tab
-- Only "name" is required; code and college_id were removed as unnecessary.

create table if not exists public.designations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 1),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Remove the earlier code / college_id columns if they were already applied
alter table public.designations drop column if exists code;
alter table public.designations drop column if exists college_id;

alter table public.designations enable row level security;

drop policy if exists designations_read on public.designations;
create policy designations_read on public.designations
for select to authenticated
using (
  public.has_permission('academics.read')
  or public.has_permission('academics.manage')
);

drop policy if exists designations_manage on public.designations;
create policy designations_manage on public.designations
for all to authenticated
using (
  public.has_permission('academics.manage')
)
with check (
  public.has_permission('academics.manage')
);

grant select on public.designations to anon;
grant all on public.designations to authenticated;

-- Seed the default designation list once (idempotent - safe to re-run)
insert into public.designations (name, active)
select d.name, true
from (values
    ('Professor'),
    ('Associate Professor'),
    ('Assistant Professor'),
    ('Lecturer')
) as d(name)
where not exists (
  select 1 from public.designations existing where existing.name = d.name
);