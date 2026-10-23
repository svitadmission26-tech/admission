-- Migration: Add Fee Schemes (General, TFWS, NRI)
-- Path: new_database/add_fee_schemes.sql

DO $$
BEGIN
    -- 1. Create fee_schemes table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fee_schemes') THEN
        CREATE TABLE public.fee_schemes (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
        );

        -- Enable RLS
        ALTER TABLE public.fee_schemes ENABLE ROW LEVEL SECURITY;
    END IF;

    -- 2. Insert initial fee schemes
    INSERT INTO public.fee_schemes (name, description)
    VALUES 
        ('General', 'Standard fee structure'),
        ('TFWS', 'Tuition Fee Waiver Scheme'),
        ('NRI', 'Non-Resident Indian Quota')
    ON CONFLICT (name) DO NOTHING;

    -- 3. Update fee_structures
    -- Add fee_scheme_id column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fee_structures' AND column_name = 'fee_scheme_id') THEN
        ALTER TABLE public.fee_structures ADD COLUMN fee_scheme_id UUID REFERENCES public.fee_schemes(id);

        -- Set existing fee structures to 'General' scheme
        UPDATE public.fee_structures 
        SET fee_scheme_id = (SELECT id FROM public.fee_schemes WHERE name = 'General')
        WHERE fee_scheme_id IS NULL;

        -- Make it NOT NULL for future records
        ALTER TABLE public.fee_structures ALTER COLUMN fee_scheme_id SET NOT NULL;

        -- Drop old unique constraint and create new one including fee_scheme_id
        ALTER TABLE public.fee_structures DROP CONSTRAINT IF EXISTS fee_structures_unique_key;
        ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_unique_key UNIQUE (course_id, academic_year_id, form_type, fee_scheme_id);
    END IF;

    -- 4. Update applications to track assigned scheme
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = 'assigned_fee_scheme_id') THEN
        ALTER TABLE public.applications ADD COLUMN assigned_fee_scheme_id UUID REFERENCES public.fee_schemes(id);
    END IF;

    -- 5. Create Policies for fee_schemes (using DROP/CREATE for idempotency)
    DROP POLICY IF EXISTS "Fee Schemes: Read for all authenticated" ON public.fee_schemes;
    CREATE POLICY "Fee Schemes: Read for all authenticated" ON public.fee_schemes FOR SELECT USING (auth.role() = 'authenticated');
    
    DROP POLICY IF EXISTS "Fee Schemes: Admin management" ON public.fee_schemes;
    CREATE POLICY "Fee Schemes: Admin management" ON public.fee_schemes FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
    );

END $$;
