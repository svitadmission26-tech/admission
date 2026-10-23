-- Add default_value column to student_profile_fields table
-- This allows setting default values for profile fields that will be used when linked to admission forms

ALTER TABLE student_profile_fields 
ADD COLUMN IF NOT EXISTS default_value TEXT;

-- Add comment to explain the column purpose
COMMENT ON COLUMN student_profile_fields.default_value IS 'Default value for this profile field';