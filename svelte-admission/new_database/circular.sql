-- Migration: Add is_public column to circulars for landing page visibility
-- Path: new_database/circular.sql

DO $$
BEGIN
    -- 1. Add is_public column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'circulars' AND column_name = 'is_public') THEN
        ALTER TABLE public.circulars ADD COLUMN is_public BOOLEAN DEFAULT false;
        COMMENT ON COLUMN public.circulars.is_public IS 'If true, the circular will be displayed on the main landing page without login.';
    END IF;

    -- 2. Add college_id column if missing (Optional but good for multi-college setups)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'circulars' AND column_name = 'college_id') THEN
        ALTER TABLE public.circulars ADD COLUMN college_id UUID REFERENCES public.colleges(id);
    END IF;

    -- 3. RLS Policies
    -- Drop existing to avoid conflicts
    DROP POLICY IF EXISTS "Circulars: Public Read" ON public.circulars;
    
    -- Allow unauthenticated (anon) users to see active public circulars
    CREATE POLICY "Circulars: Public Read" ON public.circulars 
    FOR SELECT USING (is_public = true AND is_active = true);

END $$;
