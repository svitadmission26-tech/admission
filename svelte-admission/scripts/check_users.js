import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUsers() {
    console.log("Checking users...");
    const { data: users, error } = await supabase
        .from('users')
        .select('email, role, college_id, university_id');
    
    if (error) {
        console.error("Error fetching users:", error);
    } else {
        console.log("Found users:", users);
    }
}

checkUsers();
