-- Migration 068: remove sequential country and trunk prefixes from inquiry mobiles

create or replace function public.normalize_inquiry_mobile()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.mobile is not null then
    new.mobile := translate(
      new.mobile,
      '૦૧૨૩૪૫૬૭૮૯०१२३४५६७८९٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
      '0123456789012345678901234567890123456789'
    );
    new.mobile := regexp_replace(new.mobile, '[^0-9]', '', 'g');

    if length(new.mobile) > 10 and left(new.mobile, 4) = '0091' then
      new.mobile := substr(new.mobile, 5);
    elsif length(new.mobile) > 10 and left(new.mobile, 2) = '91' then
      new.mobile := substr(new.mobile, 3);
    end if;

    if length(new.mobile) = 11 and left(new.mobile, 1) = '0' then
      new.mobile := substr(new.mobile, 2);
    end if;
  end if;

  if new.mobile is null or new.mobile !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9';
  end if;

  return new;
end;
$$;
