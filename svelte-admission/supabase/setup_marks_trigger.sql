-- Migration to add automatic mapping from applications.form_data to marks table

-- 1. Ensure unique constraint on marks table (application_id, subject)
-- We use a DO block to safely add the constraint only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.marks'::regclass 
        AND conname = 'marks_app_subject_unique'
    ) THEN
        ALTER TABLE public.marks ADD CONSTRAINT marks_app_subject_unique UNIQUE (application_id, subject);
    END IF;
END
$$;

-- 2. Create the Trigger Function
CREATE OR REPLACE FUNCTION public.sync_application_marks()
RETURNS TRIGGER AS $$
DECLARE
    form_schema JSONB;
    field_def JSONB;
    field_value NUMERIC;
    subject_name TEXT;
    max_score_val NUMERIC;
BEGIN
    -- Only proceed if form_data has changed or is new
    IF (TG_OP = 'UPDATE' AND OLD.form_data = NEW.form_data) THEN
        RETURN NEW;
    END IF;

    -- Fetch the Form Schema for this application
    SELECT schema_json INTO form_schema
    FROM public.admission_forms
    WHERE course_id = NEW.course_id AND cycle_id = NEW.cycle_id AND form_type = NEW.form_type
    LIMIT 1;

    -- If no schema, exit
    IF form_schema IS NULL OR form_schema->'fields' IS NULL THEN
        RETURN NEW;
    END IF;

    -- Iterate through fields in the schema
    FOR field_def IN SELECT * FROM jsonb_array_elements(form_schema->'fields')
    LOOP
        -- Check if this field is marked for merit calculation
        IF (field_def->>'is_merit')::BOOLEAN IS TRUE THEN
            
            subject_name := field_def->>'label';
            -- Ideally use a dedicated subject_name property if available, else label
            IF (field_def->>'subject_name') IS NOT NULL AND (field_def->>'subject_name') <> '' THEN
                subject_name := field_def->>'subject_name';
            END IF;
            
            -- Extract value from the application's form_data
            -- Use specific error handling for numeric conversion
            BEGIN
                -- Safely cast to numeric. If null or empty string, it will be null.
                -- We use coalesce to treat nulls as 0 if desired, or skip.
                -- Let's try to parse.
                field_value := (NEW.form_data ->> (field_def->>'key'))::NUMERIC;
            EXCEPTION WHEN OTHERS THEN
                field_value := 0; -- Default to 0 if invalid
            END;

            -- Determine max score (default 100 or from schema)
            max_score_val := 100;
            IF (field_def->>'max_score') IS NOT NULL THEN
                BEGIN
                    max_score_val := (field_def->>'max_score')::NUMERIC;
                EXCEPTION WHEN OTHERS THEN
                    max_score_val := 100;
                END;
            END IF;

            -- Upsert into marks table
            INSERT INTO public.marks (application_id, subject, score, max_score)
            VALUES (NEW.id, subject_name, COALESCE(field_value, 0), max_score_val)
            ON CONFLICT ON CONSTRAINT marks_app_subject_unique
            DO UPDATE SET 
                score = EXCLUDED.score,
                max_score = EXCLUDED.max_score;
                
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create the Trigger
DROP TRIGGER IF EXISTS on_application_update_sync_marks ON public.applications;

CREATE TRIGGER on_application_update_sync_marks
AFTER INSERT OR UPDATE OF form_data ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.sync_application_marks();
