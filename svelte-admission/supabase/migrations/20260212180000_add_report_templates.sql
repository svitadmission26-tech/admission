-- Migration: Add report_templates table for Centralized Report System

CREATE TABLE public.report_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    base_table TEXT NOT NULL, -- e.g. 'applications', 'payments'
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb, -- Stores columns, filters, joins
    allowed_roles TEXT[] DEFAULT '{}', -- e.g. ['adm_officer', 'deo']
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

-- Policies
-- Admins can do everything
CREATE POLICY "Report Templates: Admin full access" ON public.report_templates
FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Other roles can READ if they are in allowed_roles
-- Note: '&&' is the Postgres array overlap operator
CREATE POLICY "Report Templates: Allowed roles read access" ON public.report_templates
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND (role = ANY(allowed_roles) OR role = 'admin')
    )
);
