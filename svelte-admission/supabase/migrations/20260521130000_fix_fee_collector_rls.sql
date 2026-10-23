
-- Migration: 20260521130000_fix_fee_collector_rls.sql
-- Description: Grants fee_collector role permissions to record transactions, payments, and receipts.

-- 1. Transactions RLS Update
DROP POLICY IF EXISTS "Transactions: Insert policy" ON public.transactions;
CREATE POLICY "Transactions: Insert policy" ON public.transactions 
FOR INSERT TO authenticated
WITH CHECK (
    auth.uid() = student_id 
    OR 
    public.get_my_role() IN ('admin', 'deo', 'fee_collector')
);

-- 2. Payments RLS Update (Ensure fee_collector can insert)
DROP POLICY IF EXISTS "Payments: Fee Collector Manage" ON public.payments;
DROP POLICY IF EXISTS "Payments: Fee Collector access" ON public.payments;
CREATE POLICY "Payments: Fee Collector access" ON public.payments 
FOR ALL TO authenticated
USING (public.get_my_role() = 'fee_collector')
WITH CHECK (public.get_my_role() = 'fee_collector');

-- 3. Fee Receipts RLS Update
DROP POLICY IF EXISTS "Fee Receipts: Staff view all" ON public.fee_receipts;
CREATE POLICY "Fee Receipts: Staff access" ON public.fee_receipts 
FOR ALL TO authenticated
USING (public.get_my_role() IN ('admin', 'fee_collector', 'adm_officer'))
WITH CHECK (public.get_my_role() IN ('admin', 'fee_collector', 'adm_officer'));

-- 4. Receipt Sequences RLS Update (Need to increment sequence)
DROP POLICY IF EXISTS "Receipt Sequences: Staff manage" ON public.receipt_sequences;
CREATE POLICY "Receipt Sequences: Staff access" ON public.receipt_sequences 
FOR ALL TO authenticated
USING (public.get_my_role() IN ('admin', 'fee_collector'))
WITH CHECK (public.get_my_role() IN ('admin', 'fee_collector'));

-- 5. Admissions RLS Update (Need to update account_status)
DROP POLICY IF EXISTS "Admissions: Fee Collector update" ON public.account_admissions;
CREATE POLICY "Admissions: Fee Collector update" ON public.account_admissions 
FOR UPDATE TO authenticated
USING (public.get_my_role() = 'fee_collector')
WITH CHECK (public.get_my_role() = 'fee_collector');
