-- Migration: Add Provisional Admission Flow Schema

-- 1. Add 'is_prov' and 'code' to form_types
ALTER TABLE public.form_types 
ADD COLUMN IF NOT EXISTS is_prov BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS code TEXT UNIQUE; -- Code like 'PROV', 'ACPC'

-- 2. Add 'prov_fee' to admission_forms
ALTER TABLE public.admission_forms
ADD COLUMN IF NOT EXISTS prov_fee NUMERIC DEFAULT 0;

-- 3. Add 'payment_mode' and 'reference_no' to payments
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS payment_mode TEXT, -- 'cash', 'qr', 'cheque'
ADD COLUMN IF NOT EXISTS reference_no TEXT;

-- 4. Update 'payment_type' check constraint on payments table
-- First, drop the existing constraint
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;

-- Then, add the new constraint including 'provisional_fee'
ALTER TABLE public.payments
ADD CONSTRAINT payments_payment_type_check
CHECK (payment_type IN ('application_fee', 'tuition_fee', 'provisional_fee', 'seat_reservation_fee'));
