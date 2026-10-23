-- Migration: Fix receipt sequences unique constraint by including payment_type.
-- This ensures independent counters for APP-, PROV-, and TUIT- receipts.

-- 1. Drop ALL potential old or conflicting constraints
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_college_id_course_id_academic_year_id_key;
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_unique_scope;
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_full_unique_key;

-- 2. Add the CORRECT unique constraint that includes payment_type
ALTER TABLE public.receipt_sequences 
ADD CONSTRAINT receipt_sequences_full_unique_key 
UNIQUE (college_id, course_id, payment_type, academic_year_id);

-- 4. Ensure Index is also updated for performance
DROP INDEX IF EXISTS idx_receipt_sequences_full_scope;
CREATE INDEX idx_receipt_sequences_full_scope 
ON public.receipt_sequences(college_id, course_id, payment_type, academic_year_id);
