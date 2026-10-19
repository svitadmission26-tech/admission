-- Add RPC for fetching faculties by college and department for dynamic inquiry form
drop function if exists public.get_faculties_for_inquiry;

create or replace function public.get_faculties_for_inquiry(
    p_college_id uuid default null,
    p_department text default ''
)
returns table (
    id uuid,
    name text,
    code text,
    department text,
    college_id uuid,
    designation text,
    email text,
    active boolean
)
language plpgsql
security definer
as $$
begin
    return query
    select f.id, f.name, f.code, f.department, f.college_id, f.designation, f.email, f.active
    from public.faculty f
    where f.active = true
    and (
        (p_college_id is null and p_department = '')
        or (p_college_id is not null and f.college_id = p_college_id)
        or (p_department <> '' and f.department ilike p_department || '%')
    )
    order by f.name;
end;
$$;

revoke all on function public.get_faculties_for_inquiry(uuid, text) from public;
grant execute on function public.get_faculties_for_inquiry(uuid, text) to anon, authenticated;
