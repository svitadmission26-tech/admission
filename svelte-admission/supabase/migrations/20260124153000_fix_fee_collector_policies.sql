-- Fix Fee Collector Visibility Issues

-- 1. Allow Fee Collectors to view Users (Students)
-- This is critical for displaying the student name in receipts and lists
CREATE POLICY "Users: Fee Collector view all" ON public.users 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'fee_collector'
    )
);

-- 2. Allow Fee Collectors to view Applications (Explicitly)
-- Although we had a script for this, adding it here ensures it's covered if the user missed it.
-- This is needed for joining payments -> applications -> users
DROP POLICY IF EXISTS "Applications: Fee Collector view all" ON public.applications;
CREATE POLICY "Applications: Fee Collector view all" ON public.applications 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'fee_collector'
    )
);
