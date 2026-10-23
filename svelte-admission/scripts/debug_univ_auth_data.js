
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugUnivAuthData() {
    console.log('Fetching verified applications...');
    
    const { data: applications, error } = await supabase
        .from('applications')
        .select(
            `
            id,
            branch_id,
            courses(id, name, branches(id, name, code))
        `)
        .eq('status', 'verified')
        .limit(5);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!applications || applications.length === 0) {
        console.log('No verified applications found.');
        return;
    }

    applications.forEach(app => {
        console.log(`\nApp ID: ${app.id}`);
        console.log(`Course: ${app.courses?.name}`);
        console.log(`Current Branch ID: ${app.branch_id}`);
        
        const branches = app.courses?.branches;
        console.log(`Available Branches: ${branches ? branches.length : 'undefined'}`);
        if (branches && branches.length > 0) {
            branches.forEach(b => console.log(` - ${b.name} (${b.code})`));
        } else {
            console.log(' - No branches found for this course.');
        }
    });
}

debugUnivAuthData();
