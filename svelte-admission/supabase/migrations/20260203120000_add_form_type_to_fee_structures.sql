-- Add form_type to fee_structures
ALTER TABLE public.fee_structures
ADD COLUMN IF NOT EXISTS form_type TEXT DEFAULT 'Provisional';

-- Add check constraint to ensure validity (optional but recommended)
-- We use the same values as admission_forms
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_structures_form_type_check') THEN
        ALTER TABLE public.fee_structures
        ADD CONSTRAINT fee_structures_form_type_check
        CHECK (form_type IN ('ACPC', 'Provisional', 'MQ/NRI', 'Vacant'));
    END IF;
END $$;

-- Ensure uniqueness per course, academic year AND form_type
-- First drop any potential existing unique constraint on just course and academic year if it exists (though schema.sql didn't show one explicitly, implicit ones might exist)
-- We will just add the new unique constraint.
ALTER TABLE public.fee_structures
DROP CONSTRAINT IF EXISTS fee_structures_unique_key; -- specific name if exists

-- Create new unique constraint
ALTER TABLE public.fee_structures
ADD CONSTRAINT fee_structures_unique_key UNIQUE (course_id, academic_year_id, form_type);
