-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Academic Years (FR-01)
CREATE TABLE public.academic_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL, -- e.g., "2025-2026"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Admission Cycles (FR-02)
CREATE TABLE public.admission_cycles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL, -- e.g., "Fall 2025", "Spring 2026"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Universities
CREATE TABLE public.universities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Colleges
CREATE TABLE public.colleges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    university_id UUID REFERENCES public.universities(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Users (Extends auth.users)
-- Roles: 'student', 'deo', 'college_auth', 'university_auth', 'adm_officer', 'fee_collector', 'admin'
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'deo', 'college_auth', 'university_auth', 'adm_officer', 'fee_collector', 'admin')),
    full_name TEXT,
    university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL, -- Nullable for Admin/Students
    college_id UUID REFERENCES public.colleges(id) ON DELETE SET NULL, -- Nullable for Admin/Univ Auth/Students
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Courses
CREATE TABLE public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL, -- e.g., "B.Sc. Computer Science"
    code TEXT,
    duration_years INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Admission Forms (Dynamic Forms)
CREATE TABLE public.admission_forms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    cycle_id UUID REFERENCES public.admission_cycles(id) ON DELETE CASCADE NOT NULL,
    form_type TEXT REFERENCES public.form_types(name) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT,
    schema_json JSONB NOT NULL DEFAULT '{}'::jsonb, -- Form fields definition
    form_fee NUMERIC(10, 2) DEFAULT 0,
    prov_fee NUMERIC(10, 2) DEFAULT 0,
    is_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(course_id, cycle_id, form_type)
);

-- 8. Fee Structures
CREATE TABLE public.fee_structures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
    total_fee NUMERIC(10, 2) NOT NULL,
    installment_json JSONB DEFAULT '[]'::jsonb, -- Details of installments
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Merit Formulas
CREATE TABLE public.merit_formulas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    rules_json JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"hsc_weight": 0.6, "entrance_weight": 0.4}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. Applications
-- Status: 'draft', 'submitted', 'verified', 'approved', 'waitlisted', 'rejected', 'needs_correction'
CREATE TABLE public.applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    cycle_id UUID REFERENCES public.admission_cycles(id) ON DELETE RESTRICT NOT NULL,
    form_data JSONB DEFAULT '{}'::jsonb, -- Filled form data
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'verified', 'approved', 'waitlisted', 'rejected', 'needs_correction')),
    merit_score NUMERIC(5, 2),
    merit_rank INTEGER,
    submitted_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    rejection_reason TEXT -- New column for application rejection reason
);

-- 11. Marks (For granular merit calculation if not in form_data)
CREATE TABLE public.marks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE NOT NULL,
    subject TEXT NOT NULL,
    score NUMERIC(5, 2) NOT NULL,
    max_score NUMERIC(5, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. Payments
-- Status: 'pending', 'completed', 'failed'
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES public.applications(id) ON DELETE RESTRICT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    transaction_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    payment_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13. Documents (for tracking uploaded files)
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE, -- Link to an application
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,            -- Link to a user (e.g., profile pic)
    college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE,      -- Link to a college (e.g., college-specific forms)
    university_id UUID REFERENCES public.universities(id) ON DELETE CASCADE, -- Link to a university
    file_path TEXT NOT NULL,                                           -- Path or URL in Supabase Storage
    file_name TEXT NOT NULL,
    file_type TEXT,                                                    -- e.g., 'image/jpeg', 'application/pdf'
    document_type TEXT,                                                -- e.g., 'HSC Marksheet', 'ID Proof', 'Photo'
    uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,     -- Who uploaded the document
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')), -- New: Document verification status
    rejection_reason TEXT,                                             -- New: Reason if document is rejected
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CHECK (
        (application_id IS NOT NULL)::INTEGER +
        (user_id IS NOT NULL)::INTEGER +
        (college_id IS NOT NULL)::INTEGER +
        (university_id IS NOT NULL)::INTEGER = 1
    ) -- Ensure exactly one association
);

-- 14. Admission Sequences (For generating admission sequence numbers)
CREATE TABLE public.admission_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
    current_sequence INTEGER DEFAULT 0,
    admission_type TEXT NOT NULL DEFAULT 'Regular',
    prefix TEXT, -- e.g., "ADM-2026-CS-regular-"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(college_id, course_id, academic_year_id, prefix)
);

-- 15. Account Admissions (For tracking final admission for accounts)
CREATE TABLE public.account_admissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES public.applications(id) ON DELETE RESTRICT NOT NULL,
    admission_number TEXT NOT NULL, -- Generated sequence number
    admission_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    admission_type TEXT NOT NULL, -- e.g. "Merit", "Management Quota", "Sports Quota"
    account_status TEXT DEFAULT 'pending' CHECK (account_status IN ('pending', 'cleared', 'partial')),
    remarks TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(admission_number),
    UNIQUE(application_id)
);

-- Indexes for performance
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_courses_college ON public.courses(college_id);
CREATE INDEX idx_applications_student ON public.applications(student_id);
CREATE INDEX idx_applications_course ON public.applications(course_id);
CREATE INDEX idx_applications_status ON public.applications(status);
CREATE INDEX idx_documents_application_id ON public.documents(application_id);
CREATE INDEX idx_documents_user_id ON public.documents(user_id);

-- RPC Functions for Admission Officer Dashboard

CREATE OR REPLACE FUNCTION public.get_application_status_counts()
RETURNS TABLE (status TEXT, count BIGINT)
LANGUAGE plpgsql
AS $
BEGIN
    RETURN QUERY
    SELECT
        a.status,
        COUNT(a.id) AS count
    FROM
        public.applications a
    GROUP BY
        a.status
    ORDER BY
        a.status;
END;
$;

CREATE OR REPLACE FUNCTION public.get_application_course_counts()
RETURNS TABLE (course_name TEXT, count BIGINT)
LANGUAGE plpgsql
AS $
BEGIN
    RETURN QUERY
    SELECT
        c.name AS course_name,
        COUNT(a.id) AS count
    FROM
        public.applications a
    JOIN
        public.courses c ON a.course_id = c.id
    GROUP BY
        c.name
    ORDER BY
        c.name;
END;
$;