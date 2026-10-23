
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables: PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const searchQuery = process.argv[2] || '';

async function listApplications() {
  console.log(`Searching for: "${searchQuery}" in Bachelor of Engineering (Provisional, MQ/NRI)`);
  console.log('--------------------------------------------------');

  try {
    const { data: apps, error } = await supabase
      .from('applications')
      .select(`
        id,
        form_type,
        form_data,
        course:courses!inner(name),
        branch:branches(name),
        student:users!applications_student_id_fkey(
          id,
          full_name,
          email,
          student_profiles(profile_data)
        )
      `)
      .in('form_type', ['Provisional', 'MQ/NRI'])
      .eq('course.name', 'BACHELOR OF ENGINEERING');

    if (error) {
      throw error;
    }

    const filtered = apps.filter(app => {
      const student = app.student;
      if (!student) return false;

      const profile = Array.isArray(student.student_profiles) ? student.student_profiles[0] : student.student_profiles;
      const profileData = profile?.profile_data || {};
      const formData = app.form_data || {};

      // Name components
      const firstName = profileData.first_name || formData.first_name || '';
      const middleName = profileData.middle_name || formData.middle_name || '';
      const lastName = profileData.last_name || formData.last_name || '';
      const combinedName = `${firstName} ${middleName} ${lastName}`.trim();
      const combinedNameSlashed = `${firstName}/${middleName}/${lastName}`.toLowerCase();
      
      // Contact info
      const contact = profileData.contact_number || formData.contact_number || profileData.mobile_number || '';
      
      const searchStr = `${student.full_name} ${student.email} ${combinedName} ${combinedNameSlashed} ${contact}`.toLowerCase();
      
      // If no search query, return all
      if (!searchQuery) return true;
      
      return searchStr.includes(searchQuery.toLowerCase());
    });

    if (filtered.length === 0) {
      console.log('No matching records found.');
      return;
    }

    filtered.forEach(app => {
      const student = app.student;
      const profile = Array.isArray(student.student_profiles) ? student.student_profiles[0] : student.student_profiles;
      const profileData = profile?.profile_data || {};
      const formData = app.form_data || {};

      const firstName = profileData.first_name || formData.first_name || 'N/A';
      const middleName = profileData.middle_name || formData.middle_name || 'N/A';
      const lastName = profileData.last_name || formData.last_name || 'N/A';
      const combinedName = `${firstName}/${middleName}/${lastName}`;
      
      const contact = profileData.contact_number || formData.contact_number || profileData.mobile_number || 'N/A';
      
      console.log(`Name (F/M/L): ${combinedName}`);
      console.log(`Full Name:   ${student.full_name || 'N/A'}`);
      console.log(`Email:       ${student.email || 'N/A'}`);
      console.log(`Form Type:   ${app.form_type}`);
      console.log(`Contact:     ${contact}`);
      console.log(`Prov Branch: ${app.branch?.name || 'N/A'}`);
      console.log('--------------------------------------------------');
    });

    console.log(`Total Found: ${filtered.length}`);

  } catch (err) {
    console.error('Error:', err.message);
  }
}

listApplications();
