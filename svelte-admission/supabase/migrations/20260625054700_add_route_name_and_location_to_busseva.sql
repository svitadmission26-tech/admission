-- Migration: Add route_name and location columns to busseva_fees table
ALTER TABLE public.busseva_fees ADD COLUMN IF NOT EXISTS route_name TEXT;
ALTER TABLE public.busseva_fees ADD COLUMN IF NOT EXISTS location TEXT;

-- Reload PostgREST schema cache to make columns visible immediately
NOTIFY pgrst, 'reload schema';
