-- 1. Create a function to handle automated inquiry conversion
CREATE OR REPLACE FUNCTION public.handle_inquiry_conversion()
RETURNS TRIGGER AS $$
DECLARE
    student_email TEXT;
BEGIN
    -- Only act if the status is changing to 'approved'
    IF (NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved')) THEN
        
        -- Get the student's email from the users table
        SELECT email INTO student_email FROM public.users WHERE id = NEW.student_id;

        -- Update any matching unprocessed inquiries to 'Converted'
        UPDATE public.inquiries
        SET is_processed = true,
            inquiry_data = inquiry_data || jsonb_build_object('conversion_status', 'Converted', 'converted_at', now())
        WHERE email = student_email AND is_processed = false;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger on the applications table
DROP TRIGGER IF EXISTS trigger_convert_inquiry_on_approval ON public.applications;
CREATE TRIGGER trigger_convert_inquiry_on_approval
    AFTER UPDATE ON public.applications
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_inquiry_conversion();

-- 3. Add 'Converted' labels to the Staff UI for clarity
COMMENT ON COLUMN public.inquiries.is_processed IS 'Status of the inquiry. True indicates handled or Converted via application approval.';
