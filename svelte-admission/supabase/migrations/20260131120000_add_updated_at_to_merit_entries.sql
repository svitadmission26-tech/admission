
ALTER TABLE public.merit_list_entries
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
