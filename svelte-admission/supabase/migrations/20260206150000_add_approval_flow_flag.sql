-- Add explicit flag to control approval workflow flexibility
-- This decouples the "Merit Calculation" requirement from the "Who Approves" requirement.

ALTER TABLE public.form_types 
ADD COLUMN IF NOT EXISTS auto_approve_on_verification BOOLEAN DEFAULT false;

-- Update descriptions and flags for existing types based on requirements
-- Provisional & ACPC: direct approval by Adm Officer (skips Univ Auth)
UPDATE public.form_types 
SET auto_approve_on_verification = true 
WHERE name IN ('Provisional', 'ACPC');

-- MQ/NRI, Vacant, D2D: Standard flow (Adm Officer verifies -> Univ Auth approves)
UPDATE public.form_types 
SET auto_approve_on_verification = false 
WHERE name IN ('MQ/NRI', 'Vacant', 'D2D');
