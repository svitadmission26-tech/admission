alter table public.colleges
  add column if not exists code text,
  add column if not exists university_name text,
  add column if not exists logo_url text;

create unique index if not exists colleges_code_unique
  on public.colleges (code)
  where code is not null;

alter table public.courses
  add column if not exists enrollment_code text,
  add column if not exists college_id uuid references public.colleges (id),
  add column if not exists duration_years numeric(4, 1),
  add column if not exists intake_capacity integer not null default 0;

alter table public.branches
  add column if not exists code text,
  add column if not exists enrollment_code text,
  add column if not exists college_id uuid references public.colleges (id);

create table if not exists public.form_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  description text not null default '',
  flags text,
  active boolean not null default true,
  workbook_key text unique
);

create unique index if not exists form_types_name_unique
  on public.form_types (lower(name));

create table if not exists public.student_profile_fields (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  key text not null unique,
  input_type text not null default 'text',
  default_value text,
  required boolean not null default false,
  force_uppercase boolean not null default false,
  display_order integer not null default 0,
  workbook_key text unique
);

alter table public.admission_forms
  add column if not exists academic_year text,
  add column if not exists course_id uuid references public.courses (id),
  add column if not exists form_type_id uuid references public.form_types (id),
  add column if not exists workbook_key text unique;

create table if not exists public.fee_schemes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  active boolean not null default true,
  workbook_key text unique
);

alter table public.fee_structures
  add column if not exists course_id uuid references public.courses (id),
  add column if not exists academic_year text,
  add column if not exists form_type_id uuid references public.form_types (id),
  add column if not exists fee_scheme_id uuid references public.fee_schemes (id),
  add column if not exists components jsonb not null default '[]'::jsonb,
  add column if not exists workbook_key text unique;

alter table public.merit_schemes
  add column if not exists course_id uuid references public.courses (id),
  add column if not exists form_type_id uuid references public.form_types (id),
  add column if not exists workbook_key text unique;

create table if not exists public.workbook_sheets (
  sheet_name text primary key,
  columns jsonb not null check (jsonb_typeof(columns) = 'array'),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  updated_at timestamptz not null default now()
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'form_types',
    'student_profile_fields',
    'fee_schemes',
    'workbook_sheets'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists admin_all on public.%I', table_name);
    execute format(
      'create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      table_name
    );
  end loop;
end
$$;

create or replace function public.refresh_course_branch_intake(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.courses course
  set intake_capacity = coalesce((
    select sum(branch.intake)::integer
    from public.branches branch
    where branch.course_id = course.id
      and branch.college_id is not distinct from course.college_id
  ), 0)
  where course.id = p_course_id;
end
$$;

create or replace function public.sync_course_branch_intake()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op <> 'INSERT' then
    perform public.refresh_course_branch_intake(old.course_id);
  end if;
  if tg_op <> 'DELETE' then
    perform public.refresh_course_branch_intake(new.course_id);
  end if;
  return null;
end
$$;

create or replace function public.set_course_branch_intake()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.intake_capacity := coalesce((
    select sum(branch.intake)::integer
    from public.branches branch
    where branch.course_id = new.id
      and branch.college_id is not distinct from new.college_id
  ), 0);
  return new;
end
$$;

revoke all on function public.refresh_course_branch_intake(uuid) from public;
revoke all on function public.sync_course_branch_intake() from public;
revoke all on function public.set_course_branch_intake() from public;

drop trigger if exists branches_sync_course_intake on public.branches;
create trigger branches_sync_course_intake
after insert or update of course_id, college_id, intake or delete
on public.branches
for each row
execute function public.sync_course_branch_intake();

drop trigger if exists courses_set_branch_intake on public.courses;
create trigger courses_set_branch_intake
before insert or update of college_id, intake_capacity
on public.courses
for each row
execute function public.set_course_branch_intake();

update public.courses course
set intake_capacity = coalesce((
  select sum(branch.intake)::integer
  from public.branches branch
  where branch.course_id = course.id
    and branch.college_id is not distinct from course.college_id
), 0);

create or replace function public.import_svit_workbook(p_sheets jsonb)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  sheet jsonb;
  record jsonb;
  target_college_id uuid;
  target_course_id uuid;
  target_form_type_id uuid;
  target_fee_scheme_id uuid;
  row_key text;
  course_name text;
  college_name text;
  university_name text;
  type_name text;
  scheme_name text;
  parsed_year text;
  imported integer := 0;
  sequence_no integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required to import workbook data.';
  end if;
  if jsonb_typeof(p_sheets) is distinct from 'array' then
    raise exception 'The workbook must contain all 9 supported sheets.';
  end if;
  if jsonb_array_length(p_sheets) <> 9 then
    raise exception 'The workbook must contain all 9 supported sheets.';
  end if;
  if exists (
    select required.sheet_name
    from (values
      ('Courses'),
      ('form type'),
      ('Student Profile Schema'),
      ('Manage Admission Forms'),
      ('branch'),
      ('college'),
      ('Fee Structure Management'),
      ('Manage Fee Schemes'),
      ('Merit Formula Management')
    ) as required(sheet_name)
    left join jsonb_array_elements(p_sheets) as supplied(value)
      on supplied.value->>'sheet_name' = required.sheet_name
    where supplied.value is null
  ) then
    raise exception 'The workbook is missing one or more required sheets.';
  end if;
  if exists (
    select value->>'sheet_name'
    from jsonb_array_elements(p_sheets)
    group by value->>'sheet_name'
    having count(*) > 1
  ) then
    raise exception 'A workbook sheet was supplied more than once.';
  end if;

  for sheet in select value from jsonb_array_elements(p_sheets)
  loop
    if not (sheet ? 'sheet_name' and sheet ? 'columns' and sheet ? 'rows')
      or jsonb_typeof(sheet->'columns') <> 'array'
      or jsonb_typeof(sheet->'rows') <> 'array'
    then
      raise exception 'Every workbook sheet must include columns and rows.';
    end if;
    insert into public.workbook_sheets (sheet_name, columns, rows, updated_at)
    values (sheet->>'sheet_name', sheet->'columns', sheet->'rows', now())
    on conflict (sheet_name) do update
      set columns = excluded.columns, rows = excluded.rows, updated_at = now();
  end loop;

  for parsed_year in
    select distinct year_name
    from (
      select nullif(btrim(value->>'Academic Year'), '') as year_name
      from jsonb_array_elements(
        coalesce((select rows from public.workbook_sheets where sheet_name = 'Fee Structure Management'), '[]'::jsonb)
      )
      union all
      select (regexp_match(value->>'Admission Cycle', '([0-9]{4}-[0-9]{2})'))[1]
      from jsonb_array_elements(
        coalesce((select rows from public.workbook_sheets where sheet_name = 'Manage Admission Forms'), '[]'::jsonb)
      )
    ) years
    where year_name is not null
  loop
    insert into public.academic_years (name, active)
    values (parsed_year, true)
    on conflict (name) do update set active = true;
  end loop;

  for record in
    select value from jsonb_array_elements(
      coalesce((select rows from public.workbook_sheets where sheet_name = 'college'), '[]'::jsonb)
    )
  loop
    college_name := nullif(btrim(record->>'College Name'), '');
    university_name := nullif(btrim(record->>'University'), '');
    if college_name is not null then
      if university_name is not null then
        insert into public.universities (name)
        values (university_name)
        on conflict (name) do nothing;
      end if;
      insert into public.colleges (name, code, university_name, university_id, logo_url)
      values (
        college_name,
        nullif(btrim(record->>'Code'), ''),
        university_name,
        (select id from public.universities where name = university_name),
        nullif(btrim(record->>'Logo'), '')
      )
      on conflict (code) where code is not null do update
        set name = excluded.name,
            university_name = excluded.university_name,
            university_id = excluded.university_id,
            logo_url = excluded.logo_url;
    end if;
  end loop;

  for record in
    select value from jsonb_array_elements(
      coalesce((select rows from public.workbook_sheets where sheet_name = 'Courses'), '[]'::jsonb)
    )
  loop
    course_name := nullif(btrim(record->>'Name'), '');
    college_name := nullif(btrim(record->>'College'), '');
    target_college_id := (
      select id from public.colleges
      where lower(name) = lower(college_name)
      order by id limit 1
    );
    if course_name is not null then
      insert into public.courses (
        name, code, enrollment_code, college_id, duration_years, intake_capacity, active
      )
      values (
        course_name,
        nullif(btrim(record->>'Code'), ''),
        nullif(btrim(record->>'Enrollment Code'), '-'),
        target_college_id,
        nullif(record->>'Duration (Years)', '')::numeric,
        coalesce(nullif(record->>'Intake Capacity', '')::integer, 0),
        true
      )
      on conflict (code) do update
        set name = excluded.name,
            enrollment_code = excluded.enrollment_code,
            college_id = excluded.college_id,
            duration_years = excluded.duration_years,
            intake_capacity = excluded.intake_capacity,
            active = true
      where excluded.code is not null;
    end if;
  end loop;

  for record in
    select value from jsonb_array_elements(
      coalesce((select rows from public.workbook_sheets where sheet_name = 'form type'), '[]'::jsonb)
    )
  loop
    type_name := nullif(btrim(record->>'Name'), '');
    if type_name is not null then
      insert into public.form_types (name, code, description, flags, active, workbook_key)
      values (
        type_name,
        nullif(btrim(record->>'Code'), ''),
        coalesce(record->>'Description', ''),
        nullif(btrim(record->>'Flags'), ''),
        lower(coalesce(record->>'Status', 'active')) = 'active',
        'form-type:' || coalesce(record->>'_rowId', lower(type_name))
      )
      on conflict (workbook_key) do update
        set name = excluded.name,
            code = excluded.code,
            description = excluded.description,
            flags = excluded.flags,
            active = excluded.active;
    end if;
  end loop;

  for record in
    select value from jsonb_array_elements(
      coalesce((select rows from public.workbook_sheets where sheet_name = 'branch'), '[]'::jsonb)
    )
  loop
    course_name := nullif(btrim(record->>'Course'), '');
    college_name := nullif(btrim(record->>'College'), '');
    target_course_id := (
      select id from public.courses
      where lower(name) = lower(course_name)
      order by id limit 1
    );
    target_college_id := (
      select id from public.colleges
      where lower(name) = lower(college_name)
      order by id limit 1
    );
    if target_course_id is not null and nullif(btrim(record->>'Branch Name'), '') is not null then
      update public.branches
      set code = nullif(btrim(record->>'Code'), ''),
          enrollment_code = nullif(btrim(record->>'Enrollment Code'), '-'),
          college_id = target_college_id,
          intake = coalesce(nullif(record->>'Intake Capacity', '')::integer, 0),
          active = true
      where branches.course_id = target_course_id
        and lower(branches.name) = lower(btrim(record->>'Branch Name'));
      if not found then
        insert into public.branches (name, code, enrollment_code, course_id, college_id, intake, active)
        values (
          btrim(record->>'Branch Name'),
          nullif(btrim(record->>'Code'), ''),
          nullif(btrim(record->>'Enrollment Code'), '-'),
          target_course_id,
          target_college_id,
          coalesce(nullif(record->>'Intake Capacity', '')::integer, 0),
          true
        );
      end if;
    end if;
  end loop;

  for record in
    select value from jsonb_array_elements(
      coalesce((select rows from public.workbook_sheets where sheet_name = 'Student Profile Schema'), '[]'::jsonb)
    )
  loop
    if nullif(btrim(record->>'Key'), '') is not null
      and nullif(btrim(record->>'Label'), '') is not null
    then
      insert into public.student_profile_fields (
        label, key, input_type, required, force_uppercase, display_order, workbook_key
      )
      values (
        btrim(record->>'Label'),
        btrim(record->>'Key'),
        coalesce(nullif(btrim(record->>'Type'), ''), 'text'),
        lower(coalesce(record->>'Required', 'no')) in ('yes', 'true', '1'),
        lower(coalesce(record->>'Force Upper', 'no')) in ('yes', 'true', '1'),
        coalesce(nullif(record->>'_row_number', '')::integer, 0),
        'profile-field:' || btrim(record->>'Key')
      )
      on conflict (key) do update
        set label = excluded.label,
            input_type = excluded.input_type,
            required = excluded.required,
            force_uppercase = excluded.force_uppercase,
            display_order = excluded.display_order,
            workbook_key = excluded.workbook_key;
    end if;
  end loop;

  for record in
    select value from jsonb_array_elements(
      coalesce((select rows from public.workbook_sheets where sheet_name = 'Manage Fee Schemes'), '[]'::jsonb)
    )
  loop
    scheme_name := nullif(btrim(record->>'Name'), '');
    if scheme_name is not null then
      insert into public.fee_schemes (name, description, active, workbook_key)
      values (
        scheme_name,
        coalesce(record->>'Description', ''),
        lower(coalesce(record->>'Status', 'active')) = 'active',
        'fee-scheme:' || coalesce(record->>'_rowId', lower(scheme_name))
      )
      on conflict (workbook_key) do update
        set description = excluded.description, active = excluded.active;
    end if;
  end loop;

  for record in
    select value from jsonb_array_elements(
      coalesce((select rows from public.workbook_sheets where sheet_name = 'Fee Structure Management'), '[]'::jsonb)
    )
  loop
    course_name := nullif(btrim(record->>'Course'), '');
    type_name := nullif(btrim(record->>'Form Type'), '');
    scheme_name := nullif(btrim(record->>'Fee Scheme'), '');
    target_course_id := (
      select id from public.courses
      where lower(name) = lower(course_name)
      order by id limit 1
    );
    target_form_type_id := (
      select id from public.form_types
      where lower(name) = lower(type_name)
      order by id limit 1
    );
    target_fee_scheme_id := (
      select id from public.fee_schemes
      where lower(name) = lower(scheme_name)
      order by id limit 1
    );
    row_key := nullif(record->>'_rowId', '');
    if course_name is not null
      and nullif(record->>'Total Fee', '') is not null
      and (record->>'Total Fee') ~ '^[0-9]+([.][0-9]+)?$'
    then
      insert into public.fee_structures (
        title, amount_paise, course_id, academic_year, form_type_id, fee_scheme_id,
        components, active, workbook_key
      )
      values (
        concat_ws(' - ', course_name, type_name, scheme_name, record->>'Academic Year'),
        round((record->>'Total Fee')::numeric * 100)::bigint,
        target_course_id,
        nullif(record->>'Academic Year', ''),
        target_form_type_id,
        target_fee_scheme_id,
        jsonb_build_object('summary', record->>'Components'),
        true,
        'fee:' || coalesce(row_key, concat_ws(':', course_name, record->>'Academic Year', type_name, scheme_name))
      )
      on conflict (workbook_key) do update
        set title = excluded.title,
            amount_paise = excluded.amount_paise,
            course_id = excluded.course_id,
            academic_year = excluded.academic_year,
            form_type_id = excluded.form_type_id,
            fee_scheme_id = excluded.fee_scheme_id,
            components = excluded.components,
            active = true;
    end if;
  end loop;

  for record in
    select value from jsonb_array_elements(
      coalesce((select rows from public.workbook_sheets where sheet_name = 'Manage Admission Forms'), '[]'::jsonb)
    )
  loop
    course_name := nullif(btrim(record->>'Course'), '');
    parsed_year := (
      select (regexp_match(record->>'Admission Cycle', '([0-9]{4}-[0-9]{2})'))[1]
    );
    target_course_id := (
      select id from public.courses
      where lower(name) = lower(course_name)
        or lower(code) = lower(coalesce(record->>'Course Code', course_name))
      order by (lower(name) = lower(course_name)) desc
      limit 1
    );
    type_name := nullif(btrim(record->>'Type'), '');
    target_form_type_id := (
      select id from public.form_types
      where lower(name) = lower(type_name)
      order by id limit 1
    );
    row_key := nullif(record->>'_rowId', '');
    sequence_no := sequence_no + 1;
    if target_course_id is not null and row_key is not null then
      insert into public.admission_forms (
        title, description, status, fields, academic_year, course_id, form_type_id, workbook_key
      )
      values (
        concat_ws(' - ', course_name, parsed_year, coalesce(type_name, 'Admission'), sequence_no),
        '',
        'draft',
        '[]'::jsonb,
        parsed_year,
        target_course_id,
        target_form_type_id,
        'admission-form:' || row_key
      )
      on conflict (workbook_key) do update
        set academic_year = excluded.academic_year,
            course_id = excluded.course_id,
            form_type_id = excluded.form_type_id;
    end if;
  end loop;

  for record in
    select value from jsonb_array_elements(
      coalesce((select rows from public.workbook_sheets where sheet_name = 'Merit Formula Management'), '[]'::jsonb)
    )
  loop
    course_name := nullif(btrim(split_part(record->>'Course & Type', ' / ', 1)), '');
    type_name := nullif(btrim(split_part(record->>'Course & Type', ' / ', 2)), '');
    target_course_id := (
      select id from public.courses
      where lower(name) = lower(course_name)
      order by id limit 1
    );
    target_form_type_id := (
      select id from public.form_types
      where lower(name) = lower(type_name)
      order by id limit 1
    );
    row_key := nullif(record->>'_rowId', '');
    if target_course_id is not null and row_key is not null then
      insert into public.merit_schemes (
        title, formula, status, course_id, form_type_id, workbook_key
      )
      values (
        concat_ws(' - ', course_name, type_name, 'Merit Formula'),
        case
          when jsonb_typeof(record->'Rules (JSON)') = 'object' then record->'Rules (JSON)'
          else '{}'::jsonb
        end,
        'published',
        target_course_id,
        target_form_type_id,
        'merit:' || row_key
      )
      on conflict (workbook_key) do update
        set title = excluded.title,
            formula = excluded.formula,
            course_id = excluded.course_id,
            form_type_id = excluded.form_type_id,
            status = excluded.status;
    end if;
  end loop;

  select coalesce(sum(jsonb_array_length(rows)), 0)::integer into imported
  from public.workbook_sheets;
  return imported;
end
$$;

revoke all on function public.import_svit_workbook(jsonb) from public;
grant execute on function public.import_svit_workbook(jsonb) to authenticated;
