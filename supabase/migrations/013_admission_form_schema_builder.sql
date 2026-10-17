alter table public.admission_forms
  add column if not exists application_fee_paise bigint not null default 0
    check (application_fee_paise >= 0),
  add column if not exists enabled_for_students boolean not null default true,
  add column if not exists enable_branch_selection boolean not null default false,
  add column if not exists allowed_admission_types text[] not null
    default array['Regular']::text[],
  add column if not exists form_layout text not null default 'cards'
    check (form_layout in ('cards', 'tabs', 'simple')),
  add column if not exists form_sections jsonb not null
    default '[{"id":"general","title":"General","layout":"columns","visibility":null}]'::jsonb
    check (jsonb_typeof(form_sections) = 'array');

drop policy if exists admission_course_catalog_read on public.courses;
create policy admission_course_catalog_read on public.courses
for select to authenticated
using (
  active is true
  and exists (
    select 1
    from public.admission_forms form
    where form.course_id = courses.id
      and form.status = 'published'
      and form.enabled_for_students is true
  )
);

drop policy if exists admission_branch_catalog_read on public.branches;
create policy admission_branch_catalog_read on public.branches
for select to authenticated
using (active is true);
