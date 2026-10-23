ALTER TABLE public.form_types ADD COLUMN IF NOT EXISTS direct_admission_on_submit BOOLEAN DEFAULT false;
COMMENT ON COLUMN public.form_types.direct_admission_on_submit IS 'If true, applications of this form type bypass verification/approval and get admitted immediately upon submission or application fee payment.';

