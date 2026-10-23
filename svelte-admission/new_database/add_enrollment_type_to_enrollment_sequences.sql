-- Migration: Add admission_type to enrollment_sequences and make the unique index admission-type aware

-- 1. Add admission_type column if missing
ALTER TABLE public.enrollment_sequences
ADD COLUMN IF NOT EXISTS admission_type VARCHAR(20) DEFAULT 'Regular';

COMMENT ON COLUMN public.enrollment_sequences.admission_type IS 'Admission type for enrollment sequence partitioning: Regular, D2D, C2D';

-- 2. Backfill existing rows
UPDATE public.enrollment_sequences
SET admission_type = 'Regular'
WHERE admission_type IS NULL;

-- 3. Update unique index to include admission_type
DROP INDEX IF EXISTS idx_enrollment_sequences_college_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_sequences_college_id_unique
ON public.enrollment_sequences (
  college_id,
  course_id,
  academic_year_id,
  COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  admission_type
);
