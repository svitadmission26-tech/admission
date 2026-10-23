-- Allow Admission Officers to view and update payments
DROP POLICY IF EXISTS "Payments: Adm Officer View" ON public.payments;
DROP POLICY IF EXISTS "Payments: Adm Officer access" ON public.payments;

CREATE POLICY "Payments: Adm Officer access" ON public.payments
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role = 'adm_officer'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role = 'adm_officer'
    )
);