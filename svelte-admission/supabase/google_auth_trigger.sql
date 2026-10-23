-- Trigger to automatically create a public.users profile for new auth.users
-- This is essential for Google Login to work correctly with our role-based system.

-- 1. Create the function that will run after a new user is inserted into auth.users
-- Using $func$ delimiter to avoid conflicts with other dollar-quoted blocks
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $func$
BEGIN
  -- 1. Insert into public.users
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    -- Google provides full_name in raw_user_meta_data. Fallback to 'New Student' if missing.
    COALESCE(new.raw_user_meta_data->>'full_name', 'New Student'),
    -- Default role is ALWAYS 'student' for self-registration/OAuth
    'student'
  )
  -- If the user already exists (e.g. created via our manual script), do nothing
  ON CONFLICT (id) DO NOTHING;

  -- 2. Insert into public.student_profiles (if not exists)
  -- Pre-fill profile_data with Name and Email from Google metadata
  INSERT INTO public.student_profiles (user_id, profile_data, enrollment_number, admission_status)
  VALUES (
    new.id,
    jsonb_build_object(
      'name', COALESCE(new.raw_user_meta_data->>'full_name', 'New Student'),
      'email', new.email
    ),
    NULL, -- No enrollment number yet
    'pending' -- Default status
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN new;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger
-- Drop it first if it exists to ensure clean creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();