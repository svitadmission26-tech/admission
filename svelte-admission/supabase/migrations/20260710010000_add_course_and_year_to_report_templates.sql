-- Migration: Add course and academic year linkage to report_templates
ALTER TABLE public.report_templates
ADD COLUMN IF NOT EXISTS target_academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS target_course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL;

-- Create indexes for optimization
CREATE INDEX IF NOT EXISTS idx_report_templates_academic_year ON public.report_templates(target_academic_year_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_course ON public.report_templates(target_course_id);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
