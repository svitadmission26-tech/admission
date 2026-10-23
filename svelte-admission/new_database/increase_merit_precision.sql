-- Migration: Safely add or update merit_score precision to support high-precision rankings
-- Path: new_database/increase_merit_precision.sql

DO $$
BEGIN
    -- 1. Handle applications table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'merit_score') THEN
        -- Add it if it's missing
        ALTER TABLE public.applications ADD COLUMN merit_score NUMERIC(12, 6);
        COMMENT ON COLUMN public.applications.merit_score IS 'High-precision merit score for ranking';
    ELSE
        -- Update precision if it already exists
        ALTER TABLE public.applications ALTER COLUMN merit_score TYPE NUMERIC(12, 6);
    END IF;

    -- 2. Handle merit_list_entries table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merit_list_entries' AND column_name = 'merit_score') THEN
        -- Add it if it's missing
        ALTER TABLE public.merit_list_entries ADD COLUMN merit_score NUMERIC(12, 6);
    ELSE
        -- Update precision if it already exists
        ALTER TABLE public.merit_list_entries ALTER COLUMN merit_score TYPE NUMERIC(12, 6);
    END IF;
END $$;
