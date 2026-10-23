-- Migration: Fix receipt sequences unique constraint to support course-wise and payment-type-wise separation.
-- Goal: Ensure separate sequences for Admission (Tuition), Application, and Provisional fees.

-- 1. Drop existing restricted constraint
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_unique_scope;
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_payment_type_academic_year_id_key;

-- 2. Add full unique constraint including course_id
ALTER TABLE public.receipt_sequences 
ADD CONSTRAINT receipt_sequences_full_unique_key 
UNIQUE (college_id, course_id, payment_type, academic_year_id);

-- 3. Update Index for performance
DROP INDEX IF EXISTS idx_receipt_sequences_scope;
CREATE INDEX idx_receipt_sequences_full_scope 
ON public.receipt_sequences(college_id, course_id, payment_type, academic_year_id);
