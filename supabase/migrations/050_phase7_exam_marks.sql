-- Migration 050: Dynamic marks entry module (Phase 7)
-- Adds exam/board/subject masters, course-wise applicability, admission-form exam
-- tabs, independent exam result storage and configurable merit calculation.
-- Idempotent and safe to re-run.

create table if not exists public.exam_masters (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_masters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subject_masters (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_subjects (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.board_masters (id) on delete cascade,
  subject_id uuid not null references public.subject_masters (id) on delete cascade,
  theory_max numeric not null default 0,
  practical_max numeric not null default 0,
  has_practical boolean not null default true,
  display_order integer not null default 100,
  active boolean not null default true,
  unique (board_id, subject_id)
);

create table if not exists public.course_exam_applicability (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  exam_id uuid not null references public.exam_masters (id) on delete cascade,
  enabled boolean not null default true,
  display_order integer not null default 100,
  unique (course_id, exam_id)
);

alter table public.admission_forms
  add column if not exists exam_tabs jsonb not null default '[]'::jsonb;

create table if not exists public.student_exam_marks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  exam_id uuid references public.exam_masters (id) on delete set null,
  board_id uuid references public.board_masters (id) on delete set null,
  subject_id uuid references public.subject_masters (id) on delete set null,
  subject_name text,
  theory_max numeric not null default 0,
  theory_obtained numeric not null default 0,
  practical_max numeric not null default 0,
  practical_obtained numeric not null default 0,
  subject_total numeric generated always as (theory_obtained + practical_obtained) stored,
  percentage numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (theory_obtained <= theory_max),
  check (practical_obtained <= practical_max)
);

create table if not exists public.student_exam_results (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  exam_id uuid references public.exam_masters (id) on delete set null,
  field_key text not null,
  field_value text,
  document_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merit_calculation_settings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses (id) on delete cascade,
  mode text not null default 'separate'
    check (mode in ('separate', 'include_extra')),
  formula text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.exam_masters enable row level security;
alter table public.board_masters enable row level security;
alter table public.subject_masters enable row level security;
alter table public.board_subjects enable row level security;
alter table public.course_exam_applicability enable row level security;
alter table public.student_exam_marks enable row level security;
alter table public.student_exam_results enable row level security;
alter table public.merit_calculation_settings enable row level security;

-- admin manage, authenticated read
do $$
declare t text;
begin
  foreach t in array array['exam_masters','board_masters','subject_masters','board_subjects','course_exam_applicability','merit_calculation_settings'] loop
    execute format('drop policy if exists %I_admin_manage on public.%I', t, t);
    execute format('create policy %I_admin_manage on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select to authenticated using (true)', t, t);
  end loop;
end$$;

-- students can read/write their own marks/results
drop policy if exists student_exam_marks_owner on public.student_exam_marks;
create policy student_exam_marks_owner on public.student_exam_marks
  for all to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = student_exam_marks.application_id
        and a.student_id = auth.uid()
    ) or public.is_admin()
  )
  with check (
    exists (
      select 1 from public.applications a
      where a.id = student_exam_marks.application_id
        and a.student_id = auth.uid()
    ) or public.is_admin()
  );

drop policy if exists student_exam_results_owner on public.student_exam_results;
create policy student_exam_results_owner on public.student_exam_results
  for all to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = student_exam_results.application_id
        and a.student_id = auth.uid()
    ) or public.is_admin()
  )
  with check (
    exists (
      select 1 from public.applications a
      where a.id = student_exam_results.application_id
        and a.student_id = auth.uid()
    ) or public.is_admin()
  );

grant select, insert, update, delete on public.exam_masters to authenticated;
grant select, insert, update, delete on public.board_masters to authenticated;
grant select, insert, update, delete on public.subject_masters to authenticated;
grant select, insert, update, delete on public.board_subjects to authenticated;
grant select, insert, update, delete on public.course_exam_applicability to authenticated;
grant select, insert, update, delete on public.student_exam_marks to authenticated;
grant select, insert, update, delete on public.student_exam_results to authenticated;
grant select, insert, update, delete on public.merit_calculation_settings to authenticated;

insert into public.exam_masters (code, name, description)
values
  ('board', 'Board Exam', 'Board examination marks'),
  ('nata', 'NATA Exam', 'NATA examination result'),
  ('gujcet', 'GUJCET Exam', 'GUJCET examination result'),
  ('neet', 'NEET Exam', 'NEET examination result')
on conflict (code) do nothing;
