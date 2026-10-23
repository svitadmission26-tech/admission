-- Fix Marks Trigger and RLS
-- 1. Update the trigger function to use SECURITY DEFINER

-- Ensure unique constraint (idempotent check)
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

CREATE OR REPLACE FUNCTION public.sync_application_marks()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    form_schema JSONB;
    field_def JSONB;
    field_value NUMERIC;
    subject_name TEXT;
    max_score_val NUMERIC;
    field_key TEXT;
    field_data JSONB;
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
            
            field_key := field_def->>'key';
            field_data := NEW.form_data -> field_key;

            -- Extract value
            field_value := 0;
            BEGIN
                IF field_data IS NOT NULL THEN
                    IF jsonb_typeof(field_data) = 'object' THEN
                        -- 1. Check for standard {value, max_score} format
                        IF (field_data ->> 'value') IS NOT NULL THEN
                            field_value := (field_data ->> 'value')::NUMERIC;
                        ELSE
                            -- 2. Check for nested table layout format (Theory + Practical + etc)
                            -- Sum up all numeric values in nested objects
                            SELECT SUM(COALESCE((val->>'value')::NUMERIC, 0)) INTO field_value
                            FROM jsonb_each(field_data) AS t(col, val)
                            WHERE jsonb_typeof(val) = 'object';
                        END IF;
                    ELSE
                        -- Old format: scalar value "85" or 85
                        field_value := (field_data #>> '{}')::NUMERIC; 
                    END IF;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                field_value := 0;
            END;

            -- Determine max score
            max_score_val := 0;
            BEGIN
                IF field_data IS NOT NULL AND jsonb_typeof(field_data) = 'object' THEN
                    IF (field_data ->> 'max_score') IS NOT NULL THEN
                        max_score_val := (field_data ->> 'max_score')::NUMERIC;
                    ELSE
                        -- Sum up max scores from nested columns
                        -- Try to get max_score from the data, fallback to schema column defaults
                        SELECT SUM(COALESCE((val->>'max_score')::NUMERIC, (field_def->'column_max_scores'->>col)::NUMERIC, 100)) INTO max_score_val
                        FROM jsonb_each(field_data) AS t(col, val)
                        WHERE jsonb_typeof(val) = 'object';
                    END IF;
                END IF;
                
                -- Fallback to schema-level max_score if still 0
                IF max_score_val = 0 OR max_score_val IS NULL THEN
                    max_score_val := COALESCE((field_def->>'max_score')::NUMERIC, 100);
                END IF;
            EXCEPTION WHEN OTHERS THEN
                max_score_val := 100;
            END;

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


-- 2. Add RLS policies for DEO and Adm Officer to VIEW marks
-- (They don't need write because the trigger handles it as Security Definer)

DROP POLICY IF EXISTS "Marks: DEO view" ON public.marks;
CREATE POLICY "Marks: DEO view" ON public.marks 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'deo')
);

DROP POLICY IF EXISTS "Marks: Adm Officer view" ON public.marks;
CREATE POLICY "Marks: Adm Officer view" ON public.marks 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'adm_officer')
);

-- Ensure Students policy is clean
DROP POLICY IF EXISTS "Marks: Students own RW" ON public.marks;
CREATE POLICY "Marks: Students own RW" ON public.marks 
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.applications WHERE id = application_id AND student_id = auth.uid())
);
