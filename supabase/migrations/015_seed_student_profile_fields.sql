insert into public.student_profile_fields (
  label,
  key,
  input_type,
  required,
  force_uppercase,
  text_case,
  options,
  display_order,
  workbook_key
)
values
  ('Title', 'title', 'select', true, false, 'none', '["Mr.","Ms.","Mrs.","Miss","Dr."]'::jsonb, 1, 'profile-field:title'),
  ('First Name(Student Name)', 'first_name', 'text', true, false, 'none', '[]'::jsonb, 2, 'profile-field:first_name'),
  ('Middle Name(Parent/Guardian Name)', 'middle_name', 'text', false, false, 'none', '[]'::jsonb, 3, 'profile-field:middle_name'),
  ('Last Name(Surname)', 'last_name', 'text', true, false, 'none', '[]'::jsonb, 4, 'profile-field:last_name'),
  ('Name As Per Marksheet', 'name_as_per_marksheet', 'text', true, false, 'none', '[]'::jsonb, 5, 'profile-field:name_as_per_marksheet'),
  ('Contact Number', 'contact_number', 'text', true, false, 'none', '[]'::jsonb, 6, 'profile-field:contact_number'),
  ('Alternate Contact Number', 'alternate_contact_number', 'text', false, false, 'none', '[]'::jsonb, 7, 'profile-field:alternate_contact_number'),
  ('Email Address', 'email', 'email', true, false, 'none', '[]'::jsonb, 8, 'profile-field:email'),
  ('Date of Birth', 'birth_date', 'date', true, false, 'none', '[]'::jsonb, 9, 'profile-field:birth_date'),
  ('Gender', 'gender', 'select', true, false, 'none', '["Male","Female","Other"]'::jsonb, 10, 'profile-field:gender'),
  ('Blood Group', 'blood_group', 'select', false, false, 'none', '["A+","A-","B+","B-","AB+","AB-","O+","O-"]'::jsonb, 11, 'profile-field:blood_group'),
  ('Religion', 'religion', 'select', true, false, 'none', '["Hindu","Muslim","Christian","Sikh","Jain","Buddhist","Other"]'::jsonb, 12, 'profile-field:religion'),
  ('Nationality', 'nationality', 'text', true, false, 'none', '[]'::jsonb, 13, 'profile-field:nationality'),
  ('Category', 'category', 'select', true, false, 'none', '["General","EWS","SEBC/OBC","SC","ST","Other"]'::jsonb, 14, 'profile-field:category'),
  ('Caste', 'caste', 'text', false, false, 'none', '[]'::jsonb, 15, 'profile-field:caste'),
  ('Aadhar Card Number', 'aadhar_card_number', 'text', true, false, 'none', '[]'::jsonb, 16, 'profile-field:aadhar_card_number'),
  ('Name As Per Aadhar', 'name_as_per_aadhar', 'text', true, false, 'none', '[]'::jsonb, 17, 'profile-field:name_as_per_aadhar'),
  ('ABC ID/ Appar ID', 'abc_id', 'text', false, false, 'none', '[]'::jsonb, 18, 'profile-field:abc_id'),
  ('UDISE ID', 'udise_id', 'text', false, false, 'none', '[]'::jsonb, 19, 'profile-field:udise_id'),
  ('Permanent Address Line 1', 'p_address_line_1', 'text', true, false, 'none', '[]'::jsonb, 20, 'profile-field:p_address_line_1'),
  ('Permanent Address Line 2', 'p_address_line_2', 'text', false, false, 'none', '[]'::jsonb, 21, 'profile-field:p_address_line_2'),
  ('Permanent City', 'p_city', 'text', true, false, 'none', '[]'::jsonb, 22, 'profile-field:p_city'),
  ('Permanent State', 'p_state', 'text', true, false, 'none', '[]'::jsonb, 23, 'profile-field:p_state'),
  ('Permanent Country', 'p_country', 'text', true, false, 'none', '[]'::jsonb, 24, 'profile-field:p_country'),
  ('Permanent Zip Code', 'p_zip_code', 'text', true, false, 'none', '[]'::jsonb, 25, 'profile-field:p_zip_code'),
  ('Current Address Line 1', 'c_address_line_1', 'text', true, false, 'none', '[]'::jsonb, 26, 'profile-field:c_address_line_1'),
  ('Current Address Line 2', 'c_address_line_2', 'text', false, false, 'none', '[]'::jsonb, 27, 'profile-field:c_address_line_2'),
  ('Current City', 'c_city', 'text', true, false, 'none', '[]'::jsonb, 28, 'profile-field:c_city'),
  ('Current State', 'c_state', 'text', true, false, 'none', '[]'::jsonb, 29, 'profile-field:c_state'),
  ('Current Country', 'c_country', 'text', true, false, 'none', '[]'::jsonb, 30, 'profile-field:c_country'),
  ('Current Zip Code', 'c_zip_code', 'text', true, false, 'none', '[]'::jsonb, 31, 'profile-field:c_zip_code'),
  ('Father''s Full Name', 'father_full_name', 'text', true, false, 'none', '[]'::jsonb, 32, 'profile-field:father_full_name'),
  ('Father''s Contact Number', 'father_contact_number', 'text', true, false, 'none', '[]'::jsonb, 33, 'profile-field:father_contact_number'),
  ('Mother''s Full Name', 'mother_full_name', 'text', true, false, 'none', '[]'::jsonb, 34, 'profile-field:mother_full_name'),
  ('Mother''s Contact Number', 'mother_contact_number', 'text', false, false, 'none', '[]'::jsonb, 35, 'profile-field:mother_contact_number'),
  ('Photo', 'photo', 'image', true, false, 'none', '[]'::jsonb, 36, 'profile-field:photo')
on conflict (key) do update
set options = case
  when public.student_profile_fields.input_type = 'select'
    and public.student_profile_fields.options = '[]'::jsonb
  then excluded.options
  else public.student_profile_fields.options
end;
