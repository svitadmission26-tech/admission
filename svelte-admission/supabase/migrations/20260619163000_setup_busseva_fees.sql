-- 1. Setup Academic Year-wise QR Configs (Managed by Admin)
CREATE TABLE IF NOT EXISTS public.busseva_qr_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE UNIQUE,
    upi_id TEXT,
    merchant_name TEXT,
    qr_image_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Setup Academic Year-wise Receipt Sequences
CREATE TABLE IF NOT EXISTS public.busseva_receipt_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE UNIQUE,
    current_sequence INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Setup Bus Seva Fees Transactions
CREATE TABLE IF NOT EXISTS public.busseva_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL CONSTRAINT fk_busseva_fees_student REFERENCES public.users(id) ON DELETE CASCADE,
    enrollment_number TEXT NOT NULL,
    academic_year_id UUID NOT NULL CONSTRAINT fk_busseva_fees_year REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    college_id UUID NOT NULL CONSTRAINT fk_busseva_fees_college REFERENCES public.colleges(id) ON DELETE RESTRICT,
    total_amount NUMERIC NOT NULL CHECK (total_amount > 0),
    receipt_number TEXT NOT NULL UNIQUE,
    transaction_number TEXT NOT NULL,
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    collected_by UUID NOT NULL CONSTRAINT fk_busseva_fees_collector REFERENCES public.users(id) ON DELETE RESTRICT
);

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_busseva_fees_student ON public.busseva_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_busseva_fees_enrollment ON public.busseva_fees(enrollment_number);
CREATE INDEX IF NOT EXISTS idx_busseva_fees_college ON public.busseva_fees(college_id);
CREATE INDEX IF NOT EXISTS idx_busseva_fees_receipt ON public.busseva_fees(receipt_number);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.busseva_qr_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.busseva_receipt_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.busseva_fees ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- QR Configs: All authenticated users can read; only administrators can modify
DROP POLICY IF EXISTS "Allow authenticated read for busseva_qr_configs" ON public.busseva_qr_configs;
CREATE POLICY "Allow authenticated read for busseva_qr_configs" ON public.busseva_qr_configs
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow admin to manage busseva_qr_configs" ON public.busseva_qr_configs;
CREATE POLICY "Allow admin to manage busseva_qr_configs" ON public.busseva_qr_configs
    FOR ALL TO authenticated USING (EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    ));

-- Receipt Sequences: Only fee_collector and deo can manage
DROP POLICY IF EXISTS "Allow collectors to manage sequences" ON public.busseva_receipt_sequences;
CREATE POLICY "Allow collectors to manage sequences" ON public.busseva_receipt_sequences
    FOR ALL TO authenticated USING (EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('fee_collector', 'deo')
    ));

-- Bus Seva Fees: Students read own; collectors and deo read all and insert
DROP POLICY IF EXISTS "Allow read own or collector read all for busseva_fees" ON public.busseva_fees;
CREATE POLICY "Allow read own or collector read all for busseva_fees" ON public.busseva_fees
    FOR SELECT TO authenticated USING (auth.uid() = student_id OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('fee_collector', 'deo')
    ));

DROP POLICY IF EXISTS "Allow collectors to insert busseva_fees" ON public.busseva_fees;
CREATE POLICY "Allow collectors to insert busseva_fees" ON public.busseva_fees
    FOR INSERT TO authenticated WITH CHECK (EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('fee_collector', 'deo')
    ));

-- 6. Backfill active_application_id for existing admitted students with enrollment numbers
UPDATE public.student_profiles sp
SET active_application_id = (
    SELECT a.id 
    FROM public.applications a
    WHERE a.student_id = sp.user_id
    AND a.status = 'approved'
    ORDER BY a.updated_at DESC
    LIMIT 1
)
WHERE sp.enrollment_number IS NOT NULL 
AND sp.active_application_id IS NULL;
