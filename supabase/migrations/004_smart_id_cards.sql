create table if not exists public.id_cards (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications (id),
  card_number text not null unique default (
    'SVIT-ID-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ),
  student_name text not null,
  enrollment_number text not null unique,
  course_name text not null,
  branch_name text not null,
  academic_year text not null,
  photo_path text,
  issued_on date not null default current_date,
  expires_on date not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  issued_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (expires_on >= issued_on),
  check (length(trim(student_name)) > 1)
);

create table if not exists public.id_card_events (
  id bigint generated always as identity primary key,
  card_id uuid not null references public.id_cards (id),
  actor_id uuid references public.profiles (id),
  event_type text not null check (event_type in ('issued', 'reprinted', 'revoked')),
  created_at timestamptz not null default now()
);

create index if not exists id_cards_application_id_idx on public.id_cards (application_id);

alter table public.id_cards enable row level security;
alter table public.id_card_events enable row level security;

drop policy if exists id_cards_authorized_read on public.id_cards;

create policy id_cards_authorized_read on public.id_cards
for select to authenticated
using (
  public.has_permission('id_cards.manage')
  or exists (
    select 1
    from public.applications a
    where a.id = application_id
      and a.student_id = auth.uid()
  )
);

drop policy if exists id_card_events_authorized_read on public.id_card_events;

create policy id_card_events_authorized_read on public.id_card_events
for select to authenticated
using (public.has_permission('id_cards.manage'));

create or replace function public.issue_id_card(
  p_application_id uuid,
  p_student_name text,
  p_enrollment_number text,
  p_course_name text,
  p_branch_name text,
  p_academic_year text,
  p_expires_on date,
  p_photo_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.has_permission('id_cards.manage') then
    raise exception 'Permission denied';
  end if;
  if not exists (
    select 1
    from public.applications
    where id = p_application_id
      and status = 'approved'
  ) then
    raise exception 'Application must be approved';
  end if;
  if nullif(trim(p_student_name), '') is null
    or nullif(trim(p_enrollment_number), '') is null
    or nullif(trim(p_course_name), '') is null
    or nullif(trim(p_branch_name), '') is null
    or nullif(trim(p_academic_year), '') is null then
    raise exception 'Required ID card fields missing';
  end if;
  if p_expires_on < current_date then
    raise exception 'Expiry date must not be in the past';
  end if;
  if p_photo_path is not null and not exists (
    select 1
    from public.applications a
    where a.id = p_application_id
      and split_part(p_photo_path, '/', 1) = a.student_id::text
      and exists (
        select 1
        from storage.objects o
        where o.bucket_id = 'student-documents'
          and o.name = p_photo_path
      )
  ) then
    raise exception 'Invalid private photo path';
  end if;

  insert into public.id_cards (
    application_id,
    student_name,
    enrollment_number,
    course_name,
    branch_name,
    academic_year,
    expires_on,
    photo_path,
    issued_by
  )
  values (
    p_application_id,
    trim(p_student_name),
    trim(p_enrollment_number),
    trim(p_course_name),
    trim(p_branch_name),
    trim(p_academic_year),
    p_expires_on,
    p_photo_path,
    auth.uid()
  )
  returning id into v_id;

  insert into public.id_card_events (card_id, actor_id, event_type)
  values (v_id, auth.uid(), 'issued');
  return v_id;
end;
$$;

create or replace function public.log_id_card_reprint(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('id_cards.manage') then
    raise exception 'Permission denied';
  end if;
  if not exists (
    select 1
    from public.id_cards
    where id = p_card_id
      and status = 'active'
  ) then
    raise exception 'Card unavailable';
  end if;

  insert into public.id_card_events (card_id, actor_id, event_type)
  values (p_card_id, auth.uid(), 'reprinted');
end;
$$;

create or replace function public.revoke_id_card(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('id_cards.manage') then
    raise exception 'Permission denied';
  end if;

  update public.id_cards
  set status = 'revoked'
  where id = p_card_id
    and status = 'active';
  if not found then
    raise exception 'Active card not found';
  end if;

  insert into public.id_card_events (card_id, actor_id, event_type)
  values (p_card_id, auth.uid(), 'revoked');
end;
$$;

revoke all on function public.issue_id_card(uuid, text, text, text, text, text, date, text)
from public;
revoke all on function public.log_id_card_reprint(uuid) from public;
revoke all on function public.revoke_id_card(uuid) from public;

grant execute on function public.issue_id_card(uuid, text, text, text, text, text, date, text)
to authenticated;
grant execute on function public.log_id_card_reprint(uuid) to authenticated;
grant execute on function public.revoke_id_card(uuid) to authenticated;
