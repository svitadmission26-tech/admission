-- Allow DEOs to view all applications to manage dashboard and edits
CREATE POLICY "Applications: DEO can view all" ON public.applications FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'deo')
);

-- Allow DEOs to update applications (needed for "Edit" and "Submit" functionality)
CREATE POLICY "Applications: DEO can update all" ON public.applications FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'deo')
);
