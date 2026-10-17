alter table public.admission_decision_events
  add column if not exists old_intake_id uuid references public.admission_intakes (id),
  add column if not exists new_intake_id uuid references public.admission_intakes (id),
  add column if not exists movement_type text not null default 'decision'
    check (movement_type in ('decision', 'admission', 'cancellation', 'transfer'));

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
  v_branch public.branches%rowtype;
  v_old_intake_id uuid;
  v_result_intake_id uuid;
  v_category_admitted integer;
  v_branch_admitted integer;
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

  select * into v_admission
  from public.inquiry_admissions
  where id = p_admission_id
  for update;
  if not found then
    raise exception 'Admission record not found';
  end if;
  v_old_decision := v_admission.decision;
  v_old_intake_id := v_admission.intake_id;

  if v_old_decision = 'admitted'
    and p_decision not in ('admitted', 'cancelled') then
    raise exception 'Cancel existing admission before changing its decision';
  end if;
  if v_old_decision = 'cancelled' and p_decision = 'admitted' then
    raise exception 'Cancelled admission cannot be reactivated; create a new admission record';
  end if;

  v_result_intake_id := case
    when p_decision = 'admitted' then p_intake_id
    else coalesce(v_admission.intake_id, p_intake_id)
  end;

  if p_decision = 'admitted' then
    if p_intake_id is null then
      raise exception 'Select intake first';
    end if;

    select * into v_intake
    from public.admission_intakes
    where id = p_intake_id
    for update;
    if not found then
      raise exception 'Intake not found';
    end if;
    if v_intake.course_name <> trim(p_course_name)
      or v_intake.branch_name <> trim(coalesce(p_branch_name, '')) then
      raise exception 'Course and branch must match selected intake';
    end if;

    if v_old_decision <> 'admitted'
      or p_intake_id is distinct from v_admission.intake_id then
      if v_intake.branch_id is null
        and nullif(trim(v_intake.branch_name), '') is not null then
        raise exception 'Branch intake link is missing; recreate this intake from the configured Branch record';
      end if;

      if v_intake.branch_id is not null then
        perform branch.id
        from public.branches branch
        where branch.id in (
          v_intake.branch_id,
          (
            select old_intake.branch_id
            from public.admission_intakes old_intake
            where old_intake.id = v_admission.intake_id
          )
        )
        order by branch.id
        for update;

        select * into v_branch
        from public.branches
        where id = v_intake.branch_id;
        if not found then
          raise exception 'Branch for this intake no longer exists';
        end if;

        select count(*)::integer
        into v_branch_admitted
        from public.inquiry_admissions admission
        join public.admission_intakes intake_row on intake_row.id = admission.intake_id
        where intake_row.academic_year = v_intake.academic_year
          and intake_row.branch_id = v_intake.branch_id
          and admission.decision = 'admitted'
          and admission.id <> v_admission.id;
        if v_branch_admitted >= v_branch.intake then
          raise exception 'Branch intake full: no available seats';
        end if;
      end if;

      select count(*)::integer
      into v_category_admitted
      from public.inquiry_admissions
      where intake_id = p_intake_id
        and decision = 'admitted'
        and id <> v_admission.id;
      if v_category_admitted >= v_intake.sanctioned_seats then
        raise exception 'Intake category full: no available seats';
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
    intake_id = v_result_intake_id,
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

  if v_old_decision is distinct from p_decision
    or v_old_intake_id is distinct from v_result_intake_id then
    insert into public.admission_decision_events (
      admission_id,
      actor_id,
      old_decision,
      new_decision,
      note,
      old_intake_id,
      new_intake_id,
      movement_type
    )
    values (
      p_admission_id,
      auth.uid(),
      v_old_decision,
      p_decision,
      nullif(trim(coalesce(p_decision_note, '')), ''),
      v_old_intake_id,
      v_result_intake_id,
      case
        when v_old_decision = 'admitted' and p_decision = 'cancelled' then 'cancellation'
        when p_decision = 'admitted'
          and v_old_intake_id is distinct from v_result_intake_id then 'transfer'
        when p_decision = 'admitted' and v_old_decision <> 'admitted' then 'admission'
        else 'decision'
      end
    );
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (
    auth.uid(),
    case
      when v_old_decision = 'admitted'
        and p_decision = 'admitted'
        and v_old_intake_id is distinct from v_result_intake_id
        then 'admission.transfer'
      else 'admission.decision.' || p_decision
    end,
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

create or replace view public.admission_intake_summary
with (security_invoker = true)
as
select
  intake.id,
  intake.academic_year,
  intake.course_name,
  intake.branch_name,
  intake.sanctioned_seats,
  (count(admission.id) filter (where admission.decision = 'admitted'))::integer
    as admitted_count,
  (count(admission.id) filter (where admission.decision = 'cancelled'))::integer
    as cancelled_count,
  (
    intake.sanctioned_seats
    - (count(admission.id) filter (where admission.decision = 'admitted'))
  )::integer as available_seats,
  intake.intake_head,
  intake.branch_id,
  coalesce(branch.intake, intake.sanctioned_seats) as branch_total_intake,
  coalesce((
    select count(*)::integer
    from public.inquiry_admissions branch_admission
    join public.admission_intakes branch_intake
      on branch_intake.id = branch_admission.intake_id
    where branch_intake.academic_year = intake.academic_year
      and branch_intake.branch_id = intake.branch_id
      and branch_admission.decision = 'admitted'
  ), 0) as branch_filled_count,
  coalesce((
    select count(*)::integer
    from public.admission_decision_events event
    where event.new_intake_id = intake.id
      and event.movement_type = 'transfer'
  ), 0) as transfer_in_count,
  coalesce((
    select count(*)::integer
    from public.admission_decision_events event
    where event.old_intake_id = intake.id
      and event.movement_type = 'transfer'
  ), 0) as transfer_out_count
from public.admission_intakes intake
left join public.inquiry_admissions admission
  on admission.intake_id = intake.id
  and admission.decision in ('admitted', 'cancelled')
left join public.branches branch
  on branch.id = intake.branch_id
group by intake.id, branch.intake;

grant select on public.admission_intake_summary to authenticated;

create or replace view public.admission_quota_transfers
with (security_invoker = true)
as
select
  event.id,
  event.created_at,
  event.actor_id,
  event.note,
  admission.admission_number,
  admission.student_name,
  source.academic_year,
  source.course_name as source_course,
  source.branch_name as source_branch,
  source.intake_head as source_quota,
  destination.course_name as destination_course,
  destination.branch_name as destination_branch,
  destination.intake_head as destination_quota
from public.admission_decision_events event
join public.inquiry_admissions admission on admission.id = event.admission_id
left join public.admission_intakes source on source.id = event.old_intake_id
left join public.admission_intakes destination on destination.id = event.new_intake_id
where event.movement_type = 'transfer';

grant select on public.admission_quota_transfers to authenticated;
