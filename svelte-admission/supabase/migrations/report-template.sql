-- Migration to ensure report_templates table exists with all required columns

CREATE TABLE IF NOT EXISTS public.report_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    base_table TEXT NOT NULL DEFAULT '',
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    allowed_roles TEXT[] DEFAULT '{}',
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure columns exist if table was already created without them
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'report_templates' AND column_name = 'base_table') THEN
        ALTER TABLE public.report_templates ADD COLUMN base_table TEXT NOT NULL DEFAULT '';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'report_templates' AND column_name = 'configuration') THEN
        ALTER TABLE public.report_templates ADD COLUMN configuration JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'report_templates' AND column_name = 'allowed_roles') THEN
        ALTER TABLE public.report_templates ADD COLUMN allowed_roles TEXT[] DEFAULT '{}';
    END IF;
END $$;

-- Enable RLS
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

-- Policies
-- Drop existing policies to avoid conflicts/duplication
DROP POLICY IF EXISTS "Report Templates: Admin full access" ON public.report_templates;
DROP POLICY IF EXISTS "Report Templates: Allowed roles read access" ON public.report_templates;

-- Admins can do everything
CREATE POLICY "Report Templates: Admin full access" ON public.report_templates
FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Other roles can READ if they are in allowed_roles
CREATE POLICY "Report Templates: Allowed roles read access" ON public.report_templates
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND (role = ANY(allowed_roles) OR role = 'admin')
    )
);

-- Force schema cache reload
NOTIFY pgrst, 'reload schema';
