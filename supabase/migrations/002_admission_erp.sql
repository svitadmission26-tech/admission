-- Run in Supabase SQL Editor on a NEW development project.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now()
);

create function public.new_user_profile () returns trigger language plpgsql security definer
set
  search_path = public,
  pg_temp as $$begin insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','')); return new; end$$;

create trigger auth_user_profile
after insert on auth.users for each row
execute function public.new_user_profile ();

create function public.is_admin () returns boolean language sql stable security definer
set
  search_path = public,
  pg_temp as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;

revoke all on function public.is_admin ()
from
  public;

grant
execute on function public.is_admin () to authenticated;

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean default true
);

create table public.colleges (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references universities (id),
  name text not null,
  active boolean default true
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  active boolean default true
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id),
  name text not null,
  intake integer not null default 0 check (intake >= 0),
  active boolean default true
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_on date,
  ends_on date,
  active boolean default true
);

create table public.admission_forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  created_at timestamptz default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles (id),
  form_id uuid not null references admission_forms (id),
  application_number text unique not null default (
    'SVIT-' || upper(
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
    )
  ),
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'submitted' check (
    status in (
      'submitted',
      'under_review',
      'approved',
      'rejected'
    )
  ),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  student_id uuid not null references profiles (id),
  label text not null,
  storage_path text not null,
  created_at timestamptz default now()
);

create table public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount_paise bigint not null check (amount_paise >= 0),
  active boolean default true
);

create table public.fee_assignments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id),
  fee_structure_id uuid references fee_structures (id),
  amount_paise bigint not null check (amount_paise >= 0),
  unique (application_id, fee_structure_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references fee_assignments (id),
  amount_paise bigint not null check (amount_paise > 0),
  reference text not null unique,
  mode text not null check (mode in ('cash', 'cheque', 'bank_transfer')),
  recorded_at timestamptz default now()
);

create table public.merit_schemes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  formula jsonb not null default '{}'::jsonb,
  status text default 'draft' check (status in ('draft', 'published'))
);

create table public.merit_entries (
  id uuid primary key default gen_random_uuid(),
  scheme_id uuid not null references merit_schemes (id),
  application_id uuid not null references applications (id),
  score numeric(10, 3) not null,
  rank integer,
  category text,
  published boolean not null default false,
  unique (scheme_id, application_id)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles (id),
  action text not null,
  entity text not null,
  entity_id text,
  at timestamptz default now()
);

create index on applications (student_id);

create index on applications (status);

create index on documents (student_id);

create index on fee_assignments (application_id);

create index on merit_entries (application_id);

alter table profiles enable row level security;

create policy profiles_read on profiles for
select
  to authenticated using (
    id = auth.uid ()
    or public.is_admin ()
  );

create policy profiles_admin_update on profiles
for update
  to authenticated using (public.is_admin ())
with
  check (public.is_admin ());

-- Student must never self-assign an admin role. Only provision admins via trusted SQL/admin process.
do $$declare t text; begin foreach t in array array['universities','colleges','courses','branches','academic_years','admission_forms','fee_structures','fee_assignments','payments','merit_schemes','merit_entries','audit_logs'] loop execute format('alter table public.%I enable row level security',t); execute format('create policy admin_all on public.%I for all to authenticated using(public.is_admin()) with check(public.is_admin())',t); end loop; end$$;

create policy published_forms_read on admission_forms for
select
  to authenticated using (status = 'published');

create policy student_merit_read on merit_entries for
select
  to authenticated using (
    published
    and exists (
      select
        1
      from
        applications a
      where
        a.id = application_id
        and a.student_id = auth.uid ()
    )
  );

alter table applications enable row level security;

create policy app_admin on applications for all to authenticated using (public.is_admin ())
with
  check (public.is_admin ());

create policy app_student_read on applications for
select
  to authenticated using (student_id = auth.uid ());

create policy app_student_insert on applications for insert to authenticated
with
  check (
    student_id = auth.uid ()
    and status = 'submitted'
    and exists (
      select
        1
      from
        admission_forms f
      where
        f.id = form_id
        and f.status = 'published'
    )
  );

revoke insert on public.applications
from
  authenticated;

grant insert (student_id, form_id, answers) on public.applications to authenticated;

alter table documents enable row level security;

create policy docs_admin on documents for all to authenticated using (public.is_admin ())
with
  check (public.is_admin ());

create policy docs_student_read on documents for
select
  to authenticated using (student_id = auth.uid ());

create policy docs_student_insert on documents for insert to authenticated
with
  check (
    student_id = auth.uid ()
    and exists (
      select
        1
      from
        applications a
      where
        a.id = application_id
        and a.student_id = auth.uid ()
    )
  );

revoke insert on public.documents
from
  authenticated;

grant insert (application_id, student_id, label, storage_path) on public.documents to authenticated;

create policy own_fees on fee_assignments for
select
  to authenticated using (
    exists (
      select
        1
      from
        applications a
      where
        a.id = application_id
        and a.student_id = auth.uid ()
    )
  );

create policy own_payments on payments for
select
  to authenticated using (
    exists (
      select
        1
      from
        fee_assignments fa
        join applications a on a.id = fa.application_id
      where
        fa.id = assignment_id
        and a.student_id = auth.uid ()
    )
  );

insert into
  storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
  )
values
  (
    'student-documents',
    'student-documents',
    false,
    5242880,
    array['application/pdf', 'image/jpeg', 'image/png']
  )
on conflict (id) do nothing;

create policy student_upload on storage.objects for insert to authenticated
with
  check (
    bucket_id = 'student-documents'
    and (storage.foldername (name)) [1] = auth.uid ()::text
  );

create policy student_read on storage.objects for
select
  to authenticated using (
    bucket_id = 'student-documents'
    and (
      (storage.foldername (name)) [1] = auth.uid ()::text
      or public.is_admin ()
    )
  );

-- Initial admin: sign up a user, then in trusted SQL editor:
-- update public.profiles set role='admin' where id='<AUTH_USER_UUID>';
