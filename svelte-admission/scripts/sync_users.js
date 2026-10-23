
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncUsers() {
  console.log('Syncing users from auth to public...');

  // 1. Get all Auth users
  const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error('Error fetching auth users:', authError);
    return;
  }

  // 2. Get all Public users
  const { data: publicUsers, error: publicError } = await supabase.from('users').select('email');
  if (publicError) {
    console.error('Error fetching public users:', publicError);
    return;
  }

  const existingEmails = new Set(publicUsers.map(u => u.email));

  for (const user of authUsers) {
    if (!existingEmails.has(user.email)) {
      console.log(`Syncing missing user: ${user.email}`);
      
      let role = 'student';
      if (user.email.includes('admin')) role = 'admin';
      else if (user.email.includes('officer')) role = 'adm_officer';
      else if (user.email.includes('fee_collector')) role = 'fee_collector';
      else if (user.email.includes('deo')) role = 'deo';
      else if (user.email.includes('college_auth')) role = 'college_auth';
      else if (user.email.includes('univ_auth')) role = 'university_auth';
      else if (user.email.includes('student')) role = 'student';

      const { error: insertError } = await supabase.from('users').insert({
        id: user.id,
        email: user.email,
        role: role,
        full_name: user.user_metadata?.full_name || user.email.split('@')[0]
      });

      if (insertError) {
        console.error(`Failed to insert ${user.email}:`, insertError.message);
      } else {
        console.log(`Successfully created public profile for ${user.email} as ${role}`);
      }
    }
  }
  console.log('Sync complete.');
}

syncUsers();
