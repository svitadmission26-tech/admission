CREATE TABLE public.report_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    columns JSONB NOT NULL,
    filters JSONB,
    created_by UUID REFERENCES public.users(id) NOT NULL DEFAULT auth.uid(),
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_report_templates_user ON public.report_templates(created_by);

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own templates"
ON public.report_templates
FOR ALL
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can view their own or public templates"
ON public.report_templates
FOR SELECT
TO authenticated
USING (auth.uid() = created_by OR is_public = true);
