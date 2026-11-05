-- Migration 053: dynamic PDF template builder
-- The template policy relies on the shared admin detector. When a database is
-- still being bootstrapped or a legacy install is missing that helper, the
-- migration should not crash the app with a 500 during page load.
do $migration$
begin
  if to_regprocedure('public.is_admin()') is null then
    begin
      execute $create_admin$
        create or replace function public.is_admin()
        returns boolean
        language sql
        stable
        security definer
        set search_path = public, pg_temp
        as $function_body$
          select exists (
            select 1
            from public.profiles
            where id = auth.uid()
              and role = 'admin'
          );
        $function_body$
      $create_admin$;
    exception
      when others then
        raise warning 'the fallback admin helper could not be created: %', sqlerrm;
    end;
  end if;
end;
$migration$;

create table if not exists public.pdf_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  form_type text not null,
  orientation text not null default 'portrait' check (orientation in ('portrait','landscape')),
  fields jsonb not null default '[]'::jsonb,
  header_text text,
  footer_text text,
  show_page_numbers boolean not null default true,
  font_size integer not null default 11,
  logo_url text,
  version integer not null default 1,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pdf_templates enable row level security;
drop policy if exists pdf_templates_admin_manage on public.pdf_templates;
create policy pdf_templates_admin_manage on public.pdf_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists pdf_templates_read on public.pdf_templates;
create policy pdf_templates_read on public.pdf_templates
  for select to authenticated using (true);

grant select, insert, update, delete on public.pdf_templates to authenticated;
