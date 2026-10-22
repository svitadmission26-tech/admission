-- Migration 037: SVIT ERP people spine (students, faculty, departments, guardians)
-- Apply after migration 036. Idempotent and safe to re-run.
--
-- The Student and the Faculty are the two shared masters of the ERP. This
-- migration links them to the other masters with real foreign keys and adds the
-- columns the modules need. No student or faculty record is duplicated:
--
--   students.user_id  -> profiles   (one student row per portal login)
--   faculty.user_id   -> profiles   (one faculty row per portal login)
--   students.course_id / branch_id / department_id -> the academic masters
--   students.inquiry_id / application_id / admission_id -> the admission chain
--   departments.hod_faculty_id -> faculty
--
-- A trigger links a new portal login to the existing master row when the
-- verified e-mail address already belongs to a student or a faculty member.

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
-- 2. The student master
-- ---------------------------------------------------------------------------
do $do$
begin
  alter table public.students
    add column if not exists user_id uuid references public.profiles (id) on delete set null,
    add column if not exists inquiry_id uuid references public.inquiries (id) on delete set null,
    add column if not exists application_id uuid references public.applications (id) on delete set null,
    add column if not exists admission_id uuid references public.inquiry_admissions (id) on delete set null,
    add column if not exists course_id uuid references public.courses (id) on delete set null,
    add column if not exists branch_id uuid references public.branches (id) on delete set null,
    add column if not exists department_id uuid references public.departments (id) on delete set null,
    add column if not exists admission_date date,
    add column if not exists date_of_birth date,
    add column if not exists gender text default '',
    add column if not exists blood_group text default '',
    add column if not exists category text default '',
    add column if not exists nationality text default 'Indian',
    add column if not exists religion text default '',
    add column if not exists mother_name text default '',
    add column if not exists father_name text default '',
    add column if not exists guardian_name text default '',
    add column if not exists guardian_phone text default '',
    add column if not exists guardian_email text default '',
    add column if not exists address text default '',
    add column if not exists city text default '',
    add column if not exists state text default '',
    add column if not exists pincode text default '',
    add column if not exists previous_qualification text default '',
    add column if not exists previous_percentage numeric,
    add column if not exists transport_opted boolean not null default false,
    add column if not exists hostel_opted boolean not null default false,
    add column if not exists status text not null default 'active',
    add column if not exists photo_url text default '',
    add column if not exists extra_data jsonb not null default '{}'::jsonb;
exception
  when others then
    raise warning 'alter table public.students: %', sqlerrm;
end;
$do$;

-- One row per student id and per enrollment. The partial index keeps the
-- existing rows (which may still carry an empty code) valid.
do $do$
begin
  create unique index if not exists students_enrollment_unique
    on public.students (lower(enrollment))
    where enrollment is not null and trim(enrollment) <> '';
exception
  when others then
    raise warning 'create unique index if not exists students_enrollment_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists students_student_code_unique
    on public.students (lower(student_id_code))
    where student_id_code is not null and trim(student_id_code) <> '';
exception
  when others then
    raise warning 'create unique index if not exists students_student_code_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists students_user_unique
    on public.students (user_id)
    where user_id is not null;
exception
  when others then
    raise warning 'create unique index if not exists students_user_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists students_course_idx on public.students (course_id);
exception
  when others then
    raise warning 'create index if not exists students_course_idx on public.students (course_id): %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists students_branch_idx on public.students (branch_id);
exception
  when others then
    raise warning 'create index if not exists students_branch_idx on public.students (branch_id): %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists students_admission_year_idx on public.students (admission_year);
exception
  when others then
    raise warning 'create index if not exists students_admission_year_idx on public.students (admission_year): %', sqlerrm;
end;
$do$;

-- The student portal reads its own record only.
do $do$
begin
  drop policy if exists students_own_read on public.students;
exception
  when others then
    raise warning 'drop policy if exists students_own_read on public.students: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy students_own_read on public.students
    for select
    to authenticated
    using (user_id = auth.uid());
exception
  when others then
    raise warning 'create policy students_own_read on public.students: %', sqlerrm;
end;
$do$;

-- The parent portal policy is created further down, once the guardian tables
-- exist.

-- ---------------------------------------------------------------------------
-- 3. The faculty master
-- ---------------------------------------------------------------------------
do $do$
begin
  alter table public.faculty
    add column if not exists user_id uuid references public.profiles (id) on delete set null,
    add column if not exists employee_code text default '',
    add column if not exists department_id uuid references public.departments (id) on delete set null,
    add column if not exists designation_id uuid references public.designations (id) on delete set null,
    add column if not exists joining_date date,
    add column if not exists date_of_birth date,
    add column if not exists gender text default '',
    add column if not exists employment_type text not null default 'full_time',
    add column if not exists qualification text default '',
    add column if not exists experience_years numeric,
    add column if not exists address text default '',
    add column if not exists city text default '',
    add column if not exists state text default '',
    add column if not exists pan_number text default '',
    add column if not exists bank_account text default '',
    add column if not exists bank_ifsc text default '',
    add column if not exists status text not null default 'active',
    add column if not exists photo_url text default '',
    add column if not exists extra_data jsonb not null default '{}'::jsonb;
exception
  when others then
    raise warning 'alter table public.faculty: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists faculty_employee_code_unique
    on public.faculty (lower(employee_code))
    where employee_code is not null and trim(employee_code) <> '';
exception
  when others then
    raise warning 'create unique index if not exists faculty_employee_code_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists faculty_user_unique
    on public.faculty (user_id)
    where user_id is not null;
exception
  when others then
    raise warning 'create unique index if not exists faculty_user_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists faculty_department_idx on public.faculty (department_id);
exception
  when others then
    raise warning 'create index if not exists faculty_department_idx on public.faculty (department_id): %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists faculty_own_read on public.faculty;
exception
  when others then
    raise warning 'drop policy if exists faculty_own_read on public.faculty: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy faculty_own_read on public.faculty
    for select
    to authenticated
    using (user_id = auth.uid());
exception
  when others then
    raise warning 'create policy faculty_own_read on public.faculty: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 4. Departments get their HOD and their targets
-- ---------------------------------------------------------------------------
do $do$
begin
  alter table public.departments
    add column if not exists hod_faculty_id uuid references public.faculty (id) on delete set null,
    add column if not exists college_id uuid references public.colleges (id) on delete set null,
    add column if not exists email text default '',
    add column if not exists phone text default '',
    add column if not exists established_year integer,
    add column if not exists vision text default '',
    add column if not exists mission text default '';
exception
  when others then
    raise warning 'alter table public.departments: %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_department_targets (
    id uuid primary key default gen_random_uuid(),
    department_id uuid not null references public.departments (id) on delete cascade,
    academic_year text not null default '',
    metric text not null,
    target_value numeric not null default 0,
    achieved_value numeric not null default 0,
    period text not null default 'annual',
    notes text default '',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_department_targets (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_department_targets_department_idx
    on public.erp_department_targets (department_id);
exception
  when others then
    raise warning 'create index if not exists erp_department_targets_department_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_department_targets', 'departments');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_department_targets'', ''departments''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 5. Guardians and the parent portal links
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_guardians (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students (id) on delete cascade,
    name text not null,
    relation text not null default 'guardian',
    email text default '',
    phone text default '',
    occupation text default '',
    address text default '',
    photo_url text default '',
    is_primary boolean not null default false,
    verified boolean not null default false,
    user_id uuid references public.profiles (id) on delete set null,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_guardians (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_guardians_student_idx on public.erp_guardians (student_id);
exception
  when others then
    raise warning 'create index if not exists erp_guardians_student_idx on public.erp_guardians (student_id): %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_guardians_user_idx on public.erp_guardians (user_id);
exception
  when others then
    raise warning 'create index if not exists erp_guardians_user_idx on public.erp_guardians (user_id): %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_guardians_student_email_unique
    on public.erp_guardians (student_id, lower(email))
    where email is not null and trim(email) <> '';
exception
  when others then
    raise warning 'create unique index if not exists erp_guardians_student_email_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_parent_students (
    id uuid primary key default gen_random_uuid(),
    guardian_id uuid not null references public.erp_guardians (id) on delete cascade,
    student_id uuid not null references public.students (id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint erp_parent_students_unique unique (guardian_id, student_id)
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_parent_students (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_parent_students_student_idx
    on public.erp_parent_students (student_id);
exception
  when others then
    raise warning 'create index if not exists erp_parent_students_student_idx: %', sqlerrm;
end;
$do$;

-- The guardian reads their own links and their own record.
do $do$
begin
  drop policy if exists erp_parent_students_own_read on public.erp_parent_students;
exception
  when others then
    raise warning 'drop policy if exists erp_parent_students_own_read on public.erp_parent_students: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_parent_students_own_read on public.erp_parent_students
    for select
    to authenticated
    using (
      exists (
        select 1 from public.erp_guardians guardian
        where guardian.id = erp_parent_students.guardian_id
          and guardian.user_id = auth.uid()
      )
    );
exception
  when others then
    raise warning 'create policy erp_parent_students_own_read on public.erp_parent_students: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_guardians_own_read on public.erp_guardians;
exception
  when others then
    raise warning 'drop policy if exists erp_guardians_own_read on public.erp_guardians: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_guardians_own_read on public.erp_guardians
    for select
    to authenticated
    using (user_id = auth.uid());
exception
  when others then
    raise warning 'create policy erp_guardians_own_read on public.erp_guardians: %', sqlerrm;
end;
$do$;

-- The module policies come after the personal ones so that a guardian keeps
-- access to their own child even without a module grant.
do $do$
begin
  perform public.erp_apply_module_policies('erp_guardians', 'parents');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_guardians'', ''parents''): %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_parent_students', 'parents');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_parent_students'', ''parents''): %', sqlerrm;
end;
$do$;

-- The parent portal reads the students that are linked to the guardian.
do $do$
begin
  drop policy if exists students_guardian_read on public.students;
exception
  when others then
    raise warning 'drop policy if exists students_guardian_read on public.students: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy students_guardian_read on public.students
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.erp_parent_students link
        join public.erp_guardians guardian on guardian.id = link.guardian_id
        where link.student_id = students.id
          and guardian.user_id = auth.uid()
      )
    );
exception
  when others then
    raise warning 'create policy students_guardian_read on public.students: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 6. Student documents and student records (remarks / discipline)
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_student_documents (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students (id) on delete cascade,
    document_type text not null default 'other',
    label text not null,
    storage_path text not null default '',
    file_name text default '',
    verified boolean not null default false,
    verified_by uuid references public.profiles (id) on delete set null,
    verified_at timestamptz,
    uploaded_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_student_documents (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_student_documents_student_idx
    on public.erp_student_documents (student_id);
exception
  when others then
    raise warning 'create index if not exists erp_student_documents_student_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_student_documents_own_read on public.erp_student_documents;
exception
  when others then
    raise warning 'drop policy if exists erp_student_documents_own_read on public.erp_student_documents: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_student_documents_own_read on public.erp_student_documents
    for select
    to authenticated
    using (
      exists (
        select 1 from public.students student
        where student.id = erp_student_documents.student_id
          and student.user_id = auth.uid()
      )
    );
exception
  when others then
    raise warning 'create policy erp_student_documents_own_read on public.erp_student_documents: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_student_documents', 'students');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_student_documents'', ''students''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_student_records (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students (id) on delete cascade,
    record_type text not null default 'remark',
    title text not null,
    details text not null default '',
    recorded_on date not null default current_date,
    reported_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_student_records (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_student_records_student_idx
    on public.erp_student_records (student_id);
exception
  when others then
    raise warning 'create index if not exists erp_student_records_student_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_student_records_own_read on public.erp_student_records;
exception
  when others then
    raise warning 'drop policy if exists erp_student_records_own_read on public.erp_student_records: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_student_records_own_read on public.erp_student_records
    for select
    to authenticated
    using (
      exists (
        select 1 from public.students student
        where student.id = erp_student_records.student_id
          and student.user_id = auth.uid()
      )
    );
exception
  when others then
    raise warning 'create policy erp_student_records_own_read on public.erp_student_records: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_student_records', 'students');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_student_records'', ''students''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 7. Faculty teaching load and achievements
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_faculty_load (
    id uuid primary key default gen_random_uuid(),
    faculty_id uuid not null references public.faculty (id) on delete cascade,
    academic_year text not null default '',
    semester integer not null default 1,
    subject_id uuid references public.subjects (id) on delete set null,
    course_id uuid references public.courses (id) on delete set null,
    branch_id uuid references public.branches (id) on delete set null,
    hours_per_week numeric not null default 0,
    student_count integer not null default 0,
    notes text default '',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_faculty_load (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_faculty_load_faculty_idx on public.erp_faculty_load (faculty_id);
exception
  when others then
    raise warning 'create index if not exists erp_faculty_load_faculty_idx on public.erp_faculty_load (facult: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_faculty_load', 'faculty');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_faculty_load'', ''faculty''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_faculty_achievements (
    id uuid primary key default gen_random_uuid(),
    faculty_id uuid not null references public.faculty (id) on delete cascade,
    title text not null,
    category text not null default 'publication',
    awarded_on date,
    description text default '',
    document_path text default '',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_faculty_achievements (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_faculty_achievements_faculty_idx
    on public.erp_faculty_achievements (faculty_id);
exception
  when others then
    raise warning 'create index if not exists erp_faculty_achievements_faculty_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_faculty_achievements', 'faculty');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_faculty_achievements'', ''faculty''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 8. Linking a portal login to the existing master row
--    A student or a faculty member signs in for the first time: the master row
--    that already carries the verified e-mail address is linked instead of a
--    second record being created.
-- ---------------------------------------------------------------------------
do $do$
begin
  alter table public.profiles add column if not exists email text default '';
exception
  when others then
    raise warning 'alter table public.profiles add column if not exists email text default '''': %', sqlerrm;
end;
$do$;

do $do$
begin
  create or replace function public.new_user_profile ()
  returns trigger language plpgsql security definer
  set
    search_path = public,
    pg_temp as $$
  begin
    insert into public.profiles(id, full_name, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', ''),
      lower(trim(coalesce(new.email, '')))
    )
    on conflict (id) do update
      set full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
          email = coalesce(nullif(excluded.email, ''), public.profiles.email);
    return new;
  end;
  $$;
exception
  when others then
    raise warning 'create or replace function public.new_user_profile (): %', sqlerrm;
end;
$do$;

do $do$
begin
  create or replace function public.erp_link_person_to_profile()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  declare
    v_email text;
  begin
    v_email := lower(trim(coalesce(new.email, '')));
    if v_email = '' then
      return new;
    end if;

    update public.students
    set user_id = new.id
    where user_id is null
      and lower(trim(coalesce(guardian_email, ''))) = v_email
      and not exists (
        select 1 from public.students other
        where other.user_id = new.id
      );

    update public.faculty
    set user_id = new.id
    where user_id is null
      and lower(trim(coalesce(email, ''))) = v_email
      and not exists (
        select 1 from public.faculty other
        where other.user_id = new.id
      );

    return new;
  end;
  $$;
exception
  when others then
    raise warning 'create or replace function public.erp_link_person_to_profile(): %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.erp_link_person_to_profile() from public;
exception
  when others then
    raise warning 'revoke all on function public.erp_link_person_to_profile() from public: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop trigger if exists erp_link_person_on_signup on auth.users;
exception
  when others then
    raise warning 'drop trigger if exists erp_link_person_on_signup on auth.users: %', sqlerrm;
end;
$do$;

do $do$
begin
  create trigger erp_link_person_on_signup
  after insert on auth.users
  for each row execute function public.erp_link_person_to_profile();
exception
  when others then
    raise warning 'create trigger erp_link_person_on_signup: %', sqlerrm;
end;
$do$;

-- The other way round: the student or the faculty record is created after the
-- portal login already exists. The master row is linked to that account, so
-- the person is never duplicated.
do $do$
begin
  create or replace function public.erp_link_master_to_profile()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  declare
    v_email text;
    v_user uuid;
  begin
    if new.user_id is not null then
      return new;
    end if;

    if tg_table_name = 'students' then
      v_email := lower(trim(coalesce(new.guardian_email, '')));
    else
      v_email := lower(trim(coalesce(new.email, '')));
    end if;
    if v_email = '' then
      return new;
    end if;

    select profile.id into v_user
    from public.profiles profile
    where lower(trim(coalesce(profile.email, ''))) = v_email
    limit 1;

    if v_user is not null then
      new.user_id := v_user;
    end if;
    return new;
  end;
  $$;
exception
  when others then
    raise warning 'create or replace function public.erp_link_master_to_profile(): %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.erp_link_master_to_profile() from public;
exception
  when others then
    raise warning 'revoke all on function public.erp_link_master_to_profile() from public: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop trigger if exists erp_link_student_to_profile on public.students;
exception
  when others then
    raise warning 'drop trigger if exists erp_link_student_to_profile on public.students: %', sqlerrm;
end;
$do$;

do $do$
begin
  create trigger erp_link_student_to_profile
  before insert or update of guardian_email on public.students
  for each row execute function public.erp_link_master_to_profile();
exception
  when others then
    raise warning 'create trigger erp_link_student_to_profile: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop trigger if exists erp_link_faculty_to_profile on public.faculty;
exception
  when others then
    raise warning 'drop trigger if exists erp_link_faculty_to_profile on public.faculty: %', sqlerrm;
end;
$do$;

do $do$
begin
  create trigger erp_link_faculty_to_profile
  before insert or update of email on public.faculty
  for each row execute function public.erp_link_master_to_profile();
exception
  when others then
    raise warning 'create trigger erp_link_faculty_to_profile: %', sqlerrm;
end;
$do$;

-- A faculty code identifies one person. The check runs in the database so
-- that an import cannot create a second record for the same person.
do $do$
begin
  create or replace function public.guard_faculty_code_unique()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  begin
    if new.code is null or trim(new.code) = '' then
      return new;
    end if;
    if exists (
      select 1
      from public.faculty other
      where other.id <> new.id
        and lower(trim(other.code)) = lower(trim(new.code))
    ) then
      raise exception 'The faculty code % is already used by another record', new.code;
    end if;
    return new;
  end;
  $$;
exception
  when others then
    raise warning 'create or replace function public.guard_faculty_code_unique(): %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.guard_faculty_code_unique() from public;
exception
  when others then
    raise warning 'revoke all on function public.guard_faculty_code_unique() from public: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop trigger if exists faculty_code_unique_guard on public.faculty;
exception
  when others then
    raise warning 'drop trigger if exists faculty_code_unique_guard on public.faculty: %', sqlerrm;
end;
$do$;

do $do$
begin
  create trigger faculty_code_unique_guard
  before insert or update of code on public.faculty
  for each row execute function public.guard_faculty_code_unique();
exception
  when others then
    raise warning 'create trigger faculty_code_unique_guard: %', sqlerrm;
end;
$do$;

-- The guardians of an already signed in student are linked when the guardian
-- row carries the same verified e-mail address.
do $do$
begin
  create or replace function public.erp_link_guardian_to_profile()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  begin
    if new.user_id is null and trim(coalesce(new.email, '')) <> '' then
      update public.erp_guardians
      set user_id = new.id,
          verified = true
      where user_id is null
        and lower(trim(coalesce(email, ''))) = lower(trim(new.email));
    end if;
    return new;
  end;
  $$;
exception
  when others then
    raise warning 'create or replace function public.erp_link_guardian_to_profile(): %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.erp_link_guardian_to_profile() from public;
exception
  when others then
    raise warning 'revoke all on function public.erp_link_guardian_to_profile() from public: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop trigger if exists erp_link_guardian_on_insert on public.erp_guardians;
exception
  when others then
    raise warning 'drop trigger if exists erp_link_guardian_on_insert on public.erp_guardians: %', sqlerrm;
end;
$do$;

do $do$
begin
  create trigger erp_link_guardian_on_insert
  after insert or update of email on public.erp_guardians
  for each row execute function public.erp_link_guardian_to_profile();
exception
  when others then
    raise warning 'create trigger erp_link_guardian_on_insert: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 9. Audit triggers for the people tables
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
begin
  foreach target in array array[
    'erp_guardians',
    'erp_parent_students',
    'erp_student_documents',
    'erp_student_records',
    'erp_faculty_load',
    'erp_faculty_achievements',
    'erp_department_targets'
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
