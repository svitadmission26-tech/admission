-- Consolidated Setup Script for Sequences and IDs
-- Run this script to fully set up the Sequence Generation tables and columns.

BEGIN;

-- 1. Add 'receipt_number' to payments (if missing)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='receipt_number') THEN
        ALTER TABLE public.payments ADD COLUMN receipt_number TEXT;
    END IF;
END $$;

-- 2. Add 'enrollment_number' to users (if missing)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='enrollment_number') THEN
        ALTER TABLE public.users ADD COLUMN enrollment_number TEXT;
    END IF;
END $$;

-- 3. Add 'short_code' to academic_years (if missing)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='academic_years' AND column_name='short_code') THEN
        ALTER TABLE public.academic_years ADD COLUMN short_code TEXT; -- e.g., '25'
    END IF;
END $$;

-- 4. Create 'receipt_sequences' table
CREATE TABLE IF NOT EXISTS public.receipt_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
    current_sequence INTEGER DEFAULT 0,
    prefix TEXT, -- e.g., "RCPT-"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(college_id, course_id, academic_year_id)
);

-- 5. Create 'enrollment_sequences' table
CREATE TABLE IF NOT EXISTS public.enrollment_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
    current_sequence INTEGER DEFAULT 0,
    prefix TEXT, -- e.g., "ENR-"
    admission_type TEXT NOT NULL DEFAULT 'Regular',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Add 'branch_id' to enrollment_sequences if it was created without it previously
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enrollment_sequences' AND column_name='branch_id') THEN
        ALTER TABLE public.enrollment_sequences ADD COLUMN branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 7. Ensure 'admission_category' column is GONE (if it existed temporarily)
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enrollment_sequences' AND column_name='admission_category') THEN
        ALTER TABLE public.enrollment_sequences DROP COLUMN admission_category;
    END IF;
END $$;

-- 8. Fix Constraints / Indices for enrollment_sequences
-- Drop old constraints if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollment_sequences_college_id_course_id_academic_year_id_key') THEN
        ALTER TABLE public.enrollment_sequences DROP CONSTRAINT enrollment_sequences_college_id_course_id_academic_year_id_key;
    END IF;
END $$;

-- Create the correct unique index for CollegeID generation logic
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_sequences_college_id_unique 
ON public.enrollment_sequences (
    college_id, 
    course_id, 
    academic_year_id, 
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), -- Handle NULL branch_id safely
    admission_type
);

-- 9. Setup RLS
ALTER TABLE public.receipt_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_sequences ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to be safe
DROP POLICY IF EXISTS "Receipt Sequences: Admin manage" ON public.receipt_sequences;
DROP POLICY IF EXISTS "Enrollment Sequences: Admin manage" ON public.enrollment_sequences;
DROP POLICY IF EXISTS "Receipt Sequences: Fee Collector read update" ON public.receipt_sequences;
DROP POLICY IF EXISTS "Enrollment Sequences: Fee Collector read update" ON public.enrollment_sequences;

-- Recreate Policies
CREATE POLICY "Receipt Sequences: Admin manage" ON public.receipt_sequences FOR ALL USING ((SELECT public.get_my_role()) = 'admin');
CREATE POLICY "Enrollment Sequences: Admin manage" ON public.enrollment_sequences FOR ALL USING ((SELECT public.get_my_role()) = 'admin');

CREATE POLICY "Receipt Sequences: Fee Collector read update" ON public.receipt_sequences 
FOR ALL 
USING ((SELECT public.get_my_role()) = 'fee_collector');

CREATE POLICY "Enrollment Sequences: Fee Collector read update" ON public.enrollment_sequences 
FOR ALL 
USING ((SELECT public.get_my_role()) = 'fee_collector');

COMMIT;
