-- Fix RLS policy for applications to allow 'adm_officer' to view all submitted applications
-- Currently, policies only allow 'admin', 'college_auth', 'university_auth' and 'deo' (via patch).
-- We need to add 'adm_officer' to the list of roles that can view applications.

-- Drop old policy if it exists or create a new one specifically for adm_officer
DROP POLICY IF EXISTS "Applications: Adm Officer can view all" ON public.applications;

CREATE POLICY "Applications: Adm Officer can view all" ON public.applications 
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'adm_officer')
);

-- Also allow them to update (for verification)
CREATE POLICY "Applications: Adm Officer can update" ON public.applications 
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'adm_officer')
);

-- Fix RLS policy for documents to allow 'adm_officer' to view/update
DROP POLICY IF EXISTS "Documents: Adm Officer view and update" ON public.documents;

CREATE POLICY "Documents: Adm Officer view and update" ON public.documents 
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'adm_officer')
);
