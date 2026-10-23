-- 1. Create Security Definer function to safely get user role without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- 2. Fix Recursion in 'public.users' policies
-- We replace the policies that queried 'public.users' recursively.

DROP POLICY IF EXISTS "Users: Admin can view all" ON public.users;
CREATE POLICY "Users: Admin can view all" ON public.users FOR SELECT USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Users: Admin can insert" ON public.users;
CREATE POLICY "Users: Admin can insert" ON public.users FOR INSERT WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Users: Admin can update all" ON public.users;
CREATE POLICY "Users: Admin can update all" ON public.users FOR UPDATE USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Users: Admin can delete all" ON public.users;
CREATE POLICY "Users: Admin can delete all" ON public.users FOR DELETE USING (get_my_role() = 'admin');

-- 3. Fix Payments Policies (Enable DEO Access and optimize others)

-- Drop potential conflicting or old policies
DROP POLICY IF EXISTS "Payments: Fee Collector view all and update" ON public.payments;
DROP POLICY IF EXISTS "Payments: Admin can view all" ON public.payments;

-- Fee Collector Policy (Re-create with get_my_role)
CREATE POLICY "Payments: Fee Collector access" ON public.payments 
FOR ALL 
USING (get_my_role() = 'fee_collector');

-- Admin Policy (Re-create with get_my_role, full access)
CREATE POLICY "Payments: Admin access" ON public.payments 
FOR ALL 
USING (get_my_role() = 'admin');

-- DEO Policy (NEW: Allow DEO to view and insert/update payments)
-- Requirements: "DEO can record offline payment" -> INSERT
CREATE POLICY "Payments: DEO access" ON public.payments 
FOR ALL 
USING (get_my_role() = 'deo');

-- Note: Student policy remains unchanged (Students own read and insert) as it relies on application ownership, not just role.
