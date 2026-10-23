ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS payment_breakdown JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS fee_components_breakdown JSONB DEFAULT '[]'::jsonb;
