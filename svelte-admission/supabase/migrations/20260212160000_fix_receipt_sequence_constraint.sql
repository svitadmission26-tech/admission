-- Migration: Update receipt_sequences to include college_id in unique constraint for proper scoping

-- 1. Drop existing unique constraint (name might vary, trying standard naming convention)
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_payment_type_academic_year_id_key;
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_payment_type_academic_year_id_college_id_key; -- Just in case

-- 2. Add new Unique Constraint covering College, Payment Type, and Academic Year
ALTER TABLE public.receipt_sequences 
ADD CONSTRAINT receipt_sequences_unique_scope 
UNIQUE (college_id, payment_type, academic_year_id);

-- 3. Update Index
DROP INDEX IF EXISTS idx_receipt_sequences_type_year;
CREATE INDEX idx_receipt_sequences_scope ON public.receipt_sequences(college_id, payment_type, academic_year_id);
