-- Migration 064: strip periods from inquiry mobile numbers

create or replace function public.normalize_inquiry_mobile()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.mobile is not null then
    new.mobile := regexp_replace(trim(new.mobile), '[[:space:].-]', '', 'g');
  end if;

  if new.mobile is null or new.mobile !~ '^[6-9][0-9]{9}$' then
    raise exception 'Mobile number must be a 10-digit Indian mobile number starting with 6, 7, 8, or 9';
  end if;

  return new;
end;
$$;
