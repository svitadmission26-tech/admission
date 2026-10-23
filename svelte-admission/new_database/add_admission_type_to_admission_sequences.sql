-- Migration: Add admission_type to admission_sequences and backfill existing rows

ALTER TABLE public.admission_sequences
ADD COLUMN IF NOT EXISTS admission_type VARCHAR(20) DEFAULT 'Regular';

COMMENT ON COLUMN public.admission_sequences.admission_type IS 'Admission type used to partition admission sequence generation: Regular, D2D, C2D';

UPDATE public.admission_sequences
SET admission_type = 'Regular'
WHERE admission_type IS NULL;
