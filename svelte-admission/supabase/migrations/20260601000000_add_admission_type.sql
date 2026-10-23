-- Add admission_type to applications table
ALTER TABLE applications ADD COLUMN IF NOT EXISTS admission_type VARCHAR(20) DEFAULT 'Regular';

-- Ensure existing records have 'Regular'
UPDATE applications SET admission_type = 'Regular' WHERE admission_type IS NULL;

-- Add admission_mode to account_admissions to store Regular/D2D/C2D 
-- (since admission_type is already used for form_type there)
ALTER TABLE account_admissions ADD COLUMN IF NOT EXISTS admission_mode VARCHAR(20) DEFAULT 'Regular';

-- Update existing account_admissions
UPDATE account_admissions SET admission_mode = 'Regular' WHERE admission_mode IS NULL;
