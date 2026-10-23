-- Migration to add logo_url to colleges table
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS logo_url TEXT;
