-- Migration to introduce dynamic form_types table and link it

-- 1. Create the new form_types table
CREATE TABLE IF NOT EXISTS public.form_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE, -- e.g. 'Provisional', 'ACPC'
    code TEXT NOT NULL UNIQUE, -- e.g. 'Provisional', 'ACPC' (normalized if needed, but keeping simple for now)
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    requires_merit_calculation BOOLEAN DEFAULT true,
    allow_partial_payment BOOLEAN DEFAULT false,
    is_government_quota BOOLEAN DEFAULT false,
    application_fee_required BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Populate with existing hardcoded types
-- We use ON CONFLICT DO NOTHING to avoid errors if run multiple times
-- ADJUSTED FLAGS based on codebase analysis:
-- ACPC: Govt quota, usually direct admission via allotment -> No merit calc needed by college.
-- Provisional: Code includes it in 'skipMeritTypes', so treated as direct admission.
-- MQ/NRI: Not skipped, so likely needs merit list.
-- Vacant: Not skipped, likely needs merit list.

INSERT INTO public.form_types (name, code, description, requires_merit_calculation, allow_partial_payment, is_government_quota, application_fee_required)
VALUES 
    ('Provisional', 'Provisional', 'Standard provisional admission', false, false, false, true),
    ('ACPC', 'ACPC', 'Government quota admission', false, false, true, true),
    ('MQ/NRI', 'MQ/NRI', 'Management and NRI Quota', true, true, false, true),
    ('Vacant', 'Vacant', 'Vacant seats admission', true, false, false, true),
    ('D2D', 'D2D', 'Diploma to Degree', true, false, true, true)
ON CONFLICT (name) DO UPDATE SET
    requires_merit_calculation = EXCLUDED.requires_merit_calculation,
    allow_partial_payment = EXCLUDED.allow_partial_payment,
    is_government_quota = EXCLUDED.is_government_quota;

-- 3. Remove hardcoded CHECK constraints

-- For admission_forms
DO $$ 
DECLARE 
    con_name text;
BEGIN 
    SELECT conname INTO con_name 
    FROM pg_constraint 
    WHERE conrelid = 'public.admission_forms'::regclass 
      AND contype = 'c' 
      AND pg_get_constraintdef(oid) LIKE '%form_type%';
      
    IF con_name IS NOT NULL THEN 
        EXECUTE 'ALTER TABLE public.admission_forms DROP CONSTRAINT ' || con_name; 
    END IF;
END $$;

-- For fee_structures (constraint was named fee_structures_form_type_check)
ALTER TABLE public.fee_structures DROP CONSTRAINT IF EXISTS fee_structures_form_type_check;

-- For applications (if any check constraint exists)
DO $$ 
DECLARE 
    con_name text;
BEGIN 
    SELECT conname INTO con_name 
    FROM pg_constraint 
    WHERE conrelid = 'public.applications'::regclass 
      AND contype = 'c' 
      AND pg_get_constraintdef(oid) LIKE '%form_type%';
      
    IF con_name IS NOT NULL THEN 
        EXECUTE 'ALTER TABLE public.applications DROP CONSTRAINT ' || con_name; 
    END IF;
END $$;

-- For merit_formulas (if any check constraint exists)
DO $$ 
DECLARE 
    con_name text;
BEGIN 
    SELECT conname INTO con_name 
    FROM pg_constraint 
    WHERE conrelid = 'public.merit_formulas'::regclass 
      AND contype = 'c' 
      AND pg_get_constraintdef(oid) LIKE '%form_type%';
      
    IF con_name IS NOT NULL THEN 
        EXECUTE 'ALTER TABLE public.merit_formulas DROP CONSTRAINT ' || con_name; 
    END IF;
END $$;

-- 4. Add Foreign Key constraints to ensure data integrity
-- We reference 'name' because the existing data uses the full string (e.g. 'MQ/NRI').

-- Update admission_forms
ALTER TABLE public.admission_forms 
    ADD CONSTRAINT admission_forms_form_type_fkey 
    FOREIGN KEY (form_type) REFERENCES public.form_types(name) 
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- Update fee_structures
ALTER TABLE public.fee_structures 
    ADD CONSTRAINT fee_structures_form_type_fkey 
    FOREIGN KEY (form_type) REFERENCES public.form_types(name) 
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- Update merit_formulas
ALTER TABLE public.merit_formulas 
    ADD CONSTRAINT merit_formulas_form_type_fkey 
    FOREIGN KEY (form_type) REFERENCES public.form_types(name) 
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- Update applications
-- Note: applications might have historical data. Ensure all current form_types in applications exist in form_types table.
-- If there are rogue values, the FK addition will fail.
ALTER TABLE public.applications 
    ADD CONSTRAINT applications_form_type_fkey 
    FOREIGN KEY (form_type) REFERENCES public.form_types(name) 
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- 5. Enable RLS on the new table (Standard practice)
ALTER TABLE public.form_types ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Allow public read access" ON public.form_types
    FOR SELECT USING (true);

-- Allow admin write access
CREATE POLICY "Allow admin write access" ON public.form_types
    FOR ALL USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
    );