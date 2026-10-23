-- ==========================================================
-- PAYMENT SYSTEM TABLES & POLICIES
-- ==========================================================

-- 1. Create or Update payment_gateways table
CREATE TABLE IF NOT EXISTS public.payment_gateways (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT false,
    mode TEXT DEFAULT 'test' CHECK (mode IN ('test', 'live')),
    type TEXT DEFAULT 'sdk' CHECK (type IN ('sdk', 'redirect')),
    endpoint_url TEXT,
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure all columns exist (in case table was partially created)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_gateways' AND column_name='type') THEN
        ALTER TABLE public.payment_gateways ADD COLUMN type TEXT DEFAULT 'sdk' CHECK (type IN ('sdk', 'redirect'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_gateways' AND column_name='endpoint_url') THEN
        ALTER TABLE public.payment_gateways ADD COLUMN endpoint_url TEXT;
    END IF;
END $$;


-- 2. Create or Update transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'pending', 'success', 'failed', 'cancelled')),
    payment_gateway_id UUID REFERENCES public.payment_gateways(id) ON DELETE SET NULL,
    gateway_transaction_id TEXT,
    payment_url TEXT,
    ip_address TEXT,
    gateway_response JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable RLS
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;


-- 4. RLS Policies for payment_gateways
DROP POLICY IF EXISTS "Payment Gateways: Admin manage" ON public.payment_gateways;
CREATE POLICY "Payment Gateways: Admin manage" ON public.payment_gateways 
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Payment Gateways: Authenticated read" ON public.payment_gateways;
CREATE POLICY "Payment Gateways: Authenticated read" ON public.payment_gateways 
FOR SELECT TO authenticated
USING (true);


-- 5. RLS Policies for transactions
DROP POLICY IF EXISTS "Transactions: Students read and own" ON public.transactions;
CREATE POLICY "Transactions: Students read and own" ON public.transactions 
FOR SELECT TO authenticated
USING (auth.uid() = student_id OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Transactions: Staff view" ON public.transactions;
CREATE POLICY "Transactions: Staff view" ON public.transactions 
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'fee_collector', 'adm_officer')));

-- Students can insert their own transactions
DROP POLICY IF EXISTS "Transactions: Students insert" ON public.transactions;
CREATE POLICY "Transactions: Students insert" ON public.transactions 
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = student_id);

-- System/Admin can update transactions
DROP POLICY IF EXISTS "Transactions: Admin update" ON public.transactions;
CREATE POLICY "Transactions: Admin update" ON public.transactions 
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
