ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check 
CHECK (role IN ('student', 'admin', 'college_auth', 'univ_auth', 'university_auth', 'adm_officer', 'fee_collector', 'deo'));
