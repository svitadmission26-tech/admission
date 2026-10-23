-- 1. Create Tables Safely
CREATE TABLE IF NOT EXISTS public.inquiry_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    schema_json JSONB NOT NULL DEFAULT '{"fields": [], "sections": [{"id": "default", "title": "General"}]}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID REFERENCES public.inquiry_forms(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    phone TEXT,
    inquiry_data JSONB DEFAULT '{}'::jsonb,
    is_processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inquiry_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id UUID REFERENCES public.inquiries(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(inquiry_id, course_id, branch_id)
);

-- 2. "Nuclear" Cleanup and Column Management
DO $$ 
DECLARE
    pol record;
BEGIN 
    -- A. Manage academic_year_id Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inquiry_forms' AND column_name='academic_year_id') THEN
        ALTER TABLE public.inquiry_forms ADD COLUMN academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inquiries' AND column_name='academic_year_id') THEN
        ALTER TABLE public.inquiries ADD COLUMN academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL;
    END IF;

    -- B. Drop ALL existing policies for these specific tables to prevent 42710 (Duplicate Object)
    FOR pol IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename IN ('inquiry_forms', 'inquiries', 'inquiry_preferences')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;

END $$;

-- 3. Create Fresh Policies (Fixes 42501 - RLS Violation on Insert)
ALTER TABLE public.inquiry_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_preferences ENABLE ROW LEVEL SECURITY;

-- Forms: Public can see active forms
CREATE POLICY "inquiry_forms_public_read" ON public.inquiry_forms FOR SELECT USING (is_active = true);
CREATE POLICY "inquiry_forms_staff_all" ON public.inquiry_forms FOR ALL USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'adm_officer'));

-- Inquiries: Anyone can insert, Staff can view everything. 
-- Note: 'anon_read_back' is critical to allow the app to fetch the row it just inserted.
CREATE POLICY "inquiries_public_insert" ON public.inquiries FOR INSERT WITH CHECK (true);
CREATE POLICY "inquiries_staff_read" ON public.inquiries FOR SELECT USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'adm_officer', 'university_auth', 'college_auth', 'deo'));
CREATE POLICY "inquiries_anon_read_back" ON public.inquiries FOR SELECT USING (true);

-- Preferences: Same logic
CREATE POLICY "inquiry_prefs_public_insert" ON public.inquiry_preferences FOR INSERT WITH CHECK (true);
CREATE POLICY "inquiry_prefs_staff_read" ON public.inquiry_preferences FOR SELECT USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'adm_officer', 'university_auth', 'college_auth', 'deo'));
CREATE POLICY "inquiry_prefs_anon_read_back" ON public.inquiry_preferences FOR SELECT USING (true);

-- 4. Global Data Access (Ensures dropdowns work for anonymous users)
DROP POLICY IF EXISTS "Courses: Public Read" ON public.courses;
CREATE POLICY "Courses: Public Read" ON public.courses FOR SELECT USING (true);

DROP POLICY IF EXISTS "Colleges: Public Read" ON public.colleges;
CREATE POLICY "Colleges: Public Read" ON public.colleges FOR SELECT USING (true);

DROP POLICY IF EXISTS "Universities: Public Read" ON public.universities;
CREATE POLICY "Universities: Public Read" ON public.universities FOR SELECT USING (true);

DROP POLICY IF EXISTS "Academic Years: Public Read" ON public.academic_years;
CREATE POLICY "Academic Years: Public Read" ON public.academic_years FOR SELECT USING (true);

-- 5. Recreate Indexes
DROP INDEX IF EXISTS idx_inquiries_email;
DROP INDEX IF EXISTS idx_inquiries_year;
DROP INDEX IF EXISTS idx_inquiry_forms_slug;

CREATE INDEX idx_inquiries_email ON public.inquiries(email);
CREATE INDEX idx_inquiries_year ON public.inquiries(academic_year_id);
CREATE INDEX idx_inquiry_forms_slug ON public.inquiry_forms(slug);

-- 6. Final Grant Permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT ON public.inquiries TO anon, authenticated;
GRANT SELECT, INSERT ON public.inquiry_preferences TO anon, authenticated;
GRANT SELECT ON public.inquiry_forms TO anon, authenticated;
GRANT SELECT ON public.courses TO anon, authenticated;
GRANT SELECT ON public.branches TO anon, authenticated;
GRANT SELECT ON public.academic_years TO anon, authenticated;
GRANT SELECT ON public.colleges TO anon, authenticated;
GRANT SELECT ON public.universities TO anon, authenticated;
