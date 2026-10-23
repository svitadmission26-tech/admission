-- Add missing metadata and form configuration columns to admission_forms

ALTER TABLE public.admission_forms
    ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Untitled Form',
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS form_type TEXT REFERENCES public.form_types(name) ON UPDATE CASCADE ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS form_fee NUMERIC(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS prov_fee NUMERIC(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT false;

-- Replace the older course/cycle unique constraint with course/cycle/form_type.
DO $$
DECLARE
    conname text;
BEGIN
    SELECT conname INTO conname
    FROM pg_constraint
    WHERE conrelid = 'public.admission_forms'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%UNIQUE (course_id, cycle_id)%';

    IF conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.admission_forms DROP CONSTRAINT %I', conname);
    END IF;
END $$;

ALTER TABLE public.admission_forms
    ADD CONSTRAINT admission_forms_course_cycle_type_key UNIQUE (course_id, cycle_id, form_type);

-- Reload PostgREST schema cache so the newly added columns are visible to Supabase/PostgREST clients.
NOTIFY pgrst, 'reload schema';
