
-- Migration to add form_type to merit_formulas table
ALTER TABLE public.merit_formulas 
ADD COLUMN IF NOT EXISTS form_type TEXT DEFAULT 'Provisional';

-- Optional: If you want to enforce uniqueness per course + form_type
-- DROP INDEX IF EXISTS idx_merit_formulas_course_unique;
-- CREATE UNIQUE INDEX idx_merit_formulas_course_type_unique ON public.merit_formulas (course_id, form_type);
