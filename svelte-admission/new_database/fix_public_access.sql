-- Allow public read access to courses so they show up in inquiry forms
DROP POLICY IF EXISTS "Courses: Read" ON public.courses;
DROP POLICY IF EXISTS "Courses: All authenticated can read" ON public.courses;

CREATE POLICY "Courses: Public Read" ON public.courses 
FOR SELECT USING (true);

-- Also ensure Universities and Colleges are readable if needed for labels
DROP POLICY IF EXISTS "Universities: Read" ON public.universities;
CREATE POLICY "Universities: Public Read" ON public.universities 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Colleges: Read" ON public.colleges;
CREATE POLICY "Colleges: Public Read" ON public.colleges 
FOR SELECT USING (true);
