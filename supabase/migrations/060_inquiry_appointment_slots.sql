-- Migration 060: admin-managed, date-specific inquiry appointment slots.

create table if not exists public.inquiry_appointment_slots (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  slot_date date not null,
  starts_at time not null,
  ends_at time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint inquiry_appointment_slots_valid_time check (starts_at < ends_at),
  constraint inquiry_appointment_slots_unique unique (college_id, slot_date, starts_at, ends_at)
);

create index if not exists inquiry_appointment_slots_public_idx
  on public.inquiry_appointment_slots (college_id, slot_date, starts_at)
  where active;

alter table public.inquiry_appointment_slots enable row level security;

grant select (id, college_id, slot_date, starts_at, ends_at, active)
  on public.inquiry_appointment_slots to anon;
grant select, insert, update, delete
  on public.inquiry_appointment_slots to authenticated;

drop policy if exists inquiry_appointment_slots_public_read
  on public.inquiry_appointment_slots;
create policy inquiry_appointment_slots_public_read
  on public.inquiry_appointment_slots
  for select to anon
  using (active is true and slot_date >= current_date);

drop policy if exists inquiry_appointment_slots_staff_read
  on public.inquiry_appointment_slots;
create policy inquiry_appointment_slots_staff_read
  on public.inquiry_appointment_slots
  for select to authenticated
  using (
    public.has_permission('academics.manage')
    or (active is true and slot_date >= current_date)
  );

drop policy if exists inquiry_appointment_slots_manage
  on public.inquiry_appointment_slots;
create policy inquiry_appointment_slots_manage
  on public.inquiry_appointment_slots
  for all to authenticated
  using (public.has_permission('academics.manage'))
  with check (public.has_permission('academics.manage'));
