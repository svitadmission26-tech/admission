-- Migration 024: ERP Document Modules & Enhancements
-- Aligns database with 'erp College information.docx' requirements:
-- 1. Notice Board for Students & Public
-- 2. Faculty list college-wise, department-wise & designation hierarchy
-- 3. Faculty Leave approval by post (Staff -> HOD, HOD -> Principal, Principal -> Chairman) & document attachment
-- 4. Student Management admission year, ID-wise and enrollment-wise tracking

-- 1. Notice Board table
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  content text not null check (length(trim(content)) > 0),
  target_audience text not null default 'all' check (target_audience in ('all', 'students', 'public', 'faculty')),
  attachment_url text,
  pinned boolean not null default false,
  published boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notices_target_audience_idx on public.notices (target_audience, published);
create index if not exists notices_pinned_idx on public.notices (pinned desc, created_at desc);

alter table public.notices enable row level security;

drop policy if exists notices_read on public.notices;
create policy notices_read on public.notices
  for select
  to anon, authenticated
  using (
    published = true
    or (auth.role() = 'authenticated' and (
      public.has_permission('admissions.manage')
      or public.has_permission('academics.manage')
    ))
  );

drop policy if exists notices_manage on public.notices;
create policy notices_manage on public.notices
  for all
  to authenticated
  using (
    public.has_permission('admissions.manage')
    or public.has_permission('academics.manage')
  )
  with check (
    public.has_permission('admissions.manage')
    or public.has_permission('academics.manage')
  );

-- 2. Faculty college-wise, department-wise & post hierarchy enhancements
alter table public.faculty add column if not exists college_id uuid references public.colleges (id) on delete set null;
alter table public.faculty add column if not exists designation text not null default 'staff';

-- 3. Faculty Leaves hierarchical approvals & document link
alter table public.faculty_leaves add column if not exists document_url text;
alter table public.faculty_leaves add column if not exists applicant_post text not null default 'staff';
alter table public.faculty_leaves add column if not exists approver_post text not null default 'hod';
alter table public.faculty_leaves add column if not exists department text not null default '';

-- 4. Students admission year & ID tracking
alter table public.students add column if not exists admission_year text default '2025-2026';
alter table public.students add column if not exists student_id_code text default '';

-- 5. Enhanced leave application RPC
create or replace function public.apply_faculty_leave_v2(
  p_faculty_id uuid,
  p_start_date date,
  p_end_date date,
  p_leave_type text,
  p_reason text,
  p_document_url text default null,
  p_applicant_post text default 'staff',
  p_approver_post text default 'hod',
  p_department text default ''
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

  if p_start_date is null or p_end_date is null then
    raise exception 'Start date and end date are required';
  end if;

  if p_end_date < p_start_date then
    raise exception 'End date cannot be earlier than start date';
  end if;

  if coalesce(trim(p_leave_type), '') = '' then
    raise exception 'Leave type is required';
  end if;

  insert into public.faculty_leaves (
    faculty_id,
    start_date,
    end_date,
    leave_type,
    reason,
    created_by,
    document_url,
    applicant_post,
    approver_post,
    department
  )
  values (
    p_faculty_id,
    p_start_date,
    p_end_date,
    trim(p_leave_type),
    coalesce(trim(p_reason), ''),
    auth.uid(),
    p_document_url,
    coalesce(nullif(trim(p_applicant_post), ''), 'staff'),
    coalesce(nullif(trim(p_approver_post), ''), 'hod'),
    coalesce(trim(p_department), '')
  )
  returning * into v_leave;

  return v_leave;
end;
$$;
