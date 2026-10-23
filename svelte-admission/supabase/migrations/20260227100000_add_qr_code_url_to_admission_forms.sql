-- Add QR code URL field to admission_forms table for fee payment QR codes
ALTER TABLE public.admission_forms 
ADD COLUMN IF NOT EXISTS qr_code_url TEXT;
