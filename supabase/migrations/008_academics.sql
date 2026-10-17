-- Academics module: faculty, students, subjects, timetable, faculty leave,
-- proxy lectures and lecture attendance.
--
-- Ported from the "College Management System" FastAPI/SQLite starter into the
-- SVIT Supabase schema. Reads use RLS; writes that enforce business rules
-- (clash prevention, leave/proxy eligibility, attendance integrity) go through
-- SECURITY DEFINER functions. This file is idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- Master tables
-- ---------------------------------------------------------------------------
create table if not exists public.faculty (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (length(trim(name)) > 1),
  department text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  enrollment text not null unique,
  name text not null check (length(trim(name)) > 1),
  course text not null,
  semester integer not null check (semester between 1 and 12),
  division text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (length(trim(name)) > 1),
  course text not null,
  semester integer not null check (semester between 1 and 12),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- A staff account can be linked to a faculty record so faculty can apply for
-- leave, view their timetable and record attendance for their own lectures.
alter table public.staff_members
add column if not exists faculty_id uuid references public.faculty (id) on delete set null;

insert into public.staff_roles (code, label)
values ('faculty', 'Faculty')
on conflict (code) do nothing;

create or replace function public.current_faculty_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.faculty_id
  from public.staff_members s
  where s.user_id = auth.uid()
    and s.active
    and s.faculty_id is not null
  limit 1;
$$;

revoke all on function public.current_faculty_id() from public;
grant execute on function public.current_faculty_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Timetable, leave, proxy and attendance tables
-- ---------------------------------------------------------------------------
create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  day text not null check (
    day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
  ),
  period integer not null check (period >= 1),
  faculty_id uuid not null references public.faculty (id) on delete restrict,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  course text not null,
  semester integer not null check (semester between 1 and 12),
  division text not null default '',
  room text not null default '',
  created_at timestamptz not null default now(),
  unique (day, period, faculty_id),
  unique (day, period, course, semester, division)
);

create table if not exists public.faculty_leaves (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.faculty (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  leave_type text not null check (length(trim(leave_type)) > 1),
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid references public.profiles (id),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.lecture_proxies (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.timetable_slots (id) on delete restrict,
  lecture_date date not null,
  original_faculty_id uuid not null references public.faculty (id) on delete restrict,
  proxy_faculty_id uuid not null references public.faculty (id) on delete restrict,
  status text not null default 'assigned' check (status in ('assigned', 'cancelled')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (slot_id, lecture_date)
);

create table if not exists public.lecture_attendance (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.timetable_slots (id) on delete restrict,
  lecture_date date not null,
  student_id uuid not null references public.students (id) on delete restrict,
  taken_by uuid not null references public.faculty (id) on delete restrict,
  attendance_type text not null check (attendance_type in ('regular', 'proxy')),
  present boolean not null,
  created_at timestamptz not null default now(),
  unique (slot_id, lecture_date, student_id)
);

create index if not exists timetable_slots_faculty_idx
on public.timetable_slots (day, period, faculty_id);
create index if not exists timetable_slots_class_idx
on public.timetable_slots (day, period, course, semester, division);
create index if not exists faculty_leaves_faculty_idx
on public.faculty_leaves (faculty_id, start_date, end_date);
create index if not exists lecture_proxies_slot_idx
on public.lecture_proxies (slot_id, lecture_date);
create index if not exists lecture_attendance_slot_idx
on public.lecture_attendance (slot_id, lecture_date);

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role_code, permission)
values
  ('admin', 'academics.manage'),
  ('admin', 'academics.read'),
  ('admin', 'attendance.record'),
  ('authority', 'academics.read'),
  ('department_head', 'academics.manage'),
  ('department_head', 'academics.read'),
  ('department_head', 'attendance.record'),
  ('principal', 'academics.read'),
  ('data_entry', 'academics.read'),
  ('faculty', 'academics.read'),
  ('faculty', 'attendance.record')
on conflict (role_code, permission) do nothing;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.faculty enable row level security;
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.timetable_slots enable row level security;
alter table public.faculty_leaves enable row level security;
alter table public.lecture_proxies enable row level security;
alter table public.lecture_attendance enable row level security;

drop policy if exists faculty_academics_read on public.faculty;

create policy faculty_academics_read on public.faculty
for select to authenticated
using (
  public.has_permission('academics.read')
  or public.has_permission('academics.manage')
);

drop policy if exists faculty_academics_manage on public.faculty;

create policy faculty_academics_manage on public.faculty
for all to authenticated
using (public.has_permission('academics.manage'))
with check (public.has_permission('academics.manage'));

drop policy if exists students_academics_read on public.students;

create policy students_academics_read on public.students
for select to authenticated
using (
  public.has_permission('academics.read')
  or public.has_permission('academics.manage')
);

drop policy if exists students_academics_manage on public.students;

create policy students_academics_manage on public.students
for all to authenticated
using (public.has_permission('academics.manage'))
with check (public.has_permission('academics.manage'));

drop policy if exists subjects_academics_read on public.subjects;

create policy subjects_academics_read on public.subjects
for select to authenticated
using (
  public.has_permission('academics.read')
  or public.has_permission('academics.manage')
);

drop policy if exists subjects_academics_manage on public.subjects;

create policy subjects_academics_manage on public.subjects
for all to authenticated
using (public.has_permission('academics.manage'))
with check (public.has_permission('academics.manage'));

-- Timetable slots are read-only through RLS; all writes go through the
-- guard functions below so clash checks cannot be bypassed.
drop policy if exists timetable_slots_academics_read on public.timetable_slots;

create policy timetable_slots_academics_read on public.timetable_slots
for select to authenticated
using (
  public.has_permission('academics.read')
  or public.has_permission('academics.manage')
);

drop policy if exists faculty_leaves_read on public.faculty_leaves;

create policy faculty_leaves_read on public.faculty_leaves
for select to authenticated
using (
  public.has_permission('academics.manage')
  or faculty_id = public.current_faculty_id()
);

drop policy if exists faculty_leaves_insert on public.faculty_leaves;

create policy faculty_leaves_insert on public.faculty_leaves
for insert to authenticated
with check (
  public.has_permission('academics.manage')
  or faculty_id = public.current_faculty_id()
);

drop policy if exists faculty_leaves_manage on public.faculty_leaves;

create policy faculty_leaves_manage on public.faculty_leaves
for all to authenticated
using (public.has_permission('academics.manage'))
with check (public.has_permission('academics.manage'));

drop policy if exists lecture_proxies_read on public.lecture_proxies;

create policy lecture_proxies_read on public.lecture_proxies
for select to authenticated
using (
  public.has_permission('academics.manage')
  or original_faculty_id = public.current_faculty_id()
  or proxy_faculty_id = public.current_faculty_id()
);

drop policy if exists lecture_proxies_manage on public.lecture_proxies;

create policy lecture_proxies_manage on public.lecture_proxies
for all to authenticated
using (public.has_permission('academics.manage'))
with check (public.has_permission('academics.manage'));

drop policy if exists lecture_attendance_read on public.lecture_attendance;

create policy lecture_attendance_read on public.lecture_attendance
for select to authenticated
using (
  public.has_permission('academics.manage')
  or public.has_permission('attendance.record')
);

drop policy if exists lecture_attendance_manage on public.lecture_attendance;

create policy lecture_attendance_manage on public.lecture_attendance
for all to authenticated
using (public.has_permission('academics.manage'))
with check (public.has_permission('academics.manage'));

-- ---------------------------------------------------------------------------
-- Guard functions
-- ---------------------------------------------------------------------------
create or replace function public.save_timetable_slot(
  p_id uuid,
  p_day text,
  p_period integer,
  p_faculty_id uuid,
  p_subject_id uuid,
  p_course text,
  p_semester integer,
  p_division text,
  p_room text
)
returns public.timetable_slots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.timetable_slots;
  v_subject public.subjects;
begin
  if not public.has_permission('academics.manage') then
    raise exception 'Academics management permission required';
  end if;
  if p_day not in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday') then
    raise exception 'Invalid day';
  end if;
  if p_period is null or p_period < 1 then
    raise exception 'Invalid period';
  end if;
  if length(trim(coalesce(p_course, ''))) < 1
    or p_semester is null
    or p_semester < 1
    or length(trim(coalesce(p_division, ''))) < 1 then
    raise exception 'Course, semester and division are required';
  end if;
  if not exists (select 1 from public.faculty where id = p_faculty_id) then
    raise exception 'Select a valid faculty member';
  end if;
  select * into v_subject from public.subjects where id = p_subject_id;
  if not found then
    raise exception 'Select a valid subject';
  end if;
  if v_subject.course <> trim(p_course) or v_subject.semester <> p_semester then
    raise exception 'Subject course/semester must match the slot';
  end if;
  if exists (
    select 1 from public.timetable_slots
    where faculty_id = p_faculty_id
      and day = p_day
      and period = p_period
      and (p_id is null or id <> p_id)
  ) then
    raise exception 'Faculty already has a lecture in this period';
  end if;
  if exists (
    select 1 from public.timetable_slots
    where course = trim(p_course)
      and semester = p_semester
      and division = trim(p_division)
      and day = p_day
      and period = p_period
      and (p_id is null or id <> p_id)
  ) then
    raise exception 'Class already has a lecture in this period';
  end if;

  if p_id is null then
    insert into public.timetable_slots (
      day, period, faculty_id, subject_id, course, semester, division, room
    )
    values (
      p_day, p_period, p_faculty_id, p_subject_id, trim(p_course), p_semester,
      trim(p_division), coalesce(trim(p_room), '')
    )
    returning * into v_slot;
  else
    update public.timetable_slots
    set
      day = p_day,
      period = p_period,
      faculty_id = p_faculty_id,
      subject_id = p_subject_id,
      course = trim(p_course),
      semester = p_semester,
      division = trim(p_division),
      room = coalesce(trim(p_room), '')
    where id = p_id
    returning * into v_slot;
    if not found then
      raise exception 'Slot not found';
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (auth.uid(), 'timetable.save', 'timetable_slots', v_slot.id::text);

  return v_slot;
end;
$$;

create or replace function public.delete_timetable_slot(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('academics.manage') then
    raise exception 'Academics management permission required';
  end if;
  if not exists (select 1 from public.timetable_slots where id = p_id) then
    raise exception 'Slot not found';
  end if;
  if exists (select 1 from public.lecture_proxies where slot_id = p_id)
    or exists (select 1 from public.lecture_attendance where slot_id = p_id) then
    raise exception 'Slot has proxy or attendance records and cannot be deleted';
  end if;

  delete from public.timetable_slots where id = p_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (auth.uid(), 'timetable.delete', 'timetable_slots', p_id::text);
end;
$$;

create or replace function public.apply_faculty_leave(
  p_faculty_id uuid,
  p_start_date date,
  p_end_date date,
  p_leave_type text,
  p_reason text
)
returns public.faculty_leaves
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_leave public.faculty_leaves;
begin
  if not (
    public.has_permission('academics.manage')
    or p_faculty_id = public.current_faculty_id()
  ) then
    raise exception 'Permission denied';
  end if;
  if not exists (select 1 from public.faculty where id = p_faculty_id) then
    raise exception 'Select a valid faculty member';
  end if;
  if p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date then
    raise exception 'Invalid leave dates';
  end if;
  if length(trim(coalesce(p_leave_type, ''))) < 2 then
    raise exception 'Leave type is required';
  end if;

  insert into public.faculty_leaves (
    faculty_id, start_date, end_date, leave_type, reason, status, created_by
  )
  values (
    p_faculty_id,
    p_start_date,
    p_end_date,
    trim(p_leave_type),
    nullif(trim(coalesce(p_reason, '')), ''),
    'pending',
    auth.uid()
  )
  returning * into v_leave;

  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (auth.uid(), 'faculty_leave.apply', 'faculty_leaves', v_leave.id::text);

  return v_leave;
end;
$$;

create or replace function public.decide_faculty_leave(p_leave_id uuid, p_decision text)
returns public.faculty_leaves
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_leave public.faculty_leaves;
begin
  if not public.has_permission('academics.manage') then
    raise exception 'Academics management permission required';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Invalid decision';
  end if;

  select * into v_leave
  from public.faculty_leaves
  where id = p_leave_id
  for update;
  if not found then
    raise exception 'Leave application not found';
  end if;
  if v_leave.status <> 'pending' then
    raise exception 'Leave application already decided';
  end if;

  update public.faculty_leaves
  set
    status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
    decided_by = auth.uid(),
    decided_at = now()
  where id = p_leave_id
  returning * into v_leave;

  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (
    auth.uid(),
    'faculty_leave.' || v_leave.status,
    'faculty_leaves',
    v_leave.id::text
  );

  return v_leave;
end;
$$;

create or replace function public.assign_lecture_proxy(
  p_slot_id uuid,
  p_lecture_date date,
  p_proxy_faculty_id uuid
)
returns public.lecture_proxies
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.timetable_slots;
  v_proxy public.lecture_proxies;
begin
  if not public.has_permission('academics.manage') then
    raise exception 'Academics management permission required';
  end if;
  select * into v_slot from public.timetable_slots where id = p_slot_id;
  if not found then
    raise exception 'Slot not found';
  end if;
  if not exists (select 1 from public.faculty where id = p_proxy_faculty_id) then
    raise exception 'Select a valid proxy faculty member';
  end if;
  if p_proxy_faculty_id = v_slot.faculty_id then
    raise exception 'Proxy must be a different faculty member';
  end if;
  if p_lecture_date is null then
    raise exception 'Lecture date is required';
  end if;
  if trim(to_char(p_lecture_date, 'Day')) <> v_slot.day then
    raise exception 'Date does not match the slot day';
  end if;
  if not exists (
    select 1 from public.faculty_leaves
    where faculty_id = v_slot.faculty_id
      and status = 'approved'
      and start_date <= p_lecture_date
      and end_date >= p_lecture_date
  ) then
    raise exception 'Original faculty has no approved leave covering this date';
  end if;
  if exists (
    select 1 from public.timetable_slots
    where faculty_id = p_proxy_faculty_id
      and day = v_slot.day
      and period = v_slot.period
  ) then
    raise exception 'Proxy faculty already has a lecture in this period';
  end if;
  if exists (
    select 1
    from public.lecture_proxies lp
    join public.timetable_slots s on s.id = lp.slot_id
    where lp.proxy_faculty_id = p_proxy_faculty_id
      and lp.lecture_date = p_lecture_date
      and lp.status = 'assigned'
      and s.period = v_slot.period
  ) then
    raise exception 'Proxy faculty already assigned in this period';
  end if;
  if exists (
    select 1 from public.lecture_proxies
    where slot_id = p_slot_id and lecture_date = p_lecture_date
  ) then
    raise exception 'Proxy already assigned for this lecture';
  end if;

  insert into public.lecture_proxies (
    slot_id, lecture_date, original_faculty_id, proxy_faculty_id, status, created_by
  )
  values (
    p_slot_id, p_lecture_date, v_slot.faculty_id, p_proxy_faculty_id, 'assigned', auth.uid()
  )
  returning * into v_proxy;

  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (auth.uid(), 'lecture_proxy.assign', 'lecture_proxies', v_proxy.id::text);

  return v_proxy;
end;
$$;

create or replace function public.cancel_lecture_proxy(p_proxy_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proxy public.lecture_proxies;
begin
  if not public.has_permission('academics.manage') then
    raise exception 'Academics management permission required';
  end if;

  select * into v_proxy
  from public.lecture_proxies
  where id = p_proxy_id
  for update;
  if not found then
    raise exception 'Proxy not found';
  end if;
  if v_proxy.status <> 'assigned' then
    raise exception 'Proxy already cancelled';
  end if;
  if exists (
    select 1 from public.lecture_attendance
    where slot_id = v_proxy.slot_id and lecture_date = v_proxy.lecture_date
  ) then
    raise exception 'Attendance already recorded; cannot cancel proxy';
  end if;

  update public.lecture_proxies
  set status = 'cancelled'
  where id = p_proxy_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (auth.uid(), 'lecture_proxy.cancel', 'lecture_proxies', p_proxy_id::text);
end;
$$;

create or replace function public.get_attendance_roster(p_slot_id uuid, p_lecture_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.timetable_slots;
  v_proxy public.lecture_proxies;
  v_taker uuid;
begin
  select * into v_slot from public.timetable_slots where id = p_slot_id;
  if not found then
    raise exception 'Slot not found';
  end if;
  if p_lecture_date is null or trim(to_char(p_lecture_date, 'Day')) <> v_slot.day then
    raise exception 'Date does not match the slot day';
  end if;

  select * into v_proxy
  from public.lecture_proxies
  where slot_id = p_slot_id and lecture_date = p_lecture_date and status = 'assigned';
  v_taker := coalesce(v_proxy.proxy_faculty_id, v_slot.faculty_id);

  if not (
    public.has_permission('academics.manage')
    or public.current_faculty_id() = v_taker
  ) then
    raise exception 'Only the assigned faculty can open this roster';
  end if;

  return jsonb_build_object(
    'type', case when v_proxy.id is null then 'REGULAR' else 'PROXY' end,
    'taken_by', v_taker,
    'subject_id', v_slot.subject_id,
    'submitted', exists (
      select 1 from public.lecture_attendance
      where slot_id = p_slot_id and lecture_date = p_lecture_date
    ),
    'students', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'enrollment', s.enrollment,
          'name', s.name,
          'present', a.present
        )
        order by s.enrollment
      )
      from public.students s
      left join public.lecture_attendance a
        on a.student_id = s.id
        and a.slot_id = p_slot_id
        and a.lecture_date = p_lecture_date
      where s.course = v_slot.course
        and s.semester = v_slot.semester
        and s.division = v_slot.division
        and s.active
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.submit_lecture_attendance(
  p_slot_id uuid,
  p_lecture_date date,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.timetable_slots;
  v_proxy public.lecture_proxies;
  v_taker uuid;
  v_roster uuid[];
  v_keys uuid[];
  v_count integer;
begin
  select * into v_slot from public.timetable_slots where id = p_slot_id;
  if not found then
    raise exception 'Slot not found';
  end if;
  if p_lecture_date is null or trim(to_char(p_lecture_date, 'Day')) <> v_slot.day then
    raise exception 'Date does not match the slot day';
  end if;

  select * into v_proxy
  from public.lecture_proxies
  where slot_id = p_slot_id and lecture_date = p_lecture_date and status = 'assigned';
  v_taker := coalesce(v_proxy.proxy_faculty_id, v_slot.faculty_id);

  if not (
    public.has_permission('academics.manage')
    or public.current_faculty_id() = v_taker
  ) then
    raise exception 'Only the assigned faculty can submit attendance';
  end if;
  if exists (
    select 1 from public.lecture_attendance
    where slot_id = p_slot_id and lecture_date = p_lecture_date
  ) then
    raise exception 'Attendance already submitted; no overwrite';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'object' then
    raise exception 'Invalid attendance payload';
  end if;

  select array_agg(id) into v_roster
  from public.students
  where course = v_slot.course
    and semester = v_slot.semester
    and division = v_slot.division
    and active;
  if v_roster is null then
    raise exception 'No active students in this class';
  end if;

  select array_agg(k::uuid) into v_keys from jsonb_object_keys(p_entries) as k;
  if v_keys is null
    or array_length(v_keys, 1) is distinct from array_length(v_roster, 1)
    or exists (select 1 from unnest(v_keys) as k where k <> all (v_roster)) then
    raise exception 'Submit attendance for the entire roster';
  end if;

  insert into public.lecture_attendance (
    slot_id, lecture_date, student_id, taken_by, attendance_type, present
  )
  select
    p_slot_id,
    p_lecture_date,
    e.key::uuid,
    v_taker,
    case when v_proxy.id is null then 'regular' else 'proxy' end,
    case when e.value = 'true'::jsonb then true else false end
  from jsonb_each(p_entries) as e;

  get diagnostics v_count = row_count;

  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (auth.uid(), 'attendance.submit', 'lecture_attendance', p_slot_id::text);

  return jsonb_build_object(
    'saved', v_count,
    'type', case when v_proxy.id is null then 'REGULAR' else 'PROXY' end
  );
end;
$$;

revoke all on function public.save_timetable_slot(
  uuid, text, integer, uuid, uuid, text, integer, text, text
) from public;
grant execute on function public.save_timetable_slot(
  uuid, text, integer, uuid, uuid, text, integer, text, text
) to authenticated;

revoke all on function public.delete_timetable_slot(uuid) from public;
grant execute on function public.delete_timetable_slot(uuid) to authenticated;

revoke all on function public.apply_faculty_leave(
  uuid, date, date, text, text
) from public;
grant execute on function public.apply_faculty_leave(
  uuid, date, date, text, text
) to authenticated;

revoke all on function public.decide_faculty_leave(uuid, text) from public;
grant execute on function public.decide_faculty_leave(uuid, text) to authenticated;

revoke all on function public.assign_lecture_proxy(uuid, date, uuid) from public;
grant execute on function public.assign_lecture_proxy(uuid, date, uuid) to authenticated;

revoke all on function public.cancel_lecture_proxy(uuid) from public;
grant execute on function public.cancel_lecture_proxy(uuid) to authenticated;

revoke all on function public.get_attendance_roster(uuid, date) from public;
grant execute on function public.get_attendance_roster(uuid, date) to authenticated;

revoke all on function public.submit_lecture_attendance(uuid, date, jsonb) from public;
grant execute on function public.submit_lecture_attendance(uuid, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Reporting view
-- ---------------------------------------------------------------------------
create or replace view public.lecture_attendance_report
with (security_invoker = true)
as
select
  a.id,
  a.lecture_date,
  s.day,
  s.period,
  s.course,
  s.semester,
  s.division,
  s.room,
  sub.code as subject_code,
  sub.name as subject_name,
  st.enrollment,
  st.name as student_name,
  a.attendance_type,
  a.present,
  a.taken_by,
  f.name as taken_by_name
from public.lecture_attendance a
join public.timetable_slots s on s.id = a.slot_id
join public.subjects sub on sub.id = s.subject_id
join public.students st on st.id = a.student_id
left join public.faculty f on f.id = a.taken_by;

grant select on public.lecture_attendance_report to authenticated;
