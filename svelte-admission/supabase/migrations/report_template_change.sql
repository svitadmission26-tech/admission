-- Fix report_templates schema: Remove 'columns' and ensure 'configuration' is used

-- 1. Make 'columns' nullable to prevent NOT NULL constraint errors during transition
ALTER TABLE public.report_templates ALTER COLUMN "columns" DROP NOT NULL;

-- 2. Migrate data: If 'configuration' is empty and 'columns' has data, move it.
-- We wrap 'columns' value in a JSON object with key 'columns' to match the new structure if needed,
-- or just assume 'columns' held the array of columns directly.
-- The code expects configuration = { columns: [...] }.
-- If 'columns' column was JSONB array of columns:
UPDATE public.report_templates 
SET configuration = jsonb_build_object('columns', "columns")
WHERE configuration = '{}'::jsonb AND "columns" IS NOT NULL;

-- 3. Drop the problematic 'columns' column
ALTER TABLE public.report_templates DROP COLUMN IF EXISTS "columns";

-- 4. Ensure 'configuration' is properly set up
ALTER TABLE public.report_templates ALTER COLUMN configuration SET DEFAULT '{}'::jsonb;
ALTER TABLE public.report_templates ALTER COLUMN configuration SET NOT NULL;

-- 5. Force schema cache reload
NOTIFY pgrst, 'reload schema';
