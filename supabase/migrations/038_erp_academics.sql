-- Migration 038: SVIT ERP academics, timetable and attendance
-- Apply after migration 037. Idempotent and safe to re-run.
--
-- Adds the tables the Academic Management, Timetable Management and
-- Attendance Management modules need. Every table links to the shared
-- students / faculty / courses / subjects masters, never to a copy.

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
-- 0.1 The shared student master of migration 037
--     The people spine links a student to the portal login. The link is
--     ensured here as well, so that this migration can also be applied on
--     its own, without migration 037.
-- ---------------------------------------------------------------------------
do $do$
begin
  alter table public.students
    add column if not exists user_id uuid references public.profiles (id) on delete set null;
exception
  when others then
    raise warning 'alter table public.students: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 1. Academic management
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_semesters (
    id uuid primary key default gen_random_uuid(),
    academic_year text not null default '',
    name text not null,
    number integer not null default 1,
    starts_on date,
    ends_on date,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_semesters (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_semesters_unique
    on public.erp_semesters (academic_year, number);
exception
  when others then
    raise warning 'create unique index if not exists erp_semesters_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_semesters', 'academics');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_semesters'', ''academics''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_curriculum (
    id uuid primary key default gen_random_uuid(),
    course_id uuid references public.courses (id) on delete cascade,
    branch_id uuid references public.branches (id) on delete cascade,
    semester integer not null default 1,
    subject_id uuid references public.subjects (id) on delete cascade,
    subject_code text not null default '',
    subject_name text not null default '',
    course_type text not null default 'core',
    credits numeric not null default 0,
    lecture_hours numeric not null default 0,
    lab_hours numeric not null default 0,
    academic_year text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_curriculum (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_curriculum_unique
    on public.erp_curriculum (
      coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
      semester,
      subject_code
    );
exception
  when others then
    raise warning 'create unique index if not exists erp_curriculum_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_curriculum', 'academics');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_curriculum'', ''academics''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_course_outcomes (
    id uuid primary key default gen_random_uuid(),
    course_id uuid references public.courses (id) on delete cascade,
    branch_id uuid references public.branches (id) on delete cascade,
    code text not null,
    title text not null,
    description text not null default '',
    blooms_level text not null default 'understand',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_course_outcomes (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_course_outcomes_unique
    on public.erp_course_outcomes (
      coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
      code
    );
exception
  when others then
    raise warning 'create unique index if not exists erp_course_outcomes_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_course_outcomes', 'academics');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_course_outcomes'', ''academics''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_credit_rules (
    id uuid primary key default gen_random_uuid(),
    course_id uuid references public.courses (id) on delete cascade,
    branch_id uuid references public.branches (id) on delete cascade,
    academic_year text not null default '',
    min_credits numeric not null default 0,
    max_credits numeric not null default 0,
    mandatory_credits numeric not null default 0,
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_credit_rules (: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_credit_rules', 'academics');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_credit_rules'', ''academics''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_academic_records (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students (id) on delete cascade,
    academic_year text not null default '',
    semester integer not null default 1,
    credits_earned numeric not null default 0,
    cgpa numeric not null default 0,
    attendance_percentage numeric not null default 0,
    status text not null default 'regular',
    remarks text not null default '',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_academic_records (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_academic_records_unique
    on public.erp_academic_records (student_id, academic_year, semester);
exception
  when others then
    raise warning 'create unique index if not exists erp_academic_records_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_academic_records_own_read on public.erp_academic_records;
exception
  when others then
    raise warning 'drop policy if exists erp_academic_records_own_read on public.erp_academic_records: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_academic_records_own_read on public.erp_academic_records
    for select
    to authenticated
    using (
      exists (
        select 1 from public.students student
        where student.id = erp_academic_records.student_id
          and student.user_id = auth.uid()
      )
    );
exception
  when others then
    raise warning 'create policy erp_academic_records_own_read on public.erp_academic_records: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_academic_records', 'academics');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_academic_records'', ''academics''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 2. Timetable management
-- ---------------------------------------------------------------------------
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

do $do$
begin
  create table if not exists public.erp_timetable_substitutions (
    id uuid primary key default gen_random_uuid(),
    timetable_slot_id uuid not null references public.timetable_slots (id) on delete cascade,
    substitute_faculty_id uuid references public.faculty (id) on delete set null,
    substitution_date date not null default current_date,
    reason text not null default '',
    status text not null default 'scheduled',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_timetable_substitutions (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_timetable_substitutions_slot_idx
    on public.erp_timetable_substitutions (timetable_slot_id);
exception
  when others then
    raise warning 'create index if not exists erp_timetable_substitutions_slot_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_timetable_substitutions', 'timetable');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_timetable_substitutions'', ''timetable''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 3. Attendance management
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_faculty_attendance (
    id uuid primary key default gen_random_uuid(),
    faculty_id uuid not null references public.faculty (id) on delete cascade,
    attendance_date date not null default current_date,
    status text not null default 'present',
    check_in time,
    check_out time,
    remarks text not null default '',
    recorded_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_faculty_attendance (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_faculty_attendance_unique
    on public.erp_faculty_attendance (faculty_id, attendance_date);
exception
  when others then
    raise warning 'create unique index if not exists erp_faculty_attendance_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_faculty_attendance', 'attendance');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_faculty_attendance'', ''attendance''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_attendance_regularisation (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students (id) on delete cascade,
    attendance_date date not null default current_date,
    timetable_slot_id uuid references public.timetable_slots (id) on delete set null,
    reason text not null,
    status text not null default 'pending',
    decided_by uuid references public.profiles (id) on delete set null,
    decided_at timestamptz,
    decision_note text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_attendance_regularisation (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_attendance_regularisation_student_idx
    on public.erp_attendance_regularisation (student_id);
exception
  when others then
    raise warning 'create index if not exists erp_attendance_regularisation_student_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_attendance_regularisation_own_read
    on public.erp_attendance_regularisation;
exception
  when others then
    raise warning 'drop policy if exists erp_attendance_regularisation_own_read: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_attendance_regularisation_own_read
    on public.erp_attendance_regularisation
    for select
    to authenticated
    using (
      exists (
        select 1 from public.students student
        where student.id = erp_attendance_regularisation.student_id
          and student.user_id = auth.uid()
      )
    );
exception
  when others then
    raise warning 'create policy erp_attendance_regularisation_own_read: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_attendance_regularisation', 'attendance');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_attendance_regularisation'', ''attendance''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 4. Audit triggers
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
begin
  foreach target in array array[
    'erp_semesters',
    'erp_curriculum',
    'erp_course_outcomes',
    'erp_credit_rules',
    'erp_academic_records',
    'erp_timetable_rooms',
    'erp_timetable_substitutions',
    'erp_faculty_attendance',
    'erp_attendance_regularisation'
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
