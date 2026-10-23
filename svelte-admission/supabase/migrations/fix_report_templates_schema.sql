-- Fix duplicate column issue in report_templates
-- It seems there is a 'columns' column (probably older or manually created) and 'configuration' column.
-- We want to consolidate on 'configuration' as per the migration files.

-- 1. Check if 'columns' exists and migrate data to 'configuration' if needed (though likely empty or redundant)
-- Since we can't do conditional logic easily in pure SQL without PL/pgSQL, we'll just handle the column drop.
-- Assuming 'configuration' is the correct one.

-- Make 'columns' nullable first to avoid errors during transition if needed
ALTER TABLE public.report_templates ALTER COLUMN "columns" DROP NOT NULL;

-- If 'configuration' is empty and 'columns' has data, copy it over.
UPDATE public.report_templates 
SET configuration = jsonb_build_object('columns', "columns")
WHERE configuration = '{}'::jsonb AND "columns" IS NOT NULL;

-- Finally, drop the 'columns' column to clean up the schema and fix the error.
ALTER TABLE public.report_templates DROP COLUMN IF EXISTS "columns";

-- Ensure 'configuration' is NOT NULL and has a default
ALTER TABLE public.report_templates ALTER COLUMN configuration SET NOT NULL;
ALTER TABLE public.report_templates ALTER COLUMN configuration SET DEFAULT '{}'::jsonb;

-- Force schema cache reload
NOTIFY pgrst, 'reload schema';
