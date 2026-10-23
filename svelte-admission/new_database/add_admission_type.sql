-- Migration: Add admission_type to applications and admission_mode to account_admissions
-- Path: new_database/add_admission_type.sql

DO $$
BEGIN
    -- 1. Add admission_type to applications table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'admission_type') THEN
        ALTER TABLE public.applications ADD COLUMN admission_type VARCHAR(20) DEFAULT 'Regular';
        COMMENT ON COLUMN public.applications.admission_type IS 'Admission type: Regular, D2D (Diploma to Degree), or C2D (Certificate to Degree)';
    END IF;

    -- Ensure existing records have 'Regular'
    UPDATE public.applications SET admission_type = 'Regular' WHERE admission_type IS NULL;

    -- 2. Add admission_mode to account_admissions
    -- (using admission_mode because admission_type already exists and is used for form_type in this table)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_admissions' AND column_name = 'admission_mode') THEN
        ALTER TABLE public.account_admissions ADD COLUMN admission_mode VARCHAR(20) DEFAULT 'Regular';
        COMMENT ON COLUMN public.account_admissions.admission_mode IS 'Finalized admission mode: Regular, D2D, or C2D';
    END IF;

    -- Update existing records
    UPDATE public.account_admissions SET admission_mode = 'Regular' WHERE admission_mode IS NULL;
END $$;


