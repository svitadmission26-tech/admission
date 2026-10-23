-- Create circulars table
CREATE TABLE IF NOT EXISTS public.circulars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    file_path TEXT, -- Path in Supabase Storage
    created_by UUID REFERENCES public.users(id),
    
    -- Targeting
    course_id UUID REFERENCES public.courses(id),
    cycle_id UUID REFERENCES public.admission_cycles(id),
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_circulars_course ON public.circulars(course_id);

-- Enable RLS
ALTER TABLE public.circulars ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Circulars Table

-- 1. Adm Officer (Read/Write)
CREATE POLICY "Adm Officers can manage all circulars"
ON public.circulars
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND (role = 'adm_officer' OR role = 'admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND (role = 'adm_officer' OR role = 'admin')
    )
);

-- 2. Student (Read Only)
-- Students can see circulars that are active AND (targeted to their course OR public to all)
CREATE POLICY "Students can view relevant circulars"
ON public.circulars
FOR SELECT
TO authenticated
USING (
    is_active = true 
    AND (
        course_id IS NULL 
        OR course_id IN (
            SELECT course_id FROM public.applications 
            WHERE student_id = auth.uid()
        )
    )
    AND EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'student'
    )
);

-- Storage Bucket Setup (Note: Bucket creation usually happens via API/Dashboard, 
-- but policies can be set here if the bucket 'circulars' exists)

-- Policy for Storage Objects (circulars bucket)
-- Adm Officer: All operations
CREATE POLICY "Adm Officers can manage circular files"
ON storage.objects
FOR ALL
TO authenticated
USING (
    bucket_id = 'circulars' 
    AND EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND (role = 'adm_officer' OR role = 'admin')
    )
)
WITH CHECK (
    bucket_id = 'circulars' 
    AND EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND (role = 'adm_officer' OR role = 'admin')
    )
);

-- Student: Select (Download) only
CREATE POLICY "Students can download circular files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'circulars'
    AND EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'student'
    )
    -- Ideally, we'd check if the user has access to the linked circular record here,
    -- but cross-table storage policies can be complex. 
    -- For now, restrictive role-based access is a good baseline.
);