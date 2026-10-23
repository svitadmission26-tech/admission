
-- Migration: 20260521120000_fix_application_uniqueness.sql (Revised)
-- Description: Consolidates duplicate applications and enforces uniqueness while handling foreign key constraints.

DO $$
BEGIN
    -- 1. Create mapping of Loser IDs to Winner IDs
    -- We use a CTE to rank duplicates and pick a 'Winner' based on status, payments, and activity.
    CREATE TEMP TABLE application_mapping AS
    WITH RankedApps AS (
        SELECT 
            id, 
            student_id, course_id, cycle_id, form_type,
            ROW_NUMBER() OVER(
                PARTITION BY student_id, course_id, cycle_id, form_type 
                ORDER BY 
                    CASE WHEN status NOT IN ('draft') THEN 1 ELSE 2 END, 
                    (SELECT COUNT(*) FROM public.payments p WHERE p.application_id = applications.id) DESC,
                    (SELECT COUNT(*) FROM public.account_admissions aa WHERE aa.application_id = applications.id) DESC,
                    updated_at DESC
            ) as rn
        FROM public.applications
    )
    SELECT ra.id as loser_id, w.id as winner_id
    FROM RankedApps ra
    JOIN (SELECT * FROM RankedApps WHERE rn = 1) w 
      ON ra.student_id = w.student_id 
      AND ra.course_id = w.course_id 
      AND ra.cycle_id = w.cycle_id 
      AND ra.form_type = w.form_type
    WHERE ra.rn > 1;

    -- 2. Update/Delete dependent records in child tables to avoid FK violations

    -- Transactions (Re-link to winner)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions' AND table_schema = 'public') THEN
        UPDATE public.transactions t SET application_id = m.winner_id 
        FROM application_mapping m WHERE t.application_id = m.loser_id;
    END IF;

    -- Payments (Re-link to winner)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments' AND table_schema = 'public') THEN
        UPDATE public.payments p SET application_id = m.winner_id 
        FROM application_mapping m WHERE p.application_id = m.loser_id;
    END IF;

    -- Admissions (Re-link to winner, handling potential 1-to-1 uniqueness conflicts)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'account_admissions' AND table_schema = 'public') THEN
        -- Delete admissions for losers if the winner already has an admission record
        DELETE FROM public.account_admissions aa
        USING application_mapping m
        WHERE aa.application_id = m.loser_id
        AND EXISTS (SELECT 1 FROM public.account_admissions aa2 WHERE aa2.application_id = m.winner_id);
        
        -- Link remaining loser admissions to winner
        UPDATE public.account_admissions aa SET application_id = m.winner_id 
        FROM application_mapping m WHERE aa.application_id = m.loser_id;
    END IF;

    -- Marks (Delete loser marks as they are usually duplicate data from form_data)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marks' AND table_schema = 'public') THEN
        DELETE FROM public.marks mk USING application_mapping m WHERE mk.application_id = m.loser_id;
    END IF;

    -- Merit entries (Delete loser entries)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merit_list_entries' AND table_schema = 'public') THEN
        DELETE FROM public.merit_list_entries mle USING application_mapping m WHERE mle.application_id = m.loser_id;
    END IF;

    -- Documents (Re-link to winner)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents' AND table_schema = 'public') THEN
        UPDATE public.documents d SET application_id = m.winner_id 
        FROM application_mapping m WHERE d.application_id = m.loser_id;
    END IF;

    -- Enrollment Numbers (Re-link)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'enrollment_numbers' AND table_schema = 'public') THEN
        UPDATE public.enrollment_numbers en SET application_id = m.winner_id 
        FROM application_mapping m WHERE en.application_id = m.loser_id;
    END IF;

    -- Transfer History (Re-link)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_transfer_history' AND table_schema = 'public') THEN
        UPDATE public.student_transfer_history sth SET application_id = m.winner_id 
        FROM application_mapping m WHERE sth.application_id = m.loser_id;
    END IF;

    -- 3. Delete the duplicate (Loser) Applications
    DELETE FROM public.applications 
    WHERE id IN (SELECT loser_id FROM application_mapping);

    -- 4. Cleanup Temp Table
    DROP TABLE IF EXISTS application_mapping;

END $$;

-- 5. Finally, add the unique constraint to the applications table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'applications_student_course_cycle_type_unique'
    ) THEN
        ALTER TABLE public.applications 
        ADD CONSTRAINT applications_student_course_cycle_type_unique 
        UNIQUE (student_id, course_id, cycle_id, form_type);
    END IF;
END $$;
