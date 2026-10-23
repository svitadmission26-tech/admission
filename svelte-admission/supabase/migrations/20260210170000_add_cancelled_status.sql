-- Migration: Add 'cancelled' to the allowed values for application status

-- 1. Drop the existing check constraint
ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_status_check;

-- 2. Add the new check constraint including 'cancelled'
ALTER TABLE public.applications 
ADD CONSTRAINT applications_status_check 
CHECK (status IN ('draft', 'submitted', 'verified', 'approved', 'waitlisted', 'rejected', 'needs_correction', 'cancelled'));
