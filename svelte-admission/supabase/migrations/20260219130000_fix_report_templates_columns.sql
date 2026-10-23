-- Fix missing columns in report_templates table
-- These columns were part of the original definition but seem to be missing in the deployed schema

ALTER TABLE public.report_templates 
ADD COLUMN IF NOT EXISTS base_table TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS configuration JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Force schema cache reload to make new columns visible to PostgREST
NOTIFY pgrst, 'reload schema';
