-- Fix Infinite Recursion in RLS Policies
-- This script drops existing policies and recreates them using a SECURITY DEFINER function to break the recursion loop.

-- =========================================================================================
-- HELPER FUNCTIONS (SECURITY DEFINER to bypass RLS)
-- =========================================================================================

-- Function to get the current user's role without triggering RLS on public.users
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.users
  WHERE id = auth.uid();
$$;

-- =========================================================================================
-- CLEANUP (Drop existing policies to prevent errors)
-- =========================================================================================

DROP POLICY IF EXISTS "Users: Individual access" ON public.users;
DROP POLICY IF EXISTS "Users: Admin can view all" ON public.users;
DROP POLICY IF EXISTS "Users: Admin can insert" ON public.users;
DROP POLICY IF EXISTS "Users: Can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users: Admin can update all" ON public.users;
DROP POLICY IF EXISTS "Users: Admin can delete all" ON public.users;

DROP POLICY IF EXISTS "Academic Years: All authenticated can read" ON public.academic_years;
DROP POLICY IF EXISTS "Academic Years: Admin can manage" ON public.academic_years;

DROP POLICY IF EXISTS "Admission Cycles: All authenticated can read" ON public.admission_cycles;
DROP POLICY IF EXISTS "Admission Cycles: Admin can manage" ON public.admission_cycles;

DROP POLICY IF EXISTS "Universities: All authenticated can read" ON public.universities;
DROP POLICY IF EXISTS "Universities: Admin can manage" ON public.universities;

DROP POLICY IF EXISTS "Colleges: All authenticated can read" ON public.colleges;
DROP POLICY IF EXISTS "Colleges: Admin can manage" ON public.colleges;

DROP POLICY IF EXISTS "Courses: All authenticated can read" ON public.courses;
DROP POLICY IF EXISTS "Courses: Admin can manage" ON public.courses;

DROP POLICY IF EXISTS "Admission Forms: All authenticated can read" ON public.admission_forms;
DROP POLICY IF EXISTS "Admission Forms: Admin can manage" ON public.admission_forms;

DROP POLICY IF EXISTS "Fee Structures: All authenticated can read" ON public.fee_structures;
DROP POLICY IF EXISTS "Fee Structures: Admin can manage" ON public.fee_structures;

DROP POLICY IF EXISTS "Merit Formulas: All authenticated can read" ON public.merit_formulas;
DROP POLICY IF EXISTS "Merit Formulas: Admin can manage" ON public.merit_formulas;

DROP POLICY IF EXISTS "Applications: Students own RW" ON public.applications;
DROP POLICY IF EXISTS "Applications: Admin can view all" ON public.applications;
DROP POLICY IF EXISTS "Applications: College Auth view own college" ON public.applications;
DROP POLICY IF EXISTS "Applications: University Auth view own university" ON public.applications;
DROP POLICY IF EXISTS "Applications: DEO can insert" ON public.applications;
DROP POLICY IF EXISTS "Applications: College Auth can update status" ON public.applications;
DROP POLICY IF EXISTS "Applications: University Auth can update status" ON public.applications;

DROP POLICY IF EXISTS "Marks: Students own RW" ON public.marks;
DROP POLICY IF EXISTS "Marks: Admin can view all" ON public.marks;

DROP POLICY IF EXISTS "Payments: Students own read and insert" ON public.payments;
DROP POLICY IF EXISTS "Payments: Fee Collector view all and update" ON public.payments;
DROP POLICY IF EXISTS "Payments: Admin can view all" ON public.payments;

DROP POLICY IF EXISTS "Documents: Students own RW" ON public.documents;
DROP POLICY IF EXISTS "Documents: College Auth view and update own college" ON public.documents;
DROP POLICY IF EXISTS "Documents: University Auth view own university" ON public.documents;
DROP POLICY IF EXISTS "Documents: Admin can view all" ON public.documents;

DROP POLICY IF EXISTS "Admission Sequences: Admin can manage" ON public.admission_sequences;

DROP POLICY IF EXISTS "Account Admissions: Admin can view all" ON public.account_admissions;
DROP POLICY IF EXISTS "Account Admissions: Fee Collector view and update" ON public.account_admissions;
DROP POLICY IF EXISTS "Account Admissions: University Auth insert and read" ON public.account_admissions;

-- Enable RLS on all tables (Idempotent)
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merit_formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_admissions ENABLE ROW LEVEL SECURITY;

-- =========================================================================================
-- RECREATED POLICIES
-- =========================================================================================

-- 1. public.users Table Policies
-- Read: Users see themselves OR Admins see all
CREATE POLICY "Users: Read access" ON public.users FOR SELECT USING (
    auth.uid() = id OR public.get_my_role() = 'admin' OR public.get_my_role() = 'deo'
);

-- Insert: Self-registration OR Admin/DEO creating others
CREATE POLICY "Users: Insert access" ON public.users FOR INSERT WITH CHECK (
    auth.uid() = id OR public.get_my_role() IN ('admin', 'deo')
);

-- Update: Users update self OR Admins update any
CREATE POLICY "Users: Update access" ON public.users FOR UPDATE USING (
    auth.uid() = id OR public.get_my_role() = 'admin'
);

-- Delete: Admins only
CREATE POLICY "Users: Delete access" ON public.users FOR DELETE USING (
    public.get_my_role() = 'admin'
);


-- 2. public.academic_years
CREATE POLICY "Academic Years: Read" ON public.academic_years FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Academic Years: Manage" ON public.academic_years FOR ALL USING (public.get_my_role() = 'admin');

-- 3. public.admission_cycles
CREATE POLICY "Admission Cycles: Read" ON public.admission_cycles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admission Cycles: Manage" ON public.admission_cycles FOR ALL USING (public.get_my_role() = 'admin');

-- 4. public.universities
CREATE POLICY "Universities: Read" ON public.universities FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Universities: Manage" ON public.universities FOR ALL USING (public.get_my_role() = 'admin');

-- 5. public.colleges
CREATE POLICY "Colleges: Read" ON public.colleges FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Colleges: Manage" ON public.colleges FOR ALL USING (public.get_my_role() = 'admin');

-- 6. public.courses
CREATE POLICY "Courses: Read" ON public.courses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Courses: Manage" ON public.courses FOR ALL USING (public.get_my_role() = 'admin');

-- 7. public.admission_forms
CREATE POLICY "Admission Forms: Read" ON public.admission_forms FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admission Forms: Manage" ON public.admission_forms FOR ALL USING (public.get_my_role() = 'admin');

-- 8. public.fee_structures
CREATE POLICY "Fee Structures: Read" ON public.fee_structures FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Fee Structures: Manage" ON public.fee_structures FOR ALL USING (public.get_my_role() = 'admin');

-- 9. public.merit_formulas
CREATE POLICY "Merit Formulas: Read" ON public.merit_formulas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Merit Formulas: Manage" ON public.merit_formulas FOR ALL USING (public.get_my_role() = 'admin');

-- 10. public.applications
-- Student: Own applications
CREATE POLICY "Applications: Student RW" ON public.applications FOR ALL USING (
    auth.uid() = student_id
);

-- Admin: View all
CREATE POLICY "Applications: Admin View" ON public.applications FOR SELECT USING (
    public.get_my_role() = 'admin'
);

-- DEO: Insert
CREATE POLICY "Applications: DEO Insert" ON public.applications FOR INSERT WITH CHECK (
    public.get_my_role() = 'deo'
);
-- DEO: View/Update drafts they created? Or all drafts? 
-- Let's allow DEO to view/edit ANY student application for simplicity in this system
CREATE POLICY "Applications: DEO Manage" ON public.applications FOR ALL USING (
    public.get_my_role() = 'deo'
);

-- College Auth: View/Update for their college
CREATE POLICY "Applications: College Auth View" ON public.applications FOR SELECT USING (
    public.get_my_role() = 'college_auth' AND
    EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = applications.course_id
        AND c.college_id = (SELECT college_id FROM public.users WHERE id = auth.uid())
    )
);

CREATE POLICY "Applications: College Auth Update" ON public.applications FOR UPDATE USING (
    public.get_my_role() = 'college_auth' AND
    EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = applications.course_id
        AND c.college_id = (SELECT college_id FROM public.users WHERE id = auth.uid())
    )
);

-- University Auth: View/Update for their university
CREATE POLICY "Applications: Univ Auth View" ON public.applications FOR SELECT USING (
    public.get_my_role() = 'university_auth' AND
    EXISTS (
        SELECT 1 FROM public.courses c
        JOIN public.colleges col ON c.college_id = col.id
        WHERE c.id = applications.course_id
        AND col.university_id = (SELECT university_id FROM public.users WHERE id = auth.uid())
    )
);

CREATE POLICY "Applications: Univ Auth Update" ON public.applications FOR UPDATE USING (
    public.get_my_role() = 'university_auth' AND
    EXISTS (
        SELECT 1 FROM public.courses c
        JOIN public.colleges col ON c.college_id = col.id
        WHERE c.id = applications.course_id
        AND col.university_id = (SELECT university_id FROM public.users WHERE id = auth.uid())
    )
);


-- 11. public.marks
CREATE POLICY "Marks: Student RW" ON public.marks FOR ALL USING (
    EXISTS (SELECT 1 FROM public.applications WHERE id = application_id AND student_id = auth.uid())
);
CREATE POLICY "Marks: Admin View" ON public.marks FOR SELECT USING (public.get_my_role() = 'admin');
-- Allow College/Univ Auth to read marks? Yes.
CREATE POLICY "Marks: Staff Read" ON public.marks FOR SELECT USING (
    public.get_my_role() IN ('college_auth', 'university_auth', 'adm_officer')
);


-- 12. public.payments
CREATE POLICY "Payments: Student RW" ON public.payments FOR ALL USING (
    EXISTS (SELECT 1 FROM public.applications WHERE id = application_id AND student_id = auth.uid())
);
CREATE POLICY "Payments: Fee Collector Manage" ON public.payments FOR ALL USING (public.get_my_role() = 'fee_collector');
CREATE POLICY "Payments: Admin View" ON public.payments FOR SELECT USING (public.get_my_role() = 'admin');


-- 13. public.documents
CREATE POLICY "Documents: Student RW" ON public.documents FOR ALL USING (
    user_id = auth.uid() OR
    application_id IN (SELECT id FROM public.applications WHERE student_id = auth.uid())
);

CREATE POLICY "Documents: Admin View" ON public.documents FOR SELECT USING (public.get_my_role() = 'admin');

CREATE POLICY "Documents: College Auth Manage" ON public.documents FOR ALL USING (
    public.get_my_role() = 'college_auth' AND
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.courses c ON (SELECT course_id FROM public.applications WHERE id = application_id) = c.id
        WHERE u.id = auth.uid() AND u.role = 'college_auth' AND u.college_id = c.college_id
    )
);

CREATE POLICY "Documents: Univ Auth View" ON public.documents FOR SELECT USING (
    public.get_my_role() = 'university_auth' AND
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.courses c ON (SELECT course_id FROM public.applications WHERE id = application_id) = c.id
        JOIN public.colleges col ON c.college_id = col.id
        WHERE u.id = auth.uid() AND u.role = 'university_auth' AND u.university_id = col.university_id
    )
);


-- 14. public.admission_sequences
CREATE POLICY "Admission Sequences: Admin Manage" ON public.admission_sequences FOR ALL USING (public.get_my_role() = 'admin');
-- Allow Univ Auth to read/update sequences during approval
CREATE POLICY "Admission Sequences: Univ Auth Manage" ON public.admission_sequences FOR ALL USING (public.get_my_role() = 'university_auth');


-- 15. public.account_admissions
CREATE POLICY "Account Admissions: Admin View" ON public.account_admissions FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "Account Admissions: Fee Collector Manage" ON public.account_admissions FOR ALL USING (public.get_my_role() = 'fee_collector');
CREATE POLICY "Account Admissions: Univ Auth Manage" ON public.account_admissions FOR ALL USING (public.get_my_role() = 'university_auth');
CREATE POLICY "Account Admissions: Student View" ON public.account_admissions FOR SELECT USING (
    application_id IN (SELECT id FROM public.applications WHERE student_id = auth.uid())
);


-- =========================================================================================
-- STORAGE POLICIES (bucket: 'documents')
-- =========================================================================================

-- Note: Storage policies use storage.objects which is a separate system table.
-- Recursion is usually not an issue here unless we query public.users.
-- We will use public.get_my_role() here as well if needed, but path checking is safer.

-- Ensure bucket exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', true) 
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Allow authenticated viewing" ON storage.objects;
CREATE POLICY "Allow authenticated viewing" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "Allow users to modify own files" ON storage.objects;
CREATE POLICY "Allow users to modify own files" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);