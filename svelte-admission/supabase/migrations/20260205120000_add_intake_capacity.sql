-- Add intake_capacity to courses and branches
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS intake_capacity INTEGER DEFAULT 0;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS intake_capacity INTEGER DEFAULT 0;
