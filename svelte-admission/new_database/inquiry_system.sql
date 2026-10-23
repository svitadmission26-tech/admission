-- 1. Create inquiry_forms table to define the public forms
CREATE TABLE IF NOT EXISTS public.inquiry_forms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    schema_json JSONB NOT NULL DEFAULT '{"fields": [], "sections": [{"id": "default", "title": "General"}]}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create inquiries table to store user submissions
CREATE TABLE IF NOT EXISTS public.inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    form_id UUID REFERENCES public.inquiry_forms(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    phone TEXT,
    inquiry_data JSONB DEFAULT '{}'::jsonb,
    is_processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create inquiry_preferences table for multiple course/branch interests
CREATE TABLE IF NOT EXISTS public.inquiry_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inquiry_id UUID REFERENCES public.inquiries(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(inquiry_id, course_id, branch_id)
);

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_inquiries_email ON public.inquiries(email);
CREATE INDEX IF NOT EXISTS idx_inquiry_forms_slug ON public.inquiry_forms(slug);

-- 5. Enable Row Level Security
ALTER TABLE public.inquiry_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_preferences ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for Inquiry Forms
CREATE POLICY "Public can view active inquiry forms" ON public.inquiry_forms
    FOR SELECT USING (is_active = true);

CREATE POLICY "Admin manage inquiry forms" ON public.inquiry_forms
    FOR ALL USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'adm_officer')
    );

-- 7. RLS Policies for Inquiries (Allow Public Submissions)
CREATE POLICY "Anonymous can insert inquiries" ON public.inquiries
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Staff can view inquiries" ON public.inquiries
    FOR SELECT USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'adm_officer', 'university_auth', 'college_auth', 'deo')
    );

-- 8. RLS Policies for Inquiry Preferences
CREATE POLICY "Anonymous can insert preferences" ON public.inquiry_preferences
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Staff can view preferences" ON public.inquiry_preferences
    FOR SELECT USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'adm_officer', 'university_auth', 'college_auth', 'deo')
    );

-- 9. Insert a Sample Form (Optional - for testing)
INSERT INTO public.inquiry_forms (name, slug, description, is_active, schema_json)
VALUES (
    'General Inquiry 2026', 
    'general-2026', 
    'Start your journey by sharing your interests and academic preferences with us.',
    true,
    '{"fields": [{"key": "highest_qualification", "type": "text", "label": "Highest Qualification", "col": 6, "required": true}, {"key": "passing_year", "type": "number", "label": "Year of Passing", "col": 6, "required": true}], "sections": [{"id": "default", "title": "General Information"}]}'
) ON CONFLICT (slug) DO NOTHING;
