-- Update Enrollment Sequences to include Branch and Category

-- 1. Add columns
ALTER TABLE public.enrollment_sequences 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS admission_type TEXT DEFAULT 'Regular';

-- 2. Drop old UNIQUE constraint
ALTER TABLE public.enrollment_sequences 
DROP CONSTRAINT IF EXISTS enrollment_sequences_college_id_course_id_academic_year_id_key;

-- 3. Add new UNIQUE Index that handles NULLs (using COALESCE for robustness)
-- We treat NULL branch_id as '0000...' and NULL admission_type as 'Regular' (though we set default)
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_sequences_unique 
ON public.enrollment_sequences (
    college_id, 
    course_id, 
    academic_year_id, 
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'), 
    COALESCE(admission_type, 'Regular')
);
