-- 1. Add Receipt Number to Payments
ALTER TABLE public.payments ADD COLUMN receipt_number TEXT;

-- 2. Add Enrollment Number to Users (Permanent Student ID)
ALTER TABLE public.users ADD COLUMN enrollment_number TEXT;

-- 3. Create Receipt Sequences Table
CREATE TABLE public.receipt_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
    current_sequence INTEGER DEFAULT 0,
    prefix TEXT, -- e.g., "RCPT-2026-"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(college_id, course_id, academic_year_id)
);

-- 4. Create Enrollment Sequences Table (Student ID)
CREATE TABLE public.enrollment_sequences (
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

-- 5. RLS Policies for new tables
ALTER TABLE public.receipt_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_sequences ENABLE ROW LEVEL SECURITY;

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
