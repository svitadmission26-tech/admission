-- Fix unique constraint for admission_sequences to include admission_type
-- This allows different sequences for Regular, D2D, and C2D admission types

DO $$
BEGIN
    -- 1. Drop old constraint if it exists
    ALTER TABLE public.admission_sequences 
    DROP CONSTRAINT IF EXISTS admission_sequences_college_id_course_id_academic_year_id_key;
    
    -- 2. Drop the old constraint that only includes prefix (if it exists)
    ALTER TABLE public.admission_sequences 
    DROP CONSTRAINT IF EXISTS admission_sequences_full_unique_key;

    -- 3. Add new constraint that includes both prefix AND admission_type
    ALTER TABLE public.admission_sequences 
    ADD CONSTRAINT admission_sequences_unique_with_type 
    UNIQUE(college_id, course_id, academic_year_id, prefix, admission_type);

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error adjusting constraints: %', SQLERRM;
END $$;
