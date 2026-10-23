-- Add audit columns to applications table
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id);

-- Optional: Enable RLS for these columns? 
-- Usually standard RLS on the row covers it.

-- COMMENT ON COLUMN public.applications.created_by IS 'User who initially created the application record';
-- COMMENT ON COLUMN public.applications.updated_by IS 'User who last modified the application record';
