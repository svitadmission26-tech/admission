-- Fix Storage Policies for 'documents' bucket
-- Run this script to resolve "new row violates row-level security policy" errors during upload.

-- 1. Ensure the bucket is public
UPDATE storage.buckets SET public = true WHERE id = 'documents';

-- 2. Drop existing policies to clear conflicts
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated viewing" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to modify own files" ON storage.objects;
-- Drop legacy or default policies if any
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Individual user access" ON storage.objects;

-- 3. Create simplified INSERT policy (Upload)
-- Uses standard LIKE matching instead of helper functions for better reliability
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  name LIKE (auth.uid() || '/%')
);

-- 4. Create SELECT policy (View)
CREATE POLICY "Allow authenticated viewing" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'documents');

-- 5. Create UPDATE/DELETE policy
CREATE POLICY "Allow users to modify own files" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'documents' AND
  name LIKE (auth.uid() || '/%')
);
