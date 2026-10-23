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

async function updateBranding() {
  console.log('Updating University Branding...');

  // Update all universities with sample data
  const { error } = await supabase
    .from('universities')
    .update({
        logo_url: 'https://via.placeholder.com/150x80?text=University+Logo',
        contact_email: 'admission@svitvasad.ac.in',
        contact_phone: '+91-9510782981',
        website: 'www.svitvasad.ac.in',
        footer_text: '© 2026 SVIT, Vasad. All Rights Reserved.',
        address: 'SVIT, Vasad, Gujarat - 388306'    })
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all (safe for dev)

  if (error) {
      console.error('Error updating branding:', error.message);
  } else {
      console.log('Successfully updated university branding details.');
  }
}

updateBranding();
