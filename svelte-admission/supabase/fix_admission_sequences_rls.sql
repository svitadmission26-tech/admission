
-- Fix unique constraint for admission sequences to include prefix
-- This allows different numbering series for different form types (e.g. MQ, ACPC, etc.)

DO $$
BEGIN
    -- 1. Drop old constraint if it exists
    ALTER TABLE public.admission_sequences 
    DROP CONSTRAINT IF EXISTS admission_sequences_college_id_course_id_academic_year_id_key;

    -- 2. Add new constraint that includes prefix
    ALTER TABLE public.admission_sequences 
    ADD CONSTRAINT admission_sequences_full_unique_key 
    UNIQUE(college_id, course_id, academic_year_id, prefix);

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error adjusting constraints: %', SQLERRM;
END $$;
