-- Migration: Update report_templates to add the missing 'allowed_roles' column

ALTER TABLE public.report_templates
ADD COLUMN IF NOT EXISTS allowed_roles TEXT[] DEFAULT '{}';

-- Re-apply RLS policy to ensure 'allowed_roles' is covered
-- (This is defensive, assuming previous policies might not have updated correctly)
DROP POLICY IF EXISTS "Report Templates: Admin full access" ON public.report_templates;
CREATE POLICY "Report Templates: Admin full access" ON public.report_templates
FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Report Templates: Allowed roles read access" ON public.report_templates;
CREATE POLICY "Report Templates: Allowed roles read access" ON public.report_templates
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND (role = ANY(allowed_roles) OR role = 'admin')
    )
);
