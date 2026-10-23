-- Create student_profile_fields table to define the schema of the profile
CREATE TABLE IF NOT EXISTS public.student_profile_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL UNIQUE, -- e.g. 'dob', 'father_name'
    label TEXT NOT NULL, -- e.g. 'Date of Birth'
    type TEXT NOT NULL, -- 'text', 'date', 'number', 'select'
    options JSONB, -- For select inputs
    is_required BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create student_profiles table
CREATE TABLE IF NOT EXISTS public.student_profiles (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    enrollment_number TEXT UNIQUE, -- Moved from users table
    profile_data JSONB DEFAULT '{}'::jsonb, -- Stores dynamic fields based on schema
    admission_status TEXT DEFAULT 'Applicant', -- 'Applicant', 'Admitted', 'Cancelled', 'Alumni'
    active_application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Backfill enrollment_number from users table
INSERT INTO public.student_profiles (user_id, enrollment_number)
SELECT id, enrollment_number
FROM public.users
WHERE role = 'student' AND enrollment_number IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
SET enrollment_number = EXCLUDED.enrollment_number;

-- Enable RLS
ALTER TABLE public.student_profile_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

-- Policies for student_profile_fields
CREATE POLICY "Public read access for profile fields" ON public.student_profile_fields
    FOR SELECT USING (true);

CREATE POLICY "Admin write access for profile fields" ON public.student_profile_fields
    FOR ALL USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
    );

-- Policies for student_profiles
CREATE POLICY "Users can view their own profile" ON public.student_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all profiles" ON public.student_profiles
    FOR SELECT USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'adm_officer', 'college_auth', 'univ_auth', 'fee_collector', 'deo')
    );

CREATE POLICY "Users can update their own profile data" ON public.student_profiles
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
    -- Note: Application logic must prevent updating enrollment_number and admission_status for students

CREATE POLICY "Staff can update any profile" ON public.student_profiles
    FOR UPDATE USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'adm_officer', 'college_auth', 'univ_auth', 'fee_collector')
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_student_profiles_updated_at
    BEFORE UPDATE ON public.student_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();