-- Migration 069: repeatedly remove recognized country and trunk prefixes

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

    while length(new.mobile) > 10 loop
      if left(new.mobile, 4) = '0091' then
        new.mobile := substr(new.mobile, 5);
      elsif left(new.mobile, 2) = '91' then
        new.mobile := substr(new.mobile, 3);
      elsif left(new.mobile, 1) = '0' then
        new.mobile := substr(new.mobile, 2);
      else
        exit;
      end if;
    end loop;
  end if;

  if new.mobile is null or new.mobile !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9';
  end if;

  return new;
end;
$$;
