
-- Remove the restrictive constraint that prevents having both application_id and user_id
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_check;

-- Optional: Re-add a less restrictive one if you want to ensure at least one is present
-- ALTER TABLE public.documents ADD CONSTRAINT documents_at_least_one_association 
-- CHECK (application_id IS NOT NULL OR user_id IS NOT NULL OR college_id IS NOT NULL OR university_id IS NOT NULL);
