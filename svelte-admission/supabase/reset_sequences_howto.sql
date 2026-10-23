-- SQL Commands to Reset Sequences

-- WARNING: Only run these if you are sure. Resetting sequences while existing records use those numbers 
-- will cause "Duplicate Key" errors when new records try to use the same numbers (e.g., ADM-0001 again).
-- You should typically truncate the dependent tables (payments, account_admissions) before resetting sequences during testing.

-- -------------------------------------------------------------------------
-- Option 1: Complete Reset (For Development/Testing Only)
-- -------------------------------------------------------------------------

-- 1. Clear Data (Optional - Removes all students/payments to avoid conflicts)
-- TRUNCATE TABLE public.payments CASCADE;
-- TRUNCATE TABLE public.account_admissions CASCADE;
-- TRUNCATE TABLE public.receipt_sequences CASCADE;
-- TRUNCATE TABLE public.enrollment_sequences CASCADE;
-- TRUNCATE TABLE public.admission_sequences CASCADE;

-- 2. Reset Counters to 0
UPDATE public.admission_sequences SET current_sequence = 0;
UPDATE public.receipt_sequences SET current_sequence = 0;
UPDATE public.enrollment_sequences SET current_sequence = 0;


-- -------------------------------------------------------------------------
-- Option 2: Reset for a Specific Academic Year (e.g., for new batch)
-- -------------------------------------------------------------------------

-- You need the UUID of the academic year.
-- Example: 
-- UPDATE public.admission_sequences 
-- SET current_sequence = 0 
-- WHERE academic_year_id = 'YOUR-ACADEMIC-YEAR-UUID';


-- -------------------------------------------------------------------------
-- Option 3: Reset Specific Sequence by ID
-- -------------------------------------------------------------------------

-- 1. Find the sequence ID first
-- SELECT * FROM public.admission_sequences;

-- 2. Update it
-- UPDATE public.admission_sequences SET current_sequence = 0 WHERE id = 'SEQUENCE-UUID';
