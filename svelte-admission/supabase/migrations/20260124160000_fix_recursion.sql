-- Fix Infinite Recursion in Users RLS

-- 1. Create a helper function to check user role without triggering RLS
-- SECURITY DEFINER means this function runs with the privileges of the creator (system), bypassing RLS.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (SELECT role FROM public.users WHERE id = auth.uid());
END;
$$;

-- 2. Drop the problematic recursive policies
DROP POLICY IF EXISTS "Users: Fee Collector view all" ON public.users;
DROP POLICY IF EXISTS "Users: Admin can view all" ON public.users;

-- 3. Re-create policies using the safe function
-- Admin Policy
CREATE POLICY "Users: Admin can view all" ON public.users 
FOR SELECT 
USING (
    (SELECT public.get_my_role()) = 'admin'
);

-- Fee Collector Policy
CREATE POLICY "Users: Fee Collector view all" ON public.users 
FOR SELECT 
USING (
    (SELECT public.get_my_role()) = 'fee_collector'
);

-- 4. Also fix the Applications policy which used the same pattern (optional but safer)
DROP POLICY IF EXISTS "Applications: Fee Collector view all" ON public.applications;
CREATE POLICY "Applications: Fee Collector view all" ON public.applications 
FOR SELECT 
USING (
    (SELECT public.get_my_role()) = 'fee_collector'
);
