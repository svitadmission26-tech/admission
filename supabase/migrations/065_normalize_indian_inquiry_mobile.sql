-- Migration 065: accept formatted Indian mobile numbers for inquiries

create or replace function public.normalize_inquiry_mobile()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.mobile is not null then
    if new.mobile !~ '^[+0-9[:space:].()-]+$' then
      raise exception 'Enter a valid Indian mobile number';
    end if;

    new.mobile := regexp_replace(trim(new.mobile), '[[:space:].()+-]', '', 'g');
    if length(new.mobile) = 12 and left(new.mobile, 2) = '91' then
      new.mobile := substr(new.mobile, 3);
    elsif length(new.mobile) = 11 and left(new.mobile, 1) = '0' then
      new.mobile := substr(new.mobile, 2);
    end if;
  end if;

  if new.mobile is null or new.mobile !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9';
  end if;

  return new;
end;
$$;

drop trigger if exists inquiries_normalize_mobile on public.inquiries;
create trigger inquiries_normalize_mobile
before insert or update of mobile on public.inquiries
for each row
execute function public.normalize_inquiry_mobile();
