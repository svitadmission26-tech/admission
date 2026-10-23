-- Fix RLS: Allow students to view their own account admissions (to see Admission Number)

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'account_admissions' 
        AND policyname = 'Account Admissions: Students own read'
    ) THEN
        CREATE POLICY "Account Admissions: Students own read" ON public.account_admissions
            FOR SELECT
            USING (
                EXISTS (
                    SELECT 1 FROM public.applications 
                    WHERE id = account_admissions.application_id 
                    AND student_id = auth.uid()
                )
            );
    END IF;
END
$$;
