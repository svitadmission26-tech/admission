-- Fix RLS for Users table
-- Allow Fee Collectors to update user profiles (specifically to set enrollment_number)

-- 1. Fee Collector update access
DROP POLICY IF EXISTS "Users: Fee Collector update" ON public.users;
CREATE POLICY "Users: Fee Collector update" ON public.users 
FOR UPDATE 
USING (
    (SELECT public.get_my_role()) = 'fee_collector'
)
WITH CHECK (
    (SELECT public.get_my_role()) = 'fee_collector'
);

-- 2. Ensure Fee Collectors can SELECT all users (to see student details)
-- If not already covered by another policy
DROP POLICY IF EXISTS "Users: Fee Collector view all" ON public.users;
CREATE POLICY "Users: Fee Collector view all" ON public.users 
FOR SELECT 
USING (
    (SELECT public.get_my_role()) = 'fee_collector'
);
