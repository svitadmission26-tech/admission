-- Update Enrollment Sequences to support CollegeID format

-- 1. Add 'short_code' to public.academic_years
ALTER TABLE public.academic_years 
ADD COLUMN IF NOT EXISTS short_code TEXT; -- e.g., '25' for '2025-2026'

-- 2. Drop 'admission_category' from enrollment_sequences
ALTER TABLE public.enrollment_sequences
DROP COLUMN IF EXISTS admission_category;

-- 3. Drop old UNIQUE constraint from enrollment_sequences
ALTER TABLE public.enrollment_sequences 
DROP CONSTRAINT IF EXISTS idx_enrollment_sequences_unique; -- This is the one I added in fix_missing_tables.sql
ALTER TABLE public.enrollment_sequences 
DROP CONSTRAINT IF EXISTS enrollment_sequences_college_id_course_id_academic_year_id_key; -- Original one

-- 4. Add new UNIQUE constraint on enrollment_sequences
-- Sequence is now per college, course, academic year, and branch.
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_sequences_college_id_unique 
ON public.enrollment_sequences (
    college_id, 
    course_id, 
    academic_year_id, 
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'), -- Handle NULL branch_id
    admission_type
);
