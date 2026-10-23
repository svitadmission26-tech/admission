-- SQL Script to reset a specific application for testing (MQ/NRI flow)
-- Replace 'YOUR_APPLICATION_ID' with the actual UUID before running.

DO $$
DECLARE
    target_app_id UUID := 'YOUR_APPLICATION_ID'; -- <--- CHANGE THIS
    target_student_id UUID;
BEGIN
    -- Get Student ID
    SELECT student_id INTO target_student_id FROM public.applications WHERE id = target_app_id;

    IF target_student_id IS NULL THEN
        RAISE NOTICE 'Application ID not found: %', target_app_id;
        RETURN;
    END IF;

    -- 1. Remove Financial & Admission Records
    DELETE FROM public.fee_receipts WHERE application_id = target_app_id;
    DELETE FROM public.payments WHERE application_id = target_app_id;
    DELETE FROM public.transactions WHERE application_id = target_app_id;
    DELETE FROM public.account_admissions WHERE application_id = target_app_id;

    -- 2. Reset Application Status
    -- Moves it back to 'submitted' so it can be re-approved/re-paid
    UPDATE public.applications 
    SET 
        application_fee_status = 'pending', 
        status = 'submitted',
        submitted_at = now()
    WHERE id = target_app_id;

    -- 3. Reset Student Profile Identity & Status
    -- Clears the College ID (enrollment_number)
    UPDATE public.student_profiles 
    SET 
        enrollment_number = NULL, 
        admission_status = 'Pending' 
    WHERE user_id = target_student_id;

    -- 4. Reset Official User Affiliation
    -- Removes the link to the college in the central users table
    UPDATE public.users 
    SET college_id = NULL 
    WHERE id = target_student_id;

    RAISE NOTICE 'Successfully reset application % and student %', target_app_id, target_student_id;
END $$;
