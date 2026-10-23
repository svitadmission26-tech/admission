-- ==========================================================
-- SESSION DATABASE UPDATES (Consolidated)
-- ==========================================================

-- 1. ADMISSION SEQUENCES: Allow separate numbering for different form types
-- This fixes the "duplicate key" error when approving MQ vs ACPC for the same course.
ALTER TABLE public.admission_sequences 
DROP CONSTRAINT IF EXISTS admission_sequences_college_id_course_id_academic_year_id_key;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admission_sequences_full_unique_key') THEN
        ALTER TABLE public.admission_sequences 
        ADD CONSTRAINT admission_sequences_full_unique_key 
        UNIQUE(college_id, course_id, academic_year_id, prefix);
    END IF;
END $$;


-- 2. DOCUMENTS TABLE: Remove restrictive "either/or" constraint
-- This allows documents to be linked to both an application AND a user for robust RLS.
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_check;


-- 3. ENROLLMENT SEQUENCES: Fix unique index for auto-enrollment
-- Ensures that different branches (or null branch) get their own sequence record safely.
DROP INDEX IF EXISTS idx_enrollment_sequences_college_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_sequences_college_id_unique 
ON public.enrollment_sequences (
    college_id, 
    course_id, 
    academic_year_id, 
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'),
    admission_type
);


-- 4. STORAGE POLICIES: Robust access for Staff and Students
-- Allow students to upload to their folders and staff to manage/view everything.

DROP POLICY IF EXISTS "Documents: Upload Policy" ON storage.objects;
CREATE POLICY "Documents: Upload Policy" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND (
    (name LIKE (auth.uid()::text || '/%')) 
    OR 
    (public.get_my_role() IN ('admin', 'deo', 'adm_officer'))
  )
);

DROP POLICY IF EXISTS "Documents: Manage Policy" ON storage.objects;
CREATE POLICY "Documents: Manage Policy" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'documents' AND (
    (name LIKE (auth.uid()::text || '/%'))
    OR 
    (public.get_my_role() IN ('admin', 'deo', 'adm_officer'))
  )
);

DROP POLICY IF EXISTS "Documents: View Policy" ON storage.objects;
CREATE POLICY "Documents: View Policy" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'documents');


-- 5. DOCUMENTS METADATA POLICIES
-- Ensure staff can see and verify documents correctly.

DROP POLICY IF EXISTS "Documents: Staff Manage" ON public.documents;
CREATE POLICY "Documents: Staff Manage" ON public.documents 
FOR ALL TO authenticated
USING (
    public.get_my_role() IN ('admin', 'deo', 'adm_officer', 'college_auth', 'university_auth')
)
WITH CHECK (
    public.get_my_role() IN ('admin', 'deo', 'adm_officer', 'college_auth', 'university_auth')
);

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


-- 6. AUDIT: Backfill missing user_ids in documents table
-- Ensures RLS works for existing records created without user_id.
UPDATE public.documents d
SET user_id = a.student_id
FROM public.applications a
WHERE d.application_id = a.id
AND d.user_id IS NULL;
