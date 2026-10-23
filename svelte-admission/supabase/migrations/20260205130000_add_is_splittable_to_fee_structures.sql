-- Add is_splittable column to fee_structures
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS is_splittable BOOLEAN DEFAULT FALSE;
