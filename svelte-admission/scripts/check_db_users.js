
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

async function checkUsers() {
  console.log('Checking public.users table...');
  const { data: publicUsers, error: publicError } = await supabase
    .from('users')
    .select('*');

  if (publicError) {
    console.error('Error fetching public users:', publicError);
  } else {
    console.log(`Found ${publicUsers.length} users in public.users.`);
    publicUsers.forEach(u => console.log(` - ${u.email} (${u.role})`));
  }
  
  console.log('\nChecking auth.users...');
  const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError) {
    console.error('Error fetching auth users:', authError);
  } else {
     console.log(`Found ${authUsers.length} users in auth.users.`);
     authUsers.forEach(u => console.log(` - ${u.email} (ID: ${u.id})`));
  }
}

checkUsers();
