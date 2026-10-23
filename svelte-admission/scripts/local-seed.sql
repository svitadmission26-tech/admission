-- Demo seed data for the local Supabase-compatible stack.
-- Safe to re-run: every statement is idempotent.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Institution ---------------------------------------------------------------
INSERT INTO public.universities (id, name, code, address, contact_email)
VALUES ('11111111-1111-4111-8111-111111111111', 'Gujarat Technological University', 'GTU',
        'Nr. Visat Three Roads, Chandkheda, Ahmedabad', 'info@gtu.ac.in')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.colleges (id, university_id, name, code, address)
VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
        'Sardar Vallabhbhai Patel Institute of Technology', 'SVIT',
        'Vasad, Anand, Gujarat 388306')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.academic_years (id, name, start_date, end_date, is_active)
VALUES ('33333333-3333-4333-8333-333333333333', '2026-2027', '2026-06-01', '2027-05-31', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.admission_cycles (id, academic_year_id, name, start_date, end_date, is_active)
VALUES ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333',
        'Admission 2026-27', '2026-06-01', '2026-08-31', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Programmes ----------------------------------------------------------------
INSERT INTO public.courses (id, college_id, name, code, duration_years, intake_capacity)
VALUES
  ('55555555-5555-4555-8555-555555555551', '22222222-2222-4222-8222-222222222222', 'B.E. Computer Engineering', 'CE', 4, 120),
  ('55555555-5555-4555-8555-555555555552', '22222222-2222-4222-8222-222222222222', 'B.E. Information Technology', 'IT', 4, 120),
  ('55555555-5555-4555-8555-555555555553', '22222222-2222-4222-8222-222222222222', 'B.E. Electronics & Communication', 'EC', 4, 60),
  ('55555555-5555-4555-8555-555555555554', '22222222-2222-4222-8222-222222222222', 'B.E. Mechanical Engineering', 'ME', 4, 60),
  ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', 'B.E. Civil Engineering', 'CL', 4, 60)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.branches (id, course_id, name, code)
VALUES
  ('66666666-6666-4666-8666-666666666661', '55555555-5555-4555-8555-555555555551', 'Computer Engineering - Morning', 'CE-1'),
  ('66666666-6666-4666-8666-666666666662', '55555555-5555-4555-8555-555555555552', 'Information Technology - Morning', 'IT-1')
ON CONFLICT (id) DO NOTHING;

-- Form types ----------------------------------------------------------------
INSERT INTO public.form_types (name, code, description, is_active, requires_merit_calculation,
                               allow_partial_payment, is_government_quota, application_fee_required)
VALUES
  ('Regular', 'REG', 'Regular ACPC / institute level admission', TRUE, TRUE, TRUE, FALSE, TRUE),
  ('Provisional', 'PROV', 'Provisional admission with seat reservation', TRUE, FALSE, TRUE, FALSE, TRUE),
  ('MQ/NRI', 'MQ', 'Management / NRI quota admission', TRUE, TRUE, TRUE, FALSE, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Fee schemes and structures ------------------------------------------------
INSERT INTO public.fee_schemes (id, name, description, is_active)
VALUES ('77777777-7777-4777-8777-777777777777', 'SVIT Standard 2026-27',
        'Default fee scheme used by the local demo data', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fee_structures (course_id, academic_year_id, form_type, total_fee,
                                   installment_json, fee_scheme_id)
SELECT c.id, '33333333-3333-4333-8333-333333333333', 'Regular', 132000,
       '[{"amount":66000,"due_date":"2026-07-15","description":"Semester 1"},{"amount":66000,"due_date":"2027-01-15","description":"Semester 2"}]'::jsonb,
       '77777777-7777-4777-8777-777777777777'
FROM public.courses c
WHERE c.college_id = '22222222-2222-4222-8222-222222222222'
  AND NOT EXISTS (
    SELECT 1 FROM public.fee_structures f
    WHERE f.course_id = c.id
      AND f.academic_year_id = '33333333-3333-4333-8333-333333333333'
      AND f.form_type = 'Regular'
  );

-- Admission sequences -------------------------------------------------------
INSERT INTO public.admission_sequences (college_id, course_id, academic_year_id, current_sequence, admission_type, prefix)
SELECT '22222222-2222-4222-8222-222222222222', c.id, '33333333-3333-4333-8333-333333333333',
       0, 'Regular', 'SVIT/ADM/26/' || c.code || '/'
FROM public.courses c
WHERE c.college_id = '22222222-2222-4222-8222-222222222222'
  AND NOT EXISTS (
    SELECT 1 FROM public.admission_sequences s
    WHERE s.course_id = c.id
      AND s.academic_year_id = '33333333-3333-4333-8333-333333333333'
  );
