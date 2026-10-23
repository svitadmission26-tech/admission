DO $$
DECLARE
    v_college_id UUID;
    v_course_id UUID;
    v_ce_branch_id UUID;
    v_mech_branch_id UUID;
    
    v_dip_ce_branch_id UUID;
    v_dip_college_id UUID;
    v_nursing_branch_id UUID;
    v_nursing_college_id UUID;

    v_ce_user_id UUID := '88888888-8888-4888-a888-8888888888c1';
    v_mech_user_id UUID := '88888888-8888-4888-a888-8888888888d2';
    v_ash_user_id UUID := '88888888-8888-4888-a888-8888888888a3';
    v_dip_user_id UUID := '88888888-8888-4888-a888-8888888888d5';
    v_nursing_user_id UUID := '88888888-8888-4888-a888-8888888888f6';
BEGIN
    -- 1. Try to dynamically find pre-existing 'COMPUTER ENGINEERING' branch and course under BE
    SELECT b.id, b.course_id INTO v_ce_branch_id, v_course_id 
    FROM public.branches b
    JOIN public.courses c ON b.course_id = c.id
    WHERE UPPER(b.name) = 'COMPUTER ENGINEERING'
      AND (UPPER(c.code) = 'BE' OR UPPER(c.name) = 'BACHELOR OF ENGINEERING')
    ORDER BY b.created_at ASC 
    LIMIT 1;

    -- 2. Try to dynamically find pre-existing 'MECHANICAL ENGINEERING' branch under BE
    SELECT b.id INTO v_mech_branch_id 
    FROM public.branches b
    JOIN public.courses c ON b.course_id = c.id
    WHERE UPPER(b.name) = 'MECHANICAL ENGINEERING'
      AND (UPPER(c.code) = 'BE' OR UPPER(c.name) = 'BACHELOR OF ENGINEERING')
    ORDER BY b.created_at ASC 
    LIMIT 1;

    -- 3. Resolve college_id from course if found
    IF v_course_id IS NOT NULL THEN
        SELECT college_id INTO v_college_id FROM public.courses WHERE id = v_course_id;
    END IF;

    -- 4. Fallback creation logic if pre-existing branches are missing
    IF v_ce_branch_id IS NULL OR v_mech_branch_id IS NULL OR v_college_id IS NULL THEN
        RAISE NOTICE 'Pre-existing branches not found. Creating fallback course and branches...';
        
        -- Get any college
        SELECT id INTO v_college_id FROM public.colleges WHERE name = 'Engineering College A';
        IF v_college_id IS NULL THEN
            SELECT id INTO v_college_id FROM public.colleges LIMIT 1;
        END IF;

        IF v_college_id IS NULL THEN
            RAISE EXCEPTION 'No college found in database. Please seed colleges first.';
        END IF;

        -- Create course
        SELECT id INTO v_course_id FROM public.courses 
        WHERE UPPER(name) = 'BACHELOR OF ENGINEERING' AND college_id = v_college_id;
        
        IF v_course_id IS NULL THEN
            v_course_id := uuid_generate_v4();
            INSERT INTO public.courses (id, college_id, name, code, duration_years)
            VALUES (v_course_id, v_college_id, 'BACHELOR OF ENGINEERING', 'BE', 4);
        END IF;

        -- Create CE branch
        IF v_ce_branch_id IS NULL THEN
            SELECT id INTO v_ce_branch_id FROM public.branches
            WHERE UPPER(name) = 'COMPUTER ENGINEERING' AND course_id = v_course_id;
            
            IF v_ce_branch_id IS NULL THEN
                v_ce_branch_id := uuid_generate_v4();
                INSERT INTO public.branches (id, course_id, name, code)
                VALUES (v_ce_branch_id, v_course_id, 'COMPUTER ENGINEERING', 'CE');
            END IF;
        END IF;

        -- Create Mech branch
        IF v_mech_branch_id IS NULL THEN
            SELECT id INTO v_mech_branch_id FROM public.branches
            WHERE UPPER(name) = 'MECHANICAL ENGINEERING' AND course_id = v_course_id;
            
            IF v_mech_branch_id IS NULL THEN
                v_mech_branch_id := uuid_generate_v4();
                INSERT INTO public.branches (id, course_id, name, code)
                VALUES (v_mech_branch_id, v_course_id, 'MECHANICAL ENGINEERING', 'ME');
            END IF;
        END IF;
    ELSE
        RAISE NOTICE 'Found pre-existing branches. Linking HODs to Branch CE: %, Branch Mech: %, College: %', v_ce_branch_id, v_mech_branch_id, v_college_id;
    END IF;

    -- Resolve Diploma CE Branch and College
    SELECT b.id, c.college_id INTO v_dip_ce_branch_id, v_dip_college_id
    FROM public.branches b
    JOIN public.courses c ON b.course_id = c.id
    WHERE UPPER(b.name) = 'COMPUTER ENGINEERING'
      AND (UPPER(c.code) = 'DIP' OR UPPER(c.name) = 'DIPLOMA ENGINEERING')
    LIMIT 1;

    -- Resolve Nursing Branch and College
    SELECT b.id, c.college_id INTO v_nursing_branch_id, v_nursing_college_id
    FROM public.branches b
    JOIN public.courses c ON b.course_id = c.id
    WHERE UPPER(b.name) = 'B.SC. NURSING' OR UPPER(c.name) = 'BACHELOR OF SCIENCE (NURSING)'
    LIMIT 1;

    -- 5. Clean up any existing example users
    DELETE FROM auth.users WHERE email IN ('hod_ce@example.com', 'hod_mech@example.com', 'hod_ash@example.com', 'hod_dip_ce@example.com', 'hod_nursing@example.com');
    DELETE FROM public.users WHERE email IN ('hod_ce@example.com', 'hod_mech@example.com', 'hod_ash@example.com', 'hod_dip_ce@example.com', 'hod_nursing@example.com');

    -- 6. Insert users into auth.users (Supabase authentication engine schema)
    -- HOD CE
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, 
        email_confirmed_at, last_sign_in_at, raw_app_meta_data, 
        raw_user_meta_data, created_at, updated_at, confirmation_token, 
        email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_ce_user_id, 'authenticated', 'authenticated', 
        'hod_ce@example.com', crypt('password123', gen_salt('bf')), 
        now(), now(), '{"provider":"email","providers":["email"]}', 
        '{"full_name":"HOD Computer Engineering"}', now(), now(), '', '', '', ''
    );

    -- HOD Mech
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, 
        email_confirmed_at, last_sign_in_at, raw_app_meta_data, 
        raw_user_meta_data, created_at, updated_at, confirmation_token, 
        email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_mech_user_id, 'authenticated', 'authenticated', 
        'hod_mech@example.com', crypt('password123', gen_salt('bf')), 
        now(), now(), '{"provider":"email","providers":["email"]}', 
        '{"full_name":"HOD Mechanical Engineering"}', now(), now(), '', '', '', ''
    );

    -- HOD ASH (General HOD - Global access)
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, 
        email_confirmed_at, last_sign_in_at, raw_app_meta_data, 
        raw_user_meta_data, created_at, updated_at, confirmation_token, 
        email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_ash_user_id, 'authenticated', 'authenticated', 
        'hod_ash@example.com', crypt('password123', gen_salt('bf')), 
        now(), now(), '{"provider":"email","providers":["email"]}', 
        '{"full_name":"General HOD (All Access)"}', now(), now(), '', '', '', ''
    );

    -- HOD Diploma CE
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, 
        email_confirmed_at, last_sign_in_at, raw_app_meta_data, 
        raw_user_meta_data, created_at, updated_at, confirmation_token, 
        email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_dip_user_id, 'authenticated', 'authenticated', 
        'hod_dip_ce@example.com', crypt('password123', gen_salt('bf')), 
        now(), now(), '{"provider":"email","providers":["email"]}', 
        '{"full_name":"HOD Diploma CE"}', now(), now(), '', '', '', ''
    );

    -- HOD Nursing
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, 
        email_confirmed_at, last_sign_in_at, raw_app_meta_data, 
        raw_user_meta_data, created_at, updated_at, confirmation_token, 
        email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_nursing_user_id, 'authenticated', 'authenticated', 
        'hod_nursing@example.com', crypt('password123', gen_salt('bf')), 
        now(), now(), '{"provider":"email","providers":["email"]}', 
        '{"full_name":"HOD Nursing"}', now(), now(), '', '', '', ''
    );

    -- Note: The trigger public.on_auth_user_created automatically fires and inserts 
    -- standard profiles in public.users. We now update them to HOD configurations.
    
    -- 7. Update user profiles to set hod roles and branch affiliations
    -- HOD CE: Tied to College, CE Branch
    UPDATE public.users 
    SET role = 'hod', college_id = v_college_id, branch_id = v_ce_branch_id 
    WHERE id = v_ce_user_id;

    -- HOD Mech: Tied to College, Mech Branch
    UPDATE public.users 
    SET role = 'hod', college_id = v_college_id, branch_id = v_mech_branch_id 
    WHERE id = v_mech_user_id;

    -- HOD ASH: College-wide access (all branches in the college), assigned to CE's college
    UPDATE public.users 
    SET role = 'hod', college_id = v_college_id, branch_id = v_ce_branch_id, hod_scope = 'college'
    WHERE id = v_ash_user_id;

    -- HOD Diploma CE
    IF v_dip_ce_branch_id IS NOT NULL THEN
        UPDATE public.users 
        SET role = 'hod', college_id = v_dip_college_id, branch_id = v_dip_ce_branch_id 
        WHERE id = v_dip_user_id;
    END IF;

    -- HOD Nursing
    IF v_nursing_branch_id IS NOT NULL THEN
        UPDATE public.users 
        SET role = 'hod', college_id = v_nursing_college_id, branch_id = v_nursing_branch_id 
        WHERE id = v_nursing_user_id;
    END IF;

    RAISE NOTICE 'Example HOD users seeded successfully!';
END $$;





