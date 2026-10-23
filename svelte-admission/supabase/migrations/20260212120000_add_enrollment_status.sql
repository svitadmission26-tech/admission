-- Migration: Add enrollment_status to account_admissions

ALTER TABLE public.account_admissions
ADD COLUMN IF NOT EXISTS enrollment_status TEXT DEFAULT 'confirmed' 
CHECK (enrollment_status IN ('provisional', 'confirmed'));
