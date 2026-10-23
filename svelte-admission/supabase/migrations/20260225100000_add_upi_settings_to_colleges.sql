-- Add UPI payment settings to colleges table
ALTER TABLE public.colleges 
ADD COLUMN IF NOT EXISTS upi_vpa TEXT,
ADD COLUMN IF NOT EXISTS upi_merchant_name TEXT,
ADD COLUMN IF NOT EXISTS upi_enabled BOOLEAN DEFAULT false;
