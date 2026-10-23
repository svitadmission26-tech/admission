-- Dummy Data for University Admission System

-- Enable uuid-ossp if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Academic Years
INSERT INTO public.academic_years (id, name, start_date, end_date, is_active)
VALUES 
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '2025-2026', '2025-06-01', '2026-05-31', TRUE),
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', '2024-2025', '2024-06-01', '2025-05-31', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 2. Admission Cycles
INSERT INTO public.admission_cycles (id, academic_year_id, name, start_date, end_date, is_active)
VALUES 
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Fall 2025', '2025-06-01', '2025-08-31', TRUE),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b12', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Spring 2026', '2025-11-01', '2026-01-31', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 3. Universities
INSERT INTO public.universities (id, name, code, address)
VALUES 
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'Tech University', 'TU01', '123 Tech Park, Silicon Valley'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c12', 'State Arts University', 'SAU01', '456 Arts Ave, Culture City')
ON CONFLICT (id) DO NOTHING;

-- 4. Colleges
INSERT INTO public.colleges (id, university_id, name, code, address)
VALUES 
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380d11', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'Engineering College A', 'ENG-A', 'Block 1, Tech Campus'),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380d12', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'Science College B', 'SCI-B', 'Block 2, Tech Campus'),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380d13', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c12', 'Arts College C', 'ART-C', 'Main Building, Arts Campus')
ON CONFLICT (id) DO NOTHING;

-- 5. Users (REMOVED: Managed by scripts/create_users.js)
-- The create_users.js script creates users in auth.users and inserts them into public.users.
-- We will now refer to them using lookups in the following inserts.

-- 6. Courses
INSERT INTO public.courses (id, college_id, name, code, duration_years)
VALUES 
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380d11', 'B.Tech Computer Science', 'CS101', 4),
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e12', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380d11', 'B.Tech Electronics', 'ECE101', 4),
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e13', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380d12', 'B.Sc Physics', 'PHY101', 3)
ON CONFLICT (id) DO NOTHING;

-- 7. Admission Forms
INSERT INTO public.admission_forms (id, course_id, cycle_id, schema_json)
VALUES 
    ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380f11', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', '{
        "fields": [
            { "name": "full_name", "label": "Full Name", "type": "text", "required": true },
            { "name": "dob", "label": "Date of Birth", "type": "date", "required": true },
            { "name": "hsc_marks", "label": "HSC Marks (%)", "type": "number", "required": true },
            { "name": "address", "label": "Address", "type": "textarea", "required": true }
        ]
    }'::jsonb),
    ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380f12', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e13', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', '{
        "fields": [
            { "name": "full_name", "label": "Full Name", "type": "text", "required": true },
            { "name": "interest", "label": "Research Interest", "type": "textarea", "required": false }
        ]
    }'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 8. Fee Structures
INSERT INTO public.fee_structures (id, course_id, academic_year_id, total_fee, installment_json)
VALUES 
    ('g0eebc99-9c0b-4ef8-bb6d-6bb9bd380g11', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 100000.00, '[
        { "amount": 50000, "due_date": "2025-07-01", "description": "First Semester" },
        { "amount": 50000, "due_date": "2026-01-01", "description": "Second Semester" }
    ]'::jsonb),
    ('g0eebc99-9c0b-4ef8-bb6d-6bb9bd380g12', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e13', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 30000.00, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 9. Merit Formulas
INSERT INTO public.merit_formulas (id, course_id, rules_json)
VALUES 
    ('h0eebc99-9c0b-4ef8-bb6d-6bb9bd380h11', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11', '{ "weight_math": 0.4, "weight_physics": 0.3, "weight_chemistry": 0.3 }'::jsonb),
    ('h0eebc99-9c0b-4ef8-bb6d-6bb9bd380h12', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e13', '{ "weight_overall": 1.0 }'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 10. Applications
INSERT INTO public.applications (id, student_id, course_id, cycle_id, form_data, status, merit_score, merit_rank, submitted_at)
VALUES 
    (
        'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380i11', 
        (SELECT id FROM public.users WHERE email = 'student1@example.com'), 
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11', 
        'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 
        '{ "full_name": "John Doe", "dob": "2005-05-15", "hsc_marks": 85, "address": "123 Main St" }'::jsonb, 
        'submitted', NULL, NULL, NOW()
    ),
    (
        'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380i12', 
        (SELECT id FROM public.users WHERE email = 'student2@example.com'), 
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11', 
        'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 
        '{ "full_name": "Jane Smith", "dob": "2005-08-20", "hsc_marks": 92, "address": "456 Oak Ave" }'::jsonb, 
        'verified', 88.5, 1, NOW()
    ),
    (
        'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380i13', 
        (SELECT id FROM public.users WHERE email = 'student1@example.com'), 
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e13', 
        'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 
        '{ "full_name": "John Doe", "interest": "Astrophysics" }'::jsonb, 
        'draft', NULL, NULL, NULL
    )
ON CONFLICT (id) DO NOTHING;

-- 11. Marks
INSERT INTO public.marks (id, application_id, subject, score, max_score)
VALUES 
    ('j0eebc99-9c0b-4ef8-bb6d-6bb9bd380j11', 'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380i11', 'Math', 85, 100),
    ('j0eebc99-9c0b-4ef8-bb6d-6bb9bd380j12', 'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380i11', 'Physics', 80, 100),
    ('j0eebc99-9c0b-4ef8-bb6d-6bb9bd380j13', 'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380i11', 'Chemistry', 88, 100),
    ('j0eebc99-9c0b-4ef8-bb6d-6bb9bd380j14', 'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380i12', 'Math', 95, 100),
    ('j0eebc99-9c0b-4ef8-bb6d-6bb9bd380j15', 'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380i12', 'Physics', 90, 100),
    ('j0eebc99-9c0b-4ef8-bb6d-6bb9bd380j16', 'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380i12', 'Chemistry', 85, 100)
ON CONFLICT (id) DO NOTHING;

-- 12. Payments
INSERT INTO public.payments (id, application_id, amount, transaction_id, status, payment_date)
VALUES 
    ('k0eebc99-9c0b-4ef8-bb6d-6bb9bd380k11', 'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380i12', 50000.00, 'TXN123456789', 'completed', NOW())
ON CONFLICT (id) DO NOTHING;

-- 13. Documents
INSERT INTO public.documents (id, application_id, user_id, college_id, university_id, file_path, file_name, file_type, document_type, uploaded_by, status)
VALUES 
    (
        'l0eebc99-9c0b-4ef8-bb6d-6bb9bd380l11', 
        'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380i11', 
        (SELECT id FROM public.users WHERE email = 'student1@example.com'), 
        NULL, NULL, 'dummy/path/doc1.pdf', 'HSC_Marksheet.pdf', 'application/pdf', 'HSC Marksheet', 
        (SELECT id FROM public.users WHERE email = 'student1@example.com'), 'pending'
    ),
    (
        'l0eebc99-9c0b-4ef8-bb6d-6bb9bd380l12', 
        'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380i12', 
        (SELECT id FROM public.users WHERE email = 'student2@example.com'), 
        NULL, NULL, 'dummy/path/doc2.jpg', 'Photo.jpg', 'image/jpeg', 'Photo', 
        (SELECT id FROM public.users WHERE email = 'student2@example.com'), 'approved'
    )
ON CONFLICT (id) DO NOTHING;

-- 14. Admission Sequences
INSERT INTO public.admission_sequences (id, college_id, course_id, academic_year_id, current_sequence, prefix)
VALUES 
    ('m0eebc99-9c0b-4ef8-bb6d-6bb9bd380m11', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380d11', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 1, 'ADM-25-CS-')
ON CONFLICT (id) DO NOTHING;

-- 15. Account Admissions
INSERT INTO public.account_admissions (id, application_id, admission_number, admission_date, admission_type, account_status)
VALUES 
    ('n0eebc99-9c0b-4ef8-bb6d-6bb9bd380n11', 'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380i12', 'ADM-25-CS-0001', NOW(), 'Merit', 'partial')
ON CONFLICT (id) DO NOTHING;