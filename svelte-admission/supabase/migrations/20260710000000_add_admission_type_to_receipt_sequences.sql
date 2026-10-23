-- Migration: Add admission_type to receipt_sequences and update unique constraint

-- 1. Add admission_type column with default 'Regular'
ALTER TABLE public.receipt_sequences 
ADD COLUMN IF NOT EXISTS admission_type TEXT NOT NULL DEFAULT 'Regular';

-- 2. Drop existing unique constraints (standard and custom)
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_unique_scope;
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_payment_type_academic_year_id_key;
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_payment_type_academic_year_id_college_id_key;
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_unique_scope_with_type;
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_college_id_course_id_academic_year_id_key;
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_unique_course_year;
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_full_unique_key;

-- 3. Add composite unique constraint covering college, course, academic year, payment type, and admission type
ALTER TABLE public.receipt_sequences 
ADD CONSTRAINT receipt_sequences_unique_scope_with_type 
UNIQUE (college_id, course_id, academic_year_id, payment_type, admission_type);