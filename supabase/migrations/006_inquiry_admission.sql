create table if not exists public.inquiry_admissions (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null unique references public.inquiries (id) on delete restrict,
  admission_number text not null unique default (
    'ADM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  student_name text not null,
  mobile text not null,
  email text,
  course_name text not null,
  branch_name text,
  qualification text,
  city text,
  enrollment_number text,
  decision text not null default 'pending'
    check (decision in ('pending', 'admitted', 'not_admitted')),
  decision_note text,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    decision <> 'not_admitted'
    or nullif(trim(coalesce(decision_note, '')), '') is not null
  )
);

create index if not exists inquiry_admissions_decision_created_idx
on public.inquiry_admissions (decision, created_at desc);

insert into public.role_permissions (role_code, permission)
values
  ('admin', 'admissions.manage'),
  ('authority', 'admissions.manage'),
  ('data_entry', 'admissions.prepare'),
  ('principal', 'admissions.read'),
  ('department_head', 'admissions.read')
on conflict (role_code, permission) do nothing;

alter table public.inquiry_admissions enable row level security;

drop policy if exists admission_staff_read on public.inquiry_admissions;

create policy admission_staff_read on public.inquiry_admissions
for select to authenticated
using (
  public.has_permission('admissions.read')
  or public.has_permission('admissions.prepare')
  or public.has_permission('admissions.manage')
);

create or replace function public.prepare_admission_from_inquiry(p_inquiry_number text)
returns public.inquiry_admissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inquiry public.inquiries%rowtype;
  v_admission public.inquiry_admissions%rowtype;
begin
  if not (
    public.has_permission('admissions.prepare')
    or public.has_permission('admissions.manage')
  ) then
    raise exception 'Permission denied';
  end if;

  select * into v_inquiry
  from public.inquiries
  where upper(inquiry_number) = upper(trim(p_inquiry_number));
  if not found then
    raise exception 'Inquiry ID not found';
  end if;

  insert into public.inquiry_admissions (
    inquiry_id,
    student_name,
    mobile,
    email,
    course_name,
    branch_name,
    qualification,
    city,
    created_by
  )
  values (
    v_inquiry.id,
    v_inquiry.student_name,
    v_inquiry.mobile,
    v_inquiry.email,
    v_inquiry.course_interest,
    v_inquiry.branch_interest,
    v_inquiry.qualification,
    v_inquiry.city,
    auth.uid()
  )
  on conflict (inquiry_id) do nothing;

  select * into v_admission
  from public.inquiry_admissions
  where inquiry_id = v_inquiry.id;
  return v_admission;
end;
$$;

create or replace function public.save_admission_decision(
  p_admission_id uuid,
  p_student_name text,
  p_mobile text,
  p_email text,
  p_course_name text,
  p_branch_name text,
  p_qualification text,
  p_city text,
  p_enrollment_number text,
  p_decision text,
  p_decision_note text
)
returns public.inquiry_admissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admission public.inquiry_admissions%rowtype;
begin
  if not public.has_permission('admissions.manage') then
    raise exception 'Admission authority permission required';
  end if;
  if p_decision not in ('pending', 'admitted', 'not_admitted') then
    raise exception 'Invalid decision';
  end if;
  if length(trim(coalesce(p_student_name, ''))) < 2
    or coalesce(p_mobile, '') !~ '^[6-9][0-9]{9}$'
    or length(trim(coalesce(p_course_name, ''))) < 2 then
    raise exception 'Required student details invalid';
  end if;
  if p_decision = 'not_admitted'
    and nullif(trim(coalesce(p_decision_note, '')), '') is null then
    raise exception 'Reason required for not admitted';
  end if;
  if p_decision = 'admitted'
    and nullif(trim(coalesce(p_enrollment_number, '')), '') is null then
    raise exception 'Enrollment number required for admitted student';
  end if;

  update public.inquiry_admissions
  set
    student_name = trim(p_student_name),
    mobile = p_mobile,
    email = nullif(trim(coalesce(p_email, '')), ''),
    course_name = trim(p_course_name),
    branch_name = nullif(trim(coalesce(p_branch_name, '')), ''),
    qualification = nullif(trim(coalesce(p_qualification, '')), ''),
    city = nullif(trim(coalesce(p_city, '')), ''),
    enrollment_number = nullif(trim(coalesce(p_enrollment_number, '')), ''),
    decision = p_decision,
    decision_note = nullif(trim(coalesce(p_decision_note, '')), ''),
    decided_at = case when p_decision = 'pending' then null else now() end,
    decided_by = case when p_decision = 'pending' then null else auth.uid() end,
    updated_at = now()
  where id = p_admission_id
  returning * into v_admission;
  if not found then
    raise exception 'Admission record not found';
  end if;

  if p_decision = 'admitted' then
    update public.inquiries
    set status = 'converted', updated_at = now()
    where id = v_admission.inquiry_id;
  else
    update public.inquiries
    set status = 'contacted', updated_at = now()
    where id = v_admission.inquiry_id and status = 'converted';
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (
    auth.uid(),
    'admission.decision.' || p_decision,
    'inquiry_admissions',
    p_admission_id::text
  );
  return v_admission;
end;
$$;

revoke all on function public.prepare_admission_from_inquiry(text) from public;
revoke all on function public.save_admission_decision(
  uuid, text, text, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.prepare_admission_from_inquiry(text) to authenticated;
grant execute on function public.save_admission_decision(
  uuid, text, text, text, text, text, text, text, text, text, text
) to authenticated;
