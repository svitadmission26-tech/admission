-- 1. Drop existing role check constraint on public.users
ALTER TABLE public.users 
DROP CONSTRAINT IF EXISTS users_role_check;

-- 2. Re-create constraint with 'hod' added
ALTER TABLE public.users 
ADD CONSTRAINT users_role_check 
CHECK (role IN ('student', 'deo', 'college_auth', 'university_auth', 'univ_auth', 'adm_officer', 'fee_collector', 'admin', 'hod'));

-- 3. Add branch_id column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- 4. Create index on branch_id for query performance
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON public.users(branch_id);

-- 5. Row Level Security: Select policy for applications
DROP POLICY IF EXISTS "Applications: HOD view own branch" ON public.applications;
CREATE POLICY "Applications: HOD view own branch" ON public.applications 
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.courses c ON applications.course_id = c.id
        WHERE u.id = auth.uid() 
          AND u.role = 'hod' 
          AND u.branch_id = applications.branch_id
          AND (u.college_id IS NULL OR u.college_id = c.college_id)
    )
);

-- 6. Row Level Security: Select policy for student profiles
DROP POLICY IF EXISTS "Student Profiles: HOD view own branch" ON public.student_profiles;
CREATE POLICY "Student Profiles: HOD view own branch" ON public.student_profiles 
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.applications app ON app.student_id = student_profiles.user_id
        JOIN public.courses c ON app.course_id = c.id
        WHERE u.id = auth.uid() 
          AND u.role = 'hod' 
          AND u.branch_id = app.branch_id
          AND (u.college_id IS NULL OR u.college_id = c.college_id)
    )
);
