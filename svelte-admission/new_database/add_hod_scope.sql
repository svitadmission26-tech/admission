-- 1. Add hod_scope column: 'branch' = single branch, 'college' = all branches in college, 'university' = all colleges in university
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS hod_scope TEXT DEFAULT 'branch'
CHECK (hod_scope IN ('branch', 'college', 'university'));

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_hod_scope ON public.users(hod_scope);

-- 3. Update RLS policy for applications to support college-scoped HODs
DROP POLICY IF EXISTS "Applications: HOD view own branch" ON public.applications;
CREATE POLICY "Applications: HOD view own branch" ON public.applications
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.courses c ON applications.course_id = c.id
        WHERE u.id = auth.uid()
          AND u.role = 'hod'
          AND (
            -- Branch-level HOD: must match branch_id
            (u.hod_scope = 'branch' AND u.branch_id = applications.branch_id AND (u.college_id IS NULL OR u.college_id = c.college_id))
            OR
            -- College-level HOD: sees all branches in their college
            (u.hod_scope = 'college' AND u.college_id IS NOT NULL AND u.college_id = c.college_id)
          )
    )
);

-- 4. Update student_profiles RLS policy for college-scoped HODs
DROP POLICY IF EXISTS "Student Profiles: HOD view own branch" ON public.student_profiles;
CREATE POLICY "Student Profiles: HOD view own branch" ON public.student_profiles
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.applications app ON app.student_id = student_profiles.user_id
        JOIN public.courses c ON app.course_id = c.id
        WHERE u.id = auth.uid()
          AND u.role = 'hod'
          AND (
            (u.hod_scope = 'branch' AND u.branch_id = app.branch_id AND (u.college_id IS NULL OR u.college_id = c.college_id))
            OR
            (u.hod_scope = 'college' AND u.college_id IS NOT NULL AND u.college_id = c.college_id)
          )
    )
);
