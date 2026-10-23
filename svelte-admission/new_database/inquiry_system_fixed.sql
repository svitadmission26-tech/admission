-- 1. Create Tables (Using standard defaults)
CREATE TABLE IF NOT EXISTS public.inquiry_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    schema_json JSONB NOT NULL DEFAULT '{"fields": [], "sections": [{"id": "default", "title": "General"}]}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID REFERENCES public.inquiry_forms(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    phone TEXT,
    inquiry_data JSONB DEFAULT '{}'::jsonb,
    is_processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inquiry_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id UUID REFERENCES public.inquiries(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Add academic_year_id columns if they don't exist
DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE public.inquiry_forms ADD COLUMN academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'column academic_year_id already exists in inquiry_forms';
    END;

    BEGIN
        ALTER TABLE public.inquiries ADD COLUMN academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'column academic_year_id already exists in inquiries';
    END;
END $$;

-- 3. Reset and Recreate Indexes
DROP INDEX IF EXISTS idx_inquiries_email;
DROP INDEX IF EXISTS idx_inquiries_year;
DROP INDEX IF EXISTS idx_inquiry_forms_slug;

CREATE INDEX idx_inquiries_email ON public.inquiries(email);
CREATE INDEX idx_inquiries_year ON public.inquiries(academic_year_id);
CREATE INDEX idx_inquiry_forms_slug ON public.inquiry_forms(slug);

-- 4. Reset and Recreate RLS Policies
ALTER TABLE public.inquiry_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_preferences ENABLE ROW LEVEL SECURITY;

-- Forms
DROP POLICY IF EXISTS "Public can view active inquiry forms" ON public.inquiry_forms;
DROP POLICY IF EXISTS "Admin manage inquiry forms" ON public.inquiry_forms;
CREATE POLICY "Public can view active inquiry forms" ON public.inquiry_forms FOR SELECT USING (is_active = true);
CREATE POLICY "Admin manage inquiry forms" ON public.inquiry_forms FOR ALL USING (true); -- Restricted by role in app logic, or use (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'

-- Inquiries
DROP POLICY IF EXISTS "Anyone can insert inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Public select inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Anonymous can insert inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Staff can view inquiries" ON public.inquiries;
CREATE POLICY "Anyone can insert inquiries" ON public.inquiries FOR INSERT WITH CHECK (true);
CREATE POLICY "Public select inquiries" ON public.inquiries FOR SELECT USING (true);

-- Preferences
DROP POLICY IF EXISTS "Anyone can insert preferences" ON public.inquiry_preferences;
DROP POLICY IF EXISTS "Public select preferences" ON public.inquiry_preferences;
DROP POLICY IF EXISTS "Anonymous can insert preferences" ON public.inquiry_preferences;
DROP POLICY IF EXISTS "Staff can view preferences" ON public.inquiry_preferences;
CREATE POLICY "Anyone can insert preferences" ON public.inquiry_preferences FOR INSERT WITH CHECK (true);
CREATE POLICY "Public select preferences" ON public.inquiry_preferences FOR SELECT USING (true);

-- 5. Final Permission Grants
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT ON public.inquiries TO anon, authenticated;
GRANT SELECT, INSERT ON public.inquiry_preferences TO anon, authenticated;
GRANT SELECT ON public.inquiry_forms TO anon, authenticated;
GRANT SELECT ON public.courses TO anon, authenticated;
GRANT SELECT ON public.branches TO anon, authenticated;
GRANT SELECT ON public.academic_years TO anon, authenticated;
GRANT SELECT ON public.colleges TO anon, authenticated;
GRANT SELECT ON public.universities TO anon, authenticated;
