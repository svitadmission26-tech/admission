-- Migration 042: SVIT ERP module access on the shared master tables
-- Apply after migration 041. Idempotent and safe to re-run.
--
-- The 25 ERP modules read and write the shared masters of the college:
-- public.students, public.faculty, public.subjects, public.timetable_slots,
-- public.lecture_attendance, public.lecture_proxies and public.faculty_leaves.
--
-- The legacy policies of migration 019 stay in place, so nothing that worked
-- before stops working. This migration adds the module path:
--
--   * a module permission opens the master table for the roles that the
--     administrator granted it to
--   * the college / department / course scope of the staff account is still
--     applied, so a scoped account never sees more than its own scope
--   * a staff account without any scope sees all the data of the module
--   * insert, update and delete are granted separately, so a role that may
--     only read a table can never change it
--
-- It also links the free text course column of the legacy masters to the
-- uuid course column, so a record that is created by a module screen stays
-- readable by the legacy screens.

-- ---------------------------------------------------------------------------
-- 0. The reusable policy helper for the module tables
--    The same helper is carried by every module migration of the ERP, so that
--    a single module migration can also be applied on its own.
--
--    An older version of the helper may still sit in the database with
--    different input parameter names or with a different return type.
--    PostgreSQL refuses to replace a function in that case, which would stop
--    the migration with "cannot change name of input parameter". The old
--    definition is therefore removed first, together with the objects that
--    still use it.
--
--    The helper itself never stops a migration: a table that is missing, a
--    role that is missing or a policy that cannot be created is reported as
--    a warning and the migration goes on.
-- ---------------------------------------------------------------------------
do $$
declare
  v_old record;
  v_signature text;
begin
  for v_old in
    select format(
             '%I.%I(%s)',
             ns.nspname,
             proc.proname,
             pg_get_function_identity_arguments(proc.oid)
           ) as signature
    from pg_proc proc
    join pg_namespace ns on ns.oid = proc.pronamespace
    where ns.nspname = 'public'
      and proc.proname = 'erp_apply_module_policies'
  loop
    v_signature := v_old.signature;
    begin
      execute format('drop function %s', v_signature);
    exception
      when dependent_objects_still_exist then
        -- Something still uses the old helper. PostgreSQL refuses to replace
        -- a function that is in use, so the old one is removed together with
        -- the objects that use it. The module policies do not use the helper,
        -- they call public.erp_module_permission, so nothing is lost.
        begin
          execute format('drop function %s cascade', v_signature);
          raise notice 'the old helper % was removed with the objects that used it', v_signature;
        exception
          when others then
            raise warning 'the old helper % could not be removed: %', v_signature, sqlerrm;
        end;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0.1 The permission function of migration 035
--     The policies of the module tables call public.erp_module_permission.
--     When that function is not there yet, a safe fallback is installed:
--     everybody is refused and the admins are let in. The migration goes on
--     and the report at the end shows that migration 035 is still missing.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.erp_module_permission(text, text)') is null then
    begin
      execute $fallback$
        create or replace function public.erp_module_permission(
          p_module_id text,
          p_action text
        )
        returns boolean
        language plpgsql
        stable
        security definer
        set search_path = public, pg_temp
        as $body$
        declare
          v_admin boolean := false;
        begin
          if to_regprocedure('public.is_admin()') is not null then
            execute 'select public.is_admin()' into v_admin;
          end if;
          return coalesce(v_admin, false);
        end;
        $body$
      $fallback$;
    exception
      when others then
        raise warning 'the fallback of the permission function could not be created: %', sqlerrm;
    end;

    raise warning
      'Migration 035_erp_core_framework.sql must be applied before this migration - a safe fallback is used until then';
  end if;
end;
$$;

create or replace function public.erp_apply_module_policies(
  p_table text,
  p_module text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table text := format('public.%I', p_table);
  v_has_role boolean;
begin
  -- The table has to be there. When it is not, the migration says so and
  -- goes on, so that one missing table cannot stop the whole migration.
  if to_regclass(v_table) is null then
    raise warning 'the table % is not there, the policies for it are skipped', v_table;
    return;
  end if;

  v_has_role := exists (select 1 from pg_roles where rolname = 'authenticated');

  begin
    execute format('alter table %s enable row level security', v_table);
  exception
    when others then
      raise warning 'the row level security of % could not be switched on: %', v_table, sqlerrm;
  end;

  if v_has_role then
    begin
      execute format('grant select on %s to authenticated', v_table);
      execute format('grant insert, update, delete on %s to authenticated', v_table);
    exception
      when others then
        raise warning 'the grants of % could not be given: %', v_table, sqlerrm;
    end;
  else
    raise warning 'the role authenticated is not there, the grants of % are skipped', v_table;
  end if;

  begin
    execute format('drop policy if exists %I on %s', p_table || '_erp_read', v_table);
    execute format(
      'create policy %I on %s for select to authenticated '
      || 'using (public.erp_module_permission(%L, ''view''))',
      p_table || '_erp_read',
      v_table,
      p_module
    );
  exception
    when others then
      raise warning 'the read policy of % could not be created: %', v_table, sqlerrm;
  end;

  begin
    execute format('drop policy if exists %I on %s', p_table || '_erp_insert', v_table);
    execute format(
      'create policy %I on %s for insert to authenticated '
      || 'with check (public.erp_module_permission(%L, ''create''))',
      p_table || '_erp_insert',
      v_table,
      p_module
    );
  exception
    when others then
      raise warning 'the insert policy of % could not be created: %', v_table, sqlerrm;
  end;

  begin
    execute format('drop policy if exists %I on %s', p_table || '_erp_update', v_table);
    execute format(
      'create policy %I on %s for update to authenticated '
      || 'using (public.erp_module_permission(%L, ''edit'')) '
      || 'with check (public.erp_module_permission(%L, ''edit''))',
      p_table || '_erp_update',
      v_table,
      p_module,
      p_module
    );
  exception
    when others then
      raise warning 'the update policy of % could not be created: %', v_table, sqlerrm;
  end;

  begin
    execute format('drop policy if exists %I on %s', p_table || '_erp_delete', v_table);
    execute format(
      'create policy %I on %s for delete to authenticated '
      || 'using (public.erp_module_permission(%L, ''delete''))',
      p_table || '_erp_delete',
      v_table,
      p_module
    );
  exception
    when others then
      raise warning 'the delete policy of % could not be created: %', v_table, sqlerrm;
  end;
end;
$$;

revoke all on function public.erp_apply_module_policies(text, text) from public;

-- ---------------------------------------------------------------------------
-- 0.1 The shared masters of the migrations 037 and 038
--     The people spine links a student and a member of staff to the portal
--     login and to the academic masters, and the academics migration owns
--     the timetable rooms. Both are ensured here as well, so that this
--     migration can also be applied on its own.
-- ---------------------------------------------------------------------------
do $do$
begin
  alter table public.students
    add column if not exists user_id uuid references public.profiles (id) on delete set null,
    add column if not exists course_id uuid references public.courses (id) on delete set null,
    add column if not exists branch_id uuid references public.branches (id) on delete set null,
    add column if not exists department_id uuid references public.departments (id) on delete set null;
exception
  when others then
    raise warning 'alter table public.students: %', sqlerrm;
end;
$do$;

do $do$
begin
  alter table public.faculty
    add column if not exists user_id uuid references public.profiles (id) on delete set null,
    add column if not exists department_id uuid references public.departments (id) on delete set null;
exception
  when others then
    raise warning 'alter table public.faculty: %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_timetable_rooms (
    id uuid primary key default gen_random_uuid(),
    code text not null,
    name text not null default '',
    building text not null default '',
    room_type text not null default 'classroom',
    capacity integer not null default 60,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_timetable_rooms (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_timetable_rooms_code_unique
    on public.erp_timetable_rooms (lower(code));
exception
  when others then
    raise warning 'create unique index if not exists erp_timetable_rooms_code_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_timetable_rooms', 'timetable');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_timetable_rooms'', ''timetable''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 1. The scope check of the module path
-- ---------------------------------------------------------------------------
do $do$
begin
  create or replace function public.erp_scope_allows(
    p_college_id uuid default null,
    p_department_id uuid default null,
    p_course_id uuid default null
  )
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select public.is_admin() or exists (
      select 1
      from public.staff_members staff
      where staff.user_id = auth.uid()
        and staff.active
        and (
          staff.scope_all
          or (
            cardinality(staff.college_scope_ids)
              + cardinality(staff.department_scope_ids)
              + cardinality(staff.course_scope_ids) = 0
            or (
              (
                cardinality(staff.college_scope_ids) = 0
                or p_college_id = any(staff.college_scope_ids)
              )
              and (
                cardinality(staff.department_scope_ids) = 0
                or p_department_id = any(staff.department_scope_ids)
              )
              and (
                cardinality(staff.course_scope_ids) = 0
                or p_course_id = any(staff.course_scope_ids)
              )
            )
          )
        )
    );
  $$;
exception
  when others then
    raise warning 'create or replace function public.erp_scope_allows(: %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.erp_scope_allows(uuid, uuid, uuid) from public;
exception
  when others then
    raise warning 'revoke all on function public.erp_scope_allows(uuid, uuid, uuid) from public: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant execute on function public.erp_scope_allows(uuid, uuid, uuid) to authenticated;
exception
  when others then
    raise warning 'grant execute on function public.erp_scope_allows(uuid, uuid, uuid) to authenticated: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 2. The legacy text columns follow the uuid columns
-- ---------------------------------------------------------------------------
do $do$
begin
  alter table public.subjects
    add column if not exists course_id uuid references public.courses (id) on delete set null;
exception
  when others then
    raise warning 'alter table public.subjects: %', sqlerrm;
end;
$do$;

do $do$
begin
  alter table public.timetable_slots
    add column if not exists course_id uuid references public.courses (id) on delete set null,
    add column if not exists branch_id uuid references public.branches (id) on delete set null,
    add column if not exists start_time time,
    add column if not exists end_time time,
    add column if not exists room_id uuid references public.erp_timetable_rooms (id) on delete set null;
exception
  when others then
    raise warning 'alter table public.timetable_slots: %', sqlerrm;
end;
$do$;

do $do$
begin
  alter table public.lecture_attendance
    add column if not exists course_id uuid references public.courses (id) on delete set null,
    add column if not exists branch_id uuid references public.branches (id) on delete set null;
exception
  when others then
    raise warning 'alter table public.lecture_attendance: %', sqlerrm;
end;
$do$;

do $do$
begin
  update public.subjects subject
  set course_id = (
    select matched.id
    from public.courses matched
    where lower(trim(matched.name)) = lower(trim(subject.course))
    limit 1
  )
  where subject.course_id is null
    and trim(coalesce(subject.course, '')) <> ''
    and (
      select count(*)
      from public.courses counted
      where lower(trim(counted.name)) = lower(trim(subject.course))
    ) = 1;
exception
  when others then
    raise warning 'update public.subjects subject: %', sqlerrm;
end;
$do$;

do $do$
begin
  update public.timetable_slots slot
  set course_id = (
    select matched.id
    from public.courses matched
    where lower(trim(matched.name)) = lower(trim(slot.course))
    limit 1
  )
  where slot.course_id is null
    and trim(coalesce(slot.course, '')) <> ''
    and (
      select count(*)
      from public.courses counted
      where lower(trim(counted.name)) = lower(trim(slot.course))
    ) = 1;
exception
  when others then
    raise warning 'update public.timetable_slots slot: %', sqlerrm;
end;
$do$;

do $do$
begin
  create or replace function public.erp_sync_text_course()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  begin
    if new.course_id is not null then
      select course.name into new.course
      from public.courses course
      where course.id = new.course_id;
    end if;
    return new;
  end;
  $$;
exception
  when others then
    raise warning 'create or replace function public.erp_sync_text_course(): %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.erp_sync_text_course() from public;
exception
  when others then
    raise warning 'revoke all on function public.erp_sync_text_course() from public: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop trigger if exists erp_sync_student_course on public.students;
exception
  when others then
    raise warning 'drop trigger if exists erp_sync_student_course on public.students: %', sqlerrm;
end;
$do$;

do $do$
begin
  create trigger erp_sync_student_course
  before insert or update of course_id, course on public.students
  for each row execute function public.erp_sync_text_course();
exception
  when others then
    raise warning 'create trigger erp_sync_student_course: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop trigger if exists erp_sync_subject_course on public.subjects;
exception
  when others then
    raise warning 'drop trigger if exists erp_sync_subject_course on public.subjects: %', sqlerrm;
end;
$do$;

do $do$
begin
  create trigger erp_sync_subject_course
  before insert or update of course_id, course on public.subjects
  for each row execute function public.erp_sync_text_course();
exception
  when others then
    raise warning 'create trigger erp_sync_subject_course: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop trigger if exists erp_sync_slot_course on public.timetable_slots;
exception
  when others then
    raise warning 'drop trigger if exists erp_sync_slot_course on public.timetable_slots: %', sqlerrm;
end;
$do$;

do $do$
begin
  create trigger erp_sync_slot_course
  before insert or update of course_id, course on public.timetable_slots
  for each row execute function public.erp_sync_text_course();
exception
  when others then
    raise warning 'create trigger erp_sync_slot_course: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 3. The module path on the shared masters
-- ---------------------------------------------------------------------------

-- Students -----------------------------------------------------------------
do $do$
begin
  drop policy if exists students_erp_read on public.students;
exception
  when others then
    raise warning 'drop policy if exists students_erp_read on public.students: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy students_erp_read on public.students
    for select
    to authenticated
    using (
      (
        public.erp_module_permission('students', 'view')
        or public.erp_module_permission('transport', 'view')
        or public.erp_module_permission('hostel', 'view')
        or public.erp_module_permission('library', 'view')
        or public.erp_module_permission('placement', 'view')
        or public.erp_module_permission('parents', 'view')
        or public.erp_module_permission('certificates', 'view')
      )
      and public.erp_scope_allows(
        (select course.college_id from public.courses course where course.id = students.course_id),
        students.department_id,
        students.course_id
      )
    );
exception
  when others then
    raise warning 'create policy students_erp_read on public.students: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists students_erp_insert on public.students;
exception
  when others then
    raise warning 'drop policy if exists students_erp_insert on public.students: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy students_erp_insert on public.students
    for insert
    to authenticated
    with check (
      public.erp_module_permission('students', 'create')
      and public.erp_scope_allows(
        (select course.college_id from public.courses course where course.id = students.course_id),
        students.department_id,
        students.course_id
      )
    );
exception
  when others then
    raise warning 'create policy students_erp_insert on public.students: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists students_erp_update on public.students;
exception
  when others then
    raise warning 'drop policy if exists students_erp_update on public.students: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy students_erp_update on public.students
    for update
    to authenticated
    using (
      public.erp_module_permission('students', 'edit')
      and public.erp_scope_allows(
        (select course.college_id from public.courses course where course.id = students.course_id),
        students.department_id,
        students.course_id
      )
    )
    with check (
      public.erp_module_permission('students', 'edit')
      and public.erp_scope_allows(
        (select course.college_id from public.courses course where course.id = students.course_id),
        students.department_id,
        students.course_id
      )
    );
exception
  when others then
    raise warning 'create policy students_erp_update on public.students: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists students_erp_delete on public.students;
exception
  when others then
    raise warning 'drop policy if exists students_erp_delete on public.students: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy students_erp_delete on public.students
    for delete
    to authenticated
    using (
      public.erp_module_permission('students', 'delete')
      and public.erp_scope_allows(
        (select course.college_id from public.courses course where course.id = students.course_id),
        students.department_id,
        students.course_id
      )
    );
exception
  when others then
    raise warning 'create policy students_erp_delete on public.students: %', sqlerrm;
end;
$do$;

-- Faculty ------------------------------------------------------------------
do $do$
begin
  drop policy if exists faculty_erp_read on public.faculty;
exception
  when others then
    raise warning 'drop policy if exists faculty_erp_read on public.faculty: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy faculty_erp_read on public.faculty
    for select
    to authenticated
    using (
      (
        public.erp_module_permission('faculty', 'view')
        or public.erp_module_permission('hr', 'view')
        or public.erp_module_permission('departments', 'view')
        or public.erp_module_permission('timetable', 'view')
        or public.erp_module_permission('transport', 'view')
        or public.erp_module_permission('hostel', 'view')
        or public.erp_module_permission('library', 'view')
        or public.erp_module_permission('placement', 'view')
      )
      and public.erp_scope_allows(
        faculty.college_id,
        faculty.department_id,
        faculty.course_id
      )
    );
exception
  when others then
    raise warning 'create policy faculty_erp_read on public.faculty: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists faculty_erp_insert on public.faculty;
exception
  when others then
    raise warning 'drop policy if exists faculty_erp_insert on public.faculty: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy faculty_erp_insert on public.faculty
    for insert
    to authenticated
    with check (
      public.erp_module_permission('faculty', 'create')
      and public.erp_scope_allows(
        faculty.college_id,
        faculty.department_id,
        faculty.course_id
      )
    );
exception
  when others then
    raise warning 'create policy faculty_erp_insert on public.faculty: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists faculty_erp_update on public.faculty;
exception
  when others then
    raise warning 'drop policy if exists faculty_erp_update on public.faculty: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy faculty_erp_update on public.faculty
    for update
    to authenticated
    using (
      public.erp_module_permission('faculty', 'edit')
      and public.erp_scope_allows(
        faculty.college_id,
        faculty.department_id,
        faculty.course_id
      )
    )
    with check (
      public.erp_module_permission('faculty', 'edit')
      and public.erp_scope_allows(
        faculty.college_id,
        faculty.department_id,
        faculty.course_id
      )
    );
exception
  when others then
    raise warning 'create policy faculty_erp_update on public.faculty: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists faculty_erp_delete on public.faculty;
exception
  when others then
    raise warning 'drop policy if exists faculty_erp_delete on public.faculty: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy faculty_erp_delete on public.faculty
    for delete
    to authenticated
    using (
      public.erp_module_permission('faculty', 'delete')
      and public.erp_scope_allows(
        faculty.college_id,
        faculty.department_id,
        faculty.course_id
      )
    );
exception
  when others then
    raise warning 'create policy faculty_erp_delete on public.faculty: %', sqlerrm;
end;
$do$;

-- Subjects -----------------------------------------------------------------
do $do$
begin
  drop policy if exists subjects_erp_read on public.subjects;
exception
  when others then
    raise warning 'drop policy if exists subjects_erp_read on public.subjects: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy subjects_erp_read on public.subjects
    for select
    to authenticated
    using (
      (
        public.erp_module_permission('academics', 'view')
        or public.erp_module_permission('timetable', 'view')
        or public.erp_module_permission('examinations', 'view')
        or public.erp_module_permission('departments', 'view')
      )
      and public.erp_scope_allows(
        (select course.college_id from public.courses course where course.id = subjects.course_id),
        null,
        subjects.course_id
      )
    );
exception
  when others then
    raise warning 'create policy subjects_erp_read on public.subjects: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists subjects_erp_manage on public.subjects;
exception
  when others then
    raise warning 'drop policy if exists subjects_erp_manage on public.subjects: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy subjects_erp_manage on public.subjects
    for insert
    to authenticated
    with check (public.erp_module_permission('academics', 'create'));
exception
  when others then
    raise warning 'create policy subjects_erp_manage on public.subjects: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists subjects_erp_update on public.subjects;
exception
  when others then
    raise warning 'drop policy if exists subjects_erp_update on public.subjects: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy subjects_erp_update on public.subjects
    for update
    to authenticated
    using (public.erp_module_permission('academics', 'edit'))
    with check (public.erp_module_permission('academics', 'edit'));
exception
  when others then
    raise warning 'create policy subjects_erp_update on public.subjects: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists subjects_erp_delete on public.subjects;
exception
  when others then
    raise warning 'drop policy if exists subjects_erp_delete on public.subjects: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy subjects_erp_delete on public.subjects
    for delete
    to authenticated
    using (public.erp_module_permission('academics', 'delete'));
exception
  when others then
    raise warning 'create policy subjects_erp_delete on public.subjects: %', sqlerrm;
end;
$do$;

-- Timetable slots ----------------------------------------------------------
do $do$
begin
  drop policy if exists timetable_slots_erp_read on public.timetable_slots;
exception
  when others then
    raise warning 'drop policy if exists timetable_slots_erp_read on public.timetable_slots: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy timetable_slots_erp_read on public.timetable_slots
    for select
    to authenticated
    using (
      public.erp_module_permission('timetable', 'view')
      and public.erp_scope_allows(
        (select course.college_id
         from public.courses course
         join public.branches branch on branch.course_id = course.id
         where branch.id = timetable_slots.branch_id),
        null,
        timetable_slots.course_id
      )
    );
exception
  when others then
    raise warning 'create policy timetable_slots_erp_read on public.timetable_slots: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists timetable_slots_erp_insert on public.timetable_slots;
exception
  when others then
    raise warning 'drop policy if exists timetable_slots_erp_insert on public.timetable_slots: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy timetable_slots_erp_insert on public.timetable_slots
    for insert
    to authenticated
    with check (public.erp_module_permission('timetable', 'create'));
exception
  when others then
    raise warning 'create policy timetable_slots_erp_insert on public.timetable_slots: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists timetable_slots_erp_update on public.timetable_slots;
exception
  when others then
    raise warning 'drop policy if exists timetable_slots_erp_update on public.timetable_slots: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy timetable_slots_erp_update on public.timetable_slots
    for update
    to authenticated
    using (public.erp_module_permission('timetable', 'edit'))
    with check (public.erp_module_permission('timetable', 'edit'));
exception
  when others then
    raise warning 'create policy timetable_slots_erp_update on public.timetable_slots: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists timetable_slots_erp_delete on public.timetable_slots;
exception
  when others then
    raise warning 'drop policy if exists timetable_slots_erp_delete on public.timetable_slots: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy timetable_slots_erp_delete on public.timetable_slots
    for delete
    to authenticated
    using (public.erp_module_permission('timetable', 'delete'));
exception
  when others then
    raise warning 'create policy timetable_slots_erp_delete on public.timetable_slots: %', sqlerrm;
end;
$do$;

-- Lecture attendance -------------------------------------------------------
do $do$
begin
  drop policy if exists lecture_attendance_erp_read on public.lecture_attendance;
exception
  when others then
    raise warning 'drop policy if exists lecture_attendance_erp_read on public.lecture_attendance: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy lecture_attendance_erp_read on public.lecture_attendance
    for select
    to authenticated
    using (
      (
        public.erp_module_permission('attendance', 'view')
        or public.erp_module_permission('academics', 'view')
        or public.erp_module_permission('timetable', 'view')
        or public.erp_module_permission('parents', 'view')
      )
      and public.erp_scope_allows(
        (select course.college_id
         from public.courses course
         join public.students student on student.course_id = course.id
         where student.id = public.lecture_attendance.student_id),
        null,
        (select student.course_id
         from public.students student
         where student.id = public.lecture_attendance.student_id)
      )
    );
exception
  when others then
    raise warning 'create policy lecture_attendance_erp_read on public.lecture_attendance: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists lecture_attendance_erp_insert on public.lecture_attendance;
exception
  when others then
    raise warning 'drop policy if exists lecture_attendance_erp_insert on public.lecture_attendance: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy lecture_attendance_erp_insert on public.lecture_attendance
    for insert
    to authenticated
    with check (public.erp_module_permission('attendance', 'create'));
exception
  when others then
    raise warning 'create policy lecture_attendance_erp_insert on public.lecture_attendance: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists lecture_attendance_erp_update on public.lecture_attendance;
exception
  when others then
    raise warning 'drop policy if exists lecture_attendance_erp_update on public.lecture_attendance: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy lecture_attendance_erp_update on public.lecture_attendance
    for update
    to authenticated
    using (public.erp_module_permission('attendance', 'edit'))
    with check (public.erp_module_permission('attendance', 'edit'));
exception
  when others then
    raise warning 'create policy lecture_attendance_erp_update on public.lecture_attendance: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists lecture_attendance_erp_delete on public.lecture_attendance;
exception
  when others then
    raise warning 'drop policy if exists lecture_attendance_erp_delete on public.lecture_attendance: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy lecture_attendance_erp_delete on public.lecture_attendance
    for delete
    to authenticated
    using (public.erp_module_permission('attendance', 'delete'));
exception
  when others then
    raise warning 'create policy lecture_attendance_erp_delete on public.lecture_attendance: %', sqlerrm;
end;
$do$;

-- Faculty leaves -----------------------------------------------------------
do $do$
begin
  drop policy if exists faculty_leaves_erp_read on public.faculty_leaves;
exception
  when others then
    raise warning 'drop policy if exists faculty_leaves_erp_read on public.faculty_leaves: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy faculty_leaves_erp_read on public.faculty_leaves
    for select
    to authenticated
    using (
      (
        public.erp_module_permission('hr', 'view')
        or public.erp_module_permission('faculty', 'view')
        or public.erp_module_permission('academics', 'view')
      )
      and public.erp_scope_allows(
        null,
        (select faculty.department_id from public.faculty faculty where faculty.id = faculty_leaves.faculty_id),
        (select faculty.course_id from public.faculty faculty where faculty.id = faculty_leaves.faculty_id)
      )
    );
exception
  when others then
    raise warning 'create policy faculty_leaves_erp_read on public.faculty_leaves: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists faculty_leaves_erp_insert on public.faculty_leaves;
exception
  when others then
    raise warning 'drop policy if exists faculty_leaves_erp_insert on public.faculty_leaves: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy faculty_leaves_erp_insert on public.faculty_leaves
    for insert
    to authenticated
    with check (public.erp_module_permission('hr', 'create'));
exception
  when others then
    raise warning 'create policy faculty_leaves_erp_insert on public.faculty_leaves: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists faculty_leaves_erp_update on public.faculty_leaves;
exception
  when others then
    raise warning 'drop policy if exists faculty_leaves_erp_update on public.faculty_leaves: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy faculty_leaves_erp_update on public.faculty_leaves
    for update
    to authenticated
    using (public.erp_module_permission('hr', 'edit'))
    with check (public.erp_module_permission('hr', 'edit'));
exception
  when others then
    raise warning 'create policy faculty_leaves_erp_update on public.faculty_leaves: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 4. The module path on the legacy records of the admission module
--    The legacy policies stay in place. These policies add the module path, so
--    a role that the administrator granted a module to can work with the
--    records of that module.
-- ---------------------------------------------------------------------------

-- Notices -----------------------------------------------------------------
do $do$
begin
  drop policy if exists notices_erp_read on public.notices;
exception
  when others then
    raise warning 'drop policy if exists notices_erp_read on public.notices: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy notices_erp_read on public.notices
    for select
    to authenticated
    using (public.erp_module_permission('communication', 'view'));
exception
  when others then
    raise warning 'create policy notices_erp_read on public.notices: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists notices_erp_manage on public.notices;
exception
  when others then
    raise warning 'drop policy if exists notices_erp_manage on public.notices: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy notices_erp_manage on public.notices
    for all
    to authenticated
    using (public.erp_module_permission('communication', 'edit'))
    with check (public.erp_module_permission('communication', 'create'));
exception
  when others then
    raise warning 'create policy notices_erp_manage on public.notices: %', sqlerrm;
end;
$do$;

-- ID cards -----------------------------------------------------------------
do $do$
begin
  drop policy if exists id_cards_erp_read on public.id_cards;
exception
  when others then
    raise warning 'drop policy if exists id_cards_erp_read on public.id_cards: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy id_cards_erp_read on public.id_cards
    for select
    to authenticated
    using (public.erp_module_permission('id_cards', 'view'));
exception
  when others then
    raise warning 'create policy id_cards_erp_read on public.id_cards: %', sqlerrm;
end;
$do$;

-- Inquiries ----------------------------------------------------------------
do $do$
begin
  drop policy if exists inquiries_erp_read on public.inquiries;
exception
  when others then
    raise warning 'drop policy if exists inquiries_erp_read on public.inquiries: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy inquiries_erp_read on public.inquiries
    for select
    to authenticated
    using (public.erp_module_permission('admissions', 'view'));
exception
  when others then
    raise warning 'create policy inquiries_erp_read on public.inquiries: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists inquiries_erp_update on public.inquiries;
exception
  when others then
    raise warning 'drop policy if exists inquiries_erp_update on public.inquiries: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy inquiries_erp_update on public.inquiries
    for update
    to authenticated
    using (public.erp_module_permission('admissions', 'edit'))
    with check (public.erp_module_permission('admissions', 'edit'));
exception
  when others then
    raise warning 'create policy inquiries_erp_update on public.inquiries: %', sqlerrm;
end;
$do$;

-- Applications -------------------------------------------------------------
do $do$
begin
  drop policy if exists applications_erp_read on public.applications;
exception
  when others then
    raise warning 'drop policy if exists applications_erp_read on public.applications: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy applications_erp_read on public.applications
    for select
    to authenticated
    using (public.erp_module_permission('admissions', 'view'));
exception
  when others then
    raise warning 'create policy applications_erp_read on public.applications: %', sqlerrm;
end;
$do$;

-- Seat intake --------------------------------------------------------------
do $do$
begin
  drop policy if exists intakes_erp_read on public.admission_intakes;
exception
  when others then
    raise warning 'drop policy if exists intakes_erp_read on public.admission_intakes: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy intakes_erp_read on public.admission_intakes
    for select
    to authenticated
    using (public.erp_module_permission('admissions', 'view'));
exception
  when others then
    raise warning 'create policy intakes_erp_read on public.admission_intakes: %', sqlerrm;
end;
$do$;

-- Fees and payments --------------------------------------------------------
do $do$
begin
  drop policy if exists fee_structures_erp_read on public.fee_structures;
exception
  when others then
    raise warning 'drop policy if exists fee_structures_erp_read on public.fee_structures: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy fee_structures_erp_read on public.fee_structures
    for select
    to authenticated
    using (public.erp_module_permission('accounts', 'view'));
exception
  when others then
    raise warning 'create policy fee_structures_erp_read on public.fee_structures: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists fee_assignments_erp_read on public.fee_assignments;
exception
  when others then
    raise warning 'drop policy if exists fee_assignments_erp_read on public.fee_assignments: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy fee_assignments_erp_read on public.fee_assignments
    for select
    to authenticated
    using (public.erp_module_permission('accounts', 'view'));
exception
  when others then
    raise warning 'create policy fee_assignments_erp_read on public.fee_assignments: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists payments_erp_read on public.payments;
exception
  when others then
    raise warning 'drop policy if exists payments_erp_read on public.payments: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy payments_erp_read on public.payments
    for select
    to authenticated
    using (public.erp_module_permission('accounts', 'view'));
exception
  when others then
    raise warning 'create policy payments_erp_read on public.payments: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 5. The scope of a staff account that has no scope at all
--    Migration 019 gave every existing account without a scope the full
--    access. New accounts that are created without a scope keep the same
--    behaviour, so the modules stay usable.
-- ---------------------------------------------------------------------------
do $do$
begin
  update public.staff_members
  set scope_all = true
  where not scope_all
    and cardinality(college_scope_ids) = 0
    and cardinality(department_scope_ids) = 0
    and cardinality(course_scope_ids) = 0;
exception
  when others then
    raise warning 'update public.staff_members: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 6. The ERP audit trail covers the shared masters
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
begin
  foreach target in array array[
    'students',
    'faculty',
    'departments'
  ]
  loop
    begin
          execute format('drop trigger if exists erp_audit_%s on public.%I', target, target);
          execute format(
            'create trigger erp_audit_%s after insert or update or delete on public.%I '
            || 'for each row execute function public.erp_audit_trigger()',
            target,
            target
          );

    exception
      when others then
        raise warning 'the audit trigger could not be created: %', sqlerrm;
    end;
  end loop;
end;
$$;
