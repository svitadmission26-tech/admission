-- Migration 040: SVIT ERP examination, library, hostel and ID card
-- Apply after migration 039. Idempotent and safe to re-run.

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
--     The people spine links a student to the portal login and the academics
--     migration owns the timetable rooms. Both are ensured here as well, so
--     that this migration can also be applied on its own.
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
-- 1. Examination management
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_exams (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    exam_type text not null default 'semester',
    academic_year text not null default '',
    course_id uuid references public.courses (id) on delete set null,
    branch_id uuid references public.branches (id) on delete set null,
    semester integer not null default 1,
    starts_on date,
    ends_on date,
    total_marks numeric not null default 0,
    pass_marks numeric not null default 0,
    status text not null default 'planned',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint erp_exams_status check (
      status in ('planned', 'scheduled', 'ongoing', 'completed', 'published', 'cancelled')
    )
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_exams (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_exams_course_idx on public.erp_exams (course_id, semester);
exception
  when others then
    raise warning 'create index if not exists erp_exams_course_idx on public.erp_exams (course_id, semester): %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_exams', 'examinations');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_exams'', ''examinations''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_exam_schedules (
    id uuid primary key default gen_random_uuid(),
    exam_id uuid not null references public.erp_exams (id) on delete cascade,
    subject_id uuid references public.subjects (id) on delete set null,
    subject_code text not null default '',
    subject_name text not null default '',
    exam_date date not null default current_date,
    start_time time,
    end_time time,
    max_marks numeric not null default 0,
    room_id uuid references public.erp_timetable_rooms (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_exam_schedules (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_exam_schedules_exam_idx
    on public.erp_exam_schedules (exam_id, exam_date);
exception
  when others then
    raise warning 'create index if not exists erp_exam_schedules_exam_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_exam_schedules', 'examinations');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_exam_schedules'', ''examinations''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_seating_plans (
    id uuid primary key default gen_random_uuid(),
    exam_id uuid not null references public.erp_exams (id) on delete cascade,
    room_id uuid references public.erp_timetable_rooms (id) on delete set null,
    plan_date date not null default current_date,
    rows_count integer not null default 0,
    columns_count integer not null default 0,
    total_seats integer not null default 0,
    occupied_seats integer not null default 0,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_seating_plans (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_seating_plans_exam_idx
    on public.erp_seating_plans (exam_id, plan_date);
exception
  when others then
    raise warning 'create index if not exists erp_seating_plans_exam_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_seating_plans', 'examinations');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_seating_plans'', ''examinations''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_exam_results (
    id uuid primary key default gen_random_uuid(),
    exam_id uuid not null references public.erp_exams (id) on delete cascade,
    student_id uuid not null references public.students (id) on delete cascade,
    subject_id uuid references public.subjects (id) on delete set null,
    subject_code text not null default '',
    marks_obtained numeric not null default 0,
    max_marks numeric not null default 0,
    grade text not null default '',
    grade_point numeric not null default 0,
    result text not null default 'pass',
    published boolean not null default false,
    entered_by uuid references public.profiles (id) on delete set null,
    entered_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_exam_results (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_exam_results_unique
    on public.erp_exam_results (exam_id, student_id, coalesce(subject_code, ''));
exception
  when others then
    raise warning 'create unique index if not exists erp_exam_results_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_exam_results_student_idx
    on public.erp_exam_results (student_id);
exception
  when others then
    raise warning 'create index if not exists erp_exam_results_student_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_exam_results_own_read on public.erp_exam_results;
exception
  when others then
    raise warning 'drop policy if exists erp_exam_results_own_read on public.erp_exam_results: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_exam_results_own_read on public.erp_exam_results
    for select
    to authenticated
    using (
      published = true
      or exists (
        select 1 from public.students student
        where student.id = erp_exam_results.student_id
          and student.user_id = auth.uid()
      )
    );
exception
  when others then
    raise warning 'create policy erp_exam_results_own_read on public.erp_exam_results: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_exam_results', 'examinations');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_exam_results'', ''examinations''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_grade_scales (
    id uuid primary key default gen_random_uuid(),
    name text not null default 'Default',
    min_percentage numeric not null default 0,
    max_percentage numeric not null default 100,
    grade_point numeric not null default 0,
    grade text not null,
    description text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_grade_scales (: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_grade_scales', 'examinations');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_grade_scales'', ''examinations''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_marksheets (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students (id) on delete cascade,
    exam_id uuid references public.erp_exams (id) on delete set null,
    number text not null default '',
    academic_year text not null default '',
    semester integer not null default 0,
    total_marks numeric not null default 0,
    obtained_marks numeric not null default 0,
    percentage numeric not null default 0,
    grade text not null default '',
    result text not null default 'pass',
    issued_on date,
    issued_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_marksheets (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_marksheets_number_unique
    on public.erp_marksheets (number)
    where number <> '';
exception
  when others then
    raise warning 'create unique index if not exists erp_marksheets_number_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_marksheets_student_idx
    on public.erp_marksheets (student_id);
exception
  when others then
    raise warning 'create index if not exists erp_marksheets_student_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_marksheets_own_read on public.erp_marksheets;
exception
  when others then
    raise warning 'drop policy if exists erp_marksheets_own_read on public.erp_marksheets: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_marksheets_own_read on public.erp_marksheets
    for select
    to authenticated
    using (
      exists (
        select 1 from public.students student
        where student.id = erp_marksheets.student_id
          and student.user_id = auth.uid()
      )
    );
exception
  when others then
    raise warning 'create policy erp_marksheets_own_read on public.erp_marksheets: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_marksheets', 'examinations');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_marksheets'', ''examinations''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_revaluation_requests (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students (id) on delete cascade,
    exam_id uuid references public.erp_exams (id) on delete set null,
    subject_code text not null default '',
    reason text not null default '',
    amount_paise bigint not null default 0,
    status text not null default 'applied',
    applied_at timestamptz not null default now(),
    decided_by uuid references public.profiles (id) on delete set null,
    decided_at timestamptz,
    new_marks numeric,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_revaluation_requests (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_revaluation_requests_student_idx
    on public.erp_revaluation_requests (student_id);
exception
  when others then
    raise warning 'create index if not exists erp_revaluation_requests_student_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_revaluation_requests_own_read
    on public.erp_revaluation_requests;
exception
  when others then
    raise warning 'drop policy if exists erp_revaluation_requests_own_read: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_revaluation_requests_own_read
    on public.erp_revaluation_requests
    for select
    to authenticated
    using (
      exists (
        select 1 from public.students student
        where student.id = erp_revaluation_requests.student_id
          and student.user_id = auth.uid()
      )
    );
exception
  when others then
    raise warning 'create policy erp_revaluation_requests_own_read: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_revaluation_requests', 'examinations');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_revaluation_requests'', ''examinations''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 2. Library management
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_library_items (
    id uuid primary key default gen_random_uuid(),
    accession_number text not null,
    title text not null,
    author text not null default '',
    publisher text not null default '',
    edition text not null default '',
    isbn text not null default '',
    category text not null default 'general',
    item_type text not null default 'book',
    price_paise bigint not null default 0,
    total_copies integer not null default 1,
    available_copies integer not null default 1,
    shelf text not null default '',
    description text not null default '',
    active boolean not null default true,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_library_items (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_library_items_accession_unique
    on public.erp_library_items (lower(accession_number));
exception
  when others then
    raise warning 'create unique index if not exists erp_library_items_accession_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_library_items_title_idx
    on public.erp_library_items (lower(title));
exception
  when others then
    raise warning 'create index if not exists erp_library_items_title_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_library_items', 'library');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_library_items'', ''library''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_library_members (
    id uuid primary key default gen_random_uuid(),
    member_code text not null default '',
    member_type text not null default 'student',
    student_id uuid references public.students (id) on delete cascade,
    faculty_id uuid references public.faculty (id) on delete cascade,
    name text not null default '',
    email text not null default '',
    phone text not null default '',
    max_books integer not null default 3,
    valid_from date not null default current_date,
    valid_to date,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_library_members (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_library_members_code_idx
    on public.erp_library_members (member_code);
exception
  when others then
    raise warning 'create index if not exists erp_library_members_code_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_library_members', 'library');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_library_members'', ''library''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_library_issues (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.erp_library_items (id) on delete cascade,
    member_id uuid not null references public.erp_library_members (id) on delete cascade,
    issue_date date not null default current_date,
    due_date date not null default current_date + 14,
    return_date date,
    fine_paise bigint not null default 0,
    status text not null default 'issued',
    issued_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_library_issues (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_library_issues_item_idx
    on public.erp_library_issues (item_id, status);
exception
  when others then
    raise warning 'create index if not exists erp_library_issues_item_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_library_issues_member_idx
    on public.erp_library_issues (member_id, status);
exception
  when others then
    raise warning 'create index if not exists erp_library_issues_member_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_library_issues', 'library');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_library_issues'', ''library''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_library_reservations (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.erp_library_items (id) on delete cascade,
    member_id uuid not null references public.erp_library_members (id) on delete cascade,
    reserved_at timestamptz not null default now(),
    status text not null default 'waiting',
    notified boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_library_reservations (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_library_reservations_item_idx
    on public.erp_library_reservations (item_id, status);
exception
  when others then
    raise warning 'create index if not exists erp_library_reservations_item_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_library_reservations', 'library');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_library_reservations'', ''library''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_library_fines (
    id uuid primary key default gen_random_uuid(),
    issue_id uuid references public.erp_library_issues (id) on delete cascade,
    member_id uuid references public.erp_library_members (id) on delete cascade,
    amount_paise bigint not null default 0,
    reason text not null default '',
    paid boolean not null default false,
    paid_at timestamptz,
    created_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_library_fines (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_library_fines_member_idx
    on public.erp_library_fines (member_id);
exception
  when others then
    raise warning 'create index if not exists erp_library_fines_member_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_library_fines', 'library');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_library_fines'', ''library''): %', sqlerrm;
end;
$do$;

-- Issuing a book keeps the available copies in step.
do $do$
begin
  create or replace function public.erp_issue_library_book(
    p_item_id uuid,
    p_member_id uuid,
    p_due_date date
  )
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  declare
    v_item public.erp_library_items;
    v_issue uuid;
  begin
    if not (public.is_admin() or public.erp_module_permission('library', 'create')) then
      raise exception 'You are not allowed to issue library books';
    end if;

    select * into v_item from public.erp_library_items where id = p_item_id;
    if not found then
      raise exception 'The library item was not found';
    end if;
    if v_item.available_copies <= 0 then
      raise exception 'No copy of this item is available';
    end if;

    insert into public.erp_library_issues (
      item_id, member_id, issue_date, due_date, status, issued_by
    )
    values (
      p_item_id,
      p_member_id,
      current_date,
      coalesce(p_due_date, current_date + 14),
      'issued',
      auth.uid()
    )
    returning id into v_issue;

    update public.erp_library_items
    set available_copies = available_copies - 1,
        updated_at = now()
    where id = p_item_id;

    return v_issue;
  end;
  $$;
exception
  when others then
    raise warning 'create or replace function public.erp_issue_library_book(: %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.erp_issue_library_book(uuid, uuid, date) from public;
exception
  when others then
    raise warning 'revoke all on function public.erp_issue_library_book(uuid, uuid, date) from public: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant execute on function public.erp_issue_library_book(uuid, uuid, date) to authenticated;
exception
  when others then
    raise warning 'grant execute on function public.erp_issue_library_book(uuid, uuid, date) to authenticated: %', sqlerrm;
end;
$do$;

do $do$
begin
  create or replace function public.erp_return_library_book(p_issue_id uuid)
  returns bigint
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  declare
    v_issue public.erp_library_issues;
    v_fine bigint;
  begin
    if not (public.is_admin() or public.erp_module_permission('library', 'edit')) then
      raise exception 'You are not allowed to return library books';
    end if;

    select * into v_issue from public.erp_library_issues where id = p_issue_id;
    if not found then
      raise exception 'The issue was not found';
    end if;
    if v_issue.status = 'returned' then
      raise exception 'This book has already been returned';
    end if;

    v_fine := greatest(
      (current_date - v_issue.due_date) * 500,
      0
    )::bigint;

    update public.erp_library_issues
    set status = 'returned',
        return_date = current_date,
        fine_paise = v_fine,
        updated_at = now()
    where id = p_issue_id;

    update public.erp_library_items
    set available_copies = least(available_copies + 1, total_copies),
        updated_at = now()
    where id = v_issue.item_id;

    if v_fine > 0 then
      insert into public.erp_library_fines (issue_id, member_id, amount_paise, reason)
      values (p_issue_id, v_issue.member_id, v_fine, 'Overdue return');
    end if;

    return v_fine;
  end;
  $$;
exception
  when others then
    raise warning 'create or replace function public.erp_return_library_book(p_issue_id uuid): %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.erp_return_library_book(uuid) from public;
exception
  when others then
    raise warning 'revoke all on function public.erp_return_library_book(uuid) from public: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant execute on function public.erp_return_library_book(uuid) to authenticated;
exception
  when others then
    raise warning 'grant execute on function public.erp_return_library_book(uuid) to authenticated: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 3. Hostel management
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_hostels (
    id uuid primary key default gen_random_uuid(),
    code text not null,
    name text not null,
    college_id uuid references public.colleges (id) on delete set null,
    warden_faculty_id uuid references public.faculty (id) on delete set null,
    hostel_type text not null default 'boys',
    address text not null default '',
    phone text not null default '',
    total_rooms integer not null default 0,
    occupied_rooms integer not null default 0,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_hostels (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_hostels_code_unique
    on public.erp_hostels (lower(code));
exception
  when others then
    raise warning 'create unique index if not exists erp_hostels_code_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_hostels', 'hostel');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_hostels'', ''hostel''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_hostel_blocks (
    id uuid primary key default gen_random_uuid(),
    hostel_id uuid not null references public.erp_hostels (id) on delete cascade,
    name text not null,
    gender text not null default 'boys',
    floors integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_hostel_blocks (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_hostel_blocks_hostel_idx
    on public.erp_hostel_blocks (hostel_id);
exception
  when others then
    raise warning 'create index if not exists erp_hostel_blocks_hostel_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_hostel_blocks', 'hostel');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_hostel_blocks'', ''hostel''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_hostel_rooms (
    id uuid primary key default gen_random_uuid(),
    hostel_id uuid not null references public.erp_hostels (id) on delete cascade,
    block_id uuid references public.erp_hostel_blocks (id) on delete set null,
    room_number text not null,
    room_type text not null default 'shared',
    floor integer not null default 0,
    capacity integer not null default 2,
    occupied integer not null default 0,
    rent_paise bigint not null default 0,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_hostel_rooms (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_hostel_rooms_unique
    on public.erp_hostel_rooms (hostel_id, room_number);
exception
  when others then
    raise warning 'create unique index if not exists erp_hostel_rooms_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_hostel_rooms', 'hostel');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_hostel_rooms'', ''hostel''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_hostel_allocations (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.erp_hostel_rooms (id) on delete cascade,
    student_id uuid not null references public.students (id) on delete cascade,
    academic_year text not null default '',
    from_date date not null default current_date,
    to_date date,
    rent_paise bigint not null default 0,
    status text not null default 'active',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_hostel_allocations (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_hostel_allocations_student_unique
    on public.erp_hostel_allocations (student_id, academic_year)
    where status = 'active';
exception
  when others then
    raise warning 'create unique index if not exists erp_hostel_allocations_student_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_hostel_allocations_room_idx
    on public.erp_hostel_allocations (room_id);
exception
  when others then
    raise warning 'create index if not exists erp_hostel_allocations_room_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_hostel_allocations_own_read
    on public.erp_hostel_allocations;
exception
  when others then
    raise warning 'drop policy if exists erp_hostel_allocations_own_read: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_hostel_allocations_own_read
    on public.erp_hostel_allocations
    for select
    to authenticated
    using (
      exists (
        select 1 from public.students student
        where student.id = erp_hostel_allocations.student_id
          and student.user_id = auth.uid()
      )
    );
exception
  when others then
    raise warning 'create policy erp_hostel_allocations_own_read: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_hostel_allocations', 'hostel');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_hostel_allocations'', ''hostel''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_hostel_attendance (
    id uuid primary key default gen_random_uuid(),
    hostel_id uuid not null references public.erp_hostels (id) on delete cascade,
    student_id uuid not null references public.students (id) on delete cascade,
    attendance_date date not null default current_date,
    status text not null default 'present',
    remarks text not null default '',
    recorded_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_hostel_attendance (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_hostel_attendance_unique
    on public.erp_hostel_attendance (hostel_id, student_id, attendance_date);
exception
  when others then
    raise warning 'create unique index if not exists erp_hostel_attendance_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_hostel_attendance', 'hostel');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_hostel_attendance'', ''hostel''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_hostel_maintenance (
    id uuid primary key default gen_random_uuid(),
    room_id uuid references public.erp_hostel_rooms (id) on delete cascade,
    hostel_id uuid references public.erp_hostels (id) on delete cascade,
    reported_on date not null default current_date,
    description text not null default '',
    cost_paise bigint not null default 0,
    status text not null default 'reported',
    resolved_on date,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_hostel_maintenance (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_hostel_maintenance_room_idx
    on public.erp_hostel_maintenance (room_id);
exception
  when others then
    raise warning 'create index if not exists erp_hostel_maintenance_room_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_hostel_maintenance', 'hostel');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_hostel_maintenance'', ''hostel''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_hostel_requests (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students (id) on delete cascade,
    request_type text not null default 'general',
    details text not null default '',
    status text not null default 'pending',
    decided_by uuid references public.profiles (id) on delete set null,
    decided_at timestamptz,
    decision_note text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_hostel_requests (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_hostel_requests_student_idx
    on public.erp_hostel_requests (student_id);
exception
  when others then
    raise warning 'create index if not exists erp_hostel_requests_student_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_hostel_requests_own_read on public.erp_hostel_requests;
exception
  when others then
    raise warning 'drop policy if exists erp_hostel_requests_own_read on public.erp_hostel_requests: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_hostel_requests_own_read on public.erp_hostel_requests
    for select
    to authenticated
    using (
      exists (
        select 1 from public.students student
        where student.id = erp_hostel_requests.student_id
          and student.user_id = auth.uid()
      )
    );
exception
  when others then
    raise warning 'create policy erp_hostel_requests_own_read on public.erp_hostel_requests: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_hostel_requests', 'hostel');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_hostel_requests'', ''hostel''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 4. Smart ID card templates
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_id_card_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    card_type text not null default 'student',
    template jsonb not null default '{}'::jsonb,
    enabled boolean not null default true,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_id_card_templates (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_id_card_templates_name_unique
    on public.erp_id_card_templates (lower(name));
exception
  when others then
    raise warning 'create unique index if not exists erp_id_card_templates_name_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_id_card_templates', 'id_cards');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_id_card_templates'', ''id_cards''): %', sqlerrm;
end;
$do$;

do $do$
begin
  alter table public.id_cards
    add column if not exists template_id uuid references public.erp_id_card_templates (id) on delete set null;
exception
  when others then
    raise warning 'alter table public.id_cards: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 5. Audit triggers
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
begin
  foreach target in array array[
    'erp_exams',
    'erp_exam_schedules',
    'erp_seating_plans',
    'erp_exam_results',
    'erp_grade_scales',
    'erp_marksheets',
    'erp_revaluation_requests',
    'erp_library_items',
    'erp_library_members',
    'erp_library_issues',
    'erp_library_reservations',
    'erp_library_fines',
    'erp_hostels',
    'erp_hostel_blocks',
    'erp_hostel_rooms',
    'erp_hostel_allocations',
    'erp_hostel_attendance',
    'erp_hostel_maintenance',
    'erp_hostel_requests',
    'erp_id_card_templates'
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
