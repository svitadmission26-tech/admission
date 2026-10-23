-- Migration: Add Form Type Permissions for Students
-- Path: new_database/add_form_type_permissions.sql

DO $$
BEGIN
    -- 1. Add student_can_apply column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'form_types' AND column_name = 'student_can_apply') THEN
        ALTER TABLE public.form_types ADD COLUMN student_can_apply BOOLEAN DEFAULT true;
        COMMENT ON COLUMN public.form_types.student_can_apply IS 'Determines if students can select this form type in the portal.';
    END IF;

    -- 2. Add allow_multiple_apps column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'form_types' AND column_name = 'allow_multiple_apps') THEN
        ALTER TABLE public.form_types ADD COLUMN allow_multiple_apps BOOLEAN DEFAULT false;
        COMMENT ON COLUMN public.form_types.allow_multiple_apps IS 'Determines if a student can have multiple active applications for this form type.';
    END IF;

    -- 3. Set specific defaults for internal types
    -- Example: Mark 'Vacant' as internal-only if it exists
    UPDATE public.form_types 
    SET student_can_apply = false 

    WHERE name ILIKE '%Vacant%' OR name ILIKE '%Internal%';
END $$;



