alter table public.student_profile_fields
  add column if not exists text_case text not null default 'none',
  add column if not exists options jsonb not null default '[]'::jsonb;

update public.student_profile_fields
set text_case = 'uppercase'
where force_uppercase and text_case = 'none';

alter table public.student_profile_fields
  drop constraint if exists student_profile_fields_text_case_check;

alter table public.student_profile_fields
  add constraint student_profile_fields_text_case_check
  check (text_case in ('none', 'uppercase', 'lowercase'));

alter table public.student_profile_fields
  drop constraint if exists student_profile_fields_options_array_check;

alter table public.student_profile_fields
  add constraint student_profile_fields_options_array_check
  check (jsonb_typeof(options) = 'array');
