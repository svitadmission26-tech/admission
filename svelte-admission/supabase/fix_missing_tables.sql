-- Fix missing columns and tables

-- 1. Add columns safely
DO $$ 
BEGIN 
    -- Add receipt_number to payments if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='receipt_number') THEN
        ALTER TABLE public.payments ADD COLUMN receipt_number TEXT;
    END IF;

    -- Add enrollment_number to users if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='enrollment_number') THEN
        ALTER TABLE public.users ADD COLUMN enrollment_number TEXT;
    END IF;
END $$;

-- 2. Create Receipt Sequences Table if not exists
CREATE TABLE IF NOT EXISTS public.receipt_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
    current_sequence INTEGER DEFAULT 0,
    prefix TEXT, -- e.g., "RCPT-2026-"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(college_id, course_id, academic_year_id)
);

-- 3. Create Enrollment Sequences Table if not exists
CREATE TABLE IF NOT EXISTS public.enrollment_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
    current_sequence INTEGER DEFAULT 0,
    prefix TEXT, -- e.g., "ENR-2026-"
    admission_type TEXT NOT NULL DEFAULT 'Regular',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(college_id, course_id, academic_year_id, admission_type)
);

-- 4. Enable RLS
ALTER TABLE public.receipt_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_sequences ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies to avoid errors when recreating
DROP POLICY IF EXISTS "Receipt Sequences: Admin manage" ON public.receipt_sequences;
DROP POLICY IF EXISTS "Enrollment Sequences: Admin manage" ON public.enrollment_sequences;
DROP POLICY IF EXISTS "Receipt Sequences: Fee Collector read update" ON public.receipt_sequences;
DROP POLICY IF EXISTS "Enrollment Sequences: Fee Collector read update" ON public.enrollment_sequences;

-- 6. Create Policies

-- Admins manage sequences
CREATE POLICY "Receipt Sequences: Admin manage" ON public.receipt_sequences FOR ALL USING ((SELECT public.get_my_role()) = 'admin');
CREATE POLICY "Enrollment Sequences: Admin manage" ON public.enrollment_sequences FOR ALL USING ((SELECT public.get_my_role()) = 'admin');

-- Fee Collectors need to READ and UPDATE receipt sequences (to increment)
CREATE POLICY "Receipt Sequences: Fee Collector read update" ON public.receipt_sequences 
FOR ALL 
USING ((SELECT public.get_my_role()) = 'fee_collector');

-- Fee Collectors (or whoever generates Student ID) need to READ and UPDATE enrollment sequences
CREATE POLICY "Enrollment Sequences: Fee Collector read update" ON public.enrollment_sequences 
FOR ALL 
USING ((SELECT public.get_my_role()) = 'fee_collector');
