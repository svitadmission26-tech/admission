-- Complete Database Setup Script
-- Generated based on current schema evolution

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. BASE TABLES (Universities, Colleges, Years, Cycles)
-- ============================================================

CREATE TABLE public.universities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    address TEXT,
    logo_url TEXT, -- Added via branding migration
    footer_text TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    website TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.colleges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    university_id UUID REFERENCES public.universities(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.academic_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT false,
    short_code TEXT, -- Added for receipt generation logic if needed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.admission_cycles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 2. ACADEMIC STRUCTURE (Courses, Branches, Form Types)
-- ============================================================

CREATE TABLE public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    duration_years INTEGER,
    intake_capacity INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.form_types (
    name TEXT PRIMARY KEY, -- Used as FK in some places, effectively ID
    code TEXT UNIQUE, -- e.g. PROV, ACPC
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    requires_merit_calculation BOOLEAN DEFAULT true,
    allow_partial_payment BOOLEAN DEFAULT false,
    is_government_quota BOOLEAN DEFAULT false,
    application_fee_required BOOLEAN DEFAULT true,
    auto_approve_on_verification BOOLEAN DEFAULT false,
    is_prov BOOLEAN DEFAULT false, -- Provisional flag
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 3. USERS & PROFILES
-- ============================================================

CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'deo', 'college_auth', 'university_auth', 'univ_auth', 'adm_officer', 'fee_collector', 'admin')),
    full_name TEXT,
    university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL,
    college_id UUID REFERENCES public.colleges(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.student_profile_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    is_required BOOLEAN DEFAULT false,
    options TEXT[], -- JSON array of strings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.student_profiles (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    profile_data JSONB DEFAULT '{}'::jsonb,
    enrollment_number TEXT, -- Permanent College ID
    admission_status TEXT,
    active_application_id UUID, -- Link to current app
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 4. FORMS & FEES CONFIGURATION
-- ============================================================

CREATE TABLE public.admission_forms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    cycle_id UUID REFERENCES public.admission_cycles(id) ON DELETE CASCADE NOT NULL,
    form_type TEXT REFERENCES public.form_types(name) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT,
    schema_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    form_fee NUMERIC(10, 2) DEFAULT 0,
    prov_fee NUMERIC(10, 2) DEFAULT 0,
    is_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(course_id, cycle_id, form_type)
);

CREATE TABLE public.fee_structures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
    form_type TEXT REFERENCES public.form_types(name),
    total_fee NUMERIC(10, 2) NOT NULL,
    installment_json JSONB DEFAULT '[]'::jsonb,
    fee_components JSONB DEFAULT '[]'::jsonb,
    is_splittable BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.merit_formulas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    form_type TEXT REFERENCES public.form_types(name),
    rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 5. APPLICATIONS & PROCESSING
-- ============================================================

CREATE TABLE public.applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    cycle_id UUID REFERENCES public.admission_cycles(id) ON DELETE RESTRICT NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    form_type TEXT REFERENCES public.form_types(name),
    
    form_data JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'verified', 'approved', 'waitlisted', 'rejected', 'needs_correction', 'cancelled')),
    
    merit_score NUMERIC(10, 4), -- Higher precision
    merit_rank INTEGER,
    
    application_fee_status TEXT DEFAULT 'not_applicable' CHECK (application_fee_status IN ('pending', 'paid', 'not_applicable', 'waived')),
    
    rejection_reason TEXT,
    
    created_by UUID REFERENCES public.users(id),
    updated_by UUID REFERENCES public.users(id),
    
    submitted_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.merit_list_entries (
    application_id UUID PRIMARY KEY REFERENCES public.applications(id) ON DELETE CASCADE,
    merit_score NUMERIC(10, 4),
    merit_rank INTEGER,
    is_published BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT,
    document_type TEXT,
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 6. ADMISSION & PAYMENTS
-- ============================================================

CREATE TABLE public.admission_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
    current_sequence INTEGER DEFAULT 0,
    admission_type TEXT NOT NULL DEFAULT 'Regular',
    prefix TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(college_id, course_id, academic_year_id, prefix) -- Added prefix to unique constraint
);

CREATE TABLE public.account_admissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES public.applications(id) ON DELETE RESTRICT NOT NULL,
    admission_number TEXT NOT NULL UNIQUE,
    admission_type TEXT NOT NULL,
    
    account_status TEXT DEFAULT 'pending' CHECK (account_status IN ('pending', 'cleared', 'partial')),
    enrollment_status TEXT DEFAULT 'confirmed' CHECK (enrollment_status IN ('provisional', 'confirmed')),
    
    remarks TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(application_id)
);

CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES public.applications(id) ON DELETE RESTRICT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    transaction_id TEXT,
    receipt_number TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    
    payment_type TEXT CHECK (payment_type IN ('application_fee', 'tuition_fee', 'provisional_fee', 'seat_reservation_fee')),
    payment_mode TEXT,
    reference_no TEXT,
    
    payment_breakdown JSONB, -- For hybrid payments
    fee_components_breakdown JSONB, -- Snapshot of fee structure
    
    payment_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.receipt_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    payment_type TEXT NOT NULL DEFAULT 'general',
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE,
    current_sequence INTEGER DEFAULT 0,
    prefix TEXT DEFAULT 'REC-',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(college_id, payment_type, academic_year_id)
);

-- ============================================================
-- 7. MISC & LOGS
-- ============================================================

CREATE TABLE public.circulars (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    file_path TEXT,
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.report_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    base_table TEXT NOT NULL,
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    allowed_roles TEXT[] DEFAULT '{}',
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.student_transfer_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
    previous_course_id UUID REFERENCES public.courses(id),
    previous_branch_id UUID REFERENCES public.branches(id),
    previous_enrollment_number TEXT,
    new_enrollment_number TEXT,
    transferred_by UUID REFERENCES public.users(id),
    transfer_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 8. FUNCTIONS & TRIGGERS
-- ============================================================

-- Function to handle new user creation (Trigger for auth.users)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role, full_name)
  VALUES (new.id, new.email, 'student', new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- RPC Functions
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

-- ============================================================
-- 9. STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('circulars', 'circulars', true) ON CONFLICT (id) DO NOTHING;

-- RLS POLICIES SHOULD BE APPLIED SEPARATELY OR APPENDED HERE.
-- (Omitting detailed RLS SQL for brevity, typically applied via migrations)