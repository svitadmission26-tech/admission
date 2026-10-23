-- Create a bucket for branding assets (logos, etc.)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow public to read branding assets
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT USING (bucket_id = 'branding');

-- Policy: Allow admins to upload/manage branding assets
CREATE POLICY "Admin Manage Branding" ON storage.objects
  FOR ALL USING (
    bucket_id = 'branding' AND 
    (auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin'))
  );
