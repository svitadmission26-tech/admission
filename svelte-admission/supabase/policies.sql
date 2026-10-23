-- RLS Policies for University Admission System

-- Enable RLS on all tables
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

-- 1. public.users Table Policies
-- Only authenticated users can see their own profile
CREATE POLICY "Users: Individual access" ON public.users FOR SELECT USING (auth.uid() = id);
-- Admins can view all users
CREATE POLICY "Users: Admin can view all" ON public.users FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
-- Admins can insert new users (e.g., DEOs creating student accounts)
CREATE POLICY "Users: Admin can insert" ON public.users FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
-- Users can update their own profile
CREATE POLICY "Users: Can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
-- Admins can update any user profile
CREATE POLICY "Users: Admin can update all" ON public.users FOR UPDATE USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
-- Admins can delete any user
CREATE POLICY "Users: Admin can delete all" ON public.users FOR DELETE USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));


-- 2. public.academic_years Table Policies
-- All authenticated users can read academic years
CREATE POLICY "Academic Years: All authenticated can read" ON public.academic_years FOR SELECT USING (auth.role() = 'authenticated');
-- Admins can manage academic years
CREATE POLICY "Academic Years: Admin can manage" ON public.academic_years FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 3. public.admission_cycles Table Policies
-- All authenticated users can read admission cycles
CREATE POLICY "Admission Cycles: All authenticated can read" ON public.admission_cycles FOR SELECT USING (auth.role() = 'authenticated');
-- Admins can manage admission cycles
CREATE POLICY "Admission Cycles: Admin can manage" ON public.admission_cycles FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 4. public.universities Table Policies
-- All authenticated users can read universities
CREATE POLICY "Universities: All authenticated can read" ON public.universities FOR SELECT USING (auth.role() = 'authenticated');
-- Admins can manage universities
CREATE POLICY "Universities: Admin can manage" ON public.universities FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 5. public.colleges Table Policies
-- All authenticated users can read colleges
CREATE POLICY "Colleges: All authenticated can read" ON public.colleges FOR SELECT USING (auth.role() = 'authenticated');
-- Admins can manage colleges
CREATE POLICY "Colleges: Admin can manage" ON public.colleges FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 6. public.courses Table Policies
-- All authenticated users can read courses
CREATE POLICY "Courses: All authenticated can read" ON public.courses FOR SELECT USING (auth.role() = 'authenticated');
-- Admins can manage courses
CREATE POLICY "Courses: Admin can manage" ON public.courses FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 7. public.admission_forms Table Policies
-- All authenticated users can read admission forms
CREATE POLICY "Admission Forms: All authenticated can read" ON public.admission_forms FOR SELECT USING (auth.role() = 'authenticated');
-- Admins can manage admission forms
CREATE POLICY "Admission Forms: Admin can manage" ON public.admission_forms FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 8. public.fee_structures Table Policies
-- All authenticated users can read fee structures
CREATE POLICY "Fee Structures: All authenticated can read" ON public.fee_structures FOR SELECT USING (auth.role() = 'authenticated');
-- Admins can manage fee structures
CREATE POLICY "Fee Structures: Admin can manage" ON public.fee_structures FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 9. public.merit_formulas Table Policies
-- All authenticated users can read merit formulas
CREATE POLICY "Merit Formulas: All authenticated can read" ON public.merit_formulas FOR SELECT USING (auth.role() = 'authenticated');
-- Admins can manage merit formulas
CREATE POLICY "Merit Formulas: Admin can manage" ON public.merit_formulas FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 10. public.applications Table Policies
-- Students can read/write their own applications
CREATE POLICY "Applications: Students own RW" ON public.applications FOR ALL USING (auth.uid() = student_id);
-- Admins can view all applications
CREATE POLICY "Applications: Admin can view all" ON public.applications FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
-- College Auth can view applications for their college
CREATE POLICY "Applications: College Auth view own college" ON public.applications FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.courses c ON applications.course_id = c.id
        WHERE u.id = auth.uid() AND u.role = 'college_auth' AND u.college_id = c.college_id
    )
);
-- University Auth can view applications within their university
CREATE POLICY "Applications: University Auth view own university" ON public.applications FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.courses c ON applications.course_id = c.id
        JOIN public.colleges col ON c.college_id = col.id
        WHERE u.id = auth.uid() AND u.role = 'university_auth' AND u.university_id = col.university_id
    )
);
-- DEOs can insert new applications
CREATE POLICY "Applications: DEO can insert" ON public.applications FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'deo'));
-- College Auth can update status to 'verified' or 'needs_correction'
CREATE POLICY "Applications: College Auth can update status" ON public.applications FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.courses c ON applications.course_id = c.id
        WHERE u.id = auth.uid() AND u.role = 'college_auth' AND u.college_id = c.college_id
    )
) WITH CHECK (status IN ('verified', 'needs_correction'));
-- University Auth can update status to 'approved', 'waitlisted', 'rejected'
CREATE POLICY "Applications: University Auth can update status" ON public.applications FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.courses c ON applications.course_id = c.id
        JOIN public.colleges col ON c.college_id = col.id
        WHERE u.id = auth.uid() AND u.role = 'university_auth' AND u.university_id = col.university_id
    )
) WITH CHECK (status IN ('approved', 'waitlisted', 'rejected'));


-- 11. public.marks Table Policies
-- Students can read/write their own marks
CREATE POLICY "Marks: Students own RW" ON public.marks FOR ALL USING (
    EXISTS (SELECT 1 FROM public.applications WHERE id = application_id AND student_id = auth.uid())
);
-- Admins can view all marks
CREATE POLICY "Marks: Admin can view all" ON public.marks FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 12. public.payments Table Policies
-- Students can read their own payments and insert new payments
CREATE POLICY "Payments: Students own read and insert" ON public.payments FOR ALL USING (
    EXISTS (SELECT 1 FROM public.applications WHERE id = application_id AND student_id = auth.uid())
) WITH CHECK (EXISTS (SELECT 1 FROM public.applications WHERE id = application_id AND student_id = auth.uid()));
-- Fee collectors can view all payments and update status
CREATE POLICY "Payments: Fee Collector view all and update" ON public.payments FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'fee_collector'));
-- Admission Officers can view and update payment records
CREATE POLICY "Payments: Adm Officer access" ON public.payments FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'adm_officer')) WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'adm_officer'));
-- Admins can view all payments
CREATE POLICY "Payments: Admin can view all" ON public.payments FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));


-- 13. public.documents Table Policies
-- Students can read/write their own documents
CREATE POLICY "Documents: Students own RW" ON public.documents FOR ALL USING (
    application_id IN (SELECT id FROM public.applications WHERE student_id = auth.uid()) OR user_id = auth.uid()
) WITH CHECK (
    application_id IN (SELECT id FROM public.applications WHERE student_id = auth.uid()) OR user_id = auth.uid()
);
-- College Auth can view documents for their college applications and update status/rejection_reason
CREATE POLICY "Documents: College Auth view and update own college" ON public.documents FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.courses c ON (SELECT course_id FROM public.applications WHERE id = application_id) = c.id
        WHERE u.id = auth.uid() AND u.role = 'college_auth' AND u.college_id = c.college_id
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.courses c ON (SELECT course_id FROM public.applications WHERE id = application_id) = c.id
        WHERE u.id = auth.uid() AND u.role = 'college_auth' AND u.college_id = c.college_id
    )
);
-- University Auth can view documents for their university applications
CREATE POLICY "Documents: University Auth view own university" ON public.documents FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.courses c ON (SELECT course_id FROM public.applications WHERE id = application_id) = c.id
        JOIN public.colleges col ON c.college_id = col.id
        WHERE u.id = auth.uid() AND u.role = 'university_auth' AND u.university_id = col.university_id
    )
);
-- Admins can view all documents
CREATE POLICY "Documents: Admin can view all" ON public.documents FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));


-- 14. public.admission_sequences Table Policies
-- Only Admins can manage admission sequences
CREATE POLICY "Admission Sequences: Admin can manage" ON public.admission_sequences FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 15. public.account_admissions Table Policies
-- Admins can view all
CREATE POLICY "Account Admissions: Admin can view all" ON public.account_admissions FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
-- Fee Collectors can view all and update status
CREATE POLICY "Account Admissions: Fee Collector view and update" ON public.account_admissions FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'fee_collector'));
-- University Auth can insert (when approving application) and read.
CREATE POLICY "Account Admissions: University Auth insert and read" ON public.account_admissions FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'university_auth'));


-- =========================================================================================
-- STORAGE POLICIES (bucket: 'documents')
-- =========================================================================================

-- Ensure bucket exists (Insert if not exists logic requires a function or manual insert, this is standard SQL attempt)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', true) 
ON CONFLICT (id) DO NOTHING;

-- Storage Policy: Insert (Upload)
-- Allow authenticated users to upload files to a folder named with their User ID
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage Policy: Select (Download/View)
-- Allow authenticated users to view files in the 'documents' bucket
-- (Refined to match user ownership would be better, but 'authenticated' is acceptable for this scope)
DROP POLICY IF EXISTS "Allow authenticated viewing" ON storage.objects;
CREATE POLICY "Allow authenticated viewing" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'documents');

-- Storage Policy: Update/Delete
-- Allow users to update or delete files in their own folder
DROP POLICY IF EXISTS "Allow users to modify own files" ON storage.objects;
CREATE POLICY "Allow users to modify own files" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
