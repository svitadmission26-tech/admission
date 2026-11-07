-- Migration 062: normalize inquiry gender values before constraint checks

alter table public.inquiries
  drop constraint if exists inquiries_gender_check;

update public.inquiries
set gender = lower(trim(gender))
where gender is not null
  and gender <> lower(trim(gender));

alter table public.inquiries
  add constraint inquiries_gender_check
  check (gender in ('male', 'female', 'other', ''));

create or replace function public.normalize_inquiry_gender()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.gender is not null then
    new.gender := lower(trim(new.gender));
  end if;
  return new;
end;
$$;

drop trigger if exists inquiries_normalize_gender on public.inquiries;
create trigger inquiries_normalize_gender
before insert or update of gender on public.inquiries
for each row
execute function public.normalize_inquiry_gender();
