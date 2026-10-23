-- Migration: Add DEO read access to public.users
-- DEOs need to be able to search students to create applications on their behalf.
-- The existing policies only allow self-access and admin access;
-- this policy grants DEOs SELECT on all users.

DROP POLICY IF EXISTS "Users: DEO can view all" ON public.users;
CREATE POLICY "Users: DEO can view all" ON public.users
    FOR SELECT USING (public.get_my_role() = 'deo');
