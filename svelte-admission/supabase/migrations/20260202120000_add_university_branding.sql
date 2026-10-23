-- Add branding and contact columns to universities table
ALTER TABLE public.universities
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS contact_email TEXT,
ADD COLUMN IF NOT EXISTS contact_phone TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS footer_text TEXT DEFAULT '© 2026 University Name. All Rights Reserved.';
