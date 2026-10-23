-- Add is_merit_published column to admission_forms
ALTER TABLE public.admission_forms 
ADD COLUMN IF NOT EXISTS is_merit_published BOOLEAN DEFAULT FALSE;
