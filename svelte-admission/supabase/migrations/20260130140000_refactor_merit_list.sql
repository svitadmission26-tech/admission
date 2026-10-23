-- Create table for merit list entries
CREATE TABLE IF NOT EXISTS public.merit_list_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE NOT NULL,
    merit_score NUMERIC(10, 2),
    merit_rank INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(application_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_merit_entries_app ON public.merit_list_entries(application_id);

-- Enable RLS
ALTER TABLE public.merit_list_entries ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Admins/Officers can view and manage all
DROP POLICY IF EXISTS "Merit Entries: Admin/Officer manage" ON public.merit_list_entries;
CREATE POLICY "Merit Entries: Admin/Officer manage" ON public.merit_list_entries FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'adm_officer'))
);

-- 2. Students can view their OWN entry
DROP POLICY IF EXISTS "Merit Entries: Student view own" ON public.merit_list_entries;
CREATE POLICY "Merit Entries: Student view own" ON public.merit_list_entries FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.applications WHERE id = application_id AND student_id = auth.uid())
);

-- 3. Public/University Auth view access (if needed, stick to role based for now)

-- Remove old columns from applications
ALTER TABLE public.applications DROP COLUMN IF EXISTS merit_score;
ALTER TABLE public.applications DROP COLUMN IF EXISTS merit_rank;
