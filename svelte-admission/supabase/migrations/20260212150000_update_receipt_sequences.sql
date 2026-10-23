-- Migration: Update receipt_sequences to ensure required columns exist

-- 1. Add columns if they don't exist
ALTER TABLE public.receipt_sequences
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'general', -- Default needed for existing rows if not null
ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS current_sequence INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS prefix TEXT DEFAULT 'REC-';

-- 2. Remove default from payment_type and make it NOT NULL (optional, but good practice)
-- ALTER TABLE public.receipt_sequences ALTER COLUMN payment_type DROP DEFAULT;
-- ALTER TABLE public.receipt_sequences ALTER COLUMN payment_type SET NOT NULL;

-- 3. Add Unique Constraint if not exists (Drop first to be safe/update)
ALTER TABLE public.receipt_sequences DROP CONSTRAINT IF EXISTS receipt_sequences_payment_type_academic_year_id_key;
ALTER TABLE public.receipt_sequences ADD CONSTRAINT receipt_sequences_payment_type_academic_year_id_key UNIQUE (payment_type, academic_year_id);

-- 4. Create Index if not exists
CREATE INDEX IF NOT EXISTS idx_receipt_sequences_type_year ON public.receipt_sequences(payment_type, academic_year_id);
