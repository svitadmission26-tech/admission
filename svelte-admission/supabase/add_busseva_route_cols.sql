ALTER TABLE public.busseva_fees ADD COLUMN IF NOT EXISTS route_name TEXT;
ALTER TABLE public.busseva_fees ADD COLUMN IF NOT EXISTS location TEXT;
