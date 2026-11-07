-- Migration 061: assign inquiries to faculty and add role-restricted feedback.

alter table public.inquiries
  add column if not exists assigned_faculty_id uuid
    references public.faculty(id) on delete set null;

create index if not exists inquiries_assigned_faculty_schedule_idx
  on public.inquiries (assigned_faculty_id, created_at desc);

drop policy if exists inquiries_assigned_faculty_read on public.inquiries;
create policy inquiries_assigned_faculty_read
  on public.inquiries
  for select to authenticated
  using (
    assigned_faculty_id = public.current_faculty_id()
  );

drop policy if exists inquiry_college_read on public.inquiries;
create policy inquiry_college_read on public.inquiries
  for select to authenticated
  using (
    public.current_faculty_id() is null
    and (
      public.has_permission('inquiries.manage')
      or public.has_permission('inquiries.read')
    )
  );

drop policy if exists inquiry_staff_read on public.inquiries;
create policy inquiry_staff_read on public.inquiries
  for select to authenticated
  using (
    public.current_faculty_id() is null
    and (
      public.has_permission('inquiries.manage')
      or public.has_permission('inquiries.read')
    )
    and (
      (
        public.staff_scope_allows(null, null, null)
        and public.is_admin()
      )
      or exists (
        select 1 from public.courses course
        where course.id = inquiries.course_id
          and public.staff_scope_allows(
            course.college_id, course.department_id, course.id
          )
      )
    )
  );

drop policy if exists inquiries_erp_read on public.inquiries;
create policy inquiries_erp_read on public.inquiries
  for select to authenticated
  using (
    public.current_faculty_id() is null
    and public.erp_module_permission('admissions', 'view')
  );

create table if not exists public.inquiry_feedback (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null unique
    references public.inquiries(id) on delete cascade,
  faculty_id uuid not null references public.faculty(id) on delete restrict,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  feedback text not null
    check (length(trim(feedback)) between 2 and 2000),
  created_at timestamptz not null default now()
);

alter table public.inquiry_feedback enable row level security;
grant select on public.inquiry_feedback to authenticated;
revoke insert, update, delete on public.inquiry_feedback from anon, authenticated;

drop policy if exists inquiry_feedback_role_read on public.inquiry_feedback;
create policy inquiry_feedback_role_read
  on public.inquiry_feedback
  for select to authenticated
  using (public.has_permission('inquiries.feedback.read'));

create or replace function public.can_submit_inquiry_feedback(p_inquiry_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_inquiry record;
  v_schedule text[];
  v_date date;
  v_end_time time;
begin
  if auth.uid() is null or public.current_faculty_id() is null then
    return false;
  end if;

  select i.id, i.assigned_faculty_id, i.other_responses, i.timing_slot
    into v_inquiry
    from public.inquiries i
    where i.id = p_inquiry_id;

  if not found
    or v_inquiry.assigned_faculty_id is distinct from public.current_faculty_id()
    or exists (
      select 1 from public.inquiry_feedback f where f.inquiry_id = p_inquiry_id
    ) then
    return false;
  end if;

  if coalesce(v_inquiry.other_responses->'inquiry_date'->>'value', '')
      !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;
  v_schedule := regexp_match(
    coalesce(v_inquiry.timing_slot, ''),
    '^([01][0-9]|2[0-3]):[0-5][0-9] - (([01][0-9]|2[0-3]):[0-5][0-9])$'
  );
  if v_schedule is null then
    return false;
  end if;

  begin
    v_date := (v_inquiry.other_responses->'inquiry_date'->>'value')::date;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      return false;
  end;
  v_end_time := v_schedule[2]::time;
  return localtimestamp >= v_date + v_end_time;
end;
$$;

revoke all on function public.can_submit_inquiry_feedback(uuid) from public;
grant execute on function public.can_submit_inquiry_feedback(uuid) to authenticated;

create or replace function public.submit_inquiry_feedback(
  p_inquiry_id uuid,
  p_feedback text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_faculty_id uuid;
  v_feedback_id uuid;
begin
  v_faculty_id := public.current_faculty_id();
  if auth.uid() is null or v_faculty_id is null then
    raise exception 'Linked faculty account required';
  end if;
  if length(trim(coalesce(p_feedback, ''))) not between 2 and 2000 then
    raise exception 'Feedback must contain 2 to 2000 characters';
  end if;
  if not public.can_submit_inquiry_feedback(p_inquiry_id) then
    raise exception 'Feedback can only be added by the assigned faculty after the scheduled inquiry time';
  end if;

  insert into public.inquiry_feedback (
    inquiry_id, faculty_id, submitted_by, feedback
  )
  values (p_inquiry_id, v_faculty_id, auth.uid(), trim(p_feedback))
  returning id into v_feedback_id;

  return v_feedback_id;
end;
$$;

revoke all on function public.submit_inquiry_feedback(uuid, text) from public;
grant execute on function public.submit_inquiry_feedback(uuid, text) to authenticated;

-- Keep the existing public RPC signature while storing a faculty-master ID
-- separately from the legacy profile-based faculty_id column.
create or replace function public.submit_public_inquiry_with_other(
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
  p_website text,
  p_college_id text,
  p_department text,
  p_faculty_id text,
  p_gender text,
  p_student_id text,
  p_course_id text,
  p_branch_id text,
  p_timing_slot text,
  p_other_responses jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_number text;
  v_response record;
  v_faculty_id uuid;
  v_department text;
begin
  if p_other_responses is null
    or jsonb_typeof(p_other_responses) is distinct from 'object' then
    raise exception 'Inquiry responses must be a JSON object';
  end if;

  if octet_length(p_other_responses::text) > 65536 then
    raise exception 'Inquiry responses are too large; shorten the answers and try again';
  end if;
  if length(coalesce(p_timing_slot, '')) > 120 then
    raise exception 'Invalid preferred timing';
  end if;

  for v_response in
    select key, value from jsonb_each(p_other_responses)
  loop
    if length(v_response.key) > 100 then
      raise exception 'Inquiry response field key is too long';
    end if;
    if jsonb_typeof(v_response.value) is distinct from 'object'
      or jsonb_typeof(v_response.value->'label') is distinct from 'string'
      or jsonb_typeof(v_response.value->'value') is distinct from 'string' then
      raise exception 'Inquiry response for "%" must contain text label and value', v_response.key;
    end if;
    if length(v_response.value->>'label') > 200 then
      raise exception 'Inquiry response label for "%" is too long', v_response.key;
    end if;
    if length(v_response.value->>'value') > 500 then
      raise exception 'Inquiry response for "%" is too long', v_response.key;
    end if;
  end loop;

  if nullif(trim(coalesce(p_faculty_id, '')), '') is not null then
    begin
      v_faculty_id := trim(p_faculty_id)::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Invalid selected faculty';
    end;

    select d.name into v_department
      from public.faculty f
      left join public.departments d on d.id = f.department_id
      where f.id = v_faculty_id
        and f.active is true
        and (
          nullif(trim(coalesce(p_college_id, '')), '') is null
          or f.college_id = trim(p_college_id)::uuid
        );
    if not found then
      raise exception 'Selected faculty is inactive or does not belong to the selected college';
    end if;
  end if;

  v_number := public.submit_public_inquiry(
    p_student_name,
    p_mobile,
    p_email,
    p_course_interest,
    p_branch_interest,
    p_qualification,
    p_city,
    p_source,
    p_message,
    p_consent,
    p_website,
    p_college_id,
    coalesce(v_department, p_department),
    '',
    p_gender,
    p_student_id,
    p_course_id,
    p_branch_id
  );

  update public.inquiries
    set other_responses = p_other_responses,
        timing_slot = nullif(trim(coalesce(p_timing_slot, '')), ''),
        assigned_faculty_id = v_faculty_id,
        department = coalesce(v_department, p_department, '')
    where inquiry_number = v_number;

  return v_number;
end;
$$;

revoke all on function public.submit_public_inquiry_with_other(
  text, text, text, text, text, text, text, text, text, boolean,
  text, text, text, text, text, text, text, text, text, jsonb
) from public;
grant execute on function public.submit_public_inquiry_with_other(
  text, text, text, text, text, text, text, text, text, boolean,
  text, text, text, text, text, text, text, text, text, jsonb
) to anon, authenticated;

drop function if exists public.get_faculties_for_inquiry(uuid, text);
create function public.get_faculties_for_inquiry(
  p_college_id uuid default null,
  p_department text default ''
)
returns table (
  id uuid,
  name text,
  code text,
  branch_id uuid,
  course_id uuid,
  college_id uuid,
  designation text,
  contact_number text,
  email text,
  active boolean,
  department text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select f.id, f.name, f.code, f.branch_id, f.course_id, f.college_id,
         f.designation, f.contact_number, f.email, f.active, coalesce(d.name, '')
    from public.faculty f
    left join public.departments d on d.id = f.department_id
    where f.active is true
      and (
        (p_college_id is null and p_department = '')
        or (p_college_id is not null and f.college_id = p_college_id)
      )
    order by f.name;
$$;

revoke all on function public.get_faculties_for_inquiry(uuid, text) from public;
grant execute on function public.get_faculties_for_inquiry(uuid, text)
  to anon, authenticated;
