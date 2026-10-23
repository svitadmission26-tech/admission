-- ==========================================================
-- 1. BACKFILL & PREPARATION
-- ==========================================================

-- Backfill user_id from applications if missing to ensure RLS works reliably
UPDATE public.documents d
SET user_id = a.student_id
FROM public.applications a
WHERE d.application_id = a.id
AND d.user_id IS NULL;


-- ==========================================================
-- 2. STORAGE POLICIES (Actual Files)
-- ==========================================================

-- Drop existing conflicting policies
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to modify own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated viewing" ON storage.objects;
DROP POLICY IF EXISTS "Documents: Upload Policy" ON storage.objects;
DROP POLICY IF EXISTS "Documents: Manage Policy" ON storage.objects;
DROP POLICY IF EXISTS "Documents: View Policy" ON storage.objects;

-- Policy: Allow users to upload to their own folder OR allow staff (Admin/DEO) to upload anywhere
CREATE POLICY "Documents: Upload Policy" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND (
    (name LIKE (auth.uid()::text || '/%')) -- Can upload to folder named after self
    OR 
    (public.get_my_role() IN ('admin', 'deo', 'adm_officer')) -- Staff can upload anywhere
  )
);

-- Policy: Allow users to update/delete their own files OR allow staff to manage all
CREATE POLICY "Documents: Manage Policy" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'documents' AND (
    (name LIKE (auth.uid()::text || '/%'))
    OR 
    (public.get_my_role() IN ('admin', 'deo', 'adm_officer'))
  )
);

-- Policy: Allow all authenticated users to view documents
CREATE POLICY "Documents: View Policy" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'documents');


-- ==========================================================
-- 3. PUBLIC TABLE POLICIES (Metadata)
-- ==========================================================

-- Ensure staff can insert/update records in the public.documents table
DROP POLICY IF EXISTS "Documents: Staff Manage" ON public.documents;
CREATE POLICY "Documents: Staff Manage" ON public.documents 
FOR ALL TO authenticated
USING (
    public.get_my_role() IN ('admin', 'deo', 'adm_officer', 'college_auth', 'university_auth')
)
WITH CHECK (
    public.get_my_role() IN ('admin', 'deo', 'adm_officer', 'college_auth', 'university_auth')
);

-- Re-confirm Student policy (already exists but ensures it's clean)
DROP POLICY IF EXISTS "Documents: Student RW" ON public.documents;
CREATE POLICY "Documents: Student RW" ON public.documents 
FOR ALL TO authenticated
USING (
    auth.uid() = user_id OR
    EXISTS (
        SELECT 1 FROM public.applications 
        WHERE id = application_id AND student_id = auth.uid()
    )
)
WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (
        SELECT 1 FROM public.applications 
        WHERE id = application_id AND student_id = auth.uid()
    )
);

-- ==========================================================
-- 5. FEE RECEIPTS POLICIES
-- ==========================================================

ALTER TABLE public.fee_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fee Receipts: Students view own" ON public.fee_receipts;
CREATE POLICY "Fee Receipts: Students view own" ON public.fee_receipts 
FOR SELECT TO authenticated
USING (auth.uid() = student_id OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Fee Receipts: Staff manage" ON public.fee_receipts;
CREATE POLICY "Fee Receipts: Staff manage" ON public.fee_receipts 
FOR ALL TO authenticated
USING (public.get_my_role() IN ('admin', 'fee_collector', 'adm_officer'));


