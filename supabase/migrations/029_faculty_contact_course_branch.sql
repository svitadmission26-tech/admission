-- Update faculty table: remove department, add branch_id, course_id, contact_number
-- Migration handles RLS dependencies on faculty.department before dropping the column

-- Step 1: Drop all RLS policies that reference faculty.department
drop policy if exists faculty_academics_read on public.faculty;
create policy faculty_academics_read on public.faculty
for select to authenticated
using (
  (public.has_permission('academics.read')
    or public.has_permission('academics.manage'))
);
drop policy if exists faculty_academics_manage on public.faculty;
create policy faculty_academics_manage on public.faculty
for all to authenticated
using (
  public.has_permission('academics.manage')
)
with check (
  public.has_permission('academics.manage')
);

drop policy if exists faculty_leaves_read on public.faculty_leaves;
create policy faculty_leaves_read on public.faculty_leaves
for select to authenticated
using (
  (
    public.has_permission('academics.manage')
    or faculty_id = public.current_faculty_id()
  )
);
drop policy if exists faculty_leaves_insert on public.faculty_leaves;
create policy faculty_leaves_insert on public.faculty_leaves
for insert to authenticated
with check (
  (
    public.has_permission('academics.manage')
    or faculty_id = public.current_faculty_id()
  )
);
drop policy if exists faculty_leaves_manage on public.faculty_leaves;
create policy faculty_leaves_manage on public.faculty_leaves
for all to authenticated
using (
  public.has_permission('academics.manage')
)
with check (
  public.has_permission('academics.manage')
);

-- Step 2: Add new columns
alter table public.faculty 
  add column if not exists branch_id uuid references public.branches(id) on delete set null,
  add column if not exists course_id uuid references public.courses(id) on delete set null,
  add column if not exists contact_number text;

-- Step 3: Remove the department column
alter table public.faculty 
  drop column if exists department;

-- Step 4: Update RPC to reflect new structure
drop function if exists public.get_faculties_for_inquiry;

create or replace function public.get_faculties_for_inquiry(
    p_college_id uuid default null,
    p_department text default ''  -- Kept for API compatibility but ignored since department was removed
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
    active boolean
)
language plpgsql
security definer
as $$
begin
    return query
    select f.id, f.name, f.code, f.branch_id, f.course_id, f.college_id, 
           f.designation, f.contact_number, f.email, f.active
    from public.faculty f
    where f.active = true
    and (
        (p_college_id is null and p_department = '')
        or (p_college_id is not null and f.college_id = p_college_id)
        -- p_department parameter kept for backward compatibility only
    )
    order by f.name;
end;
$$;

revoke all on function public.get_faculties_for_inquiry(uuid, text) from public;
grant execute on function public.get_faculties_for_inquiry(uuid, text) to anon, authenticated;

-- Step 5: Also update branches and courses tables to allow storing contact_number
alter table public.branches 
  add column if not exists contact_number text;

alter table public.courses 
  add column if not exists contact_number text;