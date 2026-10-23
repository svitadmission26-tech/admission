-- 047_new_student_admissions.sql
-- New Student Admission Management module.

create table if not exists public.new_student_admissions (
    id uuid primary key default uuid_generate_v4(),
    admission_number text not null unique,
    student_name text not null,
    email text,
    phone text,
    course_id uuid references public.courses(id) on delete set null,
    branch_id uuid references public.branches(id) on delete set null,
    academic_year_id uuid references public.academic_years(id) on delete set null,
    admission_type text default 'Regular',
    admission_date date,
    status text not null default 'Draft'
        check (status in ('Draft', 'Submitted', 'Verified', 'Approved', 'Cancelled')),
    remarks text,
    created_by uuid references public.profiles(id) on delete set null,
    updated_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists new_student_admissions_status_idx
    on public.new_student_admissions (status);
create index if not exists new_student_admissions_course_idx
    on public.new_student_admissions (course_id);

alter table public.new_student_admissions enable row level security;
drop policy if exists new_student_admissions_read on public.new_student_admissions;
create policy new_student_admissions_read on public.new_student_admissions
    for select to authenticated using (true);
drop policy if exists new_student_admissions_write on public.new_student_admissions;
create policy new_student_admissions_write on public.new_student_admissions
    for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.new_student_admissions to authenticated, anon;

insert into public.erp_modules (
    id, number, title, description, icon, portal, entry_page, permission_page, enabled, display_order
)
values (
    'new_student_admission', 26, 'New Student Admission Management',
    'Manage new student admissions: enrolment, course/branch allotment, admission number and status',
    '🎓', 'new_student_admission', 'New Student Admission Dashboard',
    'New Student Admissions', true, 260
)
on conflict (id) do update set
    number = excluded.number,
    title = excluded.title,
    description = excluded.description,
    icon = excluded.icon,
    portal = excluded.portal,
    entry_page = excluded.entry_page,
    permission_page = excluded.permission_page,
    updated_at = now();
