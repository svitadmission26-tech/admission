-- Add approval_comment column to applications table for internal notes on approvals
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS approval_comment TEXT;
