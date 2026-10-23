-- Migration: Add application fee related columns

-- 1. Add form_fee to public.admission_forms
ALTER TABLE public.admission_forms
ADD COLUMN IF NOT EXISTS form_fee NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- 2. Add payment_type to public.payments
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'tuition_fee';

-- Add CHECK constraint for payment_type if it doesn't exist already
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.payments'::regclass
        AND conname = 'payments_payment_type_check'
    ) THEN
        ALTER TABLE public.payments
        ADD CONSTRAINT payments_payment_type_check CHECK (payment_type IN ('application_fee', 'tuition_fee', 'other'));
    END IF;
END
$$;

-- 3. Add application_fee_status to public.applications
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS application_fee_status TEXT NOT NULL DEFAULT 'not_applicable';

-- Add CHECK constraint for application_fee_status if it doesn't exist already
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.applications'::regclass
        AND conname = 'applications_application_fee_status_check'
    ) THEN
        ALTER TABLE public.applications
        ADD CONSTRAINT applications_application_fee_status_check CHECK (application_fee_status IN ('not_applicable', 'pending', 'paid', 'waived'));
    END IF;
END
$$;

-- IMPORTANT: You might need to backfill existing data:
-- For applications with form_fee > 0, set application_fee_status to 'pending'
-- For applications with form_fee = 0, set application_fee_status to 'not_applicable'

-- Backfill existing application_fee_status based on current form definitions
-- This might be complex as we need to join with admission_forms based on course_id and cycle_id
-- A simpler, safer approach is to update applications with paid application fees.

-- Consider a scenario where an application has a form_fee > 0 from its form definition:
-- If form_fee > 0 and no payment of type 'application_fee' exists for this application and it's not 'waived', it should be 'pending'.
-- If form_fee > 0 and a payment of type 'application_fee' exists, it should be 'paid'.
-- If form_fee = 0, it should be 'not_applicable'.

-- Manual backfill guidance:
-- UPDATE public.applications app
-- SET application_fee_status = 'pending'
-- FROM public.admission_forms af
-- WHERE app.course_id = af.course_id AND app.cycle_id = af.cycle_id
-- AND af.form_fee > 0
-- AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.application_id = app.id AND p.payment_type = 'application_fee');

-- UPDATE public.applications app
-- SET application_fee_status = 'paid'
-- FROM public.admission_forms af
-- WHERE app.course_id = af.course_id AND app.cycle_id = af.cycle_id
-- AND af.form_fee > 0
-- AND EXISTS (SELECT 1 FROM public.payments p WHERE p.application_id = app.id AND p.payment_type = 'application_fee' AND p.status = 'completed');

-- UPDATE public.applications
-- SET application_fee_status = 'not_applicable'
-- WHERE application_fee_status IS NULL OR application_fee_status = 'pending'; -- If form_fee was 0 initially
