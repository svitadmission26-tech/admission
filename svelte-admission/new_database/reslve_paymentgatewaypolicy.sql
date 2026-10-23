-- ==========================================================
-- RESOLVE PAYMENT GATEWAY & RECEIPT POLICIES
-- ==========================================================

-- 1. Create fee_receipts table if missing
CREATE TABLE IF NOT EXISTS public.fee_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_no TEXT UNIQUE NOT NULL,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
    student_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    generated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Setup RLS for Receipts
ALTER TABLE public.fee_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fee Receipts: Students view own" ON public.fee_receipts;
CREATE POLICY "Fee Receipts: Students view own" ON public.fee_receipts 
FOR SELECT TO authenticated
USING (auth.uid() = student_id OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Fee Receipts: Staff manage" ON public.fee_receipts;
CREATE POLICY "Fee Receipts: Staff manage" ON public.fee_receipts 
FOR ALL TO authenticated
USING (public.get_my_role() IN ('admin', 'fee_collector', 'adm_officer'));

-- 3. Ensure staff can manage sequences
DROP POLICY IF EXISTS "Receipt Sequences: Staff manage" ON public.receipt_sequences;
CREATE POLICY "Receipt Sequences: Staff manage" ON public.receipt_sequences
FOR ALL TO authenticated
USING (public.get_my_role() IN ('admin', 'fee_collector'));

-- 4. Fix missing column in transactions if not already done
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS payment_url TEXT;

-- 5. Finalize Payment Gateway management for Admin
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Payment Gateways: Admin manage" ON public.payment_gateways;
CREATE POLICY "Payment Gateways: Admin manage" ON public.payment_gateways 
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
