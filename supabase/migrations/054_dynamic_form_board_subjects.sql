-- Migration 054: add board subjects from the admission form builder
-- Subject and board-subject writes are performed atomically and admin-only.
create or replace function public.admin_add_board_subject(
  p_board_id uuid,
  p_name text,
  p_code text default null,
  p_theory_max numeric default 0,
  p_has_practical boolean default true,
  p_practical_max numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_subject_id uuid;
  v_board_subject_id uuid;
  v_display_order integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  if p_board_id is null or not exists (
    select 1 from public.board_masters where id = p_board_id and active
  ) then
    raise exception 'Select an active board';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Subject name is required';
  end if;

  if p_theory_max is null or p_theory_max < 0
     or p_theory_max::text in ('NaN', 'Infinity', '-Infinity')
     or p_practical_max is null or p_practical_max < 0
     or p_practical_max::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Maximum marks must be zero or more';
  end if;

  if not coalesce(p_has_practical, false) and p_practical_max > 0 then
    raise exception 'Practical maximum marks require practical marks to be enabled';
  end if;

  select id into v_subject_id
  from public.subject_masters
  where active
    and lower(trim(name)) = lower(trim(p_name))
  order by created_at, id
  limit 1;

  if v_subject_id is null then
    insert into public.subject_masters (code, name)
    values (nullif(trim(coalesce(p_code, '')), ''), trim(p_name))
    returning id into v_subject_id;
  end if;

  if exists (
    select 1 from public.board_subjects
    where board_id = p_board_id and subject_id = v_subject_id
  ) then
    raise exception 'This subject is already configured for the selected board';
  end if;

  select coalesce(max(display_order), 0) + 100
  into v_display_order
  from public.board_subjects
  where board_id = p_board_id;

  insert into public.board_subjects (
    board_id,
    subject_id,
    theory_max,
    practical_max,
    has_practical,
    display_order
  )
  values (
    p_board_id,
    v_subject_id,
    p_theory_max,
    case when p_has_practical then p_practical_max else 0 end,
    coalesce(p_has_practical, false),
    v_display_order
  )
  returning id into v_board_subject_id;

  return v_board_subject_id;
end;
$function$;

revoke all on function public.admin_add_board_subject(uuid, text, text, numeric, boolean, numeric) from public;
revoke execute on function public.admin_add_board_subject(uuid, text, text, numeric, boolean, numeric) from anon;
grant execute on function public.admin_add_board_subject(uuid, text, text, numeric, boolean, numeric) to authenticated;
