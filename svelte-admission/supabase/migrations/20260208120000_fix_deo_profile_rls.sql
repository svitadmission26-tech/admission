-- Fix RLS policies to allow DEOs to manage student profiles

DO $$
BEGIN
    -- 1. DEO SELECT Policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'student_profiles' 
        AND policyname = 'DEO can view all profiles'
    ) THEN
        CREATE POLICY "DEO can view all profiles" ON public.student_profiles
            FOR SELECT
            USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'deo'));
    END IF;

    -- 2. DEO UPDATE Policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'student_profiles' 
        AND policyname = 'DEO can update all profiles'
    ) THEN
        CREATE POLICY "DEO can update all profiles" ON public.student_profiles
            FOR UPDATE
            USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'deo'));
    END IF;

    -- 3. DEO INSERT Policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'student_profiles' 
        AND policyname = 'DEO can insert profiles'
    ) THEN
        CREATE POLICY "DEO can insert profiles" ON public.student_profiles
            FOR INSERT
            WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'deo'));
    END IF;
END
$$;
