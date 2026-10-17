create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_number text not null unique default (
    'INQ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  student_name text not null check (length(trim(student_name)) between 2 and 120),
  mobile text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  email text check (email is null or length(email) <= 254),
  course_interest text not null check (length(trim(course_interest)) between 2 and 120),
  branch_interest text,
  qualification text,
  city text,
  source text not null default 'website',
  message text,
  consent boolean not null check (consent),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'interested', 'follow_up', 'converted', 'closed')),
  assigned_to uuid references public.profiles (id),
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inquiry_followups (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  staff_id uuid not null references public.profiles (id),
  contact_mode text not null check (contact_mode in ('call', 'whatsapp', 'email', 'visit', 'other')),
  outcome text not null check (length(trim(outcome)) between 2 and 1000),
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists inquiries_status_next_idx
on public.inquiries (status, next_follow_up_at);
create index if not exists inquiries_created_idx
on public.inquiries (created_at desc);
create index if not exists inquiry_followups_inquiry_idx
on public.inquiry_followups (inquiry_id, created_at desc);

insert into public.role_permissions (role_code, permission)
values
  ('admin', 'inquiries.manage'),
  ('authority', 'inquiries.manage'),
  ('data_entry', 'inquiries.manage'),
  ('principal', 'inquiries.read'),
  ('department_head', 'inquiries.read')
on conflict (role_code, permission) do nothing;

alter table public.inquiries enable row level security;
alter table public.inquiry_followups enable row level security;

drop policy if exists inquiry_staff_read on public.inquiries;

create policy inquiry_staff_read on public.inquiries
for select to authenticated
using (
  public.has_permission('inquiries.manage')
  or public.has_permission('inquiries.read')
);

drop policy if exists inquiry_staff_update on public.inquiries;

create policy inquiry_staff_update on public.inquiries
for update to authenticated
using (public.has_permission('inquiries.manage'))
with check (public.has_permission('inquiries.manage'));

drop policy if exists followups_staff_read on public.inquiry_followups;

create policy followups_staff_read on public.inquiry_followups
for select to authenticated
using (
  public.has_permission('inquiries.manage')
  or public.has_permission('inquiries.read')
);

create or replace function public.submit_public_inquiry(
  p_student_name text,
  p_mobile text,
  p_email text,
  p_course_interest text,
  p_branch_interest text,
  p_qualification text,
  p_city text,
  p_source text,
  p_message text,
  p_consent boolean,
  p_website text default ''
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_number text;
begin
  if coalesce(p_website, '') <> '' then
    raise exception 'Invalid submission';
  end if;
  if p_consent is distinct from true then
    raise exception 'Consent required';
  end if;
  if length(trim(coalesce(p_student_name, ''))) not between 2 and 120
    or coalesce(p_mobile, '') !~ '^[6-9][0-9]{9}$'
    or length(trim(coalesce(p_course_interest, ''))) not between 2 and 120 then
    raise exception 'Invalid required fields';
  end if;
  if length(coalesce(p_email, '')) > 254
    or (
      nullif(trim(coalesce(p_email, '')), '') is not null
      and p_email !~* '^[^ @]+@[^ @]+[.][^ @]+$'
    )
    or length(coalesce(p_message, '')) > 1500 then
    raise exception 'Invalid optional fields';
  end if;

  insert into public.inquiries (
    student_name,
    mobile,
    email,
    course_interest,
    branch_interest,
    qualification,
    city,
    source,
    message,
    consent
  )
  values (
    trim(p_student_name),
    p_mobile,
    nullif(trim(coalesce(p_email, '')), ''),
    trim(p_course_interest),
    left(nullif(trim(coalesce(p_branch_interest, '')), ''), 120),
    left(nullif(trim(coalesce(p_qualification, '')), ''), 120),
    left(nullif(trim(coalesce(p_city, '')), ''), 120),
    left(coalesce(nullif(trim(p_source), ''), 'website'), 40),
    nullif(trim(coalesce(p_message, '')), ''),
    p_consent
  )
  returning inquiry_number into v_number;
  return v_number;
end;
$$;

revoke all on function public.submit_public_inquiry(
  text, text, text, text, text, text, text, text, text, boolean, text
) from public;
grant execute on function public.submit_public_inquiry(
  text, text, text, text, text, text, text, text, text, boolean, text
) to anon, authenticated;

create or replace function public.add_inquiry_followup(
  p_inquiry_id uuid,
  p_contact_mode text,
  p_outcome text,
  p_next_follow_up_at timestamptz default null,
  p_status text default 'follow_up'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('inquiries.manage') then
    raise exception 'Permission denied';
  end if;
  if p_contact_mode not in ('call', 'whatsapp', 'email', 'visit', 'other')
    or length(trim(coalesce(p_outcome, ''))) not between 2 and 1000
    or p_status not in ('new', 'contacted', 'interested', 'follow_up', 'converted', 'closed') then
    raise exception 'Invalid follow-up';
  end if;

  update public.inquiries
  set status = p_status, next_follow_up_at = p_next_follow_up_at, updated_at = now()
  where id = p_inquiry_id;
  if not found then
    raise exception 'Inquiry not found';
  end if;

  insert into public.inquiry_followups (
    inquiry_id, staff_id, contact_mode, outcome, next_follow_up_at
  )
  values (
    p_inquiry_id, auth.uid(), p_contact_mode, trim(p_outcome), p_next_follow_up_at
  );

  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (auth.uid(), 'inquiry.followup', 'inquiries', p_inquiry_id::text);
end;
$$;

revoke all on function public.add_inquiry_followup(uuid, text, text, timestamptz, text)
from public;
grant execute on function public.add_inquiry_followup(uuid, text, text, timestamptz, text)
to authenticated;
