-- 1. Ensure columns exist in colleges table
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS upi_vpa TEXT;
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS upi_merchant_name TEXT;
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS upi_enabled BOOLEAN DEFAULT false;

-- 2. Ensure branding bucket exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage Policies for branding bucket
-- Remove existing to avoid duplicates if re-run
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Admin Manage Branding" ON storage.objects;

-- Allow public to read
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT USING (bucket_id = 'branding');

-- Allow admins to manage (upload/update/delete)
CREATE POLICY "Admin Manage Branding" ON storage.objects
  FOR ALL USING (
    bucket_id = 'branding' AND 
    (auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin'))
  );
