-- Create 'documents' bucket for file storage
-- We make it PUBLIC so that getPublicUrl works in the frontend.
-- If you require strict privacy, set public = false and update the frontend to use createSignedUrl.

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Ensure RLS is enabled on objects (it usually is by default, but good to be safe)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to upload files
-- (This was likely already in your previous script, but repeating for completeness)
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public access to view files (since bucket is public)
-- Note: For a public bucket, RLS for SELECT is bypassed for public URLs.
-- This policy is for authenticated client-side SDK calls (like list(), download()).
DROP POLICY IF EXISTS "Allow authenticated viewing" ON storage.objects;
CREATE POLICY "Allow authenticated viewing" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'documents');

-- Allow users to update/delete their own files
DROP POLICY IF EXISTS "Allow users to modify own files" ON storage.objects;
CREATE POLICY "Allow users to modify own files" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
