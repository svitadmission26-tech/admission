-- Safe migration to add missing INSERT policy for student_profiles
-- Checks for existence to prevent errors
-- Avoids recursion by using simple auth check

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'student_profiles' 
        AND policyname = 'Users can insert their own profile'
    ) THEN
        CREATE POLICY "Users can insert their own profile" ON public.student_profiles
            FOR INSERT 
            WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;