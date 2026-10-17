create table if not exists public.inquiry_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  academic_year text,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  description text not null default '',
  layout text not null default 'cards'
    check (layout in ('cards', 'simple', 'tabs')),
  sections jsonb not null default '[{"id":"general","title":"General","layout":"columns"}]'::jsonb
    check (jsonb_typeof(sections) = 'array'),
  fields jsonb not null default '[]'::jsonb
    check (jsonb_typeof(fields) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists inquiry_forms_slug_unique
  on public.inquiry_forms (lower(slug));

create table if not exists public.report_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  base_table text not null,
  template_type text not null default 'tabular'
    check (template_type in ('tabular')),
  allowed_roles text[] not null default array[]::text[],
  selected_columns jsonb not null
    check (jsonb_typeof(selected_columns) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inquiry_forms enable row level security;
alter table public.report_templates enable row level security;

drop policy if exists admin_all on public.inquiry_forms;
create policy admin_all on public.inquiry_forms
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_all on public.report_templates;
create policy admin_all on public.report_templates
for all to authenticated
using (public.is_admin())
with check (public.is_admin());
