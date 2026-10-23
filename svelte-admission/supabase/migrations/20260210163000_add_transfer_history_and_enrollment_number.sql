-- Migration: Add enrollment_number to student_profiles and create student_transfer_history table

-- 1. Add 'enrollment_number' column to public.student_profiles table if it doesn't exist
--    It's important to make this column nullable initially, as existing rows won't have a value.
ALTER TABLE public.student_profiles
ADD COLUMN IF NOT EXISTS enrollment_number TEXT NULL;

-- 2. Create the 'public.student_transfer_history' table
CREATE TABLE public.student_transfer_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES public.applications(id) ON DELETE RESTRICT NOT NULL,
    previous_course_id UUID REFERENCES public.courses(id) ON DELETE RESTRICT NOT NULL,
    previous_branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT, -- Branch can be null
    previous_enrollment_number TEXT NULL, -- Enrollment number from student_profiles before transfer
    new_enrollment_number TEXT NULL,     -- New enrollment number after transfer
    transfer_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    transferred_by UUID REFERENCES public.users(id) ON DELETE SET NULL -- The user (adm_officer) who performed the transfer
);

-- Add indexes for performance
CREATE INDEX idx_student_transfer_history_application_id ON public.student_transfer_history(application_id);
CREATE INDEX idx_student_transfer_history_transferred_by ON public.student_transfer_history(transferred_by);

-- Optional: Add RLS policies for student_transfer_history
-- You will need to define appropriate RLS policies based on your application's security requirements.
-- For example, allowing admin/adm_officer to view.
--
-- ALTER TABLE public.student_transfer_history ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Enable read access for all authenticated users" ON public.student_transfer_history
-- FOR SELECT USING (auth.role() = 'authenticated');
--
-- CREATE POLICY "Allow admin/officers to manage transfers" ON public.student_transfer_history
-- FOR ALL USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'adm_officer')));
