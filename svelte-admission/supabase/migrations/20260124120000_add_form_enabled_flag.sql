-- Add is_enabled column to admission_forms
ALTER TABLE public.admission_forms ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT true;

-- Update RLS Policies
DROP POLICY IF EXISTS "Admission Forms: All authenticated can read" ON public.admission_forms;
DROP POLICY IF EXISTS "Admission Forms: Public read access" ON public.admission_forms; -- In case I created it before

CREATE POLICY "Admission Forms: Student read enabled only" ON public.admission_forms FOR SELECT USING (
    auth.role() = 'authenticated' AND (
        is_enabled = true OR
        NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'student')
    )
);
