alter table public.admission_forms
  add column if not exists college_id uuid references public.colleges (id),
  add column if not exists show_college_logo boolean not null default false,
  add column if not exists college_logo_url text;

alter table public.receipt_sequences
  add column if not exists show_college_logo boolean not null default false;

update public.admission_forms form
set college_logo_url = college.logo_url
from public.colleges college
where form.college_id = college.id
  and form.college_logo_url is distinct from college.logo_url;

create or replace function public.set_admission_form_college_logo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.college_id is null then
    new.college_logo_url := null;
  else
    select college.logo_url
    into new.college_logo_url
    from public.colleges college
    where college.id = new.college_id;
  end if;
  return new;
end
$$;

drop trigger if exists admission_forms_college_logo_insert on public.admission_forms;
create trigger admission_forms_college_logo_insert
before insert on public.admission_forms
for each row
execute function public.set_admission_form_college_logo();

drop trigger if exists admission_forms_college_logo_update on public.admission_forms;
create trigger admission_forms_college_logo_update
before update of college_id on public.admission_forms
for each row
execute function public.set_admission_form_college_logo();

create or replace function public.sync_college_logo_to_admission_forms()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.admission_forms
  set college_logo_url = new.logo_url
  where college_id = new.id;
  return new;
end
$$;

drop trigger if exists colleges_sync_admission_form_logo on public.colleges;
create trigger colleges_sync_admission_form_logo
after update of logo_url on public.colleges
for each row
when (old.logo_url is distinct from new.logo_url)
execute function public.sync_college_logo_to_admission_forms();

-- The bucket is created with the columns that the storage schema of
-- this Supabase version has.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'public'
  ) then
    insert into storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    values (
      'college-logos',
      'college-logos',
      true,
      2097152,
      array['image/jpeg', 'image/png', 'image/webp']
    )
    on conflict (id) do nothing;
  else
    insert into storage.buckets (id, name)
    values ('college-logos', 'college-logos')
    on conflict (id) do nothing;
  end if;
end
$$;

drop policy if exists college_logos_public_read on storage.objects;
create policy college_logos_public_read on storage.objects
for select to anon, authenticated
using (bucket_id = 'college-logos');

drop policy if exists college_logos_admin_insert on storage.objects;
create policy college_logos_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'college-logos' and public.is_admin());

drop policy if exists college_logos_admin_update on storage.objects;
create policy college_logos_admin_update on storage.objects
for update to authenticated
using (bucket_id = 'college-logos' and public.is_admin())
with check (bucket_id = 'college-logos' and public.is_admin());

drop policy if exists college_logos_admin_delete on storage.objects;
create policy college_logos_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'college-logos' and public.is_admin());
