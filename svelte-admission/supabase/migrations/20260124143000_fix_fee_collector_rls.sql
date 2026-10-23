-- Allow Fee Collectors to view applications
-- This is necessary so they can see student details, course, etc. when processing payments via account_admissions

CREATE POLICY "Applications: Fee Collector view all" ON public.applications 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'fee_collector'
    )
);
