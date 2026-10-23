-- Migration: Add Direct Admission on Submit flag to form_types
-- Path: new_database/add_direct_admission_to_form_types.sql

-- 1. Add the boolean flag if it doesn't exist
ALTER TABLE public.form_types 
ADD COLUMN IF NOT EXISTS direct_admission_on_submit BOOLEAN DEFAULT false;

-- 2. Add documentation comment
COMMENT ON COLUMN public.form_types.direct_admission_on_submit IS 'If true, applications of this form type bypass verification/approval and get admitted immediately upon submission or application fee payment.';
