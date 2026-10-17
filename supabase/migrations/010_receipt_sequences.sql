create table if not exists public.receipt_sequences (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges (id),
  academic_year text not null,
  payment_type text not null,
  course_id uuid references public.courses (id),
  admission_type text not null,
  prefix text not null,
  current_sequence integer not null default 0 check (current_sequence >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists receipt_sequences_configuration_unique
  on public.receipt_sequences (
    college_id,
    academic_year,
    lower(payment_type),
    (coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    lower(admission_type)
  );

create index if not exists receipt_sequences_college_year_idx
  on public.receipt_sequences (college_id, academic_year);

alter table public.receipt_sequences enable row level security;

drop policy if exists admin_all on public.receipt_sequences;
create policy admin_all on public.receipt_sequences
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.set_receipt_sequence_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists receipt_sequences_updated_at on public.receipt_sequences;
create trigger receipt_sequences_updated_at
before update on public.receipt_sequences
for each row
execute function public.set_receipt_sequence_updated_at();
