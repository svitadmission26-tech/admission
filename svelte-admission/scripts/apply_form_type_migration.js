import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function applyMigration() {
    console.log('Applying migration to add form_type to merit_formulas...');
    
    // Using the RPC hack again since we are in a limited environment
    // Ideally this should be done via `supabase db push` or psql
    const sqlPath = path.join(process.cwd(), 'supabase/migrations/20260131100000_add_form_type_to_formulas.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    const checkRpc = await supabase.rpc('exec_sql', { sql_query: 'SELECT 1' });
    
    if (!checkRpc.error) {
         const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
         if (error) {
             console.error('Migration failed via RPC:', error);
         } else {
             console.log('Migration applied successfully via RPC.');
         }
    } else {
        console.error('RPC exec_sql not available. Please run the SQL manually.');
        console.log('SQL File:', sqlPath);
        console.log('--------------------------------------------------');
        console.log(sql);
        console.log('--------------------------------------------------');
    }
}

applyMigration();
