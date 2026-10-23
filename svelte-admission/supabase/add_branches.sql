-- Create branches table
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Update admission_forms table
ALTER TABLE public.admission_forms 
ADD COLUMN IF NOT EXISTS form_type TEXT NOT NULL DEFAULT 'Provisional' CHECK (form_type IN ('ACPC', 'Provisional', 'MQ/NRI', 'Vacant'));

-- Drop old unique constraint and add new one (including form_type)
ALTER TABLE public.admission_forms DROP CONSTRAINT IF EXISTS admission_forms_course_id_cycle_id_key;
-- Note: existing data might violate this if we don't have defaults, but I added DEFAULT 'Provisional'
ALTER TABLE public.admission_forms ADD CONSTRAINT admission_forms_unique_key UNIQUE (course_id, cycle_id, form_type);

-- Update applications table
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id),
ADD COLUMN IF NOT EXISTS form_type TEXT;

-- RLS for branches
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for students to select branches)
CREATE POLICY "Enable read access for all users" ON public.branches FOR SELECT USING (true);

-- Allow admins to manage branches
CREATE POLICY "Enable insert for admins" ON public.branches FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Enable update for admins" ON public.branches FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Enable delete for admins" ON public.branches FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);