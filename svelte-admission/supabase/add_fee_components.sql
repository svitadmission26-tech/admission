ALTER TABLE public.fee_structures 
ADD COLUMN IF NOT EXISTS fee_components JSONB DEFAULT '[]'::jsonb;

-- detailed structure example:
-- [
--   {
--     "name": "Academic Fees",
--     "items": [
--       { "name": "Tuition Fee", "amount": 50000 },
--       { "name": "Library Fee", "amount": 2000 }
--     ]
--   },
--   {
--     "name": "Other Fees",
--     "items": [
--       { "name": "Gymkhana", "amount": 500 }
--     ]
--   }
-- ]
