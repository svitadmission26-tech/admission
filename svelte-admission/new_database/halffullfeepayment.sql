-- Manual Migration: Add fee_period to payments table
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS fee_period TEXT CHECK (fee_period IN ('semester', 'year')) DEFAULT 'year';

COMMENT ON COLUMN public.payments.fee_period IS 'Tracks whether the payment covers a half semester or the full year for receipt labeling.';
