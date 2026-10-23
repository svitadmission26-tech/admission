-- SQL Script to insert Fee Structure for Bachelor of Engineering (BE)
-- Academic Year: 2026-27 (Current Active)
-- Course: Bachelor of Engineering (BE)
-- Scheme: General
-- Form Type: ACPC
-- Source Data: Extracted from feerecipt.pdf


INSERT INTO fee_structures (
    course_id, 
    academic_year_id, 
    total_fee, 
    fee_components, 
    form_type, 
    fee_scheme_id, 
    installment_json
)
VALUES (
    'de7b17a8-3e1b-4a4c-9f2b-b13235c8c7e1', -- Bachelor of Engineering
    '679c59c6-534b-42ac-b2e5-b1a5d8e00472', -- 2026-27
    52900, 
    '[
      {
        "name": "Fees",
        "items": [
          { "name": "Tution Fee", "amount": 43500, "allow_partial": true },
          { "name": "Refundable Deposit", "amount": 5000, "allow_partial": false },
          { "name": "Misc Fee, Thellessemia Report", "amount": 1050, "allow_partial": false },
          { "name": "SVIT Alumni Association Membership Fee", "amount": 500, "allow_partial": false },
          { "name": "Workshop Toolkit Rent", "amount": 100, "allow_partial": false }
        ]
      },
      {
        "name": "On Behalf Of University Fees",
        "items": [
          { "name": "Enrollment Fee/P.G.Registration", "amount": 150, "allow_partial": false }
        ]
      },
      {
        "name": "On Behalf Of Student Central Committee",
        "items": [
          { "name": "Annual Day Celebration Contribution", "amount": 1000, "allow_partial": false },
          { "name": "Sports, Extra Curricular, Cultural Activity", "amount": 500, "allow_partial": false },
          { "name": "Poor Student Aid Fund", "amount": 300, "allow_partial": false },
          { "name": "Social Welfare Aid Fund", "amount": 300, "allow_partial": false },
          { "name": "Contribution of ISTE Membership Fee", "amount": 300, "allow_partial": false },
          { "name": "College Magazine", "amount": 200, "allow_partial": false }
        ]
      }
    ]'::JSONB, 
    'ACPC', 
    '518faf43-27a5-49bc-a2ee-13639a0da007', -- General Scheme
    '[]'::JSONB
)
ON CONFLICT (course_id, academic_year_id, form_type, fee_scheme_id) 
DO UPDATE SET 
    total_fee = EXCLUDED.total_fee,
    fee_components = EXCLUDED.fee_components;
