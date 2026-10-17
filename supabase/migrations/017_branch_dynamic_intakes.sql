do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'branches'
      and column_name = 'intake_heads'
  ) then
    alter table public.branches
      add column intake_heads jsonb not null default '[]'::jsonb
        check (jsonb_typeof(intake_heads) = 'array');

    update public.branches
    set intake_heads = jsonb_build_array(
      jsonb_build_object('name', 'General', 'seats', intake)
    );
  end if;
end;
$$;

alter table public.admission_intakes
  add column if not exists branch_id uuid references public.branches (id),
  add column if not exists intake_head text not null default 'General';

update public.admission_intakes intake
set branch_id = branch.id
from public.branches branch
join public.courses course on course.id = branch.course_id
where intake.branch_id is null
  and intake.branch_name <> ''
  and lower(trim(branch.name)) = lower(trim(intake.branch_name))
  and lower(trim(course.name)) = lower(trim(intake.course_name));

alter table public.admission_intakes
  drop constraint if exists admission_intakes_academic_year_course_name_branch_name_key;

create unique index if not exists admission_intakes_year_course_branch_head_unique
  on public.admission_intakes (
    academic_year,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    course_name,
    branch_name,
    lower(intake_head)
  );

create or replace function public.guard_branch_intake_heads()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_head jsonb;
  v_name text;
  v_seats integer;
  v_total integer := 0;
  v_names text[] := array[]::text[];
  v_year record;
begin
  if jsonb_typeof(new.intake_heads) <> 'array' then
    raise exception 'Intake headings must be a JSON array';
  end if;

  for v_head in select value from jsonb_array_elements(new.intake_heads)
  loop
    if jsonb_typeof(v_head) <> 'object'
      or nullif(trim(v_head->>'name'), '') is null
      or coalesce(v_head->>'seats', '') !~ '^[0-9]+$' then
      raise exception 'Each intake heading needs a name and a whole seat count of zero or more';
    end if;
    v_name := lower(trim(v_head->>'name'));
    v_seats := (v_head->>'seats')::integer;
    if v_name = any(v_names) then
      raise exception 'Intake headings must have unique names';
    end if;
    v_names := array_append(v_names, v_name);
    v_total := v_total + v_seats;
  end loop;

  if v_total > new.intake then
    raise exception 'Intake category seats (%) cannot exceed branch intake (%)', v_total, new.intake;
  end if;

  if tg_op = 'UPDATE' and (
    new.intake is distinct from old.intake
    or new.intake_heads is distinct from old.intake_heads
    or new.name is distinct from old.name
    or new.course_id is distinct from old.course_id
  ) then
    if (new.name is distinct from old.name or new.course_id is distinct from old.course_id)
      and exists (
        select 1 from public.admission_intakes intake_row
        where intake_row.branch_id = old.id
      ) then
      raise exception 'Branch name or course cannot change after academic-year intakes are configured';
    end if;

    for v_head in
      select to_jsonb(intake_row)
      from public.admission_intakes intake_row
      where intake_row.branch_id = old.id
    loop
      select coalesce((category.value->>'seats')::integer, -1)
      into v_seats
      from jsonb_array_elements(new.intake_heads) category(value)
      where lower(trim(category.value->>'name')) =
        lower(trim(v_head->>'intake_head'));
      if not found or (v_head->>'sanctioned_seats')::integer > v_seats then
        raise exception 'Branch intake headings cannot be reduced below an existing academic-year allocation';
      end if;
    end loop;

    for v_year in
      select intake_row.academic_year, count(admission.id)::integer as admitted_count
      from public.admission_intakes intake_row
      left join public.inquiry_admissions admission
        on admission.intake_id = intake_row.id
        and admission.decision = 'admitted'
      where intake_row.branch_id = old.id
      group by intake_row.academic_year
    loop
      if v_year.admitted_count > new.intake then
        raise exception 'Branch intake cannot be reduced below existing admitted count (%) for academic year %',
          v_year.admitted_count, v_year.academic_year;
      end if;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists branches_guard_intake_heads on public.branches;
create trigger branches_guard_intake_heads
before insert or update of intake, intake_heads, name, course_id
on public.branches
for each row
execute function public.guard_branch_intake_heads();

create or replace function public.guard_admission_intake_capacity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_branch public.branches%rowtype;
  v_branch_id uuid;
  v_head_seats integer;
  v_allocated_seats integer;
begin
  if nullif(trim(new.branch_name), '') is null then
    if new.branch_id is not null then
      raise exception 'A branch is required for a branch-specific intake';
    end if;
    return new;
  end if;

  if new.branch_id is null then
    select branch.id
    into v_branch_id
    from public.branches branch
    join public.courses course on course.id = branch.course_id
    where lower(trim(branch.name)) = lower(trim(new.branch_name))
      and lower(trim(course.name)) = lower(trim(new.course_name))
    order by branch.id
    limit 1;
    new.branch_id := v_branch_id;
  end if;

  select branch.*
  into v_branch
  from public.branches branch
  join public.courses course on course.id = branch.course_id
  where branch.id = new.branch_id
    and lower(trim(branch.name)) = lower(trim(new.branch_name))
    and lower(trim(course.name)) = lower(trim(new.course_name))
  for update of branch;

  if not found then
    raise exception 'Selected course and branch do not match an existing branch';
  end if;

  select coalesce((category.value->>'seats')::integer, -1)
  into v_head_seats
  from jsonb_array_elements(v_branch.intake_heads) category(value)
  where lower(trim(category.value->>'name')) = lower(trim(new.intake_head));

  if not found then
    raise exception 'Intake heading "%" is not configured for this branch', new.intake_head;
  end if;
  if new.sanctioned_seats > v_head_seats then
    raise exception 'Academic-year allocation (%) cannot exceed the configured "%" intake of (%) seats',
      new.sanctioned_seats, new.intake_head, v_head_seats;
  end if;

  select coalesce(sum(intake_row.sanctioned_seats), 0)::integer
  into v_allocated_seats
  from public.admission_intakes intake_row
  where intake_row.academic_year = new.academic_year
    and intake_row.branch_id = new.branch_id
    and intake_row.id is distinct from new.id;

  if v_allocated_seats + new.sanctioned_seats > v_branch.intake then
    raise exception 'Academic-year intake allocations (%) cannot exceed branch intake (%)',
      v_allocated_seats + new.sanctioned_seats, v_branch.intake;
  end if;

  return new;
end;
$$;

drop trigger if exists admission_intakes_guard_capacity on public.admission_intakes;
create trigger admission_intakes_guard_capacity
before insert or update of academic_year, course_name, branch_name, branch_id, intake_head, sanctioned_seats
on public.admission_intakes
for each row
execute function public.guard_admission_intake_capacity();

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
      if v_intake.branch_id is null
        and nullif(trim(v_intake.branch_name), '') is not null then
        raise exception 'Branch intake link is missing; recreate this intake from the configured Branch record';
      end if;
      if v_intake.branch_id is not null then
        select * into v_branch
        from public.branches
        where id = v_intake.branch_id
        for update;
        if not found then
          raise exception 'Branch for this intake no longer exists';
        end if;
        select count(*)::integer
        into v_branch_admitted
        from public.inquiry_admissions admission
        join public.admission_intakes intake_row on intake_row.id = admission.intake_id
        where intake_row.academic_year = v_intake.academic_year
          and intake_row.branch_id = v_intake.branch_id
          and admission.decision = 'admitted';
        if v_branch_admitted >= v_branch.intake then
          raise exception 'Branch intake full: no available seats';
        end if;
      end if;

      select count(*)::integer
      into v_category_admitted
      from public.inquiry_admissions
      where intake_id = p_intake_id
        and decision = 'admitted';
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

create or replace view public.admission_intake_summary
with (security_invoker = true)
as
select
  intake.id,
  intake.academic_year,
  intake.course_name,
  intake.branch_name,
  intake.sanctioned_seats,
  count(admission.id)::integer as admitted_count,
  (intake.sanctioned_seats - count(admission.id))::integer as available_seats,
  intake.intake_head,
  intake.branch_id
from public.admission_intakes intake
left join public.inquiry_admissions admission
  on admission.intake_id = intake.id
  and admission.decision = 'admitted'
group by intake.id;

grant select on public.admission_intake_summary to authenticated;
