create table if not exists public.admission_intakes (
  id uuid primary key default gen_random_uuid(),
  academic_year text not null,
  course_name text not null,
  branch_name text not null default '',
  sanctioned_seats integer not null check (sanctioned_seats >= 0),
  created_at timestamptz not null default now(),
  unique (academic_year, course_name, branch_name)
);

alter table public.admission_intakes enable row level security;

drop policy if exists intakes_staff_read on public.admission_intakes;

create policy intakes_staff_read on public.admission_intakes
for select to authenticated
using (
  public.has_permission('admissions.read')
  or public.has_permission('admissions.prepare')
  or public.has_permission('admissions.manage')
);

drop policy if exists intakes_admin_insert on public.admission_intakes;

create policy intakes_admin_insert on public.admission_intakes
for insert to authenticated
with check (public.is_admin());

drop policy if exists intakes_admin_update on public.admission_intakes;

create policy intakes_admin_update on public.admission_intakes
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

alter table public.inquiry_admissions
add column if not exists intake_id uuid references public.admission_intakes (id);

alter table public.inquiry_admissions
drop constraint if exists inquiry_admissions_decision_check;

alter table public.inquiry_admissions
add constraint inquiry_admissions_decision_check
check (decision in ('pending', 'admitted', 'not_admitted', 'cancelled'));

create index if not exists inquiry_admissions_intake_active_idx
on public.inquiry_admissions (intake_id)
where decision = 'admitted';

create table if not exists public.admission_decision_events (
  id bigint generated always as identity primary key,
  admission_id uuid not null references public.inquiry_admissions (id),
  actor_id uuid references public.profiles (id),
  old_decision text,
  new_decision text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.admission_decision_events enable row level security;

drop policy if exists decision_events_staff_read on public.admission_decision_events;

create policy decision_events_staff_read on public.admission_decision_events
for select to authenticated
using (
  public.has_permission('admissions.read')
  or public.has_permission('admissions.manage')
);

drop function if exists public.save_admission_decision(
  uuid, text, text, text, text, text, text, text, text, text, text
);

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
  p_decision_note text,
  p_intake_id uuid
)
returns public.inquiry_admissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admission public.inquiry_admissions%rowtype;
  v_intake public.admission_intakes%rowtype;
  v_admitted_count integer;
  v_old_decision text;
begin
  if not public.has_permission('admissions.manage') then
    raise exception 'Admission authority permission required';
  end if;
  if p_decision is null
    or p_decision not in ('pending', 'admitted', 'not_admitted', 'cancelled') then
    raise exception 'Invalid decision';
  end if;
  if length(trim(coalesce(p_student_name, ''))) < 2
    or coalesce(p_mobile, '') !~ '^[6-9][0-9]{9}$'
    or length(trim(coalesce(p_course_name, ''))) < 2 then
    raise exception 'Required student details invalid';
  end if;
  if p_decision in ('not_admitted', 'cancelled')
    and nullif(trim(coalesce(p_decision_note, '')), '') is null then
    raise exception 'Reason required';
  end if;
  if p_decision = 'admitted'
    and nullif(trim(coalesce(p_enrollment_number, '')), '') is null then
    raise exception 'Enrollment number required';
  end if;

  if p_intake_id is not null then
    select * into v_intake
    from public.admission_intakes
    where id = p_intake_id
    for update;
    if not found then
      raise exception 'Intake not found';
    end if;
  end if;

  select * into v_admission
  from public.inquiry_admissions
  where id = p_admission_id
  for update;
  if not found then
    raise exception 'Admission record not found';
  end if;
  v_old_decision := v_admission.decision;

  if v_old_decision = 'admitted'
    and (
      p_decision not in ('admitted', 'cancelled')
      or p_intake_id is distinct from v_admission.intake_id
    ) then
    raise exception 'Cancel existing admission before changing its intake or decision';
  end if;
  if v_old_decision = 'cancelled' and p_decision = 'admitted' then
    raise exception 'Cancelled admission cannot be reactivated; contact administrator for a documented correction';
  end if;

  if p_decision = 'admitted' then
    if p_intake_id is null then
      raise exception 'Select intake first';
    end if;
    if v_intake.course_name <> trim(p_course_name)
      or v_intake.branch_name <> trim(coalesce(p_branch_name, '')) then
      raise exception 'Course and branch must match selected intake';
    end if;
    if v_old_decision <> 'admitted' then
      select count(*) into v_admitted_count
      from public.inquiry_admissions
      where intake_id = p_intake_id
        and decision = 'admitted';
      if v_admitted_count >= v_intake.sanctioned_seats then
        raise exception 'Intake full: no available seats';
      end if;
    end if;
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
    intake_id = case
      when p_decision = 'admitted' then p_intake_id
      else coalesce(intake_id, p_intake_id)
    end,
    decision = p_decision,
    decision_note = nullif(trim(coalesce(p_decision_note, '')), ''),
    decided_at = case when p_decision = 'pending' then null else now() end,
    decided_by = case when p_decision = 'pending' then null else auth.uid() end,
    updated_at = now()
  where id = p_admission_id
  returning * into v_admission;

  if p_decision = 'admitted' then
    update public.inquiries
    set status = 'converted', updated_at = now()
    where id = v_admission.inquiry_id;
  else
    update public.inquiries
    set status = 'contacted', updated_at = now()
    where id = v_admission.inquiry_id
      and status = 'converted';
  end if;

  if v_old_decision is distinct from p_decision then
    insert into public.admission_decision_events (
      admission_id, actor_id, old_decision, new_decision, note
    )
    values (
      p_admission_id,
      auth.uid(),
      v_old_decision,
      p_decision,
      nullif(trim(coalesce(p_decision_note, '')), '')
    );
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

revoke all on function public.save_admission_decision(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid
) from public;
grant execute on function public.save_admission_decision(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid
) to authenticated;

drop view if exists public.admission_intake_summary;

create view public.admission_intake_summary
with (security_invoker = true)
as
select
  intake.id,
  intake.academic_year,
  intake.course_name,
  intake.branch_name,
  intake.sanctioned_seats,
  count(admission.id)::integer as admitted_count,
  (intake.sanctioned_seats - count(admission.id))::integer as available_seats
from public.admission_intakes intake
left join public.inquiry_admissions admission
  on admission.intake_id = intake.id
  and admission.decision = 'admitted'
group by intake.id;

grant select on public.admission_intake_summary to authenticated;
